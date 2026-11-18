# Markdown Desk

A Word-style Markdown editor that opens and saves `.md` files in your Google Drive. It runs entirely in the browser and is served at **https://md.cwslab.win** by a Cloudflare Worker that deploys automatically from this repository.

## Features

- **Ribbon like Microsoft Word**: Home, Insert, View, and a Table tab that appears when the cursor is in a table.
- **Styles gallery**: Normal, Heading 1–4, Quote, Code.
- **Formatting**: bold, italic, underline, strikethrough, inline code, highlight, clear formatting, and a mini toolbar when you select text.
- **Lists**: bullets, numbering, checklists, indent and outdent.
- **Insert**: tables (grid picker), pictures from a web address, links (Ctrl+K), code blocks with syntax highlighting and a language picker, horizontal lines, date and time.
- **Find and replace** (Ctrl+F / Ctrl+H). Matches work across bold or italic text, with a match-case option.
- **Navigation pane**: an outline of your headings that you can click to jump.
- **Views**: Print Layout (a page on a desk), Web Layout, and a Markdown source view you can edit directly. Zoom 50–200%, light, dark or system theme, and full screen.
- **Google Drive**: open with the Google Picker, see recent files, save (Ctrl+S), save a copy to My Drive or a chosen folder, rename, and **AutoSave** for files already in Drive. If the file changed elsewhere, you're asked whether to overwrite, save a copy, or load the Drive version.
- **Local safety net**: the current draft is kept in this browser, so a reload or crash doesn't lose work. You can also open `.md` files from your computer or drag them onto the window.
- **Export**: download `.md` or a styled `.html`, or print or save as PDF.
- **Myanmar text**: Noto Sans Myanmar is bundled, so Burmese renders the same on every device.

Markdown can only store what Markdown supports. Fonts, colours and text alignment aren't part of Markdown, so they aren't offered. Underline is saved as `<u>…</u>` and highlight as `==…==`.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local   # optional: fill in Google values to use Drive locally
npm run dev                  # http://127.0.0.1:5173
```

## Checks

```sh
npm run check      # TypeScript
npm run lint
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright), with Google mocked
```

## Configuration

These are build-time values. They are visible to visitors, which is expected for browser OAuth. Set them as **build variables** in Cloudflare (Workers & Pages › markdown-desk › Settings › Build › Variables and secrets), or in `.env.local` for local development.

| Variable | Value |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | OAuth **Web application** client ID |
| `VITE_GOOGLE_API_KEY` | Browser API key restricted to the site and the Google Picker API |
| `VITE_GOOGLE_PROJECT_NUMBER` | Numeric Google Cloud project number |
| `VITE_BASE` | `/` (custom domain) |

See [Google Cloud setup](docs/google-cloud.md) and [Deploying to md.cwslab.win](docs/deployment.md) (Cloudflare Workers).

## Privacy

The app changes only files you open or create with it (Google's `drive.file` permission). It also asks to read your Drive (`drive.readonly`) so it can show images that a Markdown file links with a relative path, like `images/diagram.png`. It never changes other files. The access token lives only in the open tab's memory. There is no server, analytics or tracking.
