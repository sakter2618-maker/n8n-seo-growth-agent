// Milestone 4: read Google PageSpeed Insights results (mobile + desktop).
// Lab data = one Lighthouse test run by Google now (varies a little run to run).
// Field data = real Chrome users over the last 28 days (only exists for sites with enough traffic).
// If the API fails or is rate-limited, we record that status instead of inventing numbers.

function fmtMs(v) { if (v === null || v === undefined) return ''; return v >= 1000 ? (Math.round(v / 100) / 10) + ' s' : Math.round(v) + ' ms'; }
function parsePsi(req, res) {
  const out = {
    runId: req.runId, url: req.url, strategy: req.strategy,
    reportUrl: 'https://pagespeed.web.dev/analysis?url=' + encodeURIComponent(req.url) + '&form_factor=' + req.strategy,
    psiStatus: '', psiError: '', performanceScore: null,
    fcpLab: '', lcpLab: '', tbtLab: '', clsLab: '', speedIndexLab: '',
    lcpLabMs: null, tbtLabMs: null, clsLabValue: null,
    fieldDataSource: 'none', lcpField: '', inpField: '', clsField: '', fieldCwvAssessment: 'NO_FIELD_DATA',
    topOpportunities: '', lighthouseVersion: '', testedAt: ''
  };
  const status = Number(res.statusCode || 0);
  const body = res.body !== undefined ? res.body : res.data;
  let j = body;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { j = null; } }
  if (res.error && !status) { out.psiStatus = 'NETWORK_ERROR'; out.psiError = String(res.error.message || res.error).slice(0, 300); return out; }
  if (status === 429) { out.psiStatus = 'RATE_LIMITED'; out.psiError = String((j && j.error && j.error.message) || 'Google rate limit reached. Without an API key the daily quota is 0.').slice(0, 300); return out; }
  if (status < 200 || status >= 300 || !j || !j.lighthouseResult) {
    out.psiStatus = 'API_ERROR_' + (status || 'UNKNOWN');
    out.psiError = String((j && j.error && j.error.message) || 'No Lighthouse result returned').slice(0, 300);
    return out;
  }
  const lh = j.lighthouseResult;
  const a = lh.audits || {};
  const perf = lh.categories && lh.categories.performance ? lh.categories.performance.score : null;
  out.psiStatus = perf === null || perf === undefined ? 'NO_SCORE' : 'OK';
  out.performanceScore = perf === null || perf === undefined ? null : Math.round(perf * 100);
  const nv = k => (a[k] && typeof a[k].numericValue === 'number') ? a[k].numericValue : null;
  out.lcpLabMs = nv('largest-contentful-paint'); out.tbtLabMs = nv('total-blocking-time'); out.clsLabValue = nv('cumulative-layout-shift');
  out.fcpLab = fmtMs(nv('first-contentful-paint')); out.lcpLab = fmtMs(out.lcpLabMs); out.tbtLab = fmtMs(out.tbtLabMs);
  out.speedIndexLab = fmtMs(nv('speed-index'));
  out.clsLab = out.clsLabValue === null ? '' : String(Math.round(out.clsLabValue * 1000) / 1000);
  out.lighthouseVersion = lh.lighthouseVersion || '';
  out.testedAt = lh.fetchTime || j.analysisUTCTimestamp || '';

  // Field data: prefer this exact URL, fall back to whole-site (origin) data, and say which one we used.
  let le = j.loadingExperience, src = 'url';
  if (!le || !le.metrics || le.origin_fallback) { le = j.originLoadingExperience; src = 'origin'; }
  if (le && le.metrics && Object.keys(le.metrics).length) {
    const m = le.metrics;
    const p = k => (m[k] && typeof m[k].percentile === 'number') ? m[k].percentile : null;
    const lcp = p('LARGEST_CONTENTFUL_PAINT_MS'), inp = p('INTERACTION_TO_NEXT_PAINT'), clsRaw = p('CUMULATIVE_LAYOUT_SHIFT_SCORE');
    const cls = clsRaw === null ? null : clsRaw / 100;
    out.fieldDataSource = src;
    out.lcpField = fmtMs(lcp); out.inpField = fmtMs(inp); out.clsField = cls === null ? '' : String(cls);
    // Google's "good" thresholds at the 75th percentile: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1.
    const checks = [lcp === null ? null : lcp <= 2500, inp === null ? null : inp <= 200, cls === null ? null : cls <= 0.1];
    if (checks.some(c => c === false)) out.fieldCwvAssessment = 'FAILED';
    else if (checks.every(c => c === true)) out.fieldCwvAssessment = 'PASSED';
    else out.fieldCwvAssessment = 'INCOMPLETE';
  }

  // Top 3 improvement ideas from Lighthouse, ranked by estimated time saved.
  const opps = Object.values(a).filter(x => x && typeof x.score === 'number' && x.score < 0.9).map(x => {
    let save = (x.details && typeof x.details.overallSavingsMs === 'number') ? x.details.overallSavingsMs : 0;
    if (!save && x.metricSavings) save = Math.max(0, ...Object.values(x.metricSavings).filter(v => typeof v === 'number' && v > 1));
    return { title: x.title, save };
  }).filter(o => o.save > 0).sort((x, y) => y.save - x.save).slice(0, 3);
  out.topOpportunities = opps.map(o => o.title + ' (~' + fmtMs(o.save) + ')').join('; ');
  return out;
}

if (typeof module !== 'undefined' && typeof $input === 'undefined') {
  module.exports = { parsePsi };
} else {
  const reqs = $('Build PageSpeed Requests').all();
  return $input.all().map((it, i) => ({ json: parsePsi(reqs[i] ? reqs[i].json : {}, it.json) }));
}
