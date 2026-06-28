# RapidOCR Migration

## Why PaddleOCR Was Replaced

The previous OCR service used PaddleOCR/PaddlePaddle. On the current small Render deployment it frequently timed out or failed during full-page OCR, which caused Node to return `OCR_TIMEOUT` or `OCR_FAILED` and Android to show an OCR scan failure. The new service uses RapidOCR with ONNX Runtime plus OpenCV region detection to reduce startup/runtime weight while keeping the same Node, Android, React, and calculation workflow.

## Architecture

The OCR service starts one RapidOCR engine during FastAPI startup and reuses it for every `/recognize` request. The service never calculates wood volume.

Flow:

1. Android uploads the full image to Node.
2. Node forwards multipart field `file` to the OCR service.
3. OpenCV prepares a resized OCR copy while preserving original dimensions.
4. OpenCV detects likely measurement rows and columns.
5. RapidOCR recognizes each candidate crop sequentially.
6. The service maps boxes back to original image coordinates.
7. Node preserves `imageWidth`, `imageHeight`, and `detections`.
8. React displays selectable boxes and `calc.js` calculates only selected rows.

## OpenCV Candidate Regions

The detector builds blue-ink and grayscale masks, applies adaptive thresholding, removes tiny noise, groups connected components into measurement rows, and splits large horizontal gaps so columns remain independent. The final box for `4 x 12` covers the whole expression, not separate boxes around `4`, `x`, and `12`.

## Multi-Column Grouping

Grouping is dynamic. It uses component height, width, vertical overlap, baseline distance, and horizontal whitespace. It supports one to six columns and sorts columns left-to-right, then rows top-to-bottom inside each column.

## RapidOCR Result Adapter

`scanner.py` adapts common RapidOCR shapes into:

```python
{
    "text": "...",
    "confidence": 0.0,
    "polygon": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]],
}
```

It supports mapping fields such as `boxes`, `txts`, `texts`, `scores`, and list rows such as `[box, text, score]`. Unexpected non-empty shapes raise a clear development error instead of silently returning zero detections.

## Environment Setup

```powershell
cd D:\woodapp-project\woodapp-project\ocr-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Required packages are FastAPI, Uvicorn, OpenCV headless, Pillow, NumPy, RapidOCR, ONNX Runtime, python-multipart, and pytest.

## Local Testing

```powershell
cd D:\woodapp-project\woodapp-project\ocr-service
python -m pytest
uvicorn app:app --host 0.0.0.0 --port 8000
```

Direct recognition:

```powershell
curl.exe -X POST `
  -F "file=@PATH_TO_TEST_IMAGE.jpeg" `
  http://localhost:8000/recognize
```

Health should return:

```json
{
  "status": "ok",
  "modelLoaded": true,
  "engine": "rapidocr-onnx"
}
```

## Docker Testing

```powershell
cd D:\woodapp-project\woodapp-project\ocr-service
docker build -t woodapp-ocr .
docker run --rm -p 8000:8000 woodapp-ocr
```

The Dockerfile uses Python 3.11 slim, one Uvicorn worker, and low BLAS/OpenMP thread counts.

## Render Deployment

Manual steps only:

1. Open the Render OCR service.
2. Confirm root directory points to `woodapp-project/ocr-service`.
3. Confirm Docker runtime is enabled.
4. Deploy the latest branch manually.
5. Check `/health` for `engine: rapidocr-onnx`.
6. Confirm Node backend has `OCR_SERVICE_URL=https://woodapp-ocr.onrender.com`.
7. Test Node `/api/health`.
8. Test Android scanner with a five-line and four-column page.

## Node Integration

Node keeps using `POST /recognize` with multipart field `file`. Successful responses preserve:

- `imageWidth`
- `imageHeight`
- `detections`
- `box`
- `selected`
- `normalizedBox`

Timeout, service unavailable, processing failure, and invalid image errors are mapped separately.

## Android Testing

Build/sync:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm test
npm run build
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

Manual checks:

- Five-line single-column image returns five green boxes.
- Four-column page keeps boxes independent.
- Green boxes toggle grey.
- Grey boxes toggle green.
- `Calculate Selected` uses only green boxes.
- OCR failure does not show `Ready to select`.

## Rollback

1. Revert the RapidOCR migration commit.
2. Restore OCR service dependencies and Dockerfile from the previous commit.
3. Redeploy the OCR service manually.
4. Confirm Node `OCR_SERVICE_URL` still points to the restored OCR service.
5. Rebuild Android only if frontend scanner behavior changed.

## Known Limitations

- Very faint handwriting, severe blur, or heavy paper shadows may still need retakes.
- Boxes with uncertain text are returned for selection, but calculation only succeeds for selected rows that `calc.js` can parse.
- RapidOCR model behavior can vary slightly by version; adapter tests should be updated if the installed result shape changes.

## Files Changed

- `ocr-service/app.py`
- `ocr-service/scanner.py`
- `ocr-service/preprocessing.py`
- `ocr-service/requirements.txt`
- `ocr-service/Dockerfile`
- `ocr-service/tests/`
- `backend/server.js`
- `backend/tests/`
- `woodapp-react/src/pages/calculator/CalculatorApp.jsx`
- `woodapp-react/src/pages/calculator/components/ScanReviewScreen.jsx`
- `woodapp-react/tests/`
- `README.md`
