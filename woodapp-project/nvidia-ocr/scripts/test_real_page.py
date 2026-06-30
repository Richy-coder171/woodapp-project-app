from __future__ import annotations

import json
import os
from pathlib import Path
import time

import requests
from PIL import Image


def main() -> int:
    image_path = os.getenv("WOODAPP_DENSE_TEST_IMAGE")
    service_url = os.getenv("NVIDIA_OCR_TEST_URL", "http://localhost:8000/recognize-nvidia")
    if not image_path:
        print("WOODAPP_DENSE_TEST_IMAGE is not set.")
        return 2
    path = Path(image_path)
    if not path.exists():
        print(f"Test image does not exist: {path}")
        return 2
    with Image.open(path) as image:
        width, height = image.size
    start = time.perf_counter()
    with path.open("rb") as handle:
        response = requests.post(service_url, files={"file": (path.name, handle, "image/jpeg")}, timeout=200)
    duration_ms = int((time.perf_counter() - start) * 1000)
    payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    summary = payload.get("summary", {})
    report = {
        "imageDimensions": {"width": width, "height": height},
        "httpStatus": response.status_code,
        "detectedCount": summary.get("detected", len(payload.get("detections", []))),
        "validRecognitionCount": summary.get("valid", 0),
        "invalidRecognitionCount": summary.get("invalid", 0),
        "batchCount": summary.get("batches", 0),
        "processingDurationMs": duration_ms,
        "peakMemory": "not_measured",
    }
    print(json.dumps(report, indent=2))
    return 0 if response.status_code < 500 else 1


if __name__ == "__main__":
    raise SystemExit(main())
