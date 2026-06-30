# NVIDIA OCR Architecture

The NVIDIA scanner is a separate opt-in pipeline. `/recognize` remains RapidOCR. `/recognize-nvidia` is the new NVIDIA endpoint.

Pipeline:

```text
full-page photograph
-> EXIF/orientation and mild preprocessing
-> TAO OCDNet detects one polygon per complete measurement line
-> each polygon is cropped from the original image
-> TAO OCRNet recognizes crops in batches
-> labels are normalized and validated
-> polygons and boxes are returned in original-image coordinates
```

Valid high-confidence detections return `selected: true`. Invalid or low-confidence detections return `selected: false`.

Python does not calculate wood volume. Existing frontend/backend calculation stays in `calc.js`.
