# Model Installation

Use this after TAO training, evaluation, and ONNX export have completed on a compatible NVIDIA GPU machine.

Example:

```powershell
python nvidia-ocr\scripts\install_exported_models.py `
  --detector D:\models\woodapp-ocdnet.onnx `
  --recognizer D:\models\woodapp-ocrnet.onnx `
  --dictionary D:\models\woodapp_characters.txt
```

The script:

- validates that all files exist and are non-empty;
- copies them to `ocr-service/models/nvidia/`;
- writes SHA-256 checksums to `model-metadata.json`;
- refuses to overwrite existing model files unless `--force` is passed;
- does not modify environment variables;
- does not deploy.

Production environment variables:

```env
NVIDIA_DETECTOR_MODEL_PATH=/app/models/nvidia/woodapp-ocdnet.onnx
NVIDIA_RECOGNIZER_MODEL_PATH=/app/models/nvidia/woodapp-ocrnet.onnx
NVIDIA_CHARACTER_DICTIONARY_PATH=/app/models/nvidia/woodapp_characters.txt
NVIDIA_RUNTIME_BACKEND=onnx
NVIDIA_RECOGNITION_BATCH_SIZE=16
NVIDIA_MAX_DETECTIONS=100
NVIDIA_MIN_CONFIDENCE=0.70
```

Safe deployment methods:

1. Include the model artifacts through an approved private build process.
2. Download model artifacts during deployment from secure private storage.

Do not commit model files, secrets, signed URLs, or credentials.
