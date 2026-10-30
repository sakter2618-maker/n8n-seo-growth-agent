// Weekly email report. Reads only rows the agent already saved (seo_audit_runs and
// seo_findings), so every number in the email comes from a real audit run.
// Input: run rows (newest first) from "Get Recent Runs"; findings rows for the newest run
// from "Get Latest Findings". Output: one item with subject + html for the Gmail node.

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/17ZnOXQiDrXk9eqaCwiP46zN8SMVrGKCEd2GruLMcuY8/edit';

function escHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function num(v) { return (v === null || v === undefined || v === '') ? null : Number(v); }
function show(v) { return v === null ? 'not measured' : String(v); }
function day(iso) { return iso ? String(iso).slice(0, 16).replace('T', ' ') + ' UTC' : ''; }

function buildReport(runs, findings, now) {
  runs = (runs || []).filter(r => r && r.runId)
    .sort((a, b) => String(b.auditedAt || b.createdAt).localeCompare(String(a.auditedAt || a.createdAt)));
  if (!runs.length) {
    return {
      subject: 'SEO weekly report: no audit runs found',
      html: '<p>The agent found no saved audit runs. Check the daily schedule and the seo_errors table.</p>',
      runsInReport: 0
    };
  }
  const latest = runs[0];
  const oldest = runs[runs.length - 1];
  const score = num(latest.seoHealthScore), firstScore = num(oldest.seoHealthScore);
  let trend = 'only one run so far';
  if (runs.length > 1 && score !== null && firstScore !== null) {
    const d = score - firstScore;
    trend = d === 0 ? 'no change' : (d > 0 ? '+' : '') + d + ' since ' + day(oldest.auditedAt).slice(0, 10);
  }
  const failed = runs.filter(r => num(r.pagesFailed) > 0).length;
  const site = String(latest.auditTarget || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const subject = `SEO weekly report: ${site}, score ${show(score)} (${trend})`;

  const latestFindings = (findings || []).filter(f => f && f.runId === latest.runId)
    .sort((a, b) => num(a.priorityRank) - num(b.priorityRank));

  const td = 'style="border:1px solid #ddd;padding:6px 8px;text-align:left"';
  const runRows = runs.map(r => `<tr><td ${td}>${escHtml(r.runId)}</td><td ${td}>${escHtml(day(r.auditedAt))}</td>` +
    `<td ${td}>${escHtml(show(num(r.seoHealthScore)))}</td><td ${td}>${escHtml(r.pagesOk)} / ${escHtml(r.pagesAudited)}</td>` +
    `<td ${td}>${escHtml(r.high)} / ${escHtml(r.medium)} / ${escHtml(r.low)}</td>` +
    `<td ${td}>${escHtml(show(num(r.mobileScore)))} / ${escHtml(show(num(r.desktopScore)))}</td></tr>`).join('');
  const findingRows = latestFindings.length
    ? latestFindings.map(f => `<tr><td ${td}>${escHtml(f.priority)}</td><td ${td}>${escHtml(f.title)}</td>` +
        `<td ${td}>${escHtml(f.affectedPages)} of ${escHtml(f.pagesAudited)}</td><td ${td}>${escHtml(f.recommendation)}</td></tr>`).join('')
    : `<tr><td ${td} colspan="4">No findings saved for this run.</td></tr>`;

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:760px">
<h2 style="margin:0 0 4px">SEO weekly report</h2>
<p style="margin:0 0 16px;color:#555">${escHtml(latest.auditTarget)} · ${runs.length} audit run(s) in this report · generated ${escHtml(day(now))}</p>
<table style="border-collapse:collapse;margin-bottom:16px">
<tr><td ${td}><b>SEO health score</b></td><td ${td}>${escHtml(show(score))} (${escHtml(trend)})</td></tr>
<tr><td ${td}><b>Findings (High / Medium / Low)</b></td><td ${td}>${escHtml(latest.high)} / ${escHtml(latest.medium)} / ${escHtml(latest.low)}</td></tr>
<tr><td ${td}><b>PageSpeed (mobile / desktop)</b></td><td ${td}>${escHtml(show(num(latest.mobileScore)))} / ${escHtml(show(num(latest.desktopScore)))} · ${escHtml(latest.psiStatus)}</td></tr>
<tr><td ${td}><b>Runs with failed pages</b></td><td ${td}>${failed} of ${runs.length}</td></tr>
</table>
<h3 style="margin:16px 0 6px">Open findings in the latest run (${escHtml(latest.runId)})</h3>
<table style="border-collapse:collapse"><tr><th ${td}>Priority</th><th ${td}>Finding</th><th ${td}>Pages</th><th ${td}>What to do</th></tr>${findingRows}</table>
<h3 style="margin:16px 0 6px">Recent runs</h3>
<table style="border-collapse:collapse"><tr><th ${td}>Run</th><th ${td}>When</th><th ${td}>Score</th><th ${td}>Pages OK</th><th ${td}>High / Med / Low</th><th ${td}>Mobile / Desktop</th></tr>${runRows}</table>
<p style="margin-top:16px">Full history: <a href="${SHEET_URL}">Google Sheet</a>. The health score is the agent's own formula, not a Google metric. Fixes go live only after a person reviews and merges a pull request.</p>
</div>`;
  return { subject, html, runsInReport: runs.length, latestRunId: latest.runId };
}

if (typeof module !== 'undefined' && typeof $input === 'undefined') {
  module.exports = { buildReport };
} else {
  const runs = $('Get Recent Runs').all().map(i => i.json);
  const findings = $input.all().map(i => i.json);
  return [{ json: buildReport(runs, findings, new Date().toISOString()) }];
}
