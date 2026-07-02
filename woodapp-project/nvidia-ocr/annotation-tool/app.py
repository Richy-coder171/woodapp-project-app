from __future__ import annotations

import json
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps
import streamlit as st
from streamlit_drawable_canvas import st_canvas

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "dataset-tools"
sys.path.insert(0, str(TOOLS))

from annotation_schema import validate_annotation  # noqa: E402
from grammar import label_errors, normalize_label  # noqa: E402

SOURCE_DIR = ROOT / "data" / "source-pages"
ANNOTATION_DIR = ROOT / "data" / "annotations"
CROPS_DIR = ROOT / "data" / "recognition-crops"


def load_image(path: Path) -> Image.Image:
    image = Image.open(path)
    return ImageOps.exif_transpose(image).convert("RGB")


def annotation_path(image_path: Path) -> Path:
    return ANNOTATION_DIR / f"{image_path.stem}.json"


def load_existing(image_path: Path, width: int, height: int) -> dict:
    path = annotation_path(image_path)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {
        "image": image_path.name,
        "sourcePageId": image_path.stem,
        "writerId": "",
        "width": width,
        "height": height,
        "measurements": [],
    }


def rect_to_polygon(left: float, top: float, width: float, height: float, scale: float) -> list[list[float]]:
    x1 = left / scale
    y1 = top / scale
    x2 = (left + width) / scale
    y2 = (top + height) / scale
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


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
        target = CROPS_DIR / f"{Path(page['image']).stem}_{item['id']}.png"
        cv2.imwrite(str(target), crop)
        count += 1
    return count


st.set_page_config(page_title="WoodApp NVIDIA OCR Annotation", layout="wide")
st.title("WoodApp Measurement Annotation")

images = sorted([*SOURCE_DIR.glob("*.jpg"), *SOURCE_DIR.glob("*.jpeg"), *SOURCE_DIR.glob("*.png"), *SOURCE_DIR.glob("*.webp")])
if not images:
    st.info(f"Add private page photos to {SOURCE_DIR}")
    st.stop()

image_path = st.selectbox("Page photo", images, format_func=lambda path: path.name)
image = load_image(image_path)
page = load_existing(image_path, image.width, image.height)

writer_id = st.text_input("Writer ID", value=page.get("writerId", ""))
display_width = min(1100, image.width)
scale = display_width / image.width
display_image = image.resize((display_width, int(image.height * scale)))

canvas = st_canvas(
    fill_color="rgba(0, 180, 0, 0.08)",
    stroke_width=2,
    stroke_color="#00a050",
    background_image=display_image,
    update_streamlit=True,
    height=display_image.height,
    width=display_image.width,
    drawing_mode="rect",
    key=f"canvas-{image_path.name}",
)

objects = canvas.json_data.get("objects", []) if canvas.json_data else []
labels = []
st.subheader("Labels")
for index, obj in enumerate(objects):
    default = page.get("measurements", [{}] * len(objects))[index].get("text", "") if index < len(page.get("measurements", [])) else ""
    label = st.text_input(f"Measurement {index + 1}", value=default, key=f"label-{image_path.name}-{index}")
    normalized = normalize_label(label)
    errors = label_errors(normalized)
    if errors:
        st.warning(f"Invalid label for measurement {index + 1}: {', '.join(errors)}")
    labels.append(normalized)

if st.button("Save Annotation"):
    measurements = []
    for index, obj in enumerate(objects):
        polygon = rect_to_polygon(float(obj.get("left", 0)), float(obj.get("top", 0)), float(obj.get("width", 0)), float(obj.get("height", 0)), scale)
        measurements.append({
            "id": f"measurement-{index + 1:04d}",
            "polygon": polygon,
            "text": labels[index] if index < len(labels) else "",
            "originalText": labels[index] if index < len(labels) else "",
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
