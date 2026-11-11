# Deploy the EstateMaster server (so the Android app can sign in)

The Android app is only the screens. Accounts, passwords, invoices and payments live on the **server in this repo**.
If the server is not running, is private, or is an older version, the app shows
"Cannot reach the EstateMaster server".

The address built into the app (`DEFAULT_PRODUCTION_API_URL` in `src/lib/api.ts`) is an AI Studio preview URL.
Those are usually private (they ask for a Google sign-in) and run the *old* server code, so the app cannot use them.
Deploy this repo's server and point the app at it, as below. These steps use Google Cloud Run because the project
already lives in Google Cloud; any host that runs a Docker image works the same way.

## 1. Deploy to Cloud Run (about 10 minutes, from a browser)

Open **Cloud Shell** (https://shell.cloud.google.com), signed in to the Google account that owns the project, then:

```bash
git clone https://github.com/Mecha-tronic/EstateMaster-web-to-apk-2
cd EstateMaster-web-to-apk-2
git checkout claude/security-audit-bank-integration     # skip once this branch is merged into main

gcloud config set project horizontal-disk-2ds98
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com

# Random key that signs the expiring receipt links. Keep it; changing it invalidates old links.
SECRET=$(openssl rand -hex 48)

gcloud run deploy estatemaster --source . --region europe-west1 --allow-unauthenticated \
  --set-env-vars "DATA_STORE=firestore,FIREBASE_PROJECT_ID=horizontal-disk-2ds98,FIREBASE_DATABASE_ID=ai-studio-estatemasterwebt-68079c9a-d004-4a14-abfd-07d4b87adab1,LINK_SIGNING_SECRET=$SECRET,TRUST_PROXY_HOPS=1,APP_URL=https://placeholder.invalid"

# APP_URL must be the service's own address: set it now that it exists.
URL=$(gcloud run services describe estatemaster --region europe-west1 --format='value(status.url)')
gcloud run services update estatemaster --region europe-west1 --update-env-vars "APP_URL=$URL"

echo $URL
curl $URL/api/health
```

The last command must print `{"status":"ok","service":"estatemaster","apiVersion":2,...}`. If it does not, see
**Troubleshooting**.

Notes
- `--allow-unauthenticated` is required. Without it Cloud Run answers every request from the phone with 403.
  The server still requires sign-in for everything except login, registration and payment/bank callbacks.
- The Firestore database id above is the one from the project's original `firebase-applet-config.json`.
  Change it if you use a different database.
- Existing data from the old app is upgraded automatically on first start. Accounts that still use a weak or demo
  password are deactivated and owners must use "Forgot password" (needs e-mail, see step 3).

## 2. Point the app at the server

Either:

- **In the app (no rebuild):** on the sign-in screen tap **Server settings**, paste the address printed above,
  tap **Test**, then **Save**. Test shows a green "Connected" only for a server running this version of the code.
- **In the build (every install uses it):** GitHub repo > Settings > Secrets and variables > Actions > **Variables** >
  New repository variable `API_BASE_URL` = the address, then run the "Build Android Debug APK" workflow again.

## 3. Turn on e-mail (needed for sign-in codes and password resets)

Add one of these sets of variables (`gcloud run services update estatemaster --region europe-west1 --update-env-vars ...`):

- Gmail: `GMAIL_USER`, `GMAIL_APP_PASSWORD`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Resend: `RESEND_API_KEY`

Other optional settings (M-Pesa, Equity/KCB/Co-op, Gemini AI, platform paybills) are listed in `.env.example`.
Put real secrets in Google Secret Manager rather than plain environment variables once you are live.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App: "Cannot reach the EstateMaster server (host)" | Wrong or private address. Open the address + `/api/health` in a browser; it must show JSON, not a Google sign-in page. |
| Server settings Test: "older EstateMaster version" | The address runs the old server. Deploy this repo (step 1). |
| Test: "not an EstateMaster server" | The address is some other site. Check for typos. |
| Cloud Run revision fails to start | `gcloud run services logs read estatemaster --region europe-west1 --limit 50`. The log lists any missing required setting ("Refusing to start ..."). |
| Logs show Firestore `PERMISSION_DENIED` | Give the service's account database access: `gcloud projects add-iam-policy-binding horizontal-disk-2ds98 --member="serviceAccount:$(gcloud projects describe horizontal-disk-2ds98 --format='value(projectNumber)')-compute@developer.gserviceaccount.com" --role=roles/datastore.user` (that is the default account Cloud Run uses) |
