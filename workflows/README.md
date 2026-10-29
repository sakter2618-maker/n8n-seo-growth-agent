# Importing the workflows

1. Create three n8n Data Tables with these names. The columns are listed in
   `docs/DATA_TABLES.md`.
   - `seo_audit_runs`
   - `seo_findings`
   - `seo_errors`
2. Import `error-handler.json` and publish it.
3. Import `seo-growth-agent.json`. Then:
   - In **Workflow settings → Error workflow**, choose "SEO Growth Agent - Error Handler".
   - In **Agent Config**, set `targetUrl`, `allowedDomains` and `maxPages`.
   - Optional: attach a Query Auth credential (name `key`) to **PageSpeed API**.
   - Optional: create a Google Sheets OAuth2 credential and pick your spreadsheet in the two
     **Sheets: Append** nodes. A spreadsheet with 'Runs' and 'Findings' tabs works; headers are
     written on the first run. If your Google OAuth app stays in *Testing* mode, Google expires the
     sign-in after 7 days and the failure is logged in `seo_errors`.
4. Click **Execute workflow** to test, then publish to turn on the daily schedule.

No credentials or server addresses are stored in these files.
