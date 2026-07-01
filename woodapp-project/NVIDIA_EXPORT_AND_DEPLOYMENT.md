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

Install exported models with:

```powershell
python nvidia-ocr\scripts\install_exported_models.py `
  --detector D:\models\woodapp-ocdnet.onnx `
  --recognizer D:\models\woodapp-ocrnet.onnx `
  --dictionary D:\models\woodapp_characters.txt
```

Render CPU inference uses `onnxruntime` with `CPUExecutionProvider`. Do not use CUDA, TensorRT, or `onnxruntime-gpu` on Render CPU.
