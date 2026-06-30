from __future__ import annotations

import json
from pathlib import Path


def main() -> int:
    result = {
        "status": "not_run",
        "reason": "No trained/exported OCDNet detector and labelled evaluation dataset are available yet.",
        "metrics": {
            "precision": None,
            "recall": None,
            "f1": None,
            "iou": None,
            "missedMeasurements": None,
            "duplicateBoxes": None,
            "crossColumnMerges": None,
        },
    }
    Path("nvidia-ocr/reports/latest-detection-results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
