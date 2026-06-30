# NVIDIA Export And Deployment

Export commands:

```bash
bash nvidia-ocr/scripts/export_ocdnet.sh
bash nvidia-ocr/scripts/export_ocrnet.sh
```

Expected runtime files:

```text
nvidia-ocr/models/exported/ocdnet.onnx
nvidia-ocr/models/exported/ocrnet.onnx
```

The service endpoint `/recognize-nvidia` returns `NVIDIA_MODEL_NOT_READY` until the exported model files are installed and output decoding is verified against the actual TAO export format.

Production must not be switched until acceptance gates pass.
