# Final Prompt

Use this prompt at the beginning of the project to build the current RapidOCR-based WoodApp scanner state.

```text
Work only inside:

D:\woodapp-project\woodapp-project

Current branch:

feature/free-ocr-scanner

Goal:
Build WoodApp as a React + Node + FastAPI app with a working free OCR scanner using RapidOCR, not paid AI APIs and not NVIDIA.

Hard rules:
1. Use RapidOCR/ONNX as the OCR engine.
2. Do not use Gemini, Groq, OpenAI vision, PaddleOCR, PaddlePaddle, NVIDIA TAO, CUDA, or TensorRT.
3. Keep production scanner on RapidOCR.
4. Do not automatically deploy.
5. Do not publish APK automatically.
6. Do not modify authentication, subscriptions, payments, database logic, or wood-volume calculation unless required for scanner integration.
7. Work only in this repository.
8. Preserve any existing user changes.
9. Run tests and report exact results.

Required architecture:

Frontend:
- React/Vite app.
- User captures or uploads a full-page image of handwritten wood measurements.
- Show the full photo after scanning.
- Overlay one rectangle per detected measurement.
- Valid measurements start green and selected.
- Invalid or uncertain measurements start grey and unselected.
- User can tap boxes to toggle selected/unselected.
- Select All selects valid detections only.
- Clear All deselects everything.
- Calculate Selected uses existing calc.js.
- Do not calculate automatically.
- Do not add a customer text-editing form.
- Retake Photo remains available.
- Show only one OCR error panel.
- On OCR failure show exactly:
  OCR processing failed. Please try again.
- On OCR failure enable Retake Photo and disable Select All, Clear All, Calculate Selected.

Backend:
- Node/Express backend keeps existing auth, subscription, scan limits, payment, and history behavior.
- Remove all Gemini/Groq scanner code.
- Add OCR service integration through multipart upload.
- Use:
  OCR_SERVICE_URL=http://localhost:8000
  OCR_TIMEOUT_MS=45000
  SCANNER_ENGINE=rapidocr
- Default scanner must be RapidOCR.
- Send one image request per scan, not one request per measurement.
- Preserve image width/height, detections, status, diagnostics, and failedColumns from OCR service.
- Return safe public errors.
- For 500 OCR failures return:
  OCR processing failed. Please try again.

OCR service:
- FastAPI service in ocr-service.
- Keep endpoint:
  POST /recognize
- Keep health endpoint:
  GET /health
- Use RapidOCR initialized once at startup.
- Do not initialize OCR per crop.
- Do not use PaddleOCR/PaddlePaddle.
- Decode images safely with PIL/OpenCV.
- Apply EXIF orientation.
- Ensure OpenCV receives non-empty uint8 NumPy images.
- Support JPEG, PNG, WEBP.
- Enforce max upload bytes and max image pixels.
- Return HTTP 200 with detections array.
- If no text is found, return HTTP 200 with detections: [].
- Log full server tracebacks but return safe client errors.

RapidOCR adapter requirements:
- Verify installed rapidocr and onnxruntime versions.
- Inspect actual RapidOCR return-object shape.
- Support RapidOCR v3 object/dict style results and legacy tuple/list style results.
- Convert all NumPy values and arrays to normal Python JSON-safe values.
- Normalize measurement symbols:
  x variants -> x
  spaces normalized
- Parse measurements such as:
  43 x 24
  33 x 17
  23 X 26
  43*30
  42.5 x 18
- Keep existing WoodApp calculation logic in calc.js.

Dense-page scanner behavior:
- Support dense handwritten pages with approximately:
  1-6 columns
  5-100 measurements per page
  blue or black handwriting
  slight rotation
  uneven lighting
- Use image preprocessing:
  EXIF orientation
  safe resizing
  shadow reduction
  contrast improvement
  blue ink preservation
  black ink preservation
  mild deskewing
- Detect column regions and measurement-line candidates with OpenCV heuristics.
- Run RapidOCR on column/crop regions as needed.
- Batch/limit work so one bad region does not fail the entire page.
- If some columns fail but others succeed, return partial results:
  status: partial
  failedColumns: [...]
- Do not fail the whole page because one column/crop failed.
- Sort detections by columns left-to-right and rows top-to-bottom.
- Return original-image coordinates.

OCR response schema:

{
  "imageWidth": 715,
  "imageHeight": 1600,
  "engine": "rapidocr-onnx",
  "status": "ok",
  "failedColumns": [],
  "detections": [
    {
      "id": "measurement-1",
      "rawText": "43x24",
      "normalizedText": "43 x 24",
      "confidence": 0.95,
      "selected": true,
      "columnIndex": 0,
      "rowIndex": 0,
      "box": {
        "x": 120,
        "y": 240,
        "width": 230,
        "height": 70
      },
      "normalizedBox": {
        "x": 0.1,
        "y": 0.2,
        "width": 0.2,
        "height": 0.05
      },
      "parsedValues": {
        "aRaw": "43",
        "bRaw": "24"
      }
    }
  ],
  "diagnostics": {
    "candidateCount": 0,
    "recognizedCount": 0,
    "returnedCount": 0,
    "columnCount": 0,
    "fullPageOcrCalls": 0,
    "columnOcrCalls": 0,
    "cropOcrCalls": 0,
    "fallbackOcrCalls": 0,
    "rapidocrTotalCalls": 0,
    "failedColumnCount": 0,
    "preprocessingMs": 0,
    "fullPageOcrMs": 0,
    "candidateDetectionMs": 0,
    "cropOcrMs": 0
  }
}

Tests:
- Add OCR service tests for:
  image validation
  upload validation
  RapidOCR result normalization
  empty OCR returns HTTP 200
  dense-page layout sorting
  1-column, 4-column, 6-column fixtures
  partial failure behavior
  NumPy JSON conversion
- Add backend tests for:
  scanner uses OCR_SERVICE_URL
  Gemini/Groq removed
  one uploaded page increments scan count once
  dimensions and detections are preserved
  safe OCR errors
- Add frontend tests for:
  calc.js unchanged
  selected-only calculation
  invalid detections stay grey/unselected
  full image preview
  original OCR coordinate overlay
  no automatic calculation
  single OCR error panel

Run:
cd D:\woodapp-project\woodapp-project\ocr-service
.\.venv\Scripts\python.exe -m pytest

cd D:\woodapp-project\woodapp-project\backend
npm test

cd D:\woodapp-project\woodapp-project\woodapp-react
npm test
npm run build

Also test locally:
cd D:\woodapp-project\woodapp-project\ocr-service
uvicorn app:app --host 0.0.0.0 --port 8000

Then:
curl.exe -i -X POST -F "file=@D:\WhatsApp Image 2026-05-08 at 12.45.26 PM.jpeg;type=image/jpeg;filename=measurement.jpeg" http://localhost:8000/recognize

Work is complete only when:
1. RapidOCR service starts.
2. /health works.
3. /recognize returns HTTP 200 and valid JSON for a real image.
4. Frontend displays the photo with selectable boxes.
5. Calculation uses selected boxes only.
6. Tests pass.
7. Build passes.
8. No NVIDIA, paid vision APIs, PaddleOCR, or unrelated systems are added.
9. Production remains RapidOCR.
10. Nothing is deployed automatically.

Final report must include:
- Files changed
- RapidOCR version
- onnxruntime version
- Local curl status
- Detection count
- Tests run and exact results
- Any known limitations
- Commands to commit and push
```
