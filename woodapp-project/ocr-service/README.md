# WoodApp OCR Service

FastAPI service for the free WoodApp scanner. It prepares phone photos with OpenCV, runs RapidOCR/ONNX once-loaded at startup, and returns measurement text with rectangular coordinates. It does not calculate volume.

## Local Setup

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

Recognition endpoint:

```text
POST /recognize
multipart/form-data field: file
```

The Node backend calls this service. The frontend should never call it directly.

## Render

Create a separate Render Web Service from this folder:

```text
Root Directory: woodapp-project/ocr-service
Runtime: Docker
Health Check Path: /health
```

Then set the Node backend environment variable:

```env
OCR_SERVICE_URL=https://your-ocr-service.onrender.com
```
