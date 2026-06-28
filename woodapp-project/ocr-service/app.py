from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from scanner import RapidOcrScanner

logger = logging.getLogger("woodapp-ocr")
logging.basicConfig(level=logging.INFO)

ENGINE_NAME = "rapidocr-onnx"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))

app = FastAPI(title="WoodApp OCR Service", version="2.0.0")
OCR_ENGINE: RapidOcrScanner | None = None
MODEL_READY = False
MODEL_ERROR: dict[str, str] | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _safe_error(exc: Exception) -> dict[str, str]:
    return {
        "errorType": type(exc).__name__,
        "message": str(exc).splitlines()[0][:180],
    }


@app.on_event("startup")
def load_model() -> None:
    global OCR_ENGINE, MODEL_READY, MODEL_ERROR
    try:
        OCR_ENGINE = RapidOcrScanner()
        MODEL_READY = True
        MODEL_ERROR = None
        logger.info("RapidOCR scanner loaded")
    except Exception as exc:
        OCR_ENGINE = None
        MODEL_READY = False
        MODEL_ERROR = _safe_error(exc)
        logger.error("RapidOCR initialization failed: %s", MODEL_ERROR["errorType"])


@app.get("/health")
def health() -> Any:
    if MODEL_READY and OCR_ENGINE is not None:
        return {"status": "ok", "modelLoaded": True, "engine": ENGINE_NAME}

    payload = {
        "status": "error",
        "modelLoaded": False,
        "engine": ENGINE_NAME,
        "errorType": (MODEL_ERROR or {}).get("errorType", "MODEL_NOT_READY"),
    }
    return JSONResponse(status_code=503, content=payload)


@app.post("/recognize")
async def recognize(file: UploadFile = File(...)) -> dict:
    if not MODEL_READY or OCR_ENGINE is None:
        raise HTTPException(status_code=503, detail={"code": "MODEL_NOT_READY", "message": "OCR model is not ready"})

    content_type = file.content_type or ""
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail={"code": "INVALID_IMAGE", "message": "Unsupported image"})

    image_bytes = await file.read()
    logger.info("received file bytes=%s", len(image_bytes))
    if not image_bytes:
        raise HTTPException(status_code=400, detail={"code": "INVALID_IMAGE", "message": "Image is required"})
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail={"code": "INVALID_IMAGE", "message": "Image is too large"})

    try:
        return OCR_ENGINE.recognize(image_bytes)
    except HTTPException:
        raise
    except ValueError as exc:
        logger.info("Invalid OCR image: %s", type(exc).__name__)
        raise HTTPException(status_code=400, detail={"code": "INVALID_IMAGE", "message": "Unsupported image"}) from exc
    except Exception as exc:
        logger.exception("OCR processing failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=500,
            detail={"code": "OCR_PROCESSING_FAILED", "message": "OCR processing failed"},
        ) from exc
