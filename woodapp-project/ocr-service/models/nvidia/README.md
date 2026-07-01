# NVIDIA Model Artifacts

This directory is the production model contract for the WoodApp NVIDIA OCR runtime.

Expected files:

- `woodapp-ocdnet.onnx`
- `woodapp-ocrnet.onnx`
- `woodapp_characters.txt`
- `detector-config.json`
- `recognizer-config.json`
- `model-metadata.json`

Large model files are ignored by Git. Install exported model artifacts with:

```powershell
python nvidia-ocr\scripts\install_exported_models.py --detector D:\models\woodapp-ocdnet.onnx --recognizer D:\models\woodapp-ocrnet.onnx --dictionary D:\models\woodapp_characters.txt
```
