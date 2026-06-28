from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any

import cv2
import numpy as np

from layout import arrange_detections
from preprocessing import PreparedImage, map_polygon_to_original, prepare_decoded_image, prepare_image

logger = logging.getLogger("woodapp-ocr")

SEPARATOR_RE = re.compile(r"\s*(?:x|X|\*|times|by)\s*")
MEASUREMENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)", re.I)
NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
FALLBACK_MIN_DETECTIONS = 5
DEBUG_OUTPUT_DIR = Path(__file__).resolve().parent / "debug-output"
SAVE_DEBUG_OUTPUT = os.getenv("WOODAPP_OCR_DEBUG", "").lower() in {"1", "true", "yes"}


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass
class OcrLine:
    polygon: list[list[float]]
    text: str
    confidence: float


@dataclass
class RegionBox:
    box: dict
    source: str = "opencv"


class RapidOcrResultFormatError(RuntimeError):
    pass


def normalize_measurement_text(text: str) -> str:
    normalized = str(text or "").strip()
    replacements = {
        "×": "x",
        "✕": "x",
        "✖": "x",
        "Ã—": "x",
        "X": "x",
        "*": "x",
        "–": "-",
        "—": "-",
        "−": "-",
        "â€“": "-",
        "â€”": "-",
        "âˆ’": "-",
        ",": ".",
    }
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)

    normalized = re.sub(r"(\d)[Oo](?=\d|\s*x)", r"\g<1>0", normalized)
    normalized = re.sub(r"(x\s*)[Oo](?=\d)", r"\g<1>0", normalized)
    normalized = re.sub(r"(\d)[Il](?=\d|\s*x)", r"\g<1>1", normalized)
    normalized = re.sub(r"(x\s*)[Il](?=\d)", r"\g<1>1", normalized)
    normalized = SEPARATOR_RE.sub(" x ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def parse_measurement(text: str) -> dict:
    parsed = _measurement_parts(text)
    if not parsed:
        return {}
    return {"aRaw": parsed[0], "bRaw": parsed[1]}


def _measurement_parts(text: str) -> tuple[str, str, str] | None:
    normalized = normalize_measurement_text(text)
    match = MEASUREMENT_RE.search(normalized)
    if match:
        first, second = match.group(1), match.group(2)
        return first, second, f"{first} x {second}"

    numbers = NUMBER_RE.findall(normalized)
    if len(numbers) >= 2:
        first, second = numbers[0], numbers[1]
        return first, second, f"{first} x {second}"

    return None


def create_rapidocr_engine() -> Any:
    from rapidocr import RapidOCR

    return RapidOCR()


def _run_ocr(ocr: Any, image: Any) -> Any:
    if callable(ocr):
        return ocr(image)
    if hasattr(ocr, "ocr"):
        return ocr.ocr(image)
    if hasattr(ocr, "predict"):
        return ocr.predict(image)
    raise RuntimeError("Unsupported RapidOCR runtime")


def _plain(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def _payload_from_json_like(value: Any) -> Any:
    candidate = value
    to_dict = getattr(candidate, "to_dict", None)
    if callable(to_dict):
        candidate = to_dict()

    json_attr = getattr(candidate, "json", None)
    if json_attr is not None:
        candidate = json_attr() if callable(json_attr) else json_attr

    candidate = _plain(candidate)
    if isinstance(candidate, str):
        return json.loads(candidate)
    return candidate


def _public_attribute_names(value: Any) -> list[str]:
    names = []
    for name in dir(value):
        if name.startswith("_"):
            continue
        try:
            attr = getattr(value, name)
        except Exception:
            continue
        if callable(attr):
            continue
        names.append(name)
    return sorted(names)


def _result_shape_error(value: Any) -> RapidOcrResultFormatError:
    attrs = _public_attribute_names(value) if value is not None else []
    return RapidOcrResultFormatError(
        f"Unknown RapidOCR result shape type={type(value).__name__} attrs={attrs}"
    )


def _first_present(mapping: dict, keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def _as_result_mapping(value: Any) -> dict | None:
    try:
        payload = _payload_from_json_like(value)
    except Exception:
        return None

    if isinstance(payload, dict):
        inner = payload.get("res")
        if isinstance(inner, dict):
            return inner
        return payload
    return None


def _polygon_from_box(box: Any) -> list[list[float]] | None:
    box = _plain(box)
    if box is None:
        return None

    if isinstance(box, dict):
        if {"x", "y", "width", "height"}.issubset(box):
            x = float(box["x"])
            y = float(box["y"])
            width = float(box["width"])
            height = float(box["height"])
            return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
        return None

    if isinstance(box, (list, tuple)) and len(box) == 4 and all(isinstance(item, (int, float)) for item in box):
        x1, y1, x2, y2 = [float(item) for item in box]
        return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]

    if isinstance(box, (list, tuple)) and len(box) >= 4:
        points = []
        for point in box[:4]:
            point = _plain(point)
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                return None
            points.append([float(point[0]), float(point[1])])
        return points

    return None


def _extract_lines_from_mapping(mapping: dict) -> list[OcrLine] | None:
    boxes = _first_present(mapping, ("rec_polys", "rec_boxes", "dt_polys", "dt_boxes", "boxes", "polys"))
    texts = _first_present(mapping, ("rec_texts", "texts", "txts", "text", "strs"))
    scores = _first_present(mapping, ("rec_scores", "scores", "confidences", "confidence"))

    if isinstance(texts, str):
        texts = [texts]
    boxes = _plain(boxes)
    scores = _plain(scores)
    if boxes is None:
        boxes = []
    if texts is None:
        texts = []
    if scores is None:
        scores = []

    if not isinstance(texts, (list, tuple)) or not isinstance(boxes, (list, tuple)):
        return None

    lines: list[OcrLine] = []
    for index, text in enumerate(texts):
        box = boxes[index] if index < len(boxes) else None
        polygon = _polygon_from_box(box)
        if polygon is None:
            continue
        score = scores[index] if isinstance(scores, (list, tuple)) and index < len(scores) else 0.0
        try:
            confidence = float(score)
        except (TypeError, ValueError):
            confidence = 0.0
        lines.append(OcrLine(polygon=polygon, text=str(text), confidence=confidence))
    return lines


def _extract_legacy_lines(page: Any) -> list[OcrLine] | None:
    page = _plain(page)
    if not isinstance(page, (list, tuple)):
        return None

    lines: list[OcrLine] = []
    for item in page:
        item = _plain(item)
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        polygon = _polygon_from_box(item[0])
        if polygon is None:
            continue
        if len(item) >= 3 and isinstance(item[1], str):
            text = str(item[1])
            try:
                confidence = float(item[2])
            except (TypeError, ValueError):
                confidence = 0.0
        else:
            text_score = item[1]
            if isinstance(text_score, (list, tuple)):
                text = str(text_score[0] if text_score else "")
                confidence = float(text_score[1]) if len(text_score) > 1 else 0.0
            else:
                text = str(text_score)
                confidence = 0.0
        lines.append(OcrLine(polygon=polygon, text=text, confidence=confidence))
    return lines


def _extract_lines(result: Any) -> tuple[list[OcrLine], bool]:
    if isinstance(result, (list, tuple)) and len(result) == 0:
        return [], True

    mapping = _as_result_mapping(result)
    if mapping is not None:
        lines = _extract_lines_from_mapping(mapping)
        if lines is not None:
            return lines, True

    if isinstance(result, dict):
        lines = _extract_lines_from_mapping(result)
        if lines is not None:
            return lines, True

    rapid_attrs = {}
    for field in ("boxes", "txts", "texts", "scores", "rec_texts", "rec_scores", "rec_polys"):
        if hasattr(result, field):
            rapid_attrs[field] = getattr(result, field)
    if rapid_attrs:
        lines = _extract_lines_from_mapping(rapid_attrs)
        if lines is not None:
            return lines, True

    pages = result if isinstance(result, list) else [result]
    found_known_shape = False
    lines: list[OcrLine] = []
    for page in pages:
        mapping = _as_result_mapping(page)
        if mapping is not None:
            extracted = _extract_lines_from_mapping(mapping)
            if extracted is not None:
                found_known_shape = True
                lines.extend(extracted)
                continue

        extracted = _extract_legacy_lines(page)
        if extracted is not None:
            found_known_shape = True
            lines.extend(extracted)

    return lines, found_known_shape


def adapt_rapidocr_result(result: Any) -> list[dict]:
    lines, known_shape = _extract_lines(result)
    if not known_shape:
        raise _result_shape_error(result)
    return [
        {
            "text": str(line.text),
            "confidence": float(line.confidence),
            "polygon": [[float(point[0]), float(point[1])] for point in line.polygon],
        }
        for line in lines
    ]


def _box_from_polygon(polygon: list[list[float]], image_width: int, image_height: int) -> dict:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    x1 = max(0.0, min(xs))
    y1 = max(0.0, min(ys))
    x2 = min(float(image_width), max(xs))
    y2 = min(float(image_height), max(ys))
    return {
        "x": round(x1, 2),
        "y": round(y1, 2),
        "width": round(max(1.0, x2 - x1), 2),
        "height": round(max(1.0, y2 - y1), 2),
    }


def _polygon_from_rect(box: dict) -> list[list[float]]:
    x = float(box["x"])
    y = float(box["y"])
    width = float(box["width"])
    height = float(box["height"])
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


def _center_y(line: OcrLine) -> float:
    box = _box_from_polygon(line.polygon, 10**9, 10**9)
    return box["y"] + box["height"] / 2


def _center_x(line: OcrLine) -> float:
    box = _box_from_polygon(line.polygon, 10**9, 10**9)
    return box["x"] + box["width"] / 2


def _vertical_overlap(a: dict, b: dict) -> float:
    top = max(a["y"], b["y"])
    bottom = min(a["y"] + a["height"], b["y"] + b["height"])
    overlap = max(0.0, bottom - top)
    return overlap / max(1.0, min(a["height"], b["height"]))


def _union_box(boxes: list[dict]) -> dict:
    x1 = min(box["x"] for box in boxes)
    y1 = min(box["y"] for box in boxes)
    x2 = max(box["x"] + box["width"] for box in boxes)
    y2 = max(box["y"] + box["height"] for box in boxes)
    return {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}


def _expand_box(box: dict, image_width: int, image_height: int, pad: float) -> dict:
    x1 = max(0.0, float(box["x"]) - pad)
    y1 = max(0.0, float(box["y"]) - pad)
    x2 = min(float(image_width), float(box["x"]) + float(box["width"]) + pad)
    y2 = min(float(image_height), float(box["y"]) + float(box["height"]) + pad)
    return {
        "x": round(x1, 2),
        "y": round(y1, 2),
        "width": round(max(1.0, x2 - x1), 2),
        "height": round(max(1.0, y2 - y1), 2),
    }


def _box_center_y(box: dict) -> float:
    return float(box["y"]) + float(box["height"]) / 2


def _box_center_x(box: dict) -> float:
    return float(box["x"]) + float(box["width"]) / 2


def _create_blue_ink_mask(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    blue_mask = cv2.inRange(hsv, np.array([82, 18, 20]), np.array([150, 255, 255]))

    blue = image[:, :, 0].astype(np.int16)
    green = image[:, :, 1].astype(np.int16)
    red = image[:, :, 2].astype(np.int16)
    blue_dominant = ((blue - red > 14) & (blue - green > -8)).astype(np.uint8) * 255
    mask = cv2.bitwise_or(blue_mask, blue_dominant)
    return cv2.medianBlur(mask, 3)


def _create_enhanced_gray(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    return clahe.apply(gray)


def _create_handwriting_mask(image: np.ndarray) -> np.ndarray:
    gray = _create_enhanced_gray(image)
    threshold = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        35,
        11,
    )
    blue_mask = _create_blue_ink_mask(image)
    mask = cv2.bitwise_or(threshold, blue_mask)
    mask = cv2.medianBlur(mask, 3)
    return mask


def _component_boxes(mask: np.ndarray) -> list[dict]:
    height, width = mask.shape[:2]
    image_area = max(1, height * width)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    boxes: list[dict] = []

    for index in range(1, count):
        x, y, w, h, area = stats[index]
        if area < max(6, image_area * 0.000004):
            continue
        if w < max(2, width * 0.002) or h < max(3, height * 0.002):
            continue
        if w > width * 0.85 or h > height * 0.25:
            continue
        boxes.append({"x": float(x), "y": float(y), "width": float(w), "height": float(h)})

    return boxes


def _group_components_into_lines(components: list[dict], image_width: int, image_height: int) -> list[dict]:
    if not components:
        return []

    heights = sorted(max(1.0, float(box["height"])) for box in components)
    widths = sorted(max(1.0, float(box["width"])) for box in components)
    median_height = heights[len(heights) // 2]
    median_width = widths[len(widths) // 2]

    components = sorted(components, key=lambda box: (_box_center_y(box), float(box["x"])))
    rows: list[list[dict]] = []
    for box in components:
        placed = False
        for row in rows:
            row_box = _union_box(row)
            baseline_gap = abs(_box_center_y(box) - _box_center_y(row_box))
            if baseline_gap <= max(median_height * 0.9, row_box["height"] * 0.65) or _vertical_overlap(box, row_box) >= 0.35:
                row.append(box)
                placed = True
                break
        if not placed:
            rows.append([box])

    line_boxes: list[dict] = []
    for row in rows:
        row.sort(key=lambda box: box["x"])
        current: list[dict] = []
        for box in row:
            if not current:
                current.append(box)
                continue

            previous = current[-1]
            gap = float(box["x"]) - (float(previous["x"]) + float(previous["width"]))
            row_box = _union_box(current)
            max_gap = max(median_width * 4.0, median_height * 3.0, row_box["height"] * 3.0)
            column_gap = max(image_width * 0.075, median_height * 2.7, median_width * 4.5)
            likely_new_column = gap > column_gap
            same_line = _vertical_overlap(box, row_box) >= 0.25 or abs(_box_center_y(box) - _box_center_y(row_box)) <= median_height

            if same_line and gap <= max_gap and not likely_new_column:
                current.append(box)
            else:
                line_boxes.append(_union_box(current))
                current = [box]
        if current:
            line_boxes.append(_union_box(current))

    min_width = max(median_width * 2.4, image_width * 0.025)
    min_height = max(5.0, median_height * 0.65)
    useful = [
        _expand_box(box, image_width, image_height, max(4.0, median_height * 0.35))
        for box in line_boxes
        if box["width"] >= min_width and box["height"] >= min_height
    ]
    useful.sort(key=lambda box: (box["x"], box["y"]))
    return useful


def detect_opencv_regions(image: np.ndarray) -> tuple[list[RegionBox], dict[str, np.ndarray]]:
    mask = _create_handwriting_mask(image)
    height, width = image.shape[:2]
    components = _component_boxes(mask)
    line_boxes = _group_components_into_lines(components, width, height)

    debug_image = image.copy()
    for box in line_boxes:
        x1 = int(round(box["x"]))
        y1 = int(round(box["y"]))
        x2 = int(round(box["x"] + box["width"]))
        y2 = int(round(box["y"] + box["height"]))
        cv2.rectangle(debug_image, (x1, y1), (x2, y2), (0, 180, 0), 2)

    threshold = cv2.adaptiveThreshold(
        _create_enhanced_gray(image),
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        35,
        11,
    )
    debug = {
        "original": image,
        "blue-ink-mask": _create_blue_ink_mask(image),
        "enhanced-gray": _create_enhanced_gray(image),
        "threshold": threshold,
        "opencv-rectangles": debug_image,
    }
    return [RegionBox(box=box) for box in line_boxes], debug


def _save_debug_artifacts(debug_images: dict[str, np.ndarray]) -> None:
    if not SAVE_DEBUG_OUTPUT:
        return
    DEBUG_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, image in debug_images.items():
        cv2.imwrite(str(DEBUG_OUTPUT_DIR / f"{name}.png"), image)


def _crop_variants(image: np.ndarray, box: dict) -> list[np.ndarray]:
    height, width = image.shape[:2]
    raw_x1 = max(0, int(round(float(box["x"]))))
    raw_y1 = max(0, int(round(float(box["y"]))))
    raw_x2 = min(width, int(round(float(box["x"]) + float(box["width"]))))
    raw_y2 = min(height, int(round(float(box["y"]) + float(box["height"]))))
    if raw_x2 <= raw_x1 or raw_y2 <= raw_y1:
        return []

    padded = _expand_box(box, width, height, max(6.0, float(box["height"]) * 0.25))
    x1 = int(max(0, round(padded["x"])))
    y1 = int(max(0, round(padded["y"])))
    x2 = int(min(width, round(padded["x"] + padded["width"])))
    y2 = int(min(height, round(padded["y"] + padded["height"])))
    if x2 <= x1 or y2 <= y1:
        return []
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return []

    gray = _create_enhanced_gray(crop)
    blue_mask = _create_blue_ink_mask(crop)
    blue_on_white = np.full_like(blue_mask, 255)
    blue_on_white[blue_mask > 0] = 0
    return [
        crop,
        cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR),
        cv2.cvtColor(blue_on_white, cv2.COLOR_GRAY2BGR),
    ]


def _raw_result_count(result: Any) -> int:
    if result is None:
        return 0
    if isinstance(result, (list, tuple)):
        return len(result)
    mapping = _as_result_mapping(result)
    if mapping is not None:
        texts = _first_present(mapping, ("rec_texts", "texts", "txts", "text", "strs"))
        if texts is None:
            texts = []
        if isinstance(texts, (list, tuple)):
            return len(texts)
        return 1 if texts else 0
    for field in ("txts", "texts", "rec_texts"):
        if hasattr(result, field):
            texts = getattr(result, field)
            if texts is None:
                return 0
            if isinstance(texts, (list, tuple)):
                return len(texts)
            return 1
    return 1


def _recognize_text_from_crop(ocr: Any, crop: np.ndarray) -> tuple[str, float, int, int]:
    best_text = ""
    best_confidence = 0.0
    raw_count = 0
    extracted_count = 0

    for variant in _crop_variants(crop, {"x": 0, "y": 0, "width": crop.shape[1], "height": crop.shape[0]}):
        result = _run_ocr(ocr, variant)
        raw_count += _raw_result_count(result)
        try:
            adapted = adapt_rapidocr_result(result)
        except RapidOcrResultFormatError as exc:
            raise RuntimeError(f"Unexpected RapidOCR crop response shape: {exc}") from exc
        lines = [OcrLine(item["polygon"], item["text"], item["confidence"]) for item in adapted]
        extracted_count += len(lines)
        if not lines:
            continue

        lines.sort(key=lambda line: (_center_y(line), _center_x(line)))
        text = " ".join(line.text.strip() for line in lines if line.text.strip())
        confidence = sum(line.confidence for line in lines) / max(1, len(lines))
        if _measurement_parts(text):
            return text, confidence, raw_count, extracted_count
        if len(text) > len(best_text):
            best_text = text
            best_confidence = confidence

    return best_text, best_confidence, raw_count, extracted_count


def _split_multiline(line: OcrLine, image_width: int, image_height: int) -> list[OcrLine]:
    parts = [part.strip() for part in re.split(r"[\r\n]+", line.text) if part.strip()]
    if len(parts) <= 1:
        return [line]

    box = _box_from_polygon(line.polygon, image_width, image_height)
    part_height = box["height"] / len(parts)
    split_lines = []
    for index, part in enumerate(parts):
        next_box = {
            "x": box["x"],
            "y": box["y"] + index * part_height,
            "width": box["width"],
            "height": part_height,
        }
        split_lines.append(OcrLine(_polygon_from_rect(next_box), part, line.confidence))
    return split_lines


def _join_nearby_pieces(lines: list[OcrLine], image_width: int, image_height: int) -> list[OcrLine]:
    split_lines = []
    for line in lines:
        split_lines.extend(_split_multiline(line, image_width, image_height))

    split_lines.sort(key=lambda line: (_center_y(line), _center_x(line)))
    rows: list[list[OcrLine]] = []
    for line in split_lines:
        box = _box_from_polygon(line.polygon, image_width, image_height)
        placed = False
        for row in rows:
            row_box = _union_box([_box_from_polygon(item.polygon, image_width, image_height) for item in row])
            same_baseline = abs((box["y"] + box["height"] / 2) - (row_box["y"] + row_box["height"] / 2)) <= max(12, row_box["height"] * 0.75)
            if same_baseline or _vertical_overlap(box, row_box) >= 0.45:
                row.append(line)
                placed = True
                break
        if not placed:
            rows.append([line])

    joined: list[OcrLine] = []
    for row in rows:
        row.sort(key=lambda line: _box_from_polygon(line.polygon, image_width, image_height)["x"])
        current: list[OcrLine] = []
        for line in row:
            if not current:
                current.append(line)
                continue

            previous_box = _box_from_polygon(current[-1].polygon, image_width, image_height)
            next_box = _box_from_polygon(line.polygon, image_width, image_height)
            gap = next_box["x"] - (previous_box["x"] + previous_box["width"])
            max_gap = max(previous_box["height"], next_box["height"]) * 4.5
            same_line = _vertical_overlap(previous_box, next_box) >= 0.35

            if same_line and gap <= max_gap:
                current.append(line)
            else:
                joined.append(_join_group(current, image_width, image_height))
                current = [line]

        if current:
            joined.append(_join_group(current, image_width, image_height))

    return joined


def _join_group(group: list[OcrLine], image_width: int, image_height: int) -> OcrLine:
    if len(group) == 1:
        return group[0]
    boxes = [_box_from_polygon(item.polygon, image_width, image_height) for item in group]
    union = _union_box(boxes)
    text = " ".join(item.text.strip() for item in group if item.text.strip())
    confidence = sum(item.confidence for item in group) / max(1, len(group))
    return OcrLine(_polygon_from_rect(union), text, confidence)


def _candidate_detections(lines: list[OcrLine], image_width: int, image_height: int) -> list[dict]:
    detections: list[dict] = []
    for line in _join_nearby_pieces(lines, image_width, image_height):
        box = _box_from_polygon(line.polygon, image_width, image_height)
        normalized = normalize_measurement_text(line.text)
        matches = list(MEASUREMENT_RE.finditer(normalized))

        if len(matches) > 1:
            part_width = box["width"] / len(matches)
            for index, match in enumerate(matches):
                part_box = dict(box)
                part_box["x"] = round(box["x"] + index * part_width, 2)
                part_box["width"] = round(part_width, 2)
                detections.append(_make_detection(line, match.group(0), part_box))
            continue

        parts = _measurement_parts(normalized)
        if not parts:
            continue
        detections.append(_make_detection(line, parts[2], box))
    return detections


def _make_detection(line: OcrLine, text: str, box: dict) -> dict:
    parts = _measurement_parts(text)
    normalized_text = parts[2] if parts else normalize_measurement_text(text)
    parsed = parse_measurement(normalized_text)
    return {
        "id": "",
        "rawText": line.text,
        "normalizedText": normalized_text,
        "confidence": round(max(0.0, min(1.0, line.confidence)), 4),
        "selected": True,
        "columnIndex": 0,
        "rowIndex": 0,
        "box": box,
        "normalizedBox": {},
        "parsedValues": parsed,
    }


def _iou(a: dict, b: dict) -> float:
    ax2 = a["x"] + a["width"]
    ay2 = a["y"] + a["height"]
    bx2 = b["x"] + b["width"]
    by2 = b["y"] + b["height"]
    ix1 = max(a["x"], b["x"])
    iy1 = max(a["y"], b["y"])
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    intersection = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(1.0, a["width"] * a["height"])
    area_b = max(1.0, b["width"] * b["height"])
    return intersection / (area_a + area_b - intersection)


def _dedupe_detections(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged = list(existing)
    for item in incoming:
        duplicate_index = None
        for index, current in enumerate(merged):
            same_text = item["normalizedText"] == current["normalizedText"]
            overlaps = _iou(item["box"], current["box"]) >= 0.35
            close = (
                abs(item["box"]["x"] - current["box"]["x"]) <= max(item["box"]["height"], current["box"]["height"])
                and abs(item["box"]["y"] - current["box"]["y"]) <= max(item["box"]["height"], current["box"]["height"])
            )
            if overlaps or (same_text and close):
                duplicate_index = index
                break

        if duplicate_index is None:
            merged.append(item)
        elif item["confidence"] > merged[duplicate_index]["confidence"]:
            merged[duplicate_index] = item
    return merged


class RapidOcrScanner:
    engine = "rapidocr-onnx"

    def __init__(
        self,
        ocr_engine: Any | None = None,
        use_fallback_variants: bool | None = None,
        use_opencv_fallback: bool | None = None,
    ) -> None:
        self.ocr = ocr_engine if ocr_engine is not None else create_rapidocr_engine()
        self.use_fallback_variants = (
            _env_bool("OCR_ENABLE_FALLBACK_VARIANTS", False)
            if use_fallback_variants is None
            else use_fallback_variants
        )
        self.use_opencv_fallback = (
            _env_bool("OCR_ENABLE_OPENCV_FALLBACK", False)
            if use_opencv_fallback is None
            else use_opencv_fallback
        )

    def recognize(self, image_bytes: bytes) -> dict:
        prepared = prepare_image(image_bytes)
        return self.recognize_prepared(prepared)

    def recognize_image(self, image: np.ndarray) -> dict:
        return self.recognize_prepared(prepare_decoded_image(image))

    def recognize_prepared(self, prepared: PreparedImage) -> dict:
        detections, diagnostics = self._detect(prepared)
        arranged = arrange_detections(detections, prepared.original_width, prepared.original_height)
        diagnostics["returned detections"] = len(arranged)
        logger.info(
            "OCR diagnostic counts: received image size=%s processed image size=%s OCR raw result count=%s "
            "OCR extracted text count=%s OpenCV region count=%s plausible measurement count=%s returned detection count=%s",
            diagnostics.get("received image size", ""),
            diagnostics.get("processed image size", ""),
            diagnostics.get("OCR raw result count", 0),
            diagnostics.get("OCR extracted text count", 0),
            diagnostics.get("OpenCV region count", 0),
            diagnostics.get("plausible measurement count", 0),
            diagnostics.get("returned detections", 0),
        )
        return {
            "imageWidth": prepared.original_width,
            "imageHeight": prepared.original_height,
            "engine": self.engine,
            "detections": arranged,
            "diagnostics": {
                "candidateCount": int(diagnostics.get("OpenCV region count", 0)),
                "recognizedCount": int(diagnostics.get("OCR extracted text count", 0)),
                "returnedCount": len(arranged),
                "preprocessingMs": int(diagnostics.get("preprocessing_ms", 0)),
                "fullPageOcrMs": int(diagnostics.get("full_page_ocr_ms", 0)),
                "candidateDetectionMs": int(diagnostics.get("candidate_detection_ms", 0)),
                "cropOcrMs": int(diagnostics.get("crop_ocr_ms", 0)),
            },
        }

    def _detect(self, prepared: PreparedImage) -> tuple[list[dict], dict[str, int]]:
        all_detections: list[dict] = []
        diagnostics: dict[str, Any] = {
            "received image size": f"{prepared.original_width}x{prepared.original_height}",
            "processed image size": "",
            "OCR raw result count": 0,
            "OCR extracted text count": 0,
            "OpenCV region count": 0,
            "plausible measurement count": 0,
        }

        variants = prepared.variants[:1]
        fallback_variants = prepared.variants[1:]

        full_page_start = perf_counter()
        for variant in variants:
            diagnostics["processed image size"] = f"{variant.image.shape[1]}x{variant.image.shape[0]}"
            variant_detections, line_count, raw_count = self._detect_variant(prepared, variant)
            diagnostics["OCR raw result count"] += raw_count
            diagnostics["OCR extracted text count"] += line_count
            diagnostics[f"{variant.name} OCR boxes"] = line_count
            diagnostics[f"{variant.name} parsed detections"] = len(variant_detections)
            all_detections = _dedupe_detections(all_detections, variant_detections)
        diagnostics["full_page_ocr_ms"] = int((perf_counter() - full_page_start) * 1000)

        preprocessing_start = perf_counter()
        if self.use_fallback_variants and len(all_detections) < FALLBACK_MIN_DETECTIONS:
            for variant in fallback_variants:
                variant_detections, line_count, raw_count = self._detect_variant(prepared, variant)
                diagnostics["OCR raw result count"] += raw_count
                diagnostics["OCR extracted text count"] += line_count
                diagnostics[f"{variant.name} OCR boxes"] = line_count
                diagnostics[f"{variant.name} parsed detections"] = len(variant_detections)
                all_detections = _dedupe_detections(all_detections, variant_detections)
        diagnostics["preprocessing_ms"] = int((perf_counter() - preprocessing_start) * 1000)

        candidate_start = perf_counter()
        if self.use_opencv_fallback and len(all_detections) < FALLBACK_MIN_DETECTIONS:
            region_detections, region_count, region_raw_count, region_text_count = self._detect_opencv_fallback(prepared)
            diagnostics["OpenCV region count"] = region_count
            diagnostics["OCR raw result count"] += region_raw_count
            diagnostics["OCR extracted text count"] += region_text_count
            diagnostics["opencv parsed detections"] = len(region_detections)
            all_detections = _dedupe_detections(all_detections, region_detections)
        diagnostics["candidate_detection_ms"] = int((perf_counter() - candidate_start) * 1000)
        diagnostics["crop_ocr_ms"] = diagnostics.get("candidate_detection_ms", 0)

        diagnostics["parsed detections"] = len(all_detections)
        diagnostics["plausible measurement count"] = len(all_detections)
        return all_detections, diagnostics

    def _detect_variant(self, prepared: PreparedImage, variant: Any) -> tuple[list[dict], int, int]:
        result = _run_ocr(self.ocr, variant.image)
        raw_count = _raw_result_count(result)
        try:
            adapted = adapt_rapidocr_result(result)
        except RapidOcrResultFormatError as exc:
            raise RuntimeError(f"Unexpected RapidOCR response shape for variant {variant.name}: {exc}") from exc

        mapped_lines = [
            OcrLine(
                polygon=map_polygon_to_original(item["polygon"], variant.to_original),
                text=item["text"],
                confidence=item["confidence"],
            )
            for item in adapted
        ]
        detections = _candidate_detections(mapped_lines, prepared.original_width, prepared.original_height)
        return detections, len(adapted), raw_count

    def _detect_opencv_fallback(self, prepared: PreparedImage) -> tuple[list[dict], int, int, int]:
        original_variant = prepared.variants[0]
        regions, debug_images = detect_opencv_regions(original_variant.image)
        _save_debug_artifacts(debug_images)

        detections: list[dict] = []
        raw_count = 0
        text_count = 0
        image_height, image_width = original_variant.image.shape[:2]

        for region in regions:
            crop_box = _expand_box(region.box, image_width, image_height, max(6.0, region.box["height"] * 0.22))
            x1 = int(max(0, round(crop_box["x"])))
            y1 = int(max(0, round(crop_box["y"])))
            x2 = int(min(image_width, round(crop_box["x"] + crop_box["width"])))
            y2 = int(min(image_height, round(crop_box["y"] + crop_box["height"])))
            if x2 <= x1 or y2 <= y1:
                continue
            crop = original_variant.image[y1:y2, x1:x2]

            raw_text = ""
            confidence = 0.0
            if crop.size:
                raw_text, confidence, crop_raw_count, crop_text_count = _recognize_text_from_crop(self.ocr, crop)
                raw_count += crop_raw_count
                text_count += crop_text_count

            mapped_polygon = map_polygon_to_original(_polygon_from_rect(region.box), original_variant.to_original)
            original_box = _box_from_polygon(mapped_polygon, prepared.original_width, prepared.original_height)
            detections.append(_make_detection(OcrLine(mapped_polygon, raw_text, confidence), raw_text, original_box))

        return detections, len(regions), raw_count, text_count
