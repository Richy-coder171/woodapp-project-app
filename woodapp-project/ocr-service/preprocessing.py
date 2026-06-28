from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageOps


@dataclass
class PreparedVariant:
    name: str
    image: np.ndarray
    to_original: np.ndarray


@dataclass
class PreparedImage:
    original_width: int
    original_height: int
    variants: list[PreparedVariant]


def decode_image(image_bytes: bytes) -> np.ndarray:
    image = Image.open(BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image).convert("RGB")
    rgb = np.array(image)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _resize_for_ocr(image: np.ndarray, max_side: int = 2200) -> tuple[np.ndarray, np.ndarray]:
    height, width = image.shape[:2]
    longest = max(width, height)
    if longest <= max_side:
        return image.copy(), np.eye(3, dtype=np.float32)

    scale = max_side / float(longest)
    resized = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
    to_original = np.array(
        [
            [1 / scale, 0, 0],
            [0, 1 / scale, 0],
            [0, 0, 1],
        ],
        dtype=np.float32,
    )
    return resized, to_original


def _reduce_shadows(gray: np.ndarray) -> np.ndarray:
    dilated = cv2.dilate(gray, np.ones((7, 7), np.uint8))
    background = cv2.medianBlur(dilated, 21)
    diff = 255 - cv2.absdiff(gray, background)
    return cv2.normalize(diff, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)


def _improve_contrast(gray: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def _improve_color_contrast(image: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    lightness, channel_a, channel_b = cv2.split(lab)
    enhanced_lightness = _improve_contrast(lightness)
    return cv2.cvtColor(cv2.merge([enhanced_lightness, channel_a, channel_b]), cv2.COLOR_LAB2BGR)


def _enhance_blue_ink(image: np.ndarray) -> np.ndarray:
    """Create a high-contrast variant that keeps thin blue handwriting visible."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)
    blue_mask = cv2.inRange(hsv, np.array([85, 25, 20]), np.array([145, 255, 255]))

    # Light paper can also contain faint blue strokes with lower saturation.
    blue_channel = image[:, :, 0].astype(np.int16)
    red_channel = image[:, :, 2].astype(np.int16)
    blue_dominant = ((blue_channel - red_channel) > 18).astype(np.uint8) * 255
    ink_mask = cv2.bitwise_or(blue_mask, blue_dominant)
    ink_mask = cv2.medianBlur(ink_mask, 3)

    paper = np.full_like(value, 255)
    paper[ink_mask > 0] = 0
    paper = cv2.GaussianBlur(paper, (3, 3), 0)
    return cv2.cvtColor(paper, cv2.COLOR_GRAY2BGR)


def _estimate_skew(gray: np.ndarray) -> float:
    inverted = cv2.bitwise_not(gray)
    thresholded = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    points = cv2.findNonZero(thresholded)
    if points is None or len(points) < 20:
        return 0.0

    angle = cv2.minAreaRect(points)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) > 8:
        return 0.0
    return float(angle)


def _rotate(image: np.ndarray, angle: float) -> tuple[np.ndarray, np.ndarray]:
    if abs(angle) < 0.25:
        return image, np.eye(3, dtype=np.float32)

    height, width = image.shape[:2]
    center = (width / 2.0, height / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        image,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    affine = np.vstack([matrix, [0, 0, 1]]).astype(np.float32)
    return rotated, np.linalg.inv(affine)


def _find_page_warp(image: np.ndarray) -> Optional[tuple[np.ndarray, np.ndarray]]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    height, width = image.shape[:2]
    image_area = width * height
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < image_area * 0.25:
            continue
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) != 4:
            continue

        points = approx.reshape(4, 2).astype(np.float32)
        sums = points.sum(axis=1)
        diffs = np.diff(points, axis=1).ravel()
        rect = np.array(
            [
                points[np.argmin(sums)],
                points[np.argmin(diffs)],
                points[np.argmax(sums)],
                points[np.argmax(diffs)],
            ],
            dtype=np.float32,
        )

        target_width = int(max(np.linalg.norm(rect[1] - rect[0]), np.linalg.norm(rect[2] - rect[3])))
        target_height = int(max(np.linalg.norm(rect[3] - rect[0]), np.linalg.norm(rect[2] - rect[1])))
        if target_width < 300 or target_height < 300:
            continue

        destination = np.array(
            [
                [0, 0],
                [target_width - 1, 0],
                [target_width - 1, target_height - 1],
                [0, target_height - 1],
            ],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(rect, destination)
        warped = cv2.warpPerspective(image, matrix, (target_width, target_height))
        inverse = np.linalg.inv(matrix)
        return warped, inverse.astype(np.float32)

    return None


def _threshold(gray: np.ndarray) -> np.ndarray:
    return cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )


def prepare_image(image_bytes: bytes) -> PreparedImage:
    original = decode_image(image_bytes)
    original_height, original_width = original.shape[:2]
    resized, resize_to_original = _resize_for_ocr(original)

    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    gray = _reduce_shadows(gray)
    gray = _improve_contrast(gray)
    skew_angle = _estimate_skew(gray)
    deskewed, deskew_to_resized = _rotate(resized, skew_angle)
    deskewed_to_original = resize_to_original @ deskew_to_resized

    deskewed_gray = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY)
    contrast = _improve_contrast(_reduce_shadows(deskewed_gray))
    thresholded = _threshold(contrast)

    variants = [
        PreparedVariant("original", resized, resize_to_original),
        PreparedVariant("deskewed", deskewed, deskewed_to_original),
        PreparedVariant("contrast_color", _improve_color_contrast(deskewed), deskewed_to_original),
        PreparedVariant("clahe_gray", cv2.cvtColor(contrast, cv2.COLOR_GRAY2BGR), deskewed_to_original),
        PreparedVariant("threshold", cv2.cvtColor(thresholded, cv2.COLOR_GRAY2BGR), deskewed_to_original),
        PreparedVariant("blue_ink", _enhance_blue_ink(deskewed), deskewed_to_original),
    ]

    page = _find_page_warp(deskewed)
    if page:
        warped, warp_to_deskewed = page
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        warped_contrast = _improve_contrast(_reduce_shadows(warped_gray))
        variants.append(
            PreparedVariant(
                "page",
                cv2.cvtColor(warped_contrast, cv2.COLOR_GRAY2BGR),
                deskewed_to_original @ warp_to_deskewed,
            )
        )

    return PreparedImage(
        original_width=original_width,
        original_height=original_height,
        variants=variants,
    )


def map_polygon_to_original(polygon: list[list[float]], to_original: np.ndarray) -> list[list[float]]:
    mapped = []
    for point in polygon:
        source = np.array([point[0], point[1], 1.0], dtype=np.float32)
        target = to_original @ source
        if target[2] != 0:
            target = target / target[2]
        mapped.append([float(target[0]), float(target[1])])
    return mapped
