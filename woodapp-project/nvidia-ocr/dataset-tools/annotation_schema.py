from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from grammar import label_errors, normalize_label


ANNOTATION_JSON_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "WoodApp Measurement Page Annotation",
    "type": "object",
    "required": ["image", "writerId", "width", "height", "measurements"],
    "properties": {
        "image": {"type": "string", "minLength": 1},
        "sourcePageId": {"type": "string"},
        "writerId": {"type": "string", "minLength": 1},
        "width": {"type": "integer", "minimum": 1},
        "height": {"type": "integer", "minimum": 1},
        "measurements": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "polygon", "text"],
                "properties": {
                    "id": {"type": "string", "minLength": 1},
                    "polygon": {
                        "type": "array",
                        "minItems": 4,
                        "maxItems": 4,
                        "items": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 2,
                            "items": {"type": "number"},
                        },
                    },
                    "text": {"type": "string", "minLength": 1},
                    "originalText": {"type": "string"},
                },
            },
        },
    },
}


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    measurement_id: str | None = None


def _segments(points: list[tuple[float, float]]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    return list(zip(points, points[1:] + points[:1]))


def _ccw(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> bool:
    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0])


def _intersects(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], d: tuple[float, float]) -> bool:
    if a in (c, d) or b in (c, d):
        return False
    return _ccw(a, c, d) != _ccw(b, c, d) and _ccw(a, b, c) != _ccw(a, b, d)


def _polygon_area(points: list[tuple[float, float]]) -> float:
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in _segments(points))) / 2.0


def validate_annotation(data: dict[str, Any], max_label_length: int = 16) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    image = str(data.get("image") or "").strip()
    writer_id = str(data.get("writerId") or "").strip()
    width = int(data.get("width") or 0)
    height = int(data.get("height") or 0)
    measurements = data.get("measurements")

    if not image:
        issues.append(ValidationIssue("missing_image", "image is required"))
    if not writer_id:
        issues.append(ValidationIssue("missing_writer_id", "writerId is required"))
    if width <= 0 or height <= 0:
        issues.append(ValidationIssue("invalid_dimensions", "width and height must be positive"))
    if not isinstance(measurements, list):
        return issues + [ValidationIssue("invalid_measurements", "measurements must be a list")]

    seen_ids: set[str] = set()
    for item in measurements:
        measurement_id = str(item.get("id") or "").strip() if isinstance(item, dict) else ""
        if not measurement_id:
            issues.append(ValidationIssue("missing_measurement_id", "measurement id is required"))
        elif measurement_id in seen_ids:
            issues.append(ValidationIssue("duplicate_measurement_id", "measurement id is duplicated", measurement_id))
        seen_ids.add(measurement_id)

        polygon = item.get("polygon") if isinstance(item, dict) else None
        if not isinstance(polygon, list) or len(polygon) != 4:
            issues.append(ValidationIssue("invalid_polygon", "polygon must contain four points", measurement_id or None))
            continue

        points: list[tuple[float, float]] = []
        for point in polygon:
            if not isinstance(point, list | tuple) or len(point) != 2:
                issues.append(ValidationIssue("invalid_polygon_point", "polygon points must be [x, y]", measurement_id or None))
                continue
            x, y = float(point[0]), float(point[1])
            if x < 0 or y < 0 or x > width or y > height:
                issues.append(ValidationIssue("out_of_bounds_polygon", "polygon point is outside the source image", measurement_id or None))
            points.append((x, y))

        if len(points) == 4:
            if _polygon_area(points) <= 1:
                issues.append(ValidationIssue("empty_polygon", "polygon area is empty", measurement_id or None))
            segments = _segments(points)
            if any(_intersects(*segments[i], *segments[j]) for i, j in ((0, 2), (1, 3))):
                issues.append(ValidationIssue("self_intersecting_polygon", "polygon edges cross", measurement_id or None))

        text = item.get("text", "") if isinstance(item, dict) else ""
        normalized = normalize_label(text)
        for code in label_errors(normalized, max_label_length):
            issues.append(ValidationIssue(code, f"invalid label {normalized!r}", measurement_id or None))

    return issues


def load_annotation(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_schema(path: str | Path) -> None:
    Path(path).write_text(json.dumps(ANNOTATION_JSON_SCHEMA, indent=2), encoding="utf-8")
