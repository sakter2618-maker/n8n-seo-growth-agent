# Testing

## Automated (any computer with Node.js 18+)

```bash
node --test
```

Expected result: `# pass 12`, `# fail 0`.

| Test | What it proves |
|---|---|
| M1 accepts authorized URLs | Missing `https://`, upper-case hosts and `#fragments` are normalized |
| M1 rejects unsafe URLs | localhost, private IPs, `javascript:`, passwords in URLs, port 8080, look-alike domains (`books.toscrape.com.evil.com`) and non-allowlisted sites are all refused with a reason code |
| M2 robots.txt (×2) | 404 → crawl allowed. 5xx → crawl blocked. Longest-match Allow beats Disallow. Crawl-delay and Sitemap lines are read. Rules for other bots are ignored |
| M2.1 sitemap (×3) | Sitemap indexes are followed with product sitemaps first and `.gz` skipped. The page sample spans site sections. Off-site, non-HTML and robots-blocked URLs are dropped. With no sitemap, links are used |
| M3 extraction (×2) | HTML entities, upper-case tags, two canonicals, relative canonicals, H1s hidden in comments/scripts, nofollow, empty alt. JS-rendered pages are flagged. 404 and PDF pages are skipped |
| M4 PageSpeed (×2) | Lab and field data are parsed. 429, 400 and network errors give a status and no score |
| M5 findings | Expected findings appear with evidence, fix and reference. A JS-rendered page does not produce a false "missing title" |

## Manual checks in n8n

1. **Happy path.** Run the workflow as imported. After about 30 seconds, open
   **Generate Findings**. The last item is the summary, with `pagesAudited: 20`.
2. **Rejection.** In **Agent Config**, set `targetUrl` to `https://www.amazon.com`
   and run. **Rejected URL (Log)** shows `NOT_IN_ALLOWLIST`, and no request is sent
   to that site.
3. **Robots block.** Pin this output on **Fetch robots.txt**:
   `{"statusCode":200,"data":"User-agent: *\nDisallow: /"}`. Then run.
   **Blocked by robots.txt (Log)** fires, and no pages are fetched.
4. **Spot-check a value.** Open any page from the results in a browser and choose
   *View Page Source*. Compare `<title>`, `name="description"` and `<h1>` with the
   values in **Extract SEO Data**.
