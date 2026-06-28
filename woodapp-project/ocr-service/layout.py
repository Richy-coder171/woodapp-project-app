from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Iterable


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    width: float
    height: float

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2


def _as_box(item: dict) -> Box:
    box = item.get("box") or {}
    return Box(
        x=float(box.get("x", 0)),
        y=float(box.get("y", 0)),
        width=float(box.get("width", 0)),
        height=float(box.get("height", 0)),
    )


def _dynamic_column_gap(boxes: Iterable[Box], image_width: int) -> float:
    boxes = list(boxes)
    if not boxes:
        return 0

    widths = [max(1.0, box.width) for box in boxes]
    heights = [max(1.0, box.height) for box in boxes]
    median_width = median(widths)
    median_height = median(heights)
    return max(median_width * 0.85, median_height * 2.25, image_width * 0.035)


def _merge_nearest_columns(columns: list[list[dict]], max_columns: int) -> list[list[dict]]:
    while len(columns) > max_columns:
        centers = [
            sum(_as_box(item).center_x for item in column) / max(1, len(column))
            for column in columns
        ]
        nearest_index = min(
            range(len(centers) - 1),
            key=lambda index: centers[index + 1] - centers[index],
        )
        columns[nearest_index].extend(columns[nearest_index + 1])
        del columns[nearest_index + 1]
    return columns


def arrange_detections(
    detections: list[dict],
    image_width: int,
    image_height: int,
    max_columns: int = 6,
) -> list[dict]:
    """Group OCR detections by X-position columns, then sort top-to-bottom.

    The threshold is based on detected text size and image width so the same
    code works for phone photos, screenshots, and multi-column ledger pages.
    """
    useful = [
        item
        for item in detections
        if _as_box(item).width > 0 and _as_box(item).height > 0
    ]
    useful.sort(key=lambda item: _as_box(item).center_x)

    if not useful:
        return []

    gap = _dynamic_column_gap((_as_box(item) for item in useful), image_width)
    columns: list[list[dict]] = []

    for item in useful:
        box = _as_box(item)
        if not columns:
            columns.append([item])
            continue

        previous_column = columns[-1]
        previous_center = sum(_as_box(member).center_x for member in previous_column) / len(previous_column)
        if abs(box.center_x - previous_center) > gap:
            columns.append([item])
        else:
            previous_column.append(item)

    columns = _merge_nearest_columns(columns, max_columns)
    columns.sort(key=lambda column: sum(_as_box(item).center_x for item in column) / len(column))

    ordered: list[dict] = []
    for column_index, column in enumerate(columns):
        column.sort(key=lambda item: (_as_box(item).center_y, _as_box(item).center_x))
        for row_index, item in enumerate(column):
            next_item = dict(item)
            next_item["id"] = f"measurement-{len(ordered) + 1}"
            next_item["selected"] = True
            next_item["columnIndex"] = column_index
            next_item["rowIndex"] = row_index
            next_item["normalizedBox"] = normalize_box(_as_box(item), image_width, image_height)
            ordered.append(next_item)

    return ordered


def normalize_box(box: Box, image_width: int, image_height: int) -> dict:
    width = max(1, image_width)
    height = max(1, image_height)
    return {
        "x": round(box.x / width, 4),
        "y": round(box.y / height, 4),
        "width": round(box.width / width, 4),
        "height": round(box.height / height, 4),
    }
