from __future__ import annotations

import json
from pathlib import Path


def main() -> int:
    result = {
        "status": "not_run",
        "reason": "Runtime benchmark requires exported model files and WOODAPP_DENSE_TEST_IMAGE.",
        "p50Latency": None,
        "p95Latency": None,
        "peakMemory": None,
    }
    Path("nvidia-ocr/reports/latest-benchmark.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
