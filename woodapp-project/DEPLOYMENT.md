# WoodApp Internet Deployment

Use this setup when WoodApp must work from any WiFi or mobile network.

## 1. Push The Project

From the repository root:

```powershell
cd D:\woodapp-project
git add woodapp-project
git commit -m "Prepare internet deployment"
git push
```

Never commit the real `backend/.env` file.

## 2. Deploy The Backend

Create a Render Web Service connected to the GitHub repository:

```text
Root Directory: woodapp-project/backend
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Add the variables listed in `backend/.env.example` using Render's environment settings. Use the real secret values there.

At least one of these is required:

```text
GEMINI_API_KEY
GROQ_API_KEY
```

For the SQLite database, use a paid Render web service and add a persistent disk:

```text
Mount Path: /var/data
DB_PATH=/var/data/woodapp.db
```

Do not run this SQLite backend on a Free Render web service. Free services lose
local SQLite changes whenever they spin down, restart, or redeploy, so accounts,
activations, payments, and scan history will be forgotten. If you need a free
web service, migrate the backend database to an external Postgres provider.

After deployment, verify:

```text
https://your-backend.onrender.com/api/health
```

The health response must show:

```json
{
  "status": "ok",
  "storage": {
    "dbPathConfigured": true,
    "persistenceMode": "configured-not-verified",
    "persistenceWarning": null
  }
}
```

If it shows `"status": "warning"`, do not use the deployment for real accounts.
Even with `"status": "ok"`, confirm that a paid persistent disk is actually
attached in the Render dashboard. The backend can verify `DB_PATH`, but it
cannot verify Render billing or disk attachment.

## 3. Deploy The Frontend

Create a Vercel project connected to the same GitHub repository:

```text
Framework Preset: Vite
Root Directory: woodapp-project/woodapp-react
Build Command: npm run build
Output Directory: dist
```

Add this Vercel environment variable:

```text
VITE_API_ORIGIN=https://your-backend.onrender.com
```

Do not include `/api` at the end. Redeploy the frontend after changing it.

## 4. Build The Android App

Create `woodapp-react/.env` from its example and set:

```text
VITE_API_ORIGIN=https://your-backend.onrender.com
```

Then rebuild:

```powershell
cd D:\woodapp-project\woodapp-project\woodapp-react
npm run android:apk
```

The rebuilt installable APK will be at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Production builds also read the tracked `.env.production` file, so the APK uses
the public backend from any network even when the local `.env` file is missing.

## Production Notes

- Keep all API keys in the backend host environment only.
- Use strong values for `JWT_SECRET` and `ADMIN_KEY`.
- Use HTTPS for both frontend and backend.
- SQLite requires persistent storage. Consider Postgres when usage grows.
