# NVIDIA OCR Test Report

Current status: scaffolding and API integration complete; model training and real accuracy evaluation are pending.

No production environment variables were changed.

Current model readiness contract:

- Runtime backend: `onnx`
- Required provider on Render CPU: `CPUExecutionProvider`
- Required detector: `ocr-service/models/nvidia/woodapp-ocdnet.onnx`
- Required recognizer: `ocr-service/models/nvidia/woodapp-ocrnet.onnx`
- Required dictionary: `ocr-service/models/nvidia/woodapp_characters.txt`
- Missing model response: `NVIDIA_MODEL_NOT_READY`

Acceptance gates still pending:

- TAO environment verified.
- Official pretrained checkpoints acquired.
- OCDNet checkpoint trained/evaluated.
- OCRNet checkpoint trained/evaluated.
- ONNX exports validated.
- Dense-page HTTP 200 with real model output.
- Detection and recognition targets measured on held-out writer-aware data.
