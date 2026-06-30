from __future__ import annotations

from io import BytesIO
import importlib.util
from pathlib import Path
import sys

import cv2
import numpy as np
from fastapi.testclient import TestClient

import app as app_module


def _jpeg() -> bytes:
    image = np.full((80, 160, 3), 255, dtype=np.uint8)
    cv2.putText(image, "43x24", (10, 45), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def test_nvidia_health_reports_missing_models() -> None:
    pipeline_path = Path(__file__).resolve().parents[2] / "nvidia-ocr" / "inference" / "pipeline.py"
    spec = importlib.util.spec_from_file_location("test_nvidia_pipeline", pipeline_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["test_nvidia_pipeline"] = module
    spec.loader.exec_module(module)
    app_module.NVIDIA_ENGINE = module.NvidiaPipeline()
    app_module.NVIDIA_MODEL_NOT_READY = module.NvidiaModelNotReady
    client = TestClient(app_module.app)
    response = client.get("/nvidia-health")
    assert response.status_code == 503
    assert response.json()["detectorModelLoaded"] is False


def test_recognize_nvidia_missing_models_returns_safe_error() -> None:
    pipeline_path = Path(__file__).resolve().parents[2] / "nvidia-ocr" / "inference" / "pipeline.py"
    spec = importlib.util.spec_from_file_location("test_nvidia_pipeline_missing", pipeline_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["test_nvidia_pipeline_missing"] = module
    spec.loader.exec_module(module)
    app_module.NVIDIA_ENGINE = module.NvidiaPipeline()
    app_module.NVIDIA_MODEL_NOT_READY = module.NvidiaModelNotReady
    client = TestClient(app_module.app)
    response = client.post("/recognize-nvidia", files={"file": ("measurement.jpg", BytesIO(_jpeg()), "image/jpeg")})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "NVIDIA_MODEL_NOT_READY"
