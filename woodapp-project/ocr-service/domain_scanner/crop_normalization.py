from __future__ import annotations

import cv2
import numpy as np

from .config import CROP_HEIGHT, MAX_CROP_WIDTH
from .schemas import LineBox


def crop_line(image: np.ndarray, line: LineBox, pad: int = 4) -> np.ndarray | None:
    height, width = image.shape[:2]
    x1 = max(0, int(round(line.x)) - pad)
    y1 = max(0, int(round(line.y)) - pad)
    x2 = min(width, int(round(line.x + line.width)) + pad)
    y2 = min(height, int(round(line.y + line.height)) + pad)
    if x2 <= x1 or y2 <= y1:
        return None
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    return crop


def normalize_crop(crop: np.ndarray, target_height: int = CROP_HEIGHT, max_width: int = MAX_CROP_WIDTH) -> np.ndarray:
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    height, width = gray.shape[:2]
    if width <= 0 or height <= 0:
        raise ValueError("Invalid crop")
    scale = target_height / float(height)
    next_width = min(max_width, max(1, int(width * scale)))
    resized = cv2.resize(gray, (next_width, target_height), interpolation=cv2.INTER_AREA)
    canvas = np.full((target_height, max_width), 255, dtype=np.uint8)
    canvas[:, :next_width] = resized
    return canvas
