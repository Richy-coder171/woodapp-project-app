# WoodApp Project Manual

WoodApp is a full-stack wood volume calculator project with a React frontend, an Express backend, and optional OCR/scanner pipelines for document processing.

## 1. What this project contains

- Frontend: React + Vite + Capacitor for Android
- Backend: Node.js + Express + SQLite
- OCR services: RapidOCR scanner service
- Documentation: setup guides, deployment notes, and training resources

## 2. Project structure

- backend/ — API server and database logic
- woodapp-react/ — web app and Android app configuration
- ocr-service/ — OCR scanner service and preprocessing tools
- scripts/ — helper scripts for networking and Android fixes
- datasets/ — sample data and annotation resources

## 3. Requirements

Before running the project, make sure you have:

- Node.js 18 or newer
- npm
- PowerShell on Windows
- Android Studio (only if you want to build the APK)

## 4. Quick start

### Backend

```powershell
cd D:\woodapp-project\woodapp-project\backend
npm install
npm run dev
```

The backend will run on port 3001.

### Frontend

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm install
npm run dev -- --host 0.0.0.0
```

Open the app in your browser at:

```text
http://localhost:5173
```

To check the backend health, open:

```text
http://localhost:3001/api/health
```

## 5. Local phone testing

If you want to test the app from a phone on the same network:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm run network:update
```

Then start the backend and frontend as shown above. Open the URL printed by the script, usually in the form:

```text
http://YOUR_PC_IP:5173
```

## 6. Android build

To build and sync the Android app:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm run android:refresh-network
npm run android:apk
```

## 7. OCR and scanner options

RapidOCR is the scanner workflow for WoodApp.

## 8. Main documentation

Use these documents for deeper instructions:

- [DEPLOYMENT.md](DEPLOYMENT.md) — public deployment guide
- [SCANNER_UPDATE.md](SCANNER_UPDATE.md) — OCR scanner update notes
- [RAPIDOCR_MIGRATION.md](RAPIDOCR_MIGRATION.md) — RapidOCR migration guide
- [ANDROID_SCANNER_UPDATE.md](ANDROID_SCANNER_UPDATE.md) — Android scanner and APK guidance
- [DOMAIN_SCANNER_ARCHITECTURE.md](DOMAIN_SCANNER_ARCHITECTURE.md) — domain scanner architecture

## 9. Troubleshooting

- Make sure the phone and PC are on the same Wi-Fi or hotspot.
- Keep the backend running on port 3001.
- Keep the frontend running on port 5173.
- If the network changes, rerun the network update script.
- If the app cannot reach the backend, check firewall settings and the local IP address.

## 10. Deployment

For web deployment, use a hosting provider such as Render or Railway and follow the deployment guide in [DEPLOYMENT.md](DEPLOYMENT.md).
