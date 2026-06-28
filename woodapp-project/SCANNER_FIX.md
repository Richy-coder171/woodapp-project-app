# Scanner Fix

## Root Cause

The Android scanner could reach a real zero-detection state even for readable handwritten measurements because the OCR path was too narrow:

- PaddleOCR response extraction only handled older legacy shapes and could miss newer response fields such as `res.rec_texts`, `rec_scores`, and `rec_polys`.
- OCR text parsing expected a clean `number x number` string and did not tolerate split OCR pieces like `4`, `x`, `12` or text with two numeric groups but a damaged separator.
- The preprocessing pipeline leaned on thresholded/processed images that can erase thin blue handwriting.
- The review preview had fixed-height behavior from the scanner UI, so tall Android photos could appear cropped even when OCR coordinates were valid.
- The frontend could show the zero-detection message too eagerly and did not have regression coverage for "detected boxes but no immediate calculation".

## OCR Response Shape

`ocr-service/scanner.py` now supports newer and older PaddleOCR shapes:

- `result.json`
- `result.json()`
- `result["res"]`
- `rec_texts`
- `rec_scores`
- `rec_polys`
- `rec_boxes`
- `dt_polys`
- `dt_boxes`
- legacy `[[poly, (text, score)], ...]`

Unexpected non-empty response shapes now raise a runtime error for development instead of being silently converted to an empty detection list.

## Image Preprocessing

`ocr-service/preprocessing.py` now creates multiple variants:

1. Original EXIF-oriented image, resized only when needed.
2. Deskewed image.
3. Contrast-enhanced colour image.
4. CLAHE grayscale image.
5. Adaptive-threshold image.
6. Blue-ink-enhanced image.
7. Optional page-warp fallback.

The original image remains the first OCR pass. Fallback variants run only when the first pass returns fewer than five plausible measurement detections.

## Thin Blue Handwriting

The blue-ink variant uses HSV blue masking plus a blue-vs-red channel check so faint blue strokes remain visible instead of being erased by binary thresholding. The scanner combines detections from fallback variants with bounding-box overlap deduplication.

## Frontend Filtering

`woodapp-react/src/utils/calc.js` now tolerates:

- `x`, `X`, `*`, and mojibake multiply symbols.
- decimal commas.
- OCR `O`/`I` confusions near numbers.
- two numeric groups even when the separator is missing.

`woodapp-react/src/utils/scanSelection.js` keeps returned boxes selected by default and calculates only selected boxes.

## Preview Cropping Fix

The scanner preview now follows the captured photo's natural aspect ratio:

```css
.scan-preview {
  position: relative;
  width: 100%;
}

.scan-preview img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
}

.scan-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
```

The SVG overlay uses the OCR service's original `imageWidth` and `imageHeight` through `viewBox={getOverlayViewBox(imageMeta.width, imageMeta.height)}`.

## Tests Run

Passed:

- `python -m py_compile ocr-service\app.py ocr-service\scanner.py ocr-service\preprocessing.py ocr-service\layout.py`
- Manual OCR parser tests via `runpy`: `ocr-service/tests/test_scanner_normalization.py`
- Manual layout tests via `runpy`: `ocr-service/tests/test_layout.py`
- `npm.cmd test` in `woodapp-react` - 12/12 tests passed.
- `npm.cmd test` in `backend` - 4/4 tests passed.
- `npm.cmd run build` in `woodapp-react`.
- `npm.cmd run android:sync` in `woodapp-react`.
- `.\gradlew.bat assembleDebug` in `woodapp-react/android`.

Blocked locally:

- `python -m pytest` in `ocr-service` failed because this Python environment does not have `pytest` installed.
- Installed PaddleOCR/PaddlePaddle versions could not be inspected because `paddleocr` is not installed locally.
- A live `POST /recognize` test could not be run locally for the same reason.

## Android APK

Debug APK built successfully:

```text
D:\woodapp-project\woodapp-project\woodapp-react\android\app\build\outputs\apk\debug\app-debug.apk
```

Build timestamp:

```text
27-06-2026 20:37:33
```

Size:

```text
4,824,765 bytes
```

## Remaining Limitations

- The private customer photo was not available in the workspace, so the exact photo still needs a manual device test.
- The local machine needs OCR dependencies installed before live PaddleOCR `/recognize` verification can be run.
- OCR quality still depends on photo focus, lighting, and handwriting contrast, but the scanner now avoids the previous all-or-nothing parsing and thresholding failure paths.
