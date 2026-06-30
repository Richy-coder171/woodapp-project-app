from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import sys

from annotation_schema import load_annotation, validate_annotation
from grammar import normalize_label


def iter_annotation_paths(root: Path) -> list[Path]:
    return sorted(root.glob("*.json"))


def validate_dataset(annotation_dir: Path) -> dict:
    report = {
        "annotationDir": str(annotation_dir),
        "pages": 0,
        "measurements": 0,
        "invalidLabelCount": 0,
        "issueCount": 0,
        "issues": [],
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
        for item in measurements:
            label = normalize_label(item.get("text", ""))
            chars.update(label)
            lengths[len(label)] += 1
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
    parser.add_argument("--report", type=Path, default=Path("nvidia-ocr/reports/dataset-validation.json"))
    args = parser.parse_args()
    report = validate_dataset(args.annotations)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if report["issueCount"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
