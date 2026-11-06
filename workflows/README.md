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
   - Optional, Google Sheets: create a Google Cloud *service account*, download its JSON key and add it in
     n8n as a **Google Service Account API** credential (turn on "Set up for use in HTTP Request node",
     scopes `https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/webmasters.readonly`).
     Share your spreadsheet with the service account's email as Editor, enable the Google Sheets API in
     the service account's project, and pick the spreadsheet in the two **Sheets: Append** nodes. A
     service account never needs to sign in again, unlike an OAuth app left in *Testing* mode, whose
     sign-in Google expires after 7 days.
4. Click **Execute workflow** to test, then publish to turn on the daily schedule.
5. Optional, weekly email: import `weekly-email-report.json`.
   - **Email Report (SMTP):** create an SMTP credential (for Gmail: host `smtp.gmail.com`, port 465, SSL,
     your address and a Google *App Password*) and set your address in *From* and *To*.
   - **Search Console (28 days):** uses the same service account credential. Add the service account's
     email as a user on your Search Console property, enable the Search Console API in its project, and
     replace the site in the URL with your own property (URL-encoded). If this node fails, the email
     still goes out and says the data could not be read.
   - Publish it. It runs every Monday at 07:40 in the workflow's time zone.

No credentials or server addresses are stored in these files.
