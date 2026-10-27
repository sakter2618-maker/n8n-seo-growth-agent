# SEO Growth Agent (n8n)

A reusable n8n workflow that audits the SEO of any website you are authorized to
check. It runs on a self-hosted n8n server (Hostinger VPS) and produces evidence-based,
prioritized findings.

Every number in a report comes from the site's own HTML, its robots.txt and sitemap,
or Google PageSpeed Insights. When a step cannot get real data (for example a page
blocks the crawler or an API is rate-limited), the report says so instead of guessing.

> **Status:** milestones 1–5 work and are tested. The agent runs daily on the VPS,
> saves every run and finding to n8n Data Tables, and logs failures through an error
> workflow. Google Sheets export, Search Console, AI summaries and the approval-gated
> fix workflow (M9) are next. See [Roadmap](#roadmap).

## What it does

```mermaid
flowchart LR
  A[Agent Config<br/>target URL, allowlist, max pages] --> B{Validate URL}
  B -- rejected --> X[Log reason]
  B -- ok --> C[robots.txt]
  C -- blocked --> Y[Log BLOCKED_BY_ROBOTS]
  C -- allowed --> D[Sitemap discovery<br/>index → child sitemaps]
  D --> E[Plan crawl<br/>sample across site sections]
  E --> F[Fetch pages<br/>one at a time, polite delay]
  F --> G[Extract SEO data<br/>title, meta, canonical, H1-H3,<br/>links, images, word count]
  G --> H[PageSpeed Insights<br/>mobile + desktop]
  H --> I[Findings engine<br/>25+ rules, evidence, priority]
  I --> J[(Data Tables: runs + findings)]
  I -. errors .-> K[(Error workflow → seo_errors)]
```

| Step | What happens | Why it matters |
|---|---|---|
| **Validate** | Checks format, blocks localhost, private IPs, odd ports and URLs with passwords, and enforces an allowlist of authorized domains | The agent can't be turned against your own server or used on sites you don't own |
| **robots.txt** | Parses Allow/Disallow with longest-match rules, `Crawl-delay` and `Sitemap:` lines | Respects site owners. If robots.txt returns a server error, nothing is crawled (the same rule Google uses) |
| **Discover** | Reads the sitemap, follows sitemap indexes (WordPress, WooCommerce, Shopify), and samples pages round-robin across sections | A 20-page audit covers products, categories and blog posts, not just the first 20 URLs |
| **Fetch** | One request at a time with at least 1.5 s between them, retries once, records HTTP errors | Never overloads a site, and one failed page doesn't stop the audit |
| **Extract** | 48 fields per page, parsed from the raw HTML the way a search engine first sees it | Comments and `<script>` content are ignored, so hidden "fake" headings are not counted |
| **PageSpeed** | Lab metrics (score, LCP, TBT, CLS) and real-user Core Web Vitals when Google has them | Performance is a ranking factor and a conversion factor |
| **Findings** | Each finding has a severity, the affected pages, the exact evidence, a fix and a link to Google's documentation | Every recommendation can be checked by a person |

## Example result

books.toscrape.com (a public sandbox built for scraping practice), 20 pages:

| Priority | Finding | Evidence |
|---|---|---|
| P1 · Fix first | Different URLs serve identical content | `/` and `/index.html` have the same text, and neither has a canonical tag |
| P2 · Plan next | No canonical tags | 20 of 20 pages |
| P2 · Plan next | Meta description empty | 20 of 20 pages (`content` attribute is only whitespace) |
| P2 · Plan next | No readable XML sitemap | `/sitemap.xml` returned HTTP 404 |
| P3 · Nice to have | No H2 structure, no Open Graph, no robots.txt | — |

SEO health score: **76/100**. This is our own transparent formula, not a Google metric:
100 minus (High 15 / Medium 7 / Low 2) × share of pages affected, per finding.

## Accuracy safeguards

- **No invented numbers.** If PageSpeed is rate-limited, the run records `RATE_LIMITED` and adds an Info finding. It never estimates a score.
- **JavaScript-rendered pages are not mis-reported.** A page with almost no text and several scripts is flagged as "content may load via JavaScript" and left out of content checks. Without this, the agent would report false "missing title" or "missing H1" findings.
- **Industry guidelines are labelled as guidelines.** For example: "60 characters is an industry guideline, not a Google rule."
- **Cross-checked.** Extraction results were compared with Python's standard HTML parser on 20 live pages, with zero mismatches.

## Run it

1. In n8n, go to **Workflows → Import from file** and choose `workflows/seo-growth-agent.json`.
2. Open **Agent Config** and set:
   - `targetUrl`
   - `allowedDomains` (comma-separated)
   - `maxPages`
3. Optional: for PageSpeed, create a free Google API key and add it in n8n as a **Query Auth** credential with name `key`. Attach it to the **PageSpeed API** node.
4. Click **Execute workflow**. Results are in **Generate Findings**: one item per finding, plus a summary item.

## Tests

Every Code node lives in `src/nodes/` as the exact code that runs in n8n. The tests run
that code with fake inputs, so no n8n server or internet connection is needed.

```bash
node --test
```

The 12 tests cover URL validation and security, robots.txt rules, sitemap index
handling, crawl sampling, extraction from messy HTML, PageSpeed parsing and error
states, and the findings engine. See [docs/TESTING.md](docs/TESTING.md).

## Project layout

```
workflows/seo-growth-agent.json   n8n export (no credentials inside)
src/nodes/*.js                    source of each Code node
tests/                            automated tests and fixtures
docs/TESTING.md                   manual and automated test steps
docs/INTERVIEW_GUIDE.md           how to explain the project
```

## Roadmap

| Milestone | Status |
|---|---|
| M1 URL validation and allowlist | ✅ Done |
| M2 robots.txt-aware, throttled crawling | ✅ Done |
| M2.1 Sitemap discovery with section sampling | ✅ Done |
| M3 SEO data extraction | ✅ Done |
| M4 PageSpeed Insights | ✅ Built; needs an API key for live scores |
| M5 Findings and prioritization | ✅ Done |
| M6 Save results (n8n Data Tables: runs, findings) | ✅ Done — Google Sheets mirror next |
| M7 Daily schedule + error workflow logging to `seo_errors` | ✅ Done — email alerts next |
| M8 Search Console, sales data, AI summary | Planned |
| M9 Fix proposals as pull requests, published only after human approval | Planned |

The live test site is [Sutokotha](https://github.com/sakter2618-maker/sutokotha), a demo
store built for this project with known SEO issues for the agent to find.
