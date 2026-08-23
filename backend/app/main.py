"""ANVAYA — FastAPI backend."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings
from .image_guard import ALLOWED_MIME_TYPES, sniff_image_mime
from .pipeline import DISCLAIMER, analyze_image
from .rate_limit import AnalyzeAbuseGuard
from .schemas import AnalyzeMode, AnalyzeResponse, HealthResponse

logger = logging.getLogger("anvaya")

_boot = get_settings()
_abuse_guard = AnalyzeAbuseGuard(
    per_minute=_boot.rate_limit_per_minute,
    per_hour=_boot.rate_limit_per_hour,
    per_day=_boot.rate_limit_per_day,
    global_per_day=_boot.global_daily_analyze_limit,
)
_analyze_slots = asyncio.Semaphore(_boot.max_concurrent_analyze)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_settings()
    if cfg.is_production:
        origins = cfg.cors_origin_list
        if not origins or "*" in origins:
            raise RuntimeError(
                "Set CORS_ORIGINS to your exact frontend HTTPS origin (no *) before going live."
            )
        if not cfg.gemini_api_key:
            logger.warning("GEMINI_API_KEY is empty — /analyze will return 503")
    yield


app = FastAPI(
    title="ANVAYA",
    description="Multimodal accessibility copilot API",
    version="1.2.0",
    lifespan=lifespan,
    docs_url=None if _boot.is_production else "/docs",
    redoc_url=None if _boot.is_production else "/redoc",
    openapi_url=None if _boot.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_boot.cors_origin_list,
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
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(SecurityHeadersMiddleware)


def _client_key(request: Request) -> str:
    """Prefer the IP added by our host (last X-Forwarded-For hop)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[-1][:64]
    if request.client:
        return request.client.host[:64]
    return "unknown"


def _too_many(detail: str, retry_after: str = "60") -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=detail,
        headers={"Retry-After": retry_after},
    )


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
    payload = {"service": "ANVAYA", "health": "/health"}
    if not get_settings().is_production:
        payload["docs"] = "/docs"
    return payload


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    image: UploadFile = File(..., description="Captured or uploaded image"),
    mode: AnalyzeMode = Form(AnalyzeMode.read),
    question: Optional[str] = Form(None),
) -> AnalyzeResponse:
    cfg = get_settings()

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            size = int(content_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid content length.") from exc
        if size > cfg.max_image_bytes + 262_144:
            raise HTTPException(status_code=413, detail="Upload too large.")

    blocked = _abuse_guard.admit(_client_key(request))
    if blocked:
        raise _too_many(blocked)

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

    if _analyze_slots.locked():
        raise _too_many("ANVAYA is busy. Please try again in a moment.", "15")

    async with _analyze_slots:
        data = await image.read()
        try:
            if not data:
                raise HTTPException(status_code=400, detail="Empty image upload.")
            if len(data) > cfg.max_image_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        "Image too large. Max size is "
                        f"{cfg.max_image_bytes // (1024 * 1024)} MB."
                    ),
                )

            sniffed = sniff_image_mime(data)
            if sniffed is None:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported file. Please send a JPEG, PNG, WebP, or GIF photo.",
                )
            declared = (image.content_type or "").lower()
            if declared and declared not in ALLOWED_MIME_TYPES and not declared.startswith(
                "image/"
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported file type. Please upload a JPEG, PNG, WebP, or GIF image.",
                )

            text, confidence_note, aim_hint, aim_instruction, document_kind = analyze_image(
                settings=cfg,
                image_bytes=data,
                mode=mode,
                question=question,
                filename=image.filename,
                content_type=sniffed,
            )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 — surface Gemini/network errors cleanly
            logger.exception("Vision analysis failed")
            detail = (
                "Vision analysis failed. Please try again."
                if cfg.is_production
                else f"Vision analysis failed: {exc}"
            )
            raise HTTPException(status_code=502, detail=detail) from exc
        finally:
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
