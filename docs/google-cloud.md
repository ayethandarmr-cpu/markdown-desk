# Google Cloud setup

All of these steps happen in the same Google Cloud project: https://console.cloud.google.com

1. **Enable APIs.** Go to **APIs & Services › Library** and enable **Google Drive API** and **Google Picker API**.
2. **Project number.** **IAM & Admin › Settings** (or the project dashboard) shows the numeric **Project number**. This becomes `VITE_GOOGLE_PROJECT_NUMBER`.
3. **OAuth consent.** In **Google Auth Platform**, fill in **Branding** (app name, support email). Under **Audience**, choose External. While it's in *Testing*, add every Google account that will use the editor under **Test users**. Under **Data access**, add the scope `https://www.googleapis.com/auth/drive.file` only.
4. **OAuth client.** **Clients › Create client › Web application**. Under **Authorized JavaScript origins** add:
   - `https://md.cwslab.win`
   - `http://localhost:5173` and `http://127.0.0.1:5173` (for local development)

   You don't need any redirect URIs. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). This becomes `VITE_GOOGLE_CLIENT_ID`.
5. **API key.** **APIs & Services › Credentials › Create credentials › API key**, then edit it:
   - *Application restrictions*: **Websites**. Add `https://md.cwslab.win/*`, `http://localhost:5173/*` and `http://127.0.0.1:5173/*`.
   - *API restrictions*: **Restrict key** and select **Google Picker API**.

   This key becomes `VITE_GOOGLE_API_KEY`.
6. Put the three values in GitHub repository variables (see [deployment.md](deployment.md)) and redeploy.

## Notes

- `drive.file` means the app only sees files you pick in the Picker or create with the app. It can't browse or change the rest of your Drive.
- In *Testing* mode, Google asks users to sign in again about once a week, and only test users can sign in. To remove those limits, publish the app under **Audience › Publish app**. The `drive.file` scope doesn't require Google verification.
