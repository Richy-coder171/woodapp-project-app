from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import random

from annotation_schema import load_annotation
from grammar import normalize_label


def _assign_writers(writers: list[str], seed: int, ratios: tuple[float, float, float]) -> dict[str, str]:
    shuffled = list(writers)
    random.Random(seed).shuffle(shuffled)
    train_cut = int(round(len(shuffled) * ratios[0]))
    validation_cut = train_cut + int(round(len(shuffled) * ratios[1]))
    assignment: dict[str, str] = {}
    for index, writer in enumerate(shuffled):
        if index < train_cut:
            split = "train"
        elif index < validation_cut:
            split = "validation"
        else:
            split = "test"
        assignment[writer] = split
    return assignment


def split_dataset(annotation_dir: Path, manifests_dir: Path, seed: int = 42, ratios: tuple[float, float, float] = (0.7, 0.15, 0.15)) -> dict:
    pages = []
    for path in sorted(annotation_dir.glob("*.json")):
        data = load_annotation(path)
        data["_annotationFile"] = path.name
        pages.append(data)

    writers = sorted({str(page.get("writerId") or "") for page in pages if page.get("writerId")})
    assignment = _assign_writers(writers, seed, ratios)
    manifests_dir.mkdir(parents=True, exist_ok=True)
    handles = {name: (manifests_dir / f"{name}.jsonl").open("w", encoding="utf-8") for name in ("train", "validation", "test")}
    stats = {
        "writersPerSplit": defaultdict(int),
        "pagesPerSplit": defaultdict(int),
        "measurementsPerSplit": defaultdict(int),
        "labelLengthDistribution": Counter(),
        "characterFrequency": Counter(),
        "invalidLabelCount": 0,
        "writerLeakageCount": 0,
    }

    try:
        for page in pages:
            writer = str(page.get("writerId") or "")
            split = assignment.get(writer, "test")
            stats["pagesPerSplit"][split] += 1
            measurements = page.get("measurements") or []
            stats["measurementsPerSplit"][split] += len(measurements)
            for item in measurements:
                label = normalize_label(item.get("text", ""))
                stats["labelLengthDistribution"][len(label)] += 1
                stats["characterFrequency"].update(label)
                record = {
                    "split": split,
                    "annotation": page["_annotationFile"],
                    "image": page.get("image"),
                    "sourcePageId": page.get("sourcePageId") or Path(str(page.get("image", ""))).stem,
                    "writerId": writer,
                    "measurementId": item.get("id"),
                    "polygon": item.get("polygon"),
                    "text": label,
                }
                handles[split].write(json.dumps(record) + "\n")
    finally:
        for handle in handles.values():
            handle.close()

    writer_splits = defaultdict(set)
    for writer, split in assignment.items():
        writer_splits[writer].add(split)
        stats["writersPerSplit"][split] += 1
    stats["writerLeakageCount"] = sum(1 for splits in writer_splits.values() if len(splits) > 1)
    return {
        "writersPerSplit": dict(stats["writersPerSplit"]),
        "pagesPerSplit": dict(stats["pagesPerSplit"]),
        "measurementsPerSplit": dict(stats["measurementsPerSplit"]),
        "labelLengthDistribution": {str(k): v for k, v in sorted(stats["labelLengthDistribution"].items())},
        "characterFrequency": dict(sorted(stats["characterFrequency"].items())),
        "invalidLabelCount": stats["invalidLabelCount"],
        "writerLeakageCount": stats["writerLeakageCount"],
        "seed": seed,
        "ratios": ratios,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Create writer-aware WoodApp dataset splits.")
    parser.add_argument("--annotations", type=Path, default=Path("nvidia-ocr/data/annotations"))
    parser.add_argument("--manifests", type=Path, default=Path("nvidia-ocr/data/manifests"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--ratios", default="0.7,0.15,0.15")
    args = parser.parse_args()
    ratios = tuple(float(value) for value in args.ratios.split(","))
    report = split_dataset(args.annotations, args.manifests, args.seed, ratios)  # type: ignore[arg-type]
    report_path = args.manifests / "split-report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if report["writerLeakageCount"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
