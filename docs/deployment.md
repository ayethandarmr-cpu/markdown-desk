# Deploying to md.cwslab.win

The site is built by GitHub Actions and served by GitHub Pages. Cloudflare only provides DNS for `cwslab.win`.

## 1. GitHub Pages

1. In the repository go to **Settings › Pages**.
2. Under **Build and deployment › Source** choose **GitHub Actions**.
3. Under **Custom domain** enter `md.cwslab.win` and click **Save**.
4. After DNS works (step 2), tick **Enforce HTTPS**. The certificate can take up to about an hour to issue.

Optional but recommended: verify the domain under your **GitHub profile › Settings › Pages › Add a domain**. GitHub shows a TXT record (name like `_github-pages-challenge-ayethandarmr-cpu`). Add it in Cloudflare, then click **Verify**. Keep that TXT record.

## 2. Cloudflare DNS

In the Cloudflare dashboard open **cwslab.win › DNS › Records › Add record**:

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `md` |
| Target | `ayethandarmr-cpu.github.io` |
| Proxy status | **DNS only** (grey cloud) |
| TTL | Auto |

Keep it **DNS only**. With the orange cloud on, GitHub can't issue the HTTPS certificate. Don't add `A` records for `md`. The target has no repository path in it.

Check it from any computer:

```sh
nslookup -type=CNAME md.cwslab.win 1.1.1.1
# should answer: md.cwslab.win canonical name = ayethandarmr-cpu.github.io
```

## 3. Repository variables

**Settings › Secrets and variables › Actions › Variables**: set `VITE_BASE` to `/` and the three Google values from [google-cloud.md](google-cloud.md).

## 4. Deploy

Every push to `main` runs **Deploy to GitHub Pages**. To redeploy without a code change, go to **Actions › Deploy to GitHub Pages › Run workflow**. Changing a variable needs a redeploy, because the values are built into the site.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Pages says "DNS check unsuccessful" | Wait 5–10 minutes. Make sure the record is a CNAME named `md`, pointing to `ayethandarmr-cpu.github.io`, set to DNS only. |
| Browser shows a certificate warning | The certificate isn't issued yet, or the Cloudflare proxy is on. Turn the proxy off, then untick and re-tick **Enforce HTTPS**. |
| 404 at md.cwslab.win | The custom domain isn't saved in Settings › Pages, or the deploy workflow hasn't run yet. |
| "Sign in" does nothing, or the popup is blocked | Allow popups for md.cwslab.win. |
| Google says `redirect_uri_mismatch` or `origin_mismatch` | Add `https://md.cwslab.win` to the OAuth client's **Authorized JavaScript origins**. |
| The Picker shows an error | The API key's website restriction must include `https://md.cwslab.win/*`, and the Picker API must be enabled. |
