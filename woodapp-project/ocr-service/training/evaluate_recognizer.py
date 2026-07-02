from __future__ import annotations

import argparse
import json
from pathlib import Path

from domain_scanner.grammar import normalize_symbol_text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", required=True)
    args = parser.parse_args()
    rows = [json.loads(line) for line in Path(args.predictions).read_text(encoding="utf-8").splitlines() if line.strip()]
    total = len(rows)
    exact = sum(1 for row in rows if normalize_symbol_text(row.get("expected", "")) == normalize_symbol_text(row.get("predicted", "")))
    metrics = {"total": total, "exactMeasurementAccuracy": exact / total if total else 0.0}
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
