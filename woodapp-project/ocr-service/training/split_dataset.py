from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="datasets/woodapp_measurements/manifests/all.jsonl")
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()
    rows = [json.loads(line) for line in Path(args.manifest).read_text(encoding="utf-8").splitlines() if line.strip()]
    by_writer = defaultdict(list)
    for row in rows:
        by_writer[row["writerId"]].append(row)
    writers = sorted(by_writer)
    random.Random(args.seed).shuffle(writers)
    train_cut = int(len(writers) * 0.7)
    val_cut = int(len(writers) * 0.85)
    splits = {
        "train": writers[:train_cut],
        "validation": writers[train_cut:val_cut],
        "test": writers[val_cut:],
    }
    out_dir = Path(args.manifest).parent
    for split, split_writers in splits.items():
        split_rows = [row for writer in split_writers for row in by_writer[writer]]
        (out_dir / f"{split}.jsonl").write_text("".join(json.dumps(row) + "\n" for row in split_rows), encoding="utf-8")
        print(split, len(split_rows), "rows", len(split_writers), "writers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
