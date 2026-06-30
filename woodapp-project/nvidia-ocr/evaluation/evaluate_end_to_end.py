from __future__ import annotations

import json
from pathlib import Path


def main() -> int:
    result = {
        "status": "not_run",
        "reason": "End-to-end evaluation requires trained OCDNet/OCRNet exports and labelled dense pages.",
        "metrics": {
            "correctMeasurementAndBox": None,
            "measurementsPerPage": None,
            "pageCompletionRate": None,
            "p50Latency": None,
            "p95Latency": None,
            "peakMemory": None,
            "crashCount": None,
        },
    }
    Path("nvidia-ocr/reports/latest-results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    Path("nvidia-ocr/reports/latest-results.md").write_text("# NVIDIA OCR Results\n\nStatus: not run. Real model files and labelled evaluation data are required.\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
