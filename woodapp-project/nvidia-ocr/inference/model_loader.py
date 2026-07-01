from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Callable


ENGINE = "nvidia-tao-ocdnet-ocrnet-v1"
CPU_PROVIDER = "CPUExecutionProvider"


class NvidiaModelNotReady(RuntimeError):
    def __init__(self, code: str, message: str = "The NVIDIA measurement models are not installed.") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class OnnxProbe:
    available: bool
    providers: list[str]
    version: str | None = None
    error_type: str | None = None


@dataclass(frozen=True)
class SessionInfo:
    session: Any
    input_names: list[str]
    output_names: list[str]
    input_shapes: list[Any]
    output_shapes: list[Any]


@dataclass(frozen=True)
class ModelPaths:
    detector: Path
    recognizer: Path
    dictionary: Path
    detector_config: Path
    recognizer_config: Path
    metadata: Path


@dataclass
class ModelBundle:
    detector: SessionInfo | None
    recognizer: SessionInfo | None
    dictionary: str
    paths: ModelPaths
    reason: str
    onnx: OnnxProbe

    @property
    def ready(self) -> bool:
        return self.reason == "MODELS_READY" and self.detector is not None and self.recognizer is not None and bool(self.dictionary)


def probe_onnx_runtime() -> OnnxProbe:
    try:
        import onnxruntime as ort

        return OnnxProbe(True, list(ort.get_available_providers()), getattr(ort, "__version__", None), None)
    except Exception as exc:
        return OnnxProbe(False, [], None, type(exc).__name__)


def default_model_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "ocr-service" / "models" / "nvidia"


def resolve_model_paths() -> ModelPaths:
    model_dir = Path(os.getenv("NVIDIA_MODEL_DIR", str(default_model_dir())))
    return ModelPaths(
        detector=Path(os.getenv("NVIDIA_DETECTOR_MODEL_PATH", str(model_dir / "woodapp-ocdnet.onnx"))),
        recognizer=Path(os.getenv("NVIDIA_RECOGNIZER_MODEL_PATH", str(model_dir / "woodapp-ocrnet.onnx"))),
        dictionary=Path(os.getenv("NVIDIA_CHARACTER_DICTIONARY_PATH", str(model_dir / "woodapp_characters.txt"))),
        detector_config=model_dir / "detector-config.json",
        recognizer_config=model_dir / "recognizer-config.json",
        metadata=model_dir / "model-metadata.json",
    )


def read_dictionary(path: Path) -> str:
    if not path.exists():
        raise NvidiaModelNotReady("DICTIONARY_MISSING")
    chars = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    dictionary = "".join(chars)
    if dictionary != "0123456789x.":
        raise NvidiaModelNotReady("MODEL_INPUT_UNSUPPORTED", "The NVIDIA character dictionary is unsupported.")
    return dictionary


def _session_info(session: Any) -> SessionInfo:
    inputs = list(session.get_inputs())
    outputs = list(session.get_outputs())
    if not inputs:
        raise NvidiaModelNotReady("MODEL_INPUT_UNSUPPORTED")
    if not outputs:
        raise NvidiaModelNotReady("MODEL_OUTPUT_UNSUPPORTED")
    return SessionInfo(
        session=session,
        input_names=[str(item.name) for item in inputs],
        output_names=[str(item.name) for item in outputs],
        input_shapes=[getattr(item, "shape", None) for item in inputs],
        output_shapes=[getattr(item, "shape", None) for item in outputs],
    )


def _load_session(
    path: Path,
    invalid_code: str,
    session_factory: Callable[..., Any] | None = None,
) -> SessionInfo:
    if session_factory is None:
        import onnxruntime as ort

        session_factory = ort.InferenceSession
    try:
        session = session_factory(str(path), providers=[CPU_PROVIDER])
        return _session_info(session)
    except NvidiaModelNotReady:
        raise
    except Exception as exc:
        raise NvidiaModelNotReady(invalid_code, f"Unable to load NVIDIA model: {type(exc).__name__}") from exc


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class NvidiaModelLoader:
    def __init__(
        self,
        paths: ModelPaths | None = None,
        session_factory: Callable[..., Any] | None = None,
        onnx_probe: OnnxProbe | None = None,
    ) -> None:
        self.paths = paths or resolve_model_paths()
        self.session_factory = session_factory
        self.onnx_probe = onnx_probe
        self._bundle: ModelBundle | None = None

    def load_once(self) -> ModelBundle:
        if self._bundle is not None:
            return self._bundle

        onnx = self.onnx_probe or probe_onnx_runtime()
        if not onnx.available:
            self._bundle = ModelBundle(None, None, "", self.paths, "ONNX_RUNTIME_NOT_INSTALLED", onnx)
            return self._bundle

        try:
            dictionary = read_dictionary(self.paths.dictionary)
        except NvidiaModelNotReady as exc:
            self._bundle = ModelBundle(None, None, "", self.paths, exc.code, onnx)
            return self._bundle

        if not self.paths.detector.exists():
            self._bundle = ModelBundle(None, None, dictionary, self.paths, "DETECTOR_MODEL_MISSING", onnx)
            return self._bundle
        if not self.paths.recognizer.exists():
            self._bundle = ModelBundle(None, None, dictionary, self.paths, "RECOGNIZER_MODEL_MISSING", onnx)
            return self._bundle

        try:
            detector = _load_session(self.paths.detector, "DETECTOR_MODEL_INVALID", self.session_factory)
            recognizer = _load_session(self.paths.recognizer, "RECOGNIZER_MODEL_INVALID", self.session_factory)
        except NvidiaModelNotReady as exc:
            self._bundle = ModelBundle(None, None, dictionary, self.paths, exc.code, onnx)
            return self._bundle

        self._bundle = ModelBundle(detector, recognizer, dictionary, self.paths, "MODELS_READY", onnx)
        return self._bundle

    def health(self) -> dict:
        bundle = self.load_once()
        complete = bundle.ready
        reason = "MODELS_READY" if complete else _public_reason(bundle.reason)
        return {
            "status": "ok" if complete else "unavailable",
            "engine": ENGINE,
            "detectorModelLoaded": bundle.detector is not None,
            "recognizerModelLoaded": bundle.recognizer is not None,
            "runtimeBackend": "onnx",
            "cudaAvailable": False,
            "tensorRtAvailable": False,
            "onnxRuntimeAvailable": bundle.onnx.available,
            "onnxProviders": bundle.onnx.providers,
            "reason": reason,
        }

    def require_ready(self) -> ModelBundle:
        bundle = self.load_once()
        if not bundle.ready:
            raise NvidiaModelNotReady(bundle.reason)
        return bundle


def _public_reason(reason: str) -> str:
    if reason in {"DETECTOR_MODEL_MISSING", "RECOGNIZER_MODEL_MISSING", "DICTIONARY_MISSING"}:
        return "MODEL_FILES_MISSING"
    return reason


def safe_metadata(bundle: ModelBundle) -> dict:
    return {
        "engine": ENGINE,
        "ready": bundle.ready,
        "reason": bundle.reason,
        "detectorInputs": bundle.detector.input_names if bundle.detector else [],
        "detectorOutputs": bundle.detector.output_names if bundle.detector else [],
        "recognizerInputs": bundle.recognizer.input_names if bundle.recognizer else [],
        "recognizerOutputs": bundle.recognizer.output_names if bundle.recognizer else [],
        "onnxRuntimeAvailable": bundle.onnx.available,
        "onnxProviders": bundle.onnx.providers,
        "onnxRuntimeVersion": bundle.onnx.version,
    }


def write_metadata(path: Path, metadata: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
