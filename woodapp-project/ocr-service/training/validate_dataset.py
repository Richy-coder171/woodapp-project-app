from __future__ import annotations

import argparse
import json
from pathlib import Path

from domain_scanner.grammar import is_supported_text, normalize_symbol_text, parse_measurement


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="datasets/woodapp_measurements")
    args = parser.parse_args()
    root = Path(args.dataset)
    errors = []
    seen_writers_by_split: dict[str, set[str]] = {}

    for annotation_path in sorted((root / "annotations").glob("*.json")):
        annotation = json.loads(annotation_path.read_text(encoding="utf-8"))
        image_path = root / "pages" / annotation.get("image", "")
        if not image_path.exists():
            errors.append(f"missing image: {image_path}")
        width = float(annotation.get("width", 0))
        height = float(annotation.get("height", 0))
        for index, item in enumerate(annotation.get("measurements", [])):
            box = item.get("box", {})
            if box.get("width", 0) <= 0 or box.get("height", 0) <= 0:
                errors.append(f"invalid box dimensions: {annotation_path}:{index}")
            if box.get("x", 0) < 0 or box.get("y", 0) < 0 or box.get("x", 0) + box.get("width", 0) > width or box.get("y", 0) + box.get("height", 0) > height:
                errors.append(f"out-of-bounds box: {annotation_path}:{index}")
            normalized = normalize_symbol_text(item.get("text", ""))
            if not is_supported_text(normalized) or parse_measurement(normalized) is None:
                errors.append(f"invalid label: {annotation_path}:{index}")

    for split_path in sorted((root / "manifests").glob("*.jsonl")):
        if split_path.stem == "all":
            continue
        writers = set()
        for line in split_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                writers.add(row.get("writerId", ""))
                if not (root / row.get("crop", "")).exists():
                    errors.append(f"missing crop: {split_path}:{row.get('crop')}")
        seen_writers_by_split[split_path.stem] = writers

    splits = list(seen_writers_by_split)
    for i, left in enumerate(splits):
        for right in splits[i + 1:]:
            overlap = seen_writers_by_split[left] & seen_writers_by_split[right]
            if overlap:
                errors.append(f"writer leakage {left}/{right}: {sorted(overlap)}")

    if errors:
        print("\n".join(errors))
        return 1
    print("dataset validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
