# Google Cloud setup

1. Choose a Cloud project you control. In APIs & Services, enable **Google Drive API** and **Google Picker API** in that project. Record the numeric **Project number** from project settings.
2. In Google Auth Platform configure Branding, Audience and Data Access. Choose Internal if your Workspace permits it and every intended user belongs to that organization. For an External app in Testing, add the Google accounts that will use the editor to Test users. Add your owned domain under Authorized domains if the branding workflow requests it and follow its verification instructions. Add only `https://www.googleapis.com/auth/drive.file` for application access.
3. Create an OAuth **Web application** client. Add the origins you actually use, for example `http://127.0.0.1:5173`, `http://localhost:5173`, `https://markdown.example.com`, or `https://OWNER.github.io`. An origin has a scheme, host and optional port. The GitHub repository path does not belong in this field. The token popup flow does not need an application redirect URI. Create or reuse a client only if the project, origins and consent setup match.
4. Create a browser API key in that project. Set Application restrictions to **Websites**, and add the actual site referrers, such as `https://markdown.example.com/*` and `http://127.0.0.1:5173/*`. Browser cross-origin referrer policies may send only the origin. Add the origin-wide matching rule for `https://OWNER.github.io/*` if testing the repository URL. Restrict API usage for this key to **Google Picker API**. Drive REST calls use the user token.
5. Fill the three Google variables in `.env.local` or GitHub Actions repository variables. Leave client secrets outside this project. Rebuild after changing deployment values.
6. In the editor select **Connect Drive**, then **Choose Google account** when the authorization script is ready. Choose the intended account and grant access. In **Open Drive**, select an existing .md or .markdown file. Picker may show other file types. Files get extension and native-format validation after selection.

A public URL serves the same app code to visitors. Each authorized user can access the files they select or create under their own Google account. A Workspace administrator can block this OAuth app. Google controls consent, branding, test-user availability and publication status.

Official references

- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Picker integration](https://developers.google.com/workspace/drive/picker/guides/web-picker)
- [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [About.get and supported scopes](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)
- [Create files with pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/create-file)
- [API key restrictions](https://cloud.google.com/docs/authentication/api-keys)
