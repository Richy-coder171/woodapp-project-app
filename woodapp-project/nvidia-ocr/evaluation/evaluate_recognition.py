from __future__ import annotations

import json
from pathlib import Path


def main() -> int:
    result = {
        "status": "not_run",
        "reason": "No trained/exported OCRNet recognizer and labelled crop dataset are available yet.",
        "metrics": {
            "exactMeasurementAccuracy": None,
            "characterAccuracy": None,
            "invalidFormatRate": None,
            "confidenceCalibration": None,
        },
    }
    Path("nvidia-ocr/reports/latest-recognition-results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
