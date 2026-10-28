# Data tables

The agent stores its results in n8n's built-in Data Tables. They need no credentials and
are kept on your own n8n server.

## seo_audit_runs — one row per run

| Column | Type | Meaning |
|---|---|---|
| runId | string | `run_<execution id>` |
| auditTarget | string | Start URL |
| auditedAt | date | When the findings were generated |
| pagesAudited / pagesOk / pagesFailed | number | Crawl outcome |
| pagesFromSitemap / sitemapUrlsFound | number | Discovery details |
| findingsTotal / high / medium / low | number | Findings by severity |
| seoHealthScore | number | 0–100, rule-based (see README) |
| mobileScore / desktopScore | number | PageSpeed performance; empty when not measured |
| psiStatus | string | e.g. `mobile:OK, desktop:RATE_LIMITED` |
| topFindings | string | Top 5 findings by priority |

## seo_findings — one row per finding per run

| Column | Type | Meaning |
|---|---|---|
| runId, auditTarget | string | Which run |
| priorityRank, priority, severity | number / string | Ordering and label (P1–P4) |
| findingId, category, title | string | What was found |
| affectedPages, pagesAudited | number | How widespread it is |
| evidence | string | The exact values that triggered the rule |
| affectedUrls | string | Space-separated list of URLs (used by the fix tool) |
| recommendation, reference | string | What to do, plus a Google documentation link |
| status | string | `open` when created |

## seo_errors — written by the error workflow

| Column | Type |
|---|---|
| occurredAt | date |
| workflowName, executionId, executionUrl, failedNode, errorMessage, mode | string |
