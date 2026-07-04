# Android Scanner Update

## 1. Android Scanner Architecture

The Android APK remains the existing Capacitor app:

```text
Android APK
  -> bundled React/Vite scanner
  -> hosted Node/Express backend
  -> hosted PaddleOCR service
```

The APK never calls the OCR service directly. It calls only the Node backend configured by `VITE_API_ORIGIN`.

## 2. Camera Permissions

The Android manifest keeps only scanner/network permissions needed by the APK:

- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.CAMERA`

Legacy external storage permissions were removed. The camera is optional hardware so devices without a camera can still install the app.

## 3. Camera Capture Flow

On Android, `Take Photo` opens the WebView/native file capture intent with:

```jsx
accept="image/*"
capture="environment"
```

On regular browsers, the existing live camera flow using `navigator.mediaDevices.getUserMedia` is preserved. Capturing never calculates automatically; it starts OCR detection and then shows the selectable review screen.

## 4. Image Upload Flow

Android camera/file images are decoded in the WebView, resized to a maximum long side of 1800 pixels, drawn to canvas to respect displayed orientation, converted to JPEG/PNG data URL, and uploaded to the Node backend. Temporary object URLs are revoked immediately after preparation.

The backend forwards the image to the OCR service and returns detection boxes. The frontend does not upload directly to PaddleOCR.

## 5. Hosted Backend Configuration

Production Android builds must set:

```env
VITE_API_ORIGIN=https://your-node-backend.onrender.com
```

This value is read by `woodapp-react/src/config.js` and used as the API origin for packaged builds.

## 6. Development Network Configuration

Local browser testing may still use:

```powershell
npm run network:update
```

Debug Android builds have a debug-only manifest that allows cleartext HTTP for local testing. Production manifest settings do not enable global cleartext.

## 7. Production HTTPS Configuration

`capacitor.config.json` uses bundled assets from `dist` and does not point to a remote development server. Production APKs should use HTTPS through `VITE_API_ORIGIN`.

The main Android manifest no longer sets:

```xml
android:usesCleartextTraffic="true"
```

## 8. SVG Overlay Behaviour

The scanner review screen displays the original captured photo and an SVG overlay with:

```jsx
viewBox={`0 0 ${imageWidth} ${imageHeight}`}
preserveAspectRatio="xMidYMid meet"
```

The image and overlay both use contained sizing so boxes stay aligned in Android WebView across portrait, landscape, resizing, and scrolling.

## 9. Android Back-Button Behaviour

The app uses browser history state for scanner screens:

- Back on results returns to scanner review.
- Back on scanner review returns to the calculator screen.
- Back on camera closes the camera and returns to the calculator screen.

Other app navigation is unchanged.

## 10. Google Sign-In Requirements

Google Sign-In remains the existing native `GoogleAuthPlugin`.

- Package name remains `com.woodapp.calculator`.
- Debug SHA-1 remains documented in the plugin error message:
  `7D:93:22:DF:55:64:3A:D8:B8:8B:3F:5B:82:B4:8E:9F:29:80:A0:74`
- Add the release signing SHA-1 to Google Cloud when a release keystore is created.
- Do not place Google client secrets in the Android project.

## 11. Capacitor Sync Instructions

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
$env:VITE_API_ORIGIN="https://your-node-backend.onrender.com"
npm run build
npm run android:sync
```

## 12. Debug APK Build Instructions

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react\android
.\gradlew assembleDebug
```

Generated debug APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 13. Release APK Or AAB Preparation

Create a release keystore, configure signing in Gradle or Android Studio, add the release SHA-1 to Google Cloud OAuth, then build:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react\android
.\gradlew assembleRelease
```

For Play Store distribution, create a release AAB in Android Studio or with the appropriate Gradle bundle task after signing is configured.

## 14. Physical-Device Testing Checklist

1. Login works.
2. Google Sign-In still works.
3. Subscription checks still work.
4. Camera permission prompt works.
5. Camera opens.
6. Captured photo appears.
7. One-column image detects measurements.
8. Four-column image detects independent measurements.
9. Green boxes are selected by default.
10. Tapping a green box turns it grey.
11. Tapping a grey box turns it green.
12. Select All works.
13. Clear All works.
14. Calculate Selected includes only green boxes.
15. Calculation is blocked when zero boxes are selected.
16. Rotating the device does not misalign boxes.
17. Slow network shows a loading state.
18. Offline mode shows a useful error.
19. Android back button behaves correctly.
20. Scan history still works.
21. Payment and admin functionality remain unchanged.

## 15. Known Android Limitations

- The native WebView file capture intent behavior can vary by device camera app.
- User cancellation of the camera intent may return no file and no error event.
- OCR accuracy still depends on handwriting quality, lighting, and backend OCR availability.
- Debug builds can allow local HTTP for testing; release builds should use HTTPS only.

## 16. Rollback Instructions

The existing Capacitor Android project was preserved. Before native edits, backups were saved under:

```text
woodapp-react/android/backup/android-scanner-update-20260627
```

To roll back code with Git:

```powershell
cd D:\woodapp-project
git switch feature/free-ocr-scanner
git restore woodapp-project/woodapp-react/capacitor.config.json
git restore woodapp-project/woodapp-react/android
git restore woodapp-project/woodapp-react/src/pages/calculator
git restore woodapp-project/woodapp-react/src/styles/calculator.css
```

Use `git status` first so you do not discard work you want to keep.

## 17. Files Changed

Android/native:

- `woodapp-react/capacitor.config.json`
- `woodapp-react/android/app/src/main/AndroidManifest.xml`
- `woodapp-react/android/app/src/debug/AndroidManifest.xml`
- `woodapp-react/android/app/src/main/res/xml/network_security_config.xml`

Frontend scanner:

- `woodapp-react/src/pages/calculator/CalculatorApp.jsx`
- `woodapp-react/src/pages/calculator/components/IdleScreen.jsx`
- `woodapp-react/src/pages/calculator/components/ScanReviewScreen.jsx`
- `woodapp-react/src/styles/calculator.css`

Documentation:

- `ANDROID_SCANNER_UPDATE.md`
- `README.md`
