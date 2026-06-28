# Scanner Update

## 1. Why The Old Gemini/Groq Scanner Was Replaced

The old scanner sent the whole photo to Gemini and used Groq as a fallback. That worked for small single-column pages, but it often merged or missed measurements when a photo contained several columns, such as four columns with about ten rows each. It also depended on AI API keys, rate limits, and model behavior. The new scanner is detection-first: it finds each measurement box, lets the user choose which boxes count, and only then uses the existing WoodApp formula.

## 2. New Free Scanner Architecture

The scanner is now split into three parts:

- React frontend: captures or uploads the original photo, draws selectable SVG boxes, and calculates selected measurements.
- Node backend: keeps authentication, subscription checks, daily scan limits, database, payments, admin, and scan history.
- Python OCR service: uses OpenCV and PaddleOCR to detect and read measurement text.

The frontend calls only the Node backend. The Node backend calls the OCR service through `OCR_SERVICE_URL`.

## 3. OpenCV Responsibilities

OpenCV prepares a copy of the image for OCR. It respects EXIF orientation through Pillow before OpenCV processing, resizes very large images, converts to grayscale, improves contrast, reduces shadows, applies adaptive thresholding, corrects slight rotation, and attempts paper perspective correction when a clear page boundary is found. The original displayed photo is not destructively edited.

## 4. PaddleOCR Responsibilities

PaddleOCR reads text and returns text boxes. It does not calculate wood volume. The OCR service loads the model once at startup, then reuses it for every `/recognize` request.

## 5. React SVG Box-Selection Behaviour

After OCR returns, React displays the original photo and an SVG overlay using the original image coordinate system:

```jsx
<svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} preserveAspectRatio="xMidYMid meet">
```

Every OCR detection becomes one rectangle. Tapping a rectangle toggles its selected state.

## 6. Green And Grey Box Meanings

- Green box: selected and included in `Calculate Selected`.
- Grey box: not selected and excluded from calculation.

There are no extra status colors.

## 7. Calculate Selected Workflow

1. User takes or uploads a photo.
2. OCR returns independent measurement boxes.
3. All boxes start selected.
4. User taps boxes to include or exclude them.
5. User presses `Calculate Selected`.
6. Frontend parses selected measurement text.
7. Frontend calls existing `calc.js` functions.
8. Results show individual volumes and the grand total.

No OCR request is made during calculation.

## 8. Multi-Column Detection

The OCR service groups detections by horizontal center using dynamic spacing based on detected box width, detected box height, and image width. Columns are sorted left to right. Items inside each column are sorted top to bottom. Similar Y-positions across different columns are not merged.

Supported target layouts:

- One to six columns.
- Up to about 50 measurement lines.
- Four columns with about 10 measurements each.
- Slightly rotated phone photos.
- Uneven spacing.

## 9. Local OCR-Service Setup

```powershell
cd D:\woodapp-project\woodapp-project\ocr-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Health check:

```text
http://localhost:8000/health
```

## 10. Local Backend Setup

Create or update `backend\.env`:

```env
PORT=3001
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_KEY=replace-with-a-long-random-admin-key
OCR_SERVICE_URL=http://localhost:8000
OCR_TIMEOUT_MS=45000
UPI_ID=your-upi-id
UPI_PAYEE_NAME=WoodApp
SUBSCRIPTION_DAYS=30
SUBSCRIPTION_AMOUNT_INR=499
DB_PATH=
```

Start backend:

```powershell
cd D:\woodapp-project\woodapp-project\backend
npm run dev
```

## 11. Local Frontend Setup

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm run dev -- --host 0.0.0.0
```

If your WiFi or hotspot changes:

```powershell
npm run network:update
```

## 12. Environment Variables

Backend:

```env
OCR_SERVICE_URL=http://localhost:8000
OCR_TIMEOUT_MS=45000
JWT_SECRET=
ADMIN_KEY=
GOOGLE_CLIENT_ID=
UPI_ID=
UPI_PAYEE_NAME=WoodApp
SUBSCRIPTION_DAYS=30
SUBSCRIPTION_AMOUNT_INR=499
DB_PATH=
```

