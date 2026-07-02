# Android RapidOCR Test

## Hosted Service Health

OCR service:

```powershell
curl.exe -sS https://woodapp-ocr.onrender.com/health
```

Expected:

```json
{"status":"ok","modelLoaded":true,"engine":"rapidocr-onnx"}
```

Backend:

```powershell
curl.exe -sS https://woodapp-project-app.onrender.com/api/health
```

Confirm the backend reports `scanner.engine` as `rapidocr-onnx`, `ocrServiceUrlConfigured: true`, and a configured timeout.

## Production API Configuration

Production Android builds must set:

```powershell
$env:VITE_API_ORIGIN="https://woodapp-project-app.onrender.com"
```

The Android app calls only the Node backend:

```text
https://woodapp-project-app.onrender.com
```

It must not call:

```text
https://woodapp-ocr.onrender.com
localhost
private LAN IP addresses
```

## Camera-To-File Conversion

Android uses the captured image file from the system picker/camera input. The frontend converts it to image bytes with a valid filename, MIME type, and non-zero file size before upload. Development-only logs include filename, MIME type, file size, API origin, HTTP status, and detection count. They do not include base64 image data, tokens, passwords, or API keys.

## Android Permissions

Required permissions:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
```

No broad storage permissions are required.

## Build Commands

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
$env:VITE_API_ORIGIN="https://woodapp-project-app.onrender.com"
npm install
npm test
npm run build
npm run android:sync
```

Android:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react\android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

## APK Path

```text
D:\woodapp-project\woodapp-project\woodapp-react\android\app\build\outputs\apk\debug\app-debug.apk
```

Latest verified debug APK:

```text
Path: D:\woodapp-project\woodapp-project\woodapp-react\android\app\build\outputs\apk\debug\app-debug.apk
Size: 4,824,829 bytes
Built: 2026-06-29 00:55:58 +05:30
```

## ADB Installation

Check devices:

```powershell
adb devices
```

Install when one authorized device is connected:

```powershell
adb install -r "D:\woodapp-project\woodapp-project\woodapp-react\android\app\build\outputs\apk\debug\app-debug.apk"
```

If ADB is unavailable, open `woodapp-react/android` in Android Studio, select a physical device, and run the app.

Current environment note: `adb` is not available on PATH, so install and Logcat capture were not completed from this shell.

## Verification Completed

- Hosted OCR health returned `status: ok`, `modelLoaded: true`, and `engine: rapidocr-onnx`.
- Hosted backend health returned `scanner.engine: rapidocr-onnx` and `ocrServiceUrlConfigured: true`.
- Production build used `VITE_API_ORIGIN=https://woodapp-project-app.onrender.com`.
- Final `dist` and Android copied assets contain the Node backend origin.
- Final `dist` and Android copied assets do not contain `woodapp-ocr.onrender.com`, `localhost`, `127.0.0.1`, `10.136.187.103`, `10.24.57.103`, or `192.168.`.
- `npm test` passed in `woodapp-react`.
- `npm test` passed in `backend`.
- `npm run build` passed in `woodapp-react`.
- `npm run android:sync` passed in `woodapp-react`.
- `.\gradlew.bat clean` passed in `woodapp-react/android`.
- `.\gradlew.bat assembleDebug` passed in `woodapp-react/android`.

## Physical Test Checklist

- App opens successfully.
- Login works.
- Subscription check works.
- Camera permission appears correctly.
- Camera capture works.
- Captured photograph is complete and not cropped.
- Upload reaches the hosted Node backend.
- Five-line page returns approximately five boxes.
- Four-column page keeps measurements separate.
- All boxes begin green.
- Tap green changes only that box to grey.
- Tap grey changes only that box to green.
- Select All works.
- Clear All works.
- Calculate Selected uses only green boxes.
- No automatic calculation happens after capture.
- Slow OCR shows a loading state.
- OCR failure shows one error message only.
- Android back button behaves correctly.
- Existing payment, history, and Google Sign-In still work.

## Logcat Troubleshooting

Filter terms:

```text
WoodApp
Capacitor
chromium
OCR
scan
fetch
Network
```

Safe details to capture:

- Request URL host.
- HTTP status.
- Error code.
- Image file size.
- Detection count.

Do not capture tokens, passwords, image bytes, base64 image contents, or API keys.

## Render Log Correlation

Check:

```text
woodapp-project-app -> Logs
woodapp-ocr -> Logs
```

Correlate Android failures with:

- Android upload.
- Node forwarding.
- OCR processing.
- Node response mapping.
- React rendering.

## Known Limitations

- Physical-device scanner verification requires an authorized Android device.
- Render cold starts can make OCR slower on the first scan.
- Very faint or blurred handwriting may still need a retake.

## Rollback

1. Revert the scanner/API build commit.
2. Rebuild the frontend with the previous known-good API configuration.
3. Run `npm run android:sync`.
4. Rebuild the debug APK.
5. Reinstall with `adb install -r` or Android Studio.

## Files Changed

- `woodapp-react/src/pages/calculator/CalculatorApp.jsx`
- `woodapp-react/src/config.js`
- `woodapp-react/src/pages/admin/AdminDashboard.jsx`
- `woodapp-react/src/pages/calculator/components/CameraScreen.jsx`
- `woodapp-react/src/pages/calculator/components/ScanReviewScreen.jsx`
- `woodapp-react/src/styles/calculator.css`
- `woodapp-react/tests/scanner.test.js`
- `woodapp-react/android/app/src/main/AndroidManifest.xml`
- `ANDROID_RAPIDOCR_TEST.md`
