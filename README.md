# Markdown Desk

A browser-based Markdown editor for English and Myanmar technical notes. React and TypeScript manage the workspace, CodeMirror edits the source, Markdown-it and DOMPurify render untrusted Markdown, IndexedDB recovers drafts, and Google Drive stores files selected or created by the user. GitHub Pages serves the static application. Cloudflare manages custom-domain DNS.

## Start locally

Use Node.js 24 LTS, npm, and a current browser. Use HTTPS or localhost for IndexedDB recovery locking and other secure-context browser APIs.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Drive configuration is optional for local work. Type in the left panel, use the view controls to switch modes, and drag the panel-width range control to change the split. Use Find for find and replace. Open local accepts UTF-8 .md and .markdown, including UTF-8 BOM. Ctrl/Cmd+S opens the save destination dialog for a new draft and saves a linked document when its Drive connection is usable.

Word counts split Unicode whitespace-separated runs. Myanmar text without spaces can contain several linguistic words in one run. Character counts are Unicode code points, including whitespace, combining marks, and each character in a CRLF pair. The editor preserves untouched line endings. Inserted line breaks use the document's first separator or LF for a new draft.

## Build and check

```sh
npm run check
npm run lint
npm test
npm run test:build
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:drive
npm run preview
```

The optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` environment variable overrides the browser path. Browser tests assume a root-path production build and use port 4173. `test:build` checks generated root and repository-subpath asset references. Unit/integration checks use mocked Drive responses. See [manual acceptance](docs/acceptance.md) for live verification.

## Browser configuration

Copy `.env.example` to `.env.local` and restart the dev server. For GitHub Actions define the corresponding repository variables. Every VITE value is visible to site visitors and changes require a rebuild.

| Variable | Value |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Web application OAuth client ID |
| `VITE_GOOGLE_API_KEY` | HTTP-referrer and API-restricted browser key |
| `VITE_GOOGLE_PROJECT_NUMBER` | Numeric Cloud project number from the same project |
| `VITE_BASE` | `/` for a custom domain or user site, `/REPOSITORY/` for a project site |

See [Google Cloud setup](docs/google-cloud.md), [GitHub Pages and Cloudflare deployment](docs/deployment.md), and [troubleshooting](docs/troubleshooting.md).

## Recovery and privacy

The browser commits a workspace snapshot after a 250 ms idle period. It includes local text, versions, pending Drive create snapshots, and preferences. Wait for **Saved locally** before closing. The workspace is specific to the browser profile and origin. Only one tab for that origin can hold the recovery lock. Other tabs can edit and download while displaying the recovery warning. Clear local drafts removes the saved workspace contents and resets preferences after confirmation. Export important work before clearing storage or changing the site origin. Browsers can evict storage, and private browsing can restrict it. Local caching offers recovery and a downloaded Markdown file gives you a portable backup.

Raw HTML is displayed as text. Code blocks are rendered as text with syntax highlighting. Built-in preview strips unsafe URI schemes and loads HTTPS images only after affirmative opt-in. Image hosts receive the request and can see your IP and timing. Preview links open external sites with opener and referrer protection. A meta Content Security Policy limits resources on GitHub Pages. Production Pages response headers are managed by the platform.

Google OAuth grants Drive authorization without signing the user into a separate app account. The access token remains in memory for the open page and reconnect is user-driven. The app reads the Drive user permission ID to bind a draft to a specific account and uses only `drive.file`. This scope covers user-selected and app-created files. Opening a public app URL does not change Drive sharing. Keep private documents out of Git and deployment assets. The app sends document content to Drive only for a Drive save and does not include analytics or AI integration.

## Save semantics and limits

Each document has a revision counter and an in-flight operation gate. A save acknowledgment advances only the saved revision captured at dispatch. Debounced autosave is opt-in and applies to existing linked files while the tab is open, recovered locally, online, and authorized. A failed operation pauses autosave for the affected draft until a manual retry. Reconnect with the original account or explicitly create a separate Drive copy.

New Drive files are created in My Drive. The app persists a Google-generated file ID and the creation snapshot before sending a multipart create. If a retry returns HTTP 409, the app reads the same ID and matches the creation property, name and source before adopting it. If newer local edits exist, save again to advance the Drive copy. Updates and renames check the Drive version before writing. Detected conflicts offer side-by-side comparison, a separate Drive copy, or a local download and recovered draft before reloading Drive. Drive preflight and write are separate requests, so a different client can still write in that interval. Use version history and a downloaded copy for critical changes.

The app keeps editing after a loaded page goes offline. An initial offline load requires a network connection. The workspace requires browser support for Web Locks to persist drafts safely across tabs. Changing a line-break span through undo can use the document's insertion separator. Undo/redo history is session-local for the active editor and resets when switching drafts. Large documents are held in memory and have no streaming editor or upload path. Local files must be UTF-8. Real Google consent, Picker, API permissions, cross-device behavior, Myanmar IME, and DNS/HTTPS need the manual acceptance pass.
