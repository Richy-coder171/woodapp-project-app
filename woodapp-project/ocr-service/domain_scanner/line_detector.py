from __future__ import annotations

import cv2
import numpy as np

from .config import MAX_COLUMNS, MAX_MEASUREMENTS
from .page_rectification import enhance_page
from .schemas import LineBox


def _ink_mask(image: np.ndarray) -> np.ndarray:
    gray = enhance_page(image)
    threshold = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        35,
        11,
    )
    if image.ndim == 3:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        blue = cv2.inRange(hsv, np.array([82, 18, 20]), np.array([150, 255, 255]))
        threshold = cv2.bitwise_or(threshold, blue)
    return cv2.medianBlur(threshold, 3)


def _component_boxes(mask: np.ndarray) -> list[dict]:
    height, width = mask.shape[:2]
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    boxes = []
    for index in range(1, count):
        x, y, w, h, area = stats[index]
        if area < max(5, width * height * 0.000003):
            continue
        if w < max(2, width * 0.002) or h < max(3, height * 0.002):
            continue
        if w > width * 0.5 or h > height * 0.16:
            continue
        boxes.append({"x": float(x), "y": float(y), "width": float(w), "height": float(h)})
    return boxes


def _center_y(box: dict) -> float:
    return box["y"] + box["height"] / 2


def _center_x(box: dict) -> float:
    return box["x"] + box["width"] / 2


def _union(boxes: list[dict]) -> dict:
    x1 = min(box["x"] for box in boxes)
    y1 = min(box["y"] for box in boxes)
    x2 = max(box["x"] + box["width"] for box in boxes)
    y2 = max(box["y"] + box["height"] for box in boxes)
    return {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}


def _overlap_y(a: dict, b: dict) -> float:
    top = max(a["y"], b["y"])
    bottom = min(a["y"] + a["height"], b["y"] + b["height"])
    return max(0.0, bottom - top) / max(1.0, min(a["height"], b["height"]))


def detect_measurement_lines(image: np.ndarray, max_measurements: int = MAX_MEASUREMENTS) -> tuple[list[LineBox], dict]:
    mask = _ink_mask(image)
    height, width = mask.shape[:2]
    components = sorted(_component_boxes(mask), key=lambda box: (_center_y(box), box["x"]))
    if not components:
        return [], {"componentCount": 0, "columnCount": 0}

    heights = sorted(max(1.0, box["height"]) for box in components)
    widths = sorted(max(1.0, box["width"]) for box in components)
    median_height = heights[len(heights) // 2]
    median_width = widths[len(widths) // 2]

    rows: list[list[dict]] = []
    for box in components:
        placed = False
        for row in rows:
            row_box = _union(row)
            if abs(_center_y(box) - _center_y(row_box)) <= max(median_height, row_box["height"] * 0.65) or _overlap_y(box, row_box) >= 0.3:
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
                current = [box]
                continue
            previous = current[-1]
            gap = box["x"] - (previous["x"] + previous["width"])
            row_box = _union(current)
            column_gap = max(width * 0.055, median_width * 2.2, median_height * 3.0)
            same_line = _overlap_y(box, row_box) >= 0.25 or abs(_center_y(box) - _center_y(row_box)) <= median_height
            if same_line and gap <= column_gap:
                current.append(box)
            else:
                line_boxes.append(_union(current))
                current = [box]
        if current:
            line_boxes.append(_union(current))

    useful = []
    pad = max(4.0, median_height * 0.35)
    for box in line_boxes:
        if box["width"] < max(width * 0.025, median_width * 2.0) or box["height"] < max(5.0, median_height * 0.6):
            continue
        x1 = max(0.0, box["x"] - pad)
        y1 = max(0.0, box["y"] - pad)
        x2 = min(float(width), box["x"] + box["width"] + pad)
        y2 = min(float(height), box["y"] + box["height"] + pad)
        if x2 > x1 and y2 > y1:
            useful.append({"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1})

    columns = _assign_columns(useful, width)
    lines = []
    for column_index, column in enumerate(columns):
        column.sort(key=lambda box: (_center_y(box), box["x"]))
        for row_index, box in enumerate(column):
            lines.append(LineBox(box["x"], box["y"], box["width"], box["height"], column_index, row_index))

    return lines[:max_measurements], {"componentCount": len(components), "columnCount": len(columns)}


def _assign_columns(boxes: list[dict], width: int) -> list[list[dict]]:
    if not boxes:
        return []
    boxes = sorted(boxes, key=_center_x)
    widths = sorted(max(1.0, box["width"]) for box in boxes)
    threshold = max(width * 0.055, widths[len(widths) // 2] * 0.9)
    columns: list[list[dict]] = []
    for box in boxes:
        if not columns:
            columns.append([box])
            continue
        center = _center_x(box)
        previous_center = sum(_center_x(item) for item in columns[-1]) / len(columns[-1])
        if abs(center - previous_center) > threshold:
            columns.append([box])
        else:
            columns[-1].append(box)
    while len(columns) > MAX_COLUMNS:
        centers = [sum(_center_x(item) for item in column) / len(column) for column in columns]
        nearest = min(range(len(centers) - 1), key=lambda index: centers[index + 1] - centers[index])
        columns[nearest].extend(columns[nearest + 1])
        del columns[nearest + 1]
    return columns
