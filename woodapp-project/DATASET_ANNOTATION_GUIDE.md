# Dataset Annotation Guide

Private data lives under:

```text
datasets/woodapp_measurements/
```

Do not commit private pages, crops, annotations, or manifests.

Annotation rules:

- One rectangle per complete measurement expression.
- Label `43 x 24` as `43x24`.
- Supported characters: `0 1 2 3 4 5 6 7 8 9 x .`
- Keep all pages from the same writer under the same `writerId`.
- Do not split one writer across train/test.

Run the development annotation API:

```powershell
cd D:\woodapp-project\woodapp-project\ocr-service
uvicorn annotation_tool.app:app --reload --port 8010
```

Validate:

```powershell
python training\validate_dataset.py --dataset ..\datasets\woodapp_measurements
```

