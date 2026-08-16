"""AccessLens AI — FastAPI backend."""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .pipeline import DISCLAIMER, analyze_image
from .schemas import AnalyzeMode, AnalyzeResponse, HealthResponse

app = FastAPI(
    title="AccessLens AI",
    description="Multimodal accessibility copilot API",
    version="1.0.0",
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    cfg = get_settings()
    return HealthResponse(
        status="ok",
        gemini_configured=bool(cfg.gemini_api_key),
        model=cfg.gemini_model,
    )


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    image: UploadFile = File(..., description="Captured or uploaded image"),
    mode: AnalyzeMode = Form(AnalyzeMode.simple),
    question: Optional[str] = Form(None),
) -> AnalyzeResponse:
    cfg = get_settings()

    if not cfg.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Server is missing GEMINI_API_KEY. Add it to backend/.env",
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
        text, confidence_note = analyze_image(
            settings=cfg,
            image_bytes=data,
            mode=mode,
            question=question,
            filename=image.filename,
            content_type=content_type or None,
        )
    except Exception as exc:  # noqa: BLE001 — surface Gemini/network errors cleanly
        raise HTTPException(
            status_code=502,
            detail=f"Vision analysis failed: {exc}",
        ) from exc
    finally:
        # Drop reference promptly (ephemeral processing)
        del data

    return AnalyzeResponse(
        text=text,
        mode=mode,
        confidence_note=confidence_note,
        disclaimer=DISCLAIMER,
    )
