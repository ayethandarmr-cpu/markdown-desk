# Troubleshooting

| Symptom | What to check |
| --- | --- |
| Connect Drive disabled | Rebuild with the OAuth web client ID, Picker API key and numeric project number. Check the browser is online. |
| Popup closes or fails to open | Allow popups for the exact origin. Open Connect Drive, then choose the account after the script loads. |
| `origin_mismatch` or authorization denied | Verify the exact scheme, hostname and port on the OAuth client. Check test users, audience and Workspace admin policy. |
| Picker API error or key rejected | Verify Picker and Drive API enablement in the same project, numeric project number, website referrers, and API key restrictions. Verify the browser allows Google's frame and scripts and inspect CSP errors in DevTools. |
| File absent or unsupported | Choose a UTF-8 file ending in .md or .markdown. App-created and explicitly selected files are accessible with `drive.file`. Access to a folder does not grant its children. |
| Reconnect required | Authorize the account originally linked to the file. Keep the draft active or download it while reconnecting. |
| Drive 403, 404, or read only | Check the active account, file sharing, permissions and Trash. Picker authorization is per file. Save a separately named copy if needed. |
| Drive 429 or server unavailable | Wait and retry manually. GET requests back off for temporary errors. Writes require an intentional retry and new creates reuse the saved ID. |
| Conflict after a save timeout | The write may have reached Drive. Compare both versions, preserve the local draft, then reload or save a copy. |
| Local recovery unavailable | Close the other editor tab, save a Markdown download, then reload. Check storage quota or private mode. For unreadable recovery data, preserve it before clearing site data using browser settings. |
| Editor loads empty on a project URL | Set `VITE_BASE=/REPOSITORY/`, deploy, and check the JS/CSS requests under that path. |
| Pages custom domain check fails | Verify the exact, DNS-only CNAME, target, TXT challenge and custom-domain entry. Check for conflicting records or forced flattening. |
| HTTPS option disabled | Wait for DNS verification and certificate provisioning. Check restrictive CAA records against GitHub's certificate guidance and review GitHub's Pages domain diagnostics. |
