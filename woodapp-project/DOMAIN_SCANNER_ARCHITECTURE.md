# WoodApp Domain Scanner Architecture

The domain scanner is a separate first-milestone pipeline exposed at:

```text
POST /recognize-domain
```

It does not replace the current RapidOCR `/recognize` endpoint. Production remains on the existing scanner unless `SCANNER_ENGINE=domain` is explicitly configured.

Pipeline:

```text
Full-page photo
-> EXIF-corrected image from app.py / preprocessing.py
-> resized processing copy
-> OpenCV ink-mask measurement-line detection
-> one crop per detected measurement line
-> crop normalization
-> batch recognizer interface
-> grammar validation
-> original-coordinate boxes
-> React green/grey selection
```

Current recognizer:

- `BaselineRecognizer` is detector-only and returns invalid unselected boxes.
- `RapidOcrLineBaseline` is available as a temporary labeling/baseline adapter.
- `PretrainedRecognizerBenchmark` is a placeholder for TrOCR or similar evaluation.

No production accuracy is claimed until real writer-separated data is collected, trained, and evaluated.

Rollback:

- Keep `SCANNER_ENGINE` unset or set to `rapidocr`.
- Continue using `/recognize`.

