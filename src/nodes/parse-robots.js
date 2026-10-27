// Milestone 2a: read robots.txt and decide what we are allowed to crawl.
// 200 = follow the file. 4xx = no robots.txt, everything allowed.
// 5xx or network error = we cannot know the rules, so we crawl nothing (safest, same as Google).
const cfg = $('Ready for Crawl').first().json;
const res = $input.first().json;
const UA_TOKEN = 'seogrowthagent';
const origin = cfg.normalizedUrl.match(/^https?:\/\/[^\/?#]+/i)[0];
const status = Number(res.statusCode || 0);
const body = typeof res.data === 'string' ? res.data : '';

let mode;
if (res.error || !status) mode = 'UNREACHABLE_BLOCK_ALL';
else if (status >= 200 && status < 300) mode = 'PARSED';
else if (status >= 400 && status < 500) mode = 'NOT_FOUND_ALLOW_ALL';
else mode = 'UNREACHABLE_BLOCK_ALL';

const groups = [];
const sitemaps = [];
let current = null;
let lastWasAgent = false;
if (mode === 'PARSED') {
  for (let line of body.split(/\r?\n/)) {
    line = line.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [], crawlDelay: null }; groups.push(current); }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') { sitemaps.push(val); continue; }
    if (!current) continue;
    if ((key === 'allow' || key === 'disallow') && val) current.rules.push({ type: key, path: val });
    else if (key === 'crawl-delay') { const n = parseFloat(val); if (!isNaN(n)) current.crawlDelay = n; }
  }
}
let chosen = groups.filter(g => g.agents.some(a => a !== '*' && UA_TOKEN.includes(a)));
const matchedGroup = chosen.length ? 'specific' : 'wildcard';
if (!chosen.length) chosen = groups.filter(g => g.agents.includes('*'));
const rules = chosen.reduce((acc, g) => acc.concat(g.rules), []);
const delays = chosen.map(g => g.crawlDelay).filter(d => d !== null);
const crawlDelaySec = delays.length ? delays[0] : null;
const delayMs = Math.min(10000, Math.max(1500, Math.round((crawlDelaySec || 0) * 1000)));

function toRegex(p) {
  let r = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (r.endsWith('\\$')) r = r.slice(0, -2) + '$';
  return new RegExp('^' + r);
}
function isAllowed(pathWithQuery) {
  if (mode === 'UNREACHABLE_BLOCK_ALL') return false;
  let best = null;
  for (const r of rules) {
    if (toRegex(r.path).test(pathWithQuery)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
    }
  }
  return !best || best.type === 'allow';
}
const startPath = cfg.normalizedUrl.slice(origin.length) || '/';
return [{ json: {
  runId: 'run_' + $execution.id,
  targetUrl: cfg.normalizedUrl,
  hostname: cfg.hostname,
  origin,
  maxPages: Number(cfg.maxPages) || 20,
  robotsUrl: origin + '/robots.txt',
  robotsStatusCode: status,
  robotsMode: mode,
  robotsGroupUsed: groups.length ? matchedGroup : 'none',
  robotsRules: rules,
  sitemaps,
  crawlDelaySec,
  delayMs,
  startAllowed: isAllowed(startPath),
  startPath
} }];
