from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from layout import arrange_detections
from preprocessing import PreparedImage, map_polygon_to_original, prepare_image

logger = logging.getLogger("woodapp-ocr")

SEPARATOR_RE = re.compile(r"\s*(?:x|X|\*|times|by)\s*")
MEASUREMENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)", re.I)
NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
FALLBACK_MIN_DETECTIONS = 5


@dataclass
class OcrLine:
    polygon: list[list[float]]
    text: str
    confidence: float


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


def _create_ocr() -> Any:
    from paddleocr import PaddleOCR

    try:
        return PaddleOCR(
            lang="en",
            ocr_version="PP-OCRv5",
            use_textline_orientation=True,
        )
    except TypeError:
        pass

    try:
        return PaddleOCR(
            lang="en",
            use_angle_cls=True,
            ocr_version="PP-OCRv5",
            show_log=False,
        )
    except TypeError:
        return PaddleOCR(lang="en", use_angle_cls=True, show_log=False)


def _run_ocr(ocr: Any, image: Any) -> Any:
    if hasattr(ocr, "ocr"):
        try:
            return ocr.ocr(image, cls=True)
        except TypeError:
            return ocr.ocr(image)
    if hasattr(ocr, "predict"):
        return ocr.predict(image)
    raise RuntimeError("Unsupported PaddleOCR runtime")


def _plain(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def _payload_from_json_like(value: Any) -> Any:
    candidate = value
    json_attr = getattr(candidate, "json", None)
    if json_attr is not None:
        candidate = json_attr() if callable(json_attr) else json_attr

    candidate = _plain(candidate)
    if isinstance(candidate, str):
        return json.loads(candidate)
    return candidate


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
    boxes = (
        mapping.get("rec_polys")
        or mapping.get("rec_boxes")
        or mapping.get("dt_polys")
        or mapping.get("dt_boxes")
        or mapping.get("boxes")
    )
    texts = mapping.get("rec_texts") or mapping.get("texts") or mapping.get("text") or []
    scores = mapping.get("rec_scores") or mapping.get("scores") or mapping.get("confidence") or []

    if isinstance(texts, str):
        texts = [texts]
    boxes = _plain(boxes) or []
    scores = _plain(scores) or []

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
    if result == []:
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


class PaddleScanner:
    def __init__(self) -> None:
        self.ocr = _create_ocr()

    def recognize(self, image_bytes: bytes) -> dict:
        prepared = prepare_image(image_bytes)
        detections, diagnostics = self._detect(prepared)
        arranged = arrange_detections(detections, prepared.original_width, prepared.original_height)
        diagnostics["returned detections"] = len(arranged)
        logger.info("OCR diagnostic counts: %s", diagnostics)
        return {
            "imageWidth": prepared.original_width,
            "imageHeight": prepared.original_height,
            "detections": arranged,
        }

    def _detect(self, prepared: PreparedImage) -> tuple[list[dict], dict[str, int]]:
        all_detections: list[dict] = []
        diagnostics: dict[str, int] = {}

        variants = prepared.variants[:1]
        fallback_variants = prepared.variants[1:]

        for variant in variants:
            variant_detections, line_count = self._detect_variant(prepared, variant)
            diagnostics[f"{variant.name} OCR boxes"] = line_count
            diagnostics[f"{variant.name} parsed detections"] = len(variant_detections)
            all_detections = _dedupe_detections(all_detections, variant_detections)

        if len(all_detections) < FALLBACK_MIN_DETECTIONS:
            for variant in fallback_variants:
                variant_detections, line_count = self._detect_variant(prepared, variant)
                diagnostics[f"{variant.name} OCR boxes"] = line_count
                diagnostics[f"{variant.name} parsed detections"] = len(variant_detections)
                all_detections = _dedupe_detections(all_detections, variant_detections)

        diagnostics["parsed detections"] = len(all_detections)
        return all_detections, diagnostics

    def _detect_variant(self, prepared: PreparedImage, variant: Any) -> tuple[list[dict], int]:
        result = _run_ocr(self.ocr, variant.image)
        lines, known_shape = _extract_lines(result)
        if not known_shape:
            raise RuntimeError(f"Unexpected PaddleOCR response shape for variant {variant.name}: {type(result).__name__}")

        mapped_lines = [
            OcrLine(
                polygon=map_polygon_to_original(line.polygon, variant.to_original),
                text=line.text,
                confidence=line.confidence,
            )
            for line in lines
        ]
        detections = _candidate_detections(mapped_lines, prepared.original_width, prepared.original_height)
        return detections, len(lines)
