# 🪵 WoodApp — Full Project

## Project Structure
```
woodapp-project/
├── backend/          ← Node.js API server
│   ├── server.js
│   ├── package.json
│   └── .env          ← Your API keys go here
└── woodapp-react/    ← React + Vite frontend (for APK)
    ├── src/
    ├── android/      ← Created after: npx cap add android
    └── ...
```

---

## ⚙️ STEP 1 — Setup Backend

```bash
cd backend
npm install
node server.js
```

The server runs on port 3001.

---

## ⚙️ STEP 2 — Find your PC's IP Address

**Windows:**
```
ipconfig
```
Look for "IPv4 Address" → e.g. `192.168.1.105`

**Linux/Mac:**
```
hostname -I
```

---

## ⚙️ STEP 3 — Update Frontend API URL

Open `woodapp-react/src/config.js` and replace the IP:

```js
export const API_BASE = 'http://YOUR_PC_IP:3001/api';
// Example:
export const API_BASE = 'http://192.168.1.105:3001/api';
```

---

## ⚙️ STEP 4 — Build the React App

```bash
cd woodapp-react
npm install
npm run build
```

---

## ⚙️ STEP 5 — Build Android APK with Capacitor

```bash
# Inside woodapp-react folder:
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init WoodApp com.woodapp.calculator
npx cap add android
npx cap sync

# Open in Android Studio:
npx cap open android
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

---

## ⚙️ STEP 6 — Fix HTTP on Android (IMPORTANT)

Open `android/app/src/main/AndroidManifest.xml` and add:

```xml
<application
    android:usesCleartextTraffic="true"
    ...>
```

Then rebuild the APK.

---

## 🌐 Admin Dashboard

Open in browser: `http://localhost:5173/admin`

- API URL: `http://localhost:3001`
- Admin Key: whatever you set in `.env` as `ADMIN_KEY`

---

## 📱 Requirements

- Phone and PC must be on the **same Wi-Fi network**
- Backend server must be running when using the app
