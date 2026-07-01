from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TARGET = ROOT / "ocr-service" / "models" / "nvidia"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_file(path: Path, label: str) -> None:
    if not path.exists() or not path.is_file():
        raise SystemExit(f"{label} does not exist: {path}")
    if path.stat().st_size <= 0:
        raise SystemExit(f"{label} is empty: {path}")


def copy_checked(source: Path, target: Path, force: bool) -> None:
    if target.exists() and not force:
        raise SystemExit(f"Refusing to overwrite existing file without --force: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def main() -> int:
    parser = argparse.ArgumentParser(description="Install exported WoodApp NVIDIA ONNX models for OCR service runtime.")
    parser.add_argument("--detector", type=Path, required=True, help="Path to exported OCDNet ONNX model")
    parser.add_argument("--recognizer", type=Path, required=True, help="Path to exported OCRNet ONNX model")
    parser.add_argument("--dictionary", type=Path, required=True, help="Path to WoodApp character dictionary")
    parser.add_argument("--target-dir", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    validate_file(args.detector, "Detector ONNX")
    validate_file(args.recognizer, "Recognizer ONNX")
    validate_file(args.dictionary, "Dictionary")

    detector_target = args.target_dir / "woodapp-ocdnet.onnx"
    recognizer_target = args.target_dir / "woodapp-ocrnet.onnx"
    dictionary_target = args.target_dir / "woodapp_characters.txt"
    copy_checked(args.detector, detector_target, args.force)
    copy_checked(args.recognizer, recognizer_target, args.force)
    copy_checked(args.dictionary, dictionary_target, args.force)

    metadata = {
        "status": "installed",
        "engine": "nvidia-tao-ocdnet-ocrnet-v1",
        "installedAt": datetime.now(timezone.utc).isoformat(),
        "detector": {
            "file": detector_target.name,
            "sha256": sha256(detector_target),
            "bytes": detector_target.stat().st_size,
        },
        "recognizer": {
            "file": recognizer_target.name,
            "sha256": sha256(recognizer_target),
            "bytes": recognizer_target.stat().st_size,
        },
        "dictionary": {
            "file": dictionary_target.name,
            "sha256": sha256(dictionary_target),
            "bytes": dictionary_target.stat().st_size,
        },
        "accuracy": None,
    }
    (args.target_dir / "model-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
