"""ANVAYA — FastAPI backend."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings
from .pipeline import DISCLAIMER, analyze_image
from .rate_limit import SlidingWindowRateLimiter
from .schemas import AnalyzeMode, AnalyzeResponse, HealthResponse

logger = logging.getLogger("anvaya")

app = FastAPI(
    title="ANVAYA",
    description="Multimodal accessibility copilot API",
    version="1.1.0",
)

settings = get_settings()
_analyze_limiter = SlidingWindowRateLimiter(settings.rate_limit_per_minute)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(SecurityHeadersMiddleware)

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    cfg = get_settings()
    return HealthResponse(
        status="ok",
        gemini_configured=bool(cfg.gemini_api_key),
        model=cfg.gemini_model,
    )


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "ANVAYA",
        "docs": "/docs",
        "health": "/health",
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    image: UploadFile = File(..., description="Captured or uploaded image"),
    mode: AnalyzeMode = Form(AnalyzeMode.read),
    question: Optional[str] = Form(None),
) -> AnalyzeResponse:
    cfg = get_settings()

    if not _analyze_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a moment and try again.",
        )

    if not cfg.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Server is missing GEMINI_API_KEY. Add it to backend/.env",
        )

    if question and len(question) > 500:
        raise HTTPException(
            status_code=400,
            detail="Question is too long (max 500 characters).",
        )

    content_type = (image.content_type or "").lower()
    if content_type and content_type not in ALLOWED_TYPES and not content_type.startswith(
        "image/"
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a JPEG, PNG, WebP, or GIF image.",
        )

    # Process in memory only — never write the image to disk
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image upload.")
    if len(data) > cfg.max_image_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Max size is {cfg.max_image_bytes // (1024 * 1024)} MB.",
        )

    try:
        text, confidence_note, aim_hint, aim_instruction, document_kind = analyze_image(
            settings=cfg,
            image_bytes=data,
            mode=mode,
            question=question,
            filename=image.filename,
            content_type=content_type or None,
        )
    except Exception as exc:  # noqa: BLE001 — surface Gemini/network errors cleanly
        logger.exception("Vision analysis failed")
        detail = (
            "Vision analysis failed. Please try again."
            if cfg.is_production
            else f"Vision analysis failed: {exc}"
        )
        raise HTTPException(status_code=502, detail=detail) from exc
    finally:
        # Drop reference promptly (ephemeral processing)
        del data

    return AnalyzeResponse(
        text=text,
        mode=mode,
        aim_hint=aim_hint,
        aim_instruction=aim_instruction,
        confidence_note=confidence_note,
        document_kind=document_kind,
        disclaimer=DISCLAIMER,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s", request.url.path)
    cfg = get_settings()
    detail = "Internal server error" if cfg.is_production else str(exc)
    return JSONResponse(status_code=500, content={"detail": detail})
