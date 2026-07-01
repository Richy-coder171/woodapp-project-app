# Annotation Guide

Run:

```powershell
cd D:\woodapp-project\woodapp-project\nvidia-ocr\annotation-tool
python -m pip install -r requirements.txt
streamlit run app.py
```

Place private page photos in `nvidia-ocr/data/source-pages/`. These files are ignored by Git.

Workflow:

- Click `Propose Boxes` to generate starting boxes from the current OpenCV detector.
- Use the table to edit `x`, `y`, `width`, and `height`; this moves and resizes boxes.
- Click `Add Box` for a missed measurement.
- Check `Delete` on rows that are wrong.
- Enter the corrected normalized text for each measurement.
- Click `Save Annotation` when all labels are valid.

Boxing rules:

- Draw one rectangle around one complete measurement expression, for example `43 x 24`.
- Do not box individual digits.
- Do not merge two measurements into one box.
- Include the full multiplication symbol and both numbers.
- Keep a small margin around handwriting so the crop is not clipped.
- Use the original intended text in normalized form: `43x24`, `33x17`, `42.5x18`.
- Keep every page for the same writer under the same `writerId`.

The tool saves canonical JSON under `nvidia-ocr/data/annotations/` and exports local recognition crops under `nvidia-ocr/data/recognition-crops/`. It never modifies the original image.
