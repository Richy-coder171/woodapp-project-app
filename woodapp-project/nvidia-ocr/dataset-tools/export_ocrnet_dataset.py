from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from annotation_schema import load_annotation, validate_annotation
from grammar import normalize_label


def _crop_polygon(image: np.ndarray, polygon: list[list[float]], padding: int = 8) -> np.ndarray | None:
    height, width = image.shape[:2]
    xs = [float(point[0]) for point in polygon]
    ys = [float(point[1]) for point in polygon]
    x1 = max(0, int(min(xs)) - padding)
    y1 = max(0, int(min(ys)) - padding)
    x2 = min(width, int(max(xs)) + padding)
    y2 = min(height, int(max(ys)) + padding)
    if x2 <= x1 or y2 <= y1:
        return None
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    return crop


def export_ocrnet_dataset(annotations: Path, source_pages: Path, output: Path, crops_dir: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    crops_dir.mkdir(parents=True, exist_ok=True)
    label_file = output / "labels.txt"
    exported = 0
    skipped = 0
    lines: list[str] = []

    for annotation_path in sorted(annotations.glob("*.json")):
        page = load_annotation(annotation_path)
        issues = validate_annotation(page)
        if issues:
            skipped += len(page.get("measurements", []))
            continue
        image_path = source_pages / Path(page["image"]).name
        image = cv2.imread(str(image_path))
        if image is None or image.size == 0:
            skipped += len(page.get("measurements", []))
            continue
        for item in page.get("measurements", []):
            crop = _crop_polygon(image, item["polygon"])
            if crop is None:
                skipped += 1
                continue
            label = normalize_label(item["text"])
            crop_name = f"{Path(page['image']).stem}_{item['id']}.png"
            crop_path = crops_dir / crop_name
            cv2.imwrite(str(crop_path), crop)
            lines.append(f"{crop_path.as_posix()}\t{label}")
            exported += 1

    label_file.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    metadata = {
        "format": "tao-ocrnet-crop-labels-tsv",
        "formatStatus": "requires_tao_help_verification",
        "measurementsExported": exported,
        "measurementsSkipped": skipped,
        "note": "Verify against `tao model ocrnet dataset_convert --help` and installed examples before training.",
    }
    (output / "export-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description="Export WoodApp measurement crops for TAO OCRNet.")
    parser.add_argument("--annotations", type=Path, default=Path("nvidia-ocr/data/annotations"))
    parser.add_argument("--source-pages", type=Path, default=Path("nvidia-ocr/data/source-pages"))
    parser.add_argument("--output", type=Path, default=Path("nvidia-ocr/data/tao-ocrnet"))
    parser.add_argument("--crops", type=Path, default=Path("nvidia-ocr/data/recognition-crops"))
    args = parser.parse_args()
    print(json.dumps(export_ocrnet_dataset(args.annotations, args.source_pages, args.output, args.crops), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
