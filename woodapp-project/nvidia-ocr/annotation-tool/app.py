from __future__ import annotations

import json
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "dataset-tools"
OCR_SERVICE_DIR = ROOT.parent / "ocr-service"
sys.path.insert(0, str(TOOLS))
sys.path.insert(0, str(OCR_SERVICE_DIR))

from annotation_schema import validate_annotation  # noqa: E402
from grammar import label_errors, normalize_label  # noqa: E402

SOURCE_DIR = ROOT / "data" / "source-pages"
ANNOTATION_DIR = ROOT / "data" / "annotations"
CROPS_DIR = ROOT / "data" / "recognition-crops"


def load_image(path: Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def annotation_path(image_path: Path) -> Path:
    return ANNOTATION_DIR / f"{image_path.stem}.json"


def load_existing(image_path: Path, width: int, height: int) -> dict:
    path = annotation_path(image_path)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {
        "image": image_path.name,
        "sourcePageId": image_path.stem,
        "writerId": "writer-001",
        "width": width,
        "height": height,
        "measurements": [],
    }


def polygon_to_row(item: dict, index: int) -> dict:
    polygon = item.get("polygon", [])
    if len(polygon) == 4:
        xs = [float(point[0]) for point in polygon]
        ys = [float(point[1]) for point in polygon]
        x = min(xs)
        y = min(ys)
        width = max(xs) - x
        height = max(ys) - y
    else:
        x, y, width, height = 0.0, 0.0, 120.0, 40.0
    return {
        "delete": False,
        "id": item.get("id") or f"measurement-{index + 1:04d}",
        "x": round(x, 2),
        "y": round(y, 2),
        "width": round(width, 2),
        "height": round(height, 2),
        "text": item.get("text", ""),
    }


def row_to_polygon(row: dict) -> list[list[float]]:
    x = float(row.get("x") or 0)
    y = float(row.get("y") or 0)
    width = float(row.get("width") or 0)
    height = float(row.get("height") or 0)
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


def export_crops(page: dict, image: Image.Image) -> int:
    CROPS_DIR.mkdir(parents=True, exist_ok=True)
    array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    count = 0
    for item in page.get("measurements", []):
        polygon = item["polygon"]
        xs = [point[0] for point in polygon]
        ys = [point[1] for point in polygon]
        pad = 8
        x1 = max(0, int(min(xs)) - pad)
        y1 = max(0, int(min(ys)) - pad)
        x2 = min(array.shape[1], int(max(xs)) + pad)
        y2 = min(array.shape[0], int(max(ys)) + pad)
        if x2 <= x1 or y2 <= y1:
            continue
        crop = array[y1:y2, x1:x2]
        cv2.imwrite(str(CROPS_DIR / f"{Path(page['image']).stem}_{item['id']}.png"), crop)
        count += 1
    return count


def propose_rows(image: Image.Image) -> list[dict]:
    bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    try:
        from domain_scanner.line_detector import detect_measurement_lines

        lines, diagnostics = detect_measurement_lines(bgr, max_measurements=100)
        rows = []
        for index, line in enumerate(lines):
            box = line.to_dict()
            if float(box["width"]) < 55 or float(box["height"]) < 18:
                continue
            rows.append({
                "delete": False,
                "id": f"measurement-{len(rows) + 1:04d}",
                "x": round(float(box["x"]), 2),
                "y": round(float(box["y"]), 2),
                "width": round(float(box["width"]), 2),
                "height": round(float(box["height"]), 2),
                "text": "",
            })
        if rows:
            st.caption(f"Proposed {len(rows)} boxes using dense line detector.")
            return rows
    except Exception as exc:
        st.warning(f"Dense line proposal failed: {type(exc).__name__}")

    try:
        from scanner import detect_opencv_regions

        regions, _ = detect_opencv_regions(bgr)
    except Exception as exc:
        st.warning(f"Fallback OpenCV proposal failed: {type(exc).__name__}")
        return []
    rows = []
    for index, region in enumerate(regions[:100]):
        box = region.box
        rows.append({
            "delete": False,
            "id": f"measurement-{index + 1:04d}",
            "x": round(float(box["x"]), 2),
            "y": round(float(box["y"]), 2),
            "width": round(float(box["width"]), 2),
            "height": round(float(box["height"]), 2),
            "text": "",
        })
    return rows


def preview_image(image: Image.Image, rows: list[dict]) -> Image.Image:
    array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    for index, row in enumerate(rows):
        if row.get("delete"):
            continue
        x = int(float(row.get("x") or 0))
        y = int(float(row.get("y") or 0))
        width = int(float(row.get("width") or 0))
        height = int(float(row.get("height") or 0))
        color = (0, 160, 0) if not label_errors(normalize_label(row.get("text", ""))) else (70, 70, 220)
        cv2.rectangle(array, (x, y), (x + width, y + height), color, 3)
        cv2.putText(array, str(index + 1), (x, max(18, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    return Image.fromarray(cv2.cvtColor(array, cv2.COLOR_BGR2RGB))


def sorted_rows(rows: list[dict]) -> list[dict]:
    active = [dict(row) for row in rows if not row.get("delete")]
    if not active:
        return []
    widths = sorted(float(row.get("width") or 1) for row in active)
    median_width = widths[len(widths) // 2]
    gap = max(80.0, median_width * 1.25)
    active.sort(key=lambda row: float(row.get("x") or 0) + float(row.get("width") or 0) / 2)
    columns: list[list[dict]] = []
    for row in active:
        center_x = float(row.get("x") or 0) + float(row.get("width") or 0) / 2
        if not columns:
            columns.append([row])
            continue
        last_center = sum(float(item.get("x") or 0) + float(item.get("width") or 0) / 2 for item in columns[-1]) / len(columns[-1])
        if abs(center_x - last_center) > gap:
            columns.append([row])
        else:
            columns[-1].append(row)
    ordered: list[dict] = []
    for column in columns:
        column.sort(key=lambda row: float(row.get("y") or 0))
        ordered.extend(column)
    return ordered


def apply_bulk_text(rows: list[dict], text: str) -> list[dict]:
    labels = [normalize_label(line) for line in text.splitlines() if normalize_label(line)]
    ordered_ids = [row.get("id") for row in sorted_rows(rows)]
    by_id = {row.get("id"): dict(row) for row in rows}
    for index, row_id in enumerate(ordered_ids):
        if index >= len(labels):
            break
        by_id[row_id]["text"] = labels[index]
    return list(by_id.values())


st.set_page_config(page_title="WoodApp NVIDIA OCR Annotation", layout="wide")
st.title("WoodApp Measurement Annotation")
st.caption("Enter a writer ID, propose or add boxes, type labels like 43x24, then save.")

images = sorted([*SOURCE_DIR.glob("*.jpg"), *SOURCE_DIR.glob("*.jpeg"), *SOURCE_DIR.glob("*.png"), *SOURCE_DIR.glob("*.webp")])
if not images:
    st.info(f"Add private page photos to {SOURCE_DIR}")
    st.stop()

image_path = st.selectbox("Page photo", images, format_func=lambda path: path.name)
image = load_image(image_path)
page = load_existing(image_path, image.width, image.height)
state_key = f"rows:{image_path.name}"

if state_key not in st.session_state:
    st.session_state[state_key] = [
        polygon_to_row(item, index)
        for index, item in enumerate(page.get("measurements", []))
    ]

writer_id = st.text_input("Writer ID", value=page.get("writerId") or "writer-001")

left, right = st.columns([1.15, 1])
with left:
    st.image(preview_image(image, st.session_state[state_key]), caption=f"{image_path.name} ({image.width} x {image.height})", use_container_width=True)

with right:
    actions = st.columns(4)
    if actions[0].button("Propose Boxes"):
        st.session_state[state_key] = propose_rows(image)
        if not st.session_state[state_key]:
            st.warning("No boxes were proposed. Use Add Box and enter coordinates manually.")
        st.rerun()
    if actions[1].button("Add Box"):
        st.session_state[state_key].append({
            "delete": False,
            "id": f"measurement-{len(st.session_state[state_key]) + 1:04d}",
            "x": 0.0,
            "y": 0.0,
            "width": 120.0,
            "height": 40.0,
            "text": "",
        })
        st.rerun()
    if actions[2].button("Clear"):
        st.session_state[state_key] = []
        st.rerun()
    if actions[3].button("Keep Labeled Only"):
        st.session_state[state_key] = [
            row
            for row in st.session_state[state_key]
            if normalize_label(row.get("text", ""))
        ]
        st.rerun()

    with st.expander("Bulk fill text"):
        st.caption("Paste one measurement per line in the same order as the red numbers: left column top-to-bottom, then next column.")
        bulk_text = st.text_area("Measurements", key=f"bulk:{image_path.name}", height=160, placeholder="43x24\n33x49\n33x49")
        if st.button("Apply Text To Boxes"):
            st.session_state[state_key] = apply_bulk_text(st.session_state[state_key], bulk_text)
            st.rerun()

    edited = st.data_editor(
        st.session_state[state_key],
        key=f"editor:{image_path.name}",
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "delete": st.column_config.CheckboxColumn("Delete"),
            "id": st.column_config.TextColumn("ID"),
            "x": st.column_config.NumberColumn("X", min_value=0.0, step=1.0),
            "y": st.column_config.NumberColumn("Y", min_value=0.0, step=1.0),
            "width": st.column_config.NumberColumn("Width", min_value=1.0, step=1.0),
            "height": st.column_config.NumberColumn("Height", min_value=1.0, step=1.0),
            "text": st.column_config.TextColumn("Text"),
        },
    )
    st.session_state[state_key] = [dict(row) for row in edited]

    invalid_rows = []
    for index, row in enumerate(st.session_state[state_key], start=1):
        if row.get("delete"):
            continue
        errors = label_errors(normalize_label(row.get("text", "")))
        if errors:
            invalid_rows.append(f"{index}: {', '.join(errors)}")
    if invalid_rows:
        st.warning("Invalid labels:\n" + "\n".join(invalid_rows))

    if st.button("Save Annotation", type="primary"):
        rows = [row for row in st.session_state[state_key] if not row.get("delete")]
        if not rows:
            st.error("Add at least one measurement box before saving this page.")
            st.stop()
        measurements = []
        for index, row in enumerate(rows):
            measurements.append({
                "id": row.get("id") or f"measurement-{index + 1:04d}",
                "polygon": row_to_polygon(row),
                "text": normalize_label(row.get("text", "")),
                "originalText": row.get("text", ""),
            })
        next_page = {
            "image": image_path.name,
            "sourcePageId": image_path.stem,
            "writerId": writer_id.strip(),
            "width": image.width,
            "height": image.height,
            "measurements": measurements,
        }
        issues = validate_annotation(next_page)
        if issues:
            st.error("Fix validation issues before saving.")
            st.json([issue.__dict__ for issue in issues])
        else:
            ANNOTATION_DIR.mkdir(parents=True, exist_ok=True)
            annotation_path(image_path).write_text(json.dumps(next_page, indent=2), encoding="utf-8")
            crop_count = export_crops(next_page, image)
            st.success(f"Saved {len(measurements)} measurements and exported {crop_count} crops.")
