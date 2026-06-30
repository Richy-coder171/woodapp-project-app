# WoodApp Annotation Tool

Development-only helper for creating measurement-line annotations.

Run from the repository root:

```powershell
cd D:\woodapp-project\woodapp-project\ocr-service
uvicorn annotation_tool.app:app --reload --port 8010
```

Save annotations under `datasets/woodapp_measurements/annotations/`.

Labeling rules:

- Draw one rectangle around the full measurement expression, for example `43 x 24`.
- Do not draw separate boxes around `43`, `x`, and `24`.
- Normalize labels to the restricted form such as `43x24`.
- Keep all pages from the same writer under the same `writerId`.
- Do not commit private page images or annotation datasets.
