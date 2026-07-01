from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import sys

import cv2

from annotation_schema import load_annotation, validate_annotation
from grammar import normalize_label


def iter_annotation_paths(root: Path) -> list[Path]:
    return sorted(root.glob("*.json"))


def _source_image_path(page: dict, source_pages: Path) -> Path:
    return source_pages / Path(str(page.get("image") or "")).name


def _crop_is_empty(image, polygon: list[list[float]]) -> bool:
    height, width = image.shape[:2]
    xs = [float(point[0]) for point in polygon]
    ys = [float(point[1]) for point in polygon]
    x1 = max(0, int(min(xs)))
    y1 = max(0, int(min(ys)))
    x2 = min(width, int(max(xs)))
    y2 = min(height, int(max(ys)))
    if x2 <= x1 or y2 <= y1:
        return True
    crop = image[y1:y2, x1:x2]
    return crop.size == 0 or crop.shape[0] <= 0 or crop.shape[1] <= 0


def validate_dataset(annotation_dir: Path, source_pages: Path = Path("nvidia-ocr/data/source-pages")) -> dict:
    report = {
        "annotationDir": str(annotation_dir),
        "pages": 0,
        "measurements": 0,
        "invalidLabelCount": 0,
        "issueCount": 0,
        "issues": [],
        "missingImages": 0,
        "emptyImages": 0,
        "emptyCrops": 0,
        "writers": [],
        "characterFrequency": {},
        "labelLengthDistribution": {},
    }
    writers: set[str] = set()
    chars: Counter[str] = Counter()
    lengths: Counter[int] = Counter()

    for path in iter_annotation_paths(annotation_dir):
        data = load_annotation(path)
        issues = validate_annotation(data)
        report["pages"] += 1
        writer_id = str(data.get("writerId") or "")
        if writer_id:
            writers.add(writer_id)
        measurements = data.get("measurements") or []
        report["measurements"] += len(measurements)
        image_path = _source_image_path(data, source_pages)
        image = None
        if not image_path.exists():
            report["missingImages"] += 1
            report["issues"].append({"file": path.name, "code": "missing_image_file", "message": "source image is missing", "measurementId": None})
        else:
            image = cv2.imread(str(image_path))
            if image is None or image.size == 0:
                report["emptyImages"] += 1
                report["issues"].append({"file": path.name, "code": "empty_image_file", "message": "source image is empty or unreadable", "measurementId": None})
        for item in measurements:
            label = normalize_label(item.get("text", ""))
            chars.update(label)
            lengths[len(label)] += 1
            if image is not None and _crop_is_empty(image, item.get("polygon", [])):
                report["emptyCrops"] += 1
                report["issues"].append({"file": path.name, "code": "empty_crop", "message": "measurement crop is empty", "measurementId": item.get("id")})
        invalid = [issue for issue in issues if issue.code.startswith("invalid") or issue.code in {"empty_text", "unsupported_characters"}]
        report["invalidLabelCount"] += len(invalid)
        for issue in issues:
            report["issues"].append({
                "file": path.name,
                "code": issue.code,
                "message": issue.message,
                "measurementId": issue.measurement_id,
            })

    report["issueCount"] = len(report["issues"])
    report["writers"] = sorted(writers)
    report["characterFrequency"] = dict(sorted(chars.items()))
    report["labelLengthDistribution"] = {str(k): v for k, v in sorted(lengths.items())}
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate WoodApp canonical annotations.")
    parser.add_argument("--annotations", type=Path, default=Path("nvidia-ocr/data/annotations"))
    parser.add_argument("--source-pages", type=Path, default=Path("nvidia-ocr/data/source-pages"))
    parser.add_argument("--report", type=Path, default=Path("nvidia-ocr/reports/dataset-validation.json"))
    args = parser.parse_args()
    report = validate_dataset(args.annotations, args.source_pages)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if report["issueCount"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
