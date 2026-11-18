# Deploying to md.cwslab.win

`md.cwslab.win` is served by the Cloudflare Worker **markdown-desk**. It serves the static Vite build as Workers static assets, configured in `wrangler.jsonc`. Cloudflare **Workers Builds** is connected to this GitHub repository, so every push to `main` builds and deploys automatically.

## One-time setup (Cloudflare dashboard)

1. **Workers & Pages › markdown-desk › Settings › Build › Connect** to the GitHub repository `ayethandarmr-cpu/markdown-desk`, branch `main`.
2. Build configuration:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Root directory | `/` |

3. Under **Build › Variables and secrets**, add the build variables (these are public values that get baked into the site):

   | Variable | Value |
   | --- | --- |
   | `VITE_GOOGLE_CLIENT_ID` | OAuth Web client ID |
   | `VITE_GOOGLE_API_KEY` | Browser API key (Picker) |
   | `VITE_GOOGLE_PROJECT_NUMBER` | Cloud project number |
   | `VITE_BASE` | `/` |

4. **Settings › Domains & Routes**: the custom domain `md.cwslab.win` is attached to this Worker. Cloudflare manages its DNS record automatically, so don't add a separate CNAME for `md`.

## Deploying

- Merge or push to `main`. Watch progress in **markdown-desk › Deployments** (or the Cloudflare check on the GitHub commit).
- To deploy by hand from a computer: `npm ci && npm run build && npx wrangler deploy` (this needs `wrangler login`).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The site still shows an old version | Check the latest build under **markdown-desk › Deployments**. If the build failed, open its log. |
| Google sign-in says `origin_mismatch` | Add `https://md.cwslab.win` to the OAuth client's Authorized JavaScript origins. |
| The Picker shows an error | The API key's website restriction must include `https://md.cwslab.win/*`, and the Picker API must be enabled. |
| "Drive not configured" in the status bar | The `VITE_GOOGLE_*` build variables are missing in Workers Builds. Add them, then retry the deployment. |
