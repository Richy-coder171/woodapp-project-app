from __future__ import annotations

import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from scanner import PaddleScanner

logger = logging.getLogger("woodapp-ocr")
logging.basicConfig(level=logging.INFO)
app = FastAPI(title="WoodApp OCR Service", version="1.0.0")
scanner: PaddleScanner | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
def load_model() -> None:
    global scanner
    scanner = PaddleScanner()
    logger.info("PaddleOCR scanner loaded")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "modelLoaded": scanner is not None}


@app.post("/recognize")
async def recognize(file: UploadFile = File(...)) -> dict:
    if scanner is None:
        raise HTTPException(status_code=503, detail="OCR model is still loading")

    content_type = file.content_type or ""
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Unsupported image")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image is required")

    try:
        return scanner.recognize(image_bytes)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OCR recognition failed")
        message = str(exc).lower()
        if "cannot identify image" in message or "image file is truncated" in message:
            raise HTTPException(status_code=400, detail="Unsupported image") from exc
        raise HTTPException(status_code=422, detail="Image could not be read clearly") from exc
