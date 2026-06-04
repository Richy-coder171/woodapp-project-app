# WoodApp Network Setup

Use this whenever your WiFi, hotspot, or PC network changes and the mobile app cannot reach the backend.

## What Changed

- The app no longer keeps the backend IP directly inside the main config file.
- The current network IP is stored in `woodapp-react/src/localNetwork.js`.
- Run one command to update that file automatically.
- Current detected PC IP: `10.24.57.103`.

## Quick Fix After Changing Network

1. Connect your PC and phone to the same WiFi or same mobile hotspot.
2. Open PowerShell in this folder:

   ```powershell
   cd D:\woodapp-project\woodapp-project\woodapp-react
   ```

3. Update the app network config:

   ```powershell
   npm run network:update
   ```

4. Start the backend:

   ```powershell
   cd ..\backend
   npm run dev
   ```

5. Start the frontend:

   ```powershell
   cd ..\woodapp-react
   npm run dev -- --host 0.0.0.0
   ```

6. Open the app on your phone browser using the IP printed by the command:

   ```text
   http://YOUR_PC_IP:5173
   ```

   Example for the current network:

   ```text
   http://10.24.57.103:5173
   ```

7. Test the backend from the phone browser:

   ```text
   http://YOUR_PC_IP:3001/api/health
   ```

   If it shows JSON with `"status":"ok"`, the phone can reach the backend.

## Android APK After Network Change

If you are using the installed Android app/APK, rebuild and sync after updating the network:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm run android:refresh-network
```

Then open Android Studio or rebuild/install the APK again.

## Manual IP Override

If automatic detection chooses the wrong adapter, pass the IP manually:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm run network:update -- -IpAddress 192.168.1.50
```

You can find the correct IP with:

```powershell
ipconfig
```

Look under `Wireless LAN adapter Wi-Fi` for `IPv4 Address`.

## Common Problems

- Phone and PC must be on the same WiFi/hotspot.
- Keep backend running on port `3001`.
- Keep frontend running on port `5173`.
- Allow Node.js through Windows Firewall for private networks.
- If the phone can open `http://YOUR_PC_IP:5173` but not `http://YOUR_PC_IP:3001/api/health`, the backend or firewall is the problem.

## Google Sign-In Setup

1. Create a Google OAuth Client ID in Google Cloud Console.
2. For browser testing, choose `Web application`.
3. Add these Authorized JavaScript origins:

   ```text
   http://localhost:5173
   http://10.24.57.103:5173
   ```

   After a network change, also add the new phone URL shown by `npm run network:update`.

4. Add the client ID to `backend\.env`:

   ```env
   GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
   ```

   If your file already has `VITE_GOOGLE_CLIENT_ID`, the backend will read that too.

5. Restart the backend:

   ```powershell
   cd D:\woodapp-project\woodapp-project\backend
   npm run dev
   ```

The app uses Google only to verify the account email. It never asks for or stores the Google password.

## Android Google Sign-In

The Android app uses the native Google account picker. If Android shows `Google sign-in failed: 10`, create an Android OAuth Client ID in the same Google Cloud project:

1. Application type: `Android`.
2. Package name:

   ```text
   com.woodapp.calculator
   ```

3. Add your debug app signing certificate SHA-1:

   ```text
   7D:93:22:DF:55:64:3A:D8:B8:8B:3F:5B:82:B4:8E:9F:29:80:A0:74
   ```

4. Rebuild and install the APK again:

   ```powershell
   cd D:\woodapp-project\woodapp-project\woodapp-react
   npm run build
   npm run android:sync
   ```

cd D:\woodapp-project\woodapp-project\woodapp-react
npm run network:update
npm run android:refresh-network
