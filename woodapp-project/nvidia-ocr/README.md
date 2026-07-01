# WoodApp NVIDIA OCR

This folder contains the isolated NVIDIA TAO OCR pipeline for dense handwritten WoodApp measurement pages.

Target flow:

```text
photo -> preprocessing -> TAO OCDNet line detection -> crops -> TAO OCRNet batch recognition -> grammar validation -> original-image boxes
```

The current production scanner is still RapidOCR. The NVIDIA path is opt-in through:

```env
SCANNER_ENGINE=nvidia
NVIDIA_OCR_SERVICE_URL=http://localhost:8000
NVIDIA_OCR_TIMEOUT_MS=180000
NVIDIA_FALLBACK_TO_RAPIDOCR=false
```

Training is not started automatically. Real training requires labelled private data, verified TAO CLI commands, official compatible pretrained checkpoints, and NVIDIA GPU/Docker readiness.

Main commands:

```powershell
.\nvidia-ocr\scripts\woodapp-nvidia.ps1 preflight
.\nvidia-ocr\scripts\woodapp-nvidia.ps1 validate-data
.\nvidia-ocr\scripts\woodapp-nvidia.ps1 split-data
.\nvidia-ocr\scripts\woodapp-nvidia.ps1 export-data
```

WSL/Linux:

```bash
bash nvidia-ocr/scripts/woodapp-nvidia.sh preflight
bash nvidia-ocr/scripts/woodapp-nvidia.sh train-detector
bash nvidia-ocr/scripts/woodapp-nvidia.sh train-recognizer
```

Install exported ONNX models:

```powershell
python nvidia-ocr\scripts\install_exported_models.py `
  --detector D:\models\woodapp-ocdnet.onnx `
  --recognizer D:\models\woodapp-ocrnet.onnx `
  --dictionary D:\models\woodapp_characters.txt
```
