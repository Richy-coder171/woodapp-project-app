from pathlib import Path


APP_SOURCE = Path(__file__).resolve().parents[1].joinpath("app.py").read_text(encoding="utf-8")
REQUIREMENTS = Path(__file__).resolve().parents[1].joinpath("requirements.txt").read_text(encoding="utf-8")


def test_health_reports_rapidocr_engine_and_model_state():
    assert 'ENGINE_NAME = "rapidocr-onnx"' in APP_SOURCE
    assert '"modelLoaded": True' in APP_SOURCE
    assert 'JSONResponse(status_code=503' in APP_SOURCE
    assert 'MODEL_READY' in APP_SOURCE
    assert 'MODEL_ERROR' in APP_SOURCE


def test_invalid_images_return_400_and_model_not_ready_returns_503():
    assert '_http_error(400' in APP_SOURCE
    assert 'INVALID_IMAGE' in APP_SOURCE
    assert 'status_code=503' in APP_SOURCE
    assert 'MODEL_NOT_READY' in APP_SOURCE


def test_paddle_runtime_dependencies_are_removed():
    lowered = REQUIREMENTS.lower()
    assert "rapidocr" in lowered
    assert "onnxruntime" in lowered
    assert "paddleocr" not in lowered
    assert "paddlepaddle" not in lowered
    assert "paddlex" not in lowered
