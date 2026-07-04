from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from time import perf_counter

import cv2
import numpy as np


@dataclass(frozen=True)
class PreparedImage:
    original: np.ndarray
    processed: np.ndarray
    to_original: np.ndarray
    width: int
    height: int
    preprocessing_ms: float


def _resize(image: np.ndarray, max_side: int) -> tuple[np.ndarray, np.ndarray]:
    height, width = image.shape[:2]
    longest = max(width, height)
    if longest <= max_side:
        return image.copy(), np.eye(3, dtype=np.float32)
    scale = max_side / float(longest)
    resized = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
    return resized, np.array([[1 / scale, 0, 0], [0, 1 / scale, 0], [0, 0, 1]], dtype=np.float32)


def _reduce_shadows(gray: np.ndarray) -> np.ndarray:
    background = cv2.medianBlur(cv2.dilate(gray, np.ones((7, 7), np.uint8)), 25)
    diff = 255 - cv2.absdiff(gray, background)
    return cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX)


def _deskew(image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    threshold = cv2.threshold(cv2.bitwise_not(gray), 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    points = cv2.findNonZero(threshold)
    if points is None or len(points) < 20:
        return image, np.eye(3, dtype=np.float32)
    angle = cv2.minAreaRect(points)[-1]
    if angle < -45:
        angle += 90
    if abs(angle) > 8:
        return image, np.eye(3, dtype=np.float32)
    height, width = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2.0, height / 2.0), float(angle), 1.0)
    rotated = cv2.warpAffine(image, matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return rotated, np.linalg.inv(np.vstack([matrix, [0, 0, 1]])).astype(np.float32)


def prepare_image(image: np.ndarray, max_side: int | None = None) -> PreparedImage:
    start = perf_counter()
    if image is None or image.size == 0 or image.dtype != np.uint8:
        raise ValueError("NVIDIA OCR requires a non-empty uint8 image")
    max_side = max_side or int(os.getenv("NVIDIA_OCR_MAX_IMAGE_SIDE", "2200"))
    height, width = image.shape[:2]
    resized, resize_to_original = _resize(image, max_side)
    deskewed, deskew_to_resized = _deskew(resized)
    gray = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY)
    enhanced = _reduce_shadows(gray)
    clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
    enhanced = clahe.apply(enhanced)
    processed = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    to_original = resize_to_original @ deskew_to_resized
    if os.getenv("NVIDIA_OCR_DEBUG", "").lower() in {"1", "true", "yes"}:
        debug_dir = Path(os.getenv("NVIDIA_OCR_DEBUG_DIR", "nvidia-ocr/reports/debug"))
        debug_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug_dir / "processed.jpg"), processed)
    return PreparedImage(image, processed, to_original, width, height, (perf_counter() - start) * 1000)


def map_points_to_original(points: list[list[float]], transform: np.ndarray) -> list[list[float]]:
    mapped: list[list[float]] = []
    for x, y in points:
        target = transform @ np.array([x, y, 1.0], dtype=np.float32)
        if target[2] != 0:
            target = target / target[2]
        mapped.append([float(target[0]), float(target[1])])
    return mapped
