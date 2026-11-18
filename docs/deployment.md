# GitHub Pages with Cloudflare DNS

Use `OWNER`, `REPOSITORY` and `markdown.example.com` as placeholders. GitHub Pages eligibility depends on repository visibility and your GitHub plan. Use an eligible repository and keep private document content out of it.

1. In the GitHub owner or organization settings, open **Pages → Add a domain** and verify the domain for the site. Add GitHub's exact TXT challenge in Cloudflare DNS, check it resolves, and click **Verify**. Keep the verification TXT record.
2. Put the project files at the repository root. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**. In **Custom domain**, save `markdown.example.com` before pointing public DNS at Pages.
3. Add the following DNS record in Cloudflare, after GitHub accepts the custom domain.

   | Field | Value |
   | --- | --- |
   | Type | CNAME |
   | Name | `markdown` |
   | Target | `OWNER.github.io` |
   | Proxy status | DNS only |
   | TTL | Auto |

   Use the GitHub account or organization hostname without the repository path. DNS only exposes the actual CNAME for validation and lets GitHub Pages terminate HTTPS. Leave unrelated records in place. A wildcard is unnecessary.
4. In **Settings → Secrets and variables → Actions → Variables**, set `VITE_BASE=/` and optionally the Google browser values from [Google Cloud setup](google-cloud.md). Set Google OAuth origins and Picker referrer restrictions for the same hostname.
5. Push the project files to the default branch. Once checks pass, open **Actions → Deploy to GitHub Pages → Run workflow** and select the default branch. Review the workflow result and output URL.
6. Wait for Pages DNS and certificate checks to pass. Enable **Enforce HTTPS** in GitHub Pages. Open the HTTPS URL and run the acceptance checklist. Verify DNS with `dig markdown.example.com CNAME` or PowerShell `Resolve-DnsName markdown.example.com -Type CNAME`.

For `https://OWNER.github.io/REPOSITORY/`, leave the custom domain unset, use `VITE_BASE=/REPOSITORY/`, and authorize `https://OWNER.github.io` in Google. User and organization sites at the root use `/`. GitHub Actions reads the custom domain from the Pages setting. The Cloudflare CNAME is a DNS record. GitHub ignores a repository CNAME file when deploying using a custom Actions workflow.

Before moving or deleting a site, remove the editor CNAME that targets its old Pages host and verify DNS. Keep the ownership verification TXT in place while the domain is in use.

Official references

- [Verify a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- [Manage a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Cloudflare DNS proxy limitations](https://developers.cloudflare.com/dns/proxy-status/limitations/)
- [Vite public base path](https://vite.dev/guide/build.html#public-base-path)
