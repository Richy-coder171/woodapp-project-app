from __future__ import annotations

import logging
import os
from pathlib import Path
from time import perf_counter
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from preprocessing import ImageDecodeError, InvalidImageDimensionsError, decode_image
from scanner import RapidOcrScanner

logger = logging.getLogger("woodapp-ocr")
logging.basicConfig(level=logging.INFO)

ENGINE_NAME = "rapidocr-onnx"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "50000000"))
MIN_IMAGE_SIDE = int(os.getenv("MIN_IMAGE_SIDE", "24"))
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/octet-stream",
    "",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

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


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def read_and_decode_image(file: UploadFile, timings: dict[str, float] | None = None) -> tuple[bytes, Any]:
    content_type = (file.content_type or "").lower().strip()
    extension = Path(file.filename or "").suffix.lower()

    read_start = perf_counter()
    image_bytes = await file.read()
    if timings is not None:
        timings["upload_read_ms"] = (perf_counter() - read_start) * 1000
    logger.info(
        "received file bytes=%s filename_ext=%s content_type=%s",
        len(image_bytes),
        extension or "<none>",
        content_type or "<none>",
    )

    if not image_bytes:
        raise _http_error(400, "EMPTY_IMAGE", "Uploaded image is empty")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise _http_error(400, "IMAGE_TOO_LARGE", "Uploaded image is too large")

    try:
        image = decode_image(image_bytes, timings)
    except ImageDecodeError as exc:
        raise _http_error(400, "IMAGE_DECODE_FAILED", "The uploaded file could not be decoded as a supported image.") from exc
    except InvalidImageDimensionsError as exc:
        raise _http_error(400, "INVALID_IMAGE_DIMENSIONS", "Uploaded image dimensions are invalid.") from exc

    if image is None or image.ndim not in (2, 3):
        raise _http_error(400, "IMAGE_DECODE_FAILED", "The uploaded file could not be decoded as a supported image.")

    height, width = image.shape[:2]
    pixels = width * height
    if width < MIN_IMAGE_SIDE or height < MIN_IMAGE_SIDE or pixels <= 0:
        raise _http_error(400, "INVALID_IMAGE_DIMENSIONS", "Uploaded image dimensions are too small")
    if pixels > MAX_IMAGE_PIXELS:
        raise _http_error(400, "IMAGE_TOO_LARGE", "Uploaded image dimensions are too large")

    mime_is_known = content_type in ALLOWED_IMAGE_TYPES
    extension_is_known = extension in ALLOWED_EXTENSIONS
    if content_type and not mime_is_known and not extension_is_known:
        logger.info("decoded image with unexpected upload metadata content_type=%s extension=%s", content_type, extension or "<none>")

    logger.info("decoded dimensions=%sx%s", width, height)
    return image_bytes, image


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
        logger.exception("RapidOCR initialization failed: %s", MODEL_ERROR["errorType"])


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

    request_start = perf_counter()
    timings: dict[str, float] = {
        "upload_read_ms": 0.0,
        "decode_ms": 0.0,
        "orientation_ms": 0.0,
        "preprocessing_ms": 0.0,
        "full_page_ocr_ms": 0.0,
        "candidate_detection_ms": 0.0,
        "crop_ocr_ms": 0.0,
        "serialization_ms": 0.0,
    }
    try:
        _, image = await read_and_decode_image(file, timings)
        payload = OCR_ENGINE.recognize_image(image)
        diagnostics = payload.get("diagnostics", {}) if isinstance(payload, dict) else {}
        serialization_start = perf_counter()
        returned_detection_count = len(payload.get("detections", [])) if isinstance(payload, dict) else 0
        timings["serialization_ms"] = (perf_counter() - serialization_start) * 1000
        timings["preprocessing_ms"] = float(diagnostics.get("preprocessingMs", diagnostics.get("preprocessing_ms", timings["preprocessing_ms"])))
        timings["full_page_ocr_ms"] = float(diagnostics.get("fullPageOcrMs", diagnostics.get("full_page_ocr_ms", timings["full_page_ocr_ms"])))
        timings["candidate_detection_ms"] = float(diagnostics.get("candidateDetectionMs", diagnostics.get("candidate_detection_ms", timings["candidate_detection_ms"])))
        timings["crop_ocr_ms"] = float(diagnostics.get("cropOcrMs", diagnostics.get("crop_ocr_ms", timings["crop_ocr_ms"])))
        timings["total_ms"] = (perf_counter() - request_start) * 1000
        logger.info(
            "OCR request timings upload_read_ms=%.1f decode_ms=%.1f orientation_ms=%.1f preprocessing_ms=%.1f "
            "full_page_ocr_ms=%.1f candidate_detection_ms=%.1f crop_ocr_ms=%.1f serialization_ms=%.1f total_ms=%.1f "
            "image_width=%s image_height=%s candidate_count=%s rapidocr_box_count=%s returned_detection_count=%s",
            timings["upload_read_ms"],
            timings["decode_ms"],
            timings["orientation_ms"],
            timings["preprocessing_ms"],
            timings["full_page_ocr_ms"],
            timings["candidate_detection_ms"],
            timings["crop_ocr_ms"],
            timings["serialization_ms"],
            timings["total_ms"],
            payload.get("imageWidth") if isinstance(payload, dict) else "",
            payload.get("imageHeight") if isinstance(payload, dict) else "",
            diagnostics.get("candidateCount", 0),
            diagnostics.get("recognizedCount", 0),
            returned_detection_count,
        )
        return payload
    except HTTPException:
        raise
    except (ImageDecodeError, InvalidImageDimensionsError, ValueError) as exc:
        logger.info("Invalid OCR image: %s", type(exc).__name__)
        raise _http_error(400, "IMAGE_DECODE_FAILED", "The uploaded file could not be decoded as a supported image.") from exc
    except Exception as exc:
        logger.exception("OCR processing failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=500,
            detail={"code": "OCR_PROCESSING_FAILED", "message": "Measurement detection failed."},
        ) from exc
