from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil

from annotation_schema import load_annotation, validate_annotation


def export_ocdnet_dataset(annotations: Path, source_pages: Path, output: Path) -> dict:
    images_dir = output / "images"
    labels_dir = output / "labels"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    exported = 0
    skipped = 0

    for annotation_path in sorted(annotations.glob("*.json")):
        page = load_annotation(annotation_path)
        issues = validate_annotation(page)
        if issues:
            skipped += 1
            continue
        image_name = Path(page["image"]).name
        source_image = source_pages / image_name
        if not source_image.exists():
            skipped += 1
            continue
        shutil.copy2(source_image, images_dir / image_name)
        lines = []
        for item in page.get("measurements", []):
            polygon = item["polygon"]
            coords = [str(round(float(value), 2)) for point in polygon for value in point]
            lines.append(",".join(coords + [str(item["text"])]))
        (labels_dir / f"{Path(image_name).stem}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        exported += 1

    metadata = {
        "format": "tao-ocdnet-text-detection-polygons",
        "formatStatus": "requires_tao_help_verification",
        "pagesExported": exported,
        "pagesSkipped": skipped,
        "note": "Verify against `tao model ocdnet * --help` and installed examples before training.",
    }
    (output / "export-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description="Export canonical WoodApp annotations for TAO OCDNet.")
    parser.add_argument("--annotations", type=Path, default=Path("nvidia-ocr/data/annotations"))
    parser.add_argument("--source-pages", type=Path, default=Path("nvidia-ocr/data/source-pages"))
    parser.add_argument("--output", type=Path, default=Path("nvidia-ocr/data/tao-ocdnet"))
    args = parser.parse_args()
    print(json.dumps(export_ocdnet_dataset(args.annotations, args.source_pages, args.output), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