Frontend:

```env
VITE_API_ORIGIN=https://your-node-backend.onrender.com
```

Do not put OCR service URLs in the frontend. Do not send AI keys to the frontend.

## 13. Render OCR-Service Deployment

Create a separate Render service:

```text
Root Directory: woodapp-project/ocr-service
Runtime: Docker
Health Check Path: /health
```

After deploy, confirm:

```text
https://your-ocr-service.onrender.com/health
```

## 14. Render Node-Backend Configuration

Keep the existing Node backend service:

```text
Root Directory: woodapp-project/backend
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Add:

```env
OCR_SERVICE_URL=https://your-ocr-service.onrender.com
OCR_TIMEOUT_MS=45000
```

Keep persistent SQLite storage configured with `DB_PATH=/var/data/woodapp.db`, or migrate to Postgres before production usage grows.

## 15. Vercel Frontend Deployment

Keep Vercel pointed at:

```text
Root Directory: woodapp-project/woodapp-react
Build Command: npm run build
Output Directory: dist
```

Set:

```env
VITE_API_ORIGIN=https://your-node-backend.onrender.com
```

Use a Vercel preview deployment first. Do not point production traffic at the new scanner until OCR service and backend tests pass.

## 16. Android Capacitor Build Instructions

Set `woodapp-react\.env`:

```env
VITE_API_ORIGIN=https://your-node-backend.onrender.com
```

Build:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm run build
npm run android:sync
```

Or create a debug APK:

```powershell
npm run android:apk
```

## 17. Testing Checklist

- One-column page with 10 measurements.
- Four-column page with 10 rows per column.
- Forty independent boxes.
- Correct column grouping.
- Correct row ordering.
- Green selected state by default.
- Tap selected box changes it to grey.
- Tap grey box changes it to green.
- Select All.
- Clear All.
- Calculation includes only selected measurements.
- Calculation is blocked when no measurements are selected.
- Existing `calc.js` results remain correct.
- One photograph consumes one daily scan.
- Existing login and subscription behavior remains working.
- Overlay remains aligned when the displayed image is resized.

## 18. Known Limitations

- PaddleOCR accuracy depends on handwriting clarity, lighting, focus, and page contrast.
- Very curved or folded pages may still produce imperfect boxes.
- If OCR combines several measurements into one very wide text detection, the service attempts to split them evenly but may not perfectly match handwriting spacing.
- The first production OCR request can be slow while Render warms the service.

## 19. Rollback Instructions

Keep the current production deployment unchanged until preview testing passes. To roll back locally:

```powershell
git switch sign-up
```

To roll back production after a deployment, redeploy the last known good Render backend and Vercel frontend build from the previous branch or commit. Removing a key from a file does not remove it from Git history; rotate any exposed key separately.

## 20. Files Changed

Created:

- `ocr-service/app.py`
- `ocr-service/scanner.py`
- `ocr-service/preprocessing.py`
- `ocr-service/layout.py`
- `ocr-service/requirements.txt`
- `ocr-service/Dockerfile`
- `ocr-service/README.md`
- `ocr-service/tests/*`
- `woodapp-react/src/pages/calculator/components/ScanReviewScreen.jsx`
- `woodapp-react/src/utils/scanSelection.js`
- `woodapp-react/tests/scanner.test.js`
- `backend/tests/scan-route.test.cjs`
- `.gitignore`
- `SCANNER_UPDATE.md`

Modified:

- `backend/server.js`
- `backend/.env.example`
- `backend/package.json`
- `woodapp-react/package.json`
- `woodapp-react/src/pages/calculator/CalculatorApp.jsx`
- `woodapp-react/src/pages/calculator/components/IdleScreen.jsx`
- `woodapp-react/src/pages/calculator/components/PreviewScreen.jsx`
- `woodapp-react/src/pages/calculator/components/LoadingScreen.jsx`
- `woodapp-react/src/pages/calculator/components/ResultsScreen.jsx`
- `woodapp-react/src/styles/calculator.css`
- `woodapp-react/src/utils/calc.js`
- `README.md`
- `DEPLOYMENT.md`
