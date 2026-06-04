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

cd D:\woodapp-project\woodapp-project\woodapp-react
npm run network:update
npm run android:refresh-network
