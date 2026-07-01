from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
INFERENCE = ROOT / "inference"
sys.path.insert(0, str(INFERENCE))

from model_loader import ModelPaths, NvidiaModelLoader, OnnxProbe, probe_onnx_runtime  # noqa: E402


class Io:
    def __init__(self, name: str, shape: list[int | str]) -> None:
        self.name = name
        self.shape = shape


class FakeSession:
    count = 0

    def __init__(self, path: str, providers: list[str]) -> None:
        FakeSession.count += 1
        self.path = path
        self.providers = providers

    def get_inputs(self):
        return [Io("input", [1, 3, 48, 320])]

    def get_outputs(self):
        return [Io("output", [1, 16, 13])]


def paths(tmp_path: Path) -> ModelPaths:
    return ModelPaths(
        detector=tmp_path / "woodapp-ocdnet.onnx",
        recognizer=tmp_path / "woodapp-ocrnet.onnx",
        dictionary=tmp_path / "woodapp_characters.txt",
        detector_config=tmp_path / "detector-config.json",
        recognizer_config=tmp_path / "recognizer-config.json",
        metadata=tmp_path / "model-metadata.json",
    )


READY_ONNX = OnnxProbe(True, ["CPUExecutionProvider"], "test", None)


def test_onnx_runtime_probe_reports_available_providers() -> None:
    probe = probe_onnx_runtime()
    assert isinstance(probe.available, bool)
    assert isinstance(probe.providers, list)


def test_missing_detector_model_is_reported(tmp_path: Path) -> None:
    model_paths = paths(tmp_path)
    model_paths.dictionary.write_text("0\n1\n2\n3\n4\n5\n6\n7\n8\n9\nx\n.\n", encoding="utf-8")
    loader = NvidiaModelLoader(model_paths, session_factory=FakeSession, onnx_probe=READY_ONNX)
    health = loader.health()
    assert health["status"] == "unavailable"
    assert health["reason"] == "MODEL_FILES_MISSING"
    assert health["detectorModelLoaded"] is False


def test_missing_recognizer_model_is_reported(tmp_path: Path) -> None:
    model_paths = paths(tmp_path)
    model_paths.dictionary.write_text("0\n1\n2\n3\n4\n5\n6\n7\n8\n9\nx\n.\n", encoding="utf-8")
    model_paths.detector.write_bytes(b"detector")
    loader = NvidiaModelLoader(model_paths, session_factory=FakeSession, onnx_probe=READY_ONNX)
    health = loader.health()
    assert health["reason"] == "MODEL_FILES_MISSING"
    assert loader.load_once().reason == "RECOGNIZER_MODEL_MISSING"


def test_missing_dictionary_is_reported(tmp_path: Path) -> None:
    model_paths = paths(tmp_path)
    loader = NvidiaModelLoader(model_paths, session_factory=FakeSession, onnx_probe=READY_ONNX)
    assert loader.load_once().reason == "DICTIONARY_MISSING"
    assert loader.health()["reason"] == "MODEL_FILES_MISSING"


def test_invalid_onnx_file_is_reported(tmp_path: Path) -> None:
    def broken_session(path: str, providers: list[str]):
        raise RuntimeError("invalid protobuf")

    model_paths = paths(tmp_path)
    model_paths.dictionary.write_text("0\n1\n2\n3\n4\n5\n6\n7\n8\n9\nx\n.\n", encoding="utf-8")
    model_paths.detector.write_bytes(b"not-onnx")
    model_paths.recognizer.write_bytes(b"not-onnx")
    loader = NvidiaModelLoader(model_paths, session_factory=broken_session, onnx_probe=READY_ONNX)
    assert loader.load_once().reason == "DETECTOR_MODEL_INVALID"


def test_model_loads_once_with_cpu_provider(tmp_path: Path) -> None:
    FakeSession.count = 0
    model_paths = paths(tmp_path)
    model_paths.dictionary.write_text("0\n1\n2\n3\n4\n5\n6\n7\n8\n9\nx\n.\n", encoding="utf-8")
    model_paths.detector.write_bytes(b"detector")
    model_paths.recognizer.write_bytes(b"recognizer")
    loader = NvidiaModelLoader(model_paths, session_factory=FakeSession, onnx_probe=READY_ONNX)
    first = loader.load_once()
    second = loader.load_once()
    assert first is second
    assert first.ready is True
    assert FakeSession.count == 2
    assert first.detector.session.providers == ["CPUExecutionProvider"]
    assert loader.health()["status"] == "ok"
