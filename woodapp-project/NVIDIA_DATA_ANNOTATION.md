# NVIDIA Data Annotation

Canonical annotation format:

```json
{
  "image": "page-000001.jpg",
  "sourcePageId": "page-000001",
  "writerId": "writer-001",
  "width": 1080,
  "height": 1920,
  "measurements": [
    {
      "id": "measurement-0001",
      "polygon": [[120, 240], [350, 240], [350, 310], [120, 310]],
      "text": "43x24",
      "originalText": "43 x 24"
    }
  ]
}
```

Rules:

- Polygon points are original-image coordinates.
- One polygon covers one complete measurement.
- Do not annotate individual characters.
- `writerId` is required for leakage-safe splitting.
- Supported characters are `0123456789x.`.
- Supported label regex is `^\d+(?:\.\d+)?x\d+(?:\.\d+)?$`.

Annotation tool:

```powershell
cd D:\woodapp-project\woodapp-project\nvidia-ocr\annotation-tool
python -m pip install -r requirements.txt
streamlit run app.py
```
