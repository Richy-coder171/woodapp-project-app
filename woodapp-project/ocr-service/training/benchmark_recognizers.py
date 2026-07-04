from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output-json", default="tmp/domain-benchmark.json")
    parser.add_argument("--output-md", default="tmp/domain-benchmark.md")
    args = parser.parse_args()
    rows = [json.loads(line) for line in Path(args.manifest).read_text(encoding="utf-8").splitlines() if line.strip()]
    report = {
        "sampleCount": len(rows),
        "rapidocrBaseline": {"status": "not_run"},
        "pretrainedBenchmark": {"status": "not_run"},
        "domainRecognizer": {"status": "not_trained"},
    }
    Path(args.output_json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output_json).write_text(json.dumps(report, indent=2), encoding="utf-8")
    Path(args.output_md).write_text(
        "# WoodApp Recognizer Benchmark\n\n"
        f"Samples: {len(rows)}\n\n"
        "No accuracy claims are made until recognizers are run on writer-separated test data.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
