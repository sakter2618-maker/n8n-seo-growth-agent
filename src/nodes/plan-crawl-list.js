// Milestone 2.1b: choose which pages to audit (at most maxPages).
// 1. The start page is always first.
// 2. Pages from the sitemap, spread across site sections (products, categories, blog...) so a
//    20-page sample covers the whole site instead of only the first 20 sitemap entries.
// 3. If there is room left (or no sitemap), links found on the start page.
// Every candidate must be on the same site, look like an HTML page, and be allowed by robots.txt.
function planCrawl(ctx, startRes, sitemapFiles, targets) {
  const host = ctx.hostname.replace(/^www\./, '');
  const maxPages = ctx.maxPages;
  const rules = ctx.robotsRules || [];
  const toRegex = p => {
    let r = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    if (r.endsWith('\\$')) r = r.slice(0, -2) + '$';
    return new RegExp('^' + r);
  };
  const isAllowed = pathQ => {
    if (ctx.robotsMode === 'UNREACHABLE_BLOCK_ALL') return false;
    let best = null;
    for (const r of rules) if (toRegex(r.path).test(pathQ)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
    }
    return !best || best.type === 'allow';
  };
  const resolve = (href, base) => {
    href = String(href || '').trim().replace(/&amp;/g, '&');
    if (!href || href.startsWith('#')) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return null;
    href = href.split('#')[0];
    if (!href) return null;
    let abs;
    if (/^https?:\/\//i.test(href)) abs = href;
    else if (href.startsWith('//')) abs = base.split('//')[0] + href;
    else {
      const bm = base.match(/^(https?:\/\/[^\/?#]+)([^?#]*)/i);
      const bPath = bm[2] || '/';
      abs = bm[1] + (href.startsWith('/') ? href : href.startsWith('?') ? bPath + href : bPath.replace(/[^\/]*$/, '') + href);
    }
    const m = abs.match(/^(https?:\/\/[^\/?#]+)([^?#]*)(\?[^#]*)?/i);
    if (!m) return null;
    const segs = [];
    for (const s of (m[2] || '/').split('/')) { if (s === '..') { if (segs.length > 1) segs.pop(); } else if (s !== '.') segs.push(s); }
    let p = segs.join('/'); if (!p.startsWith('/')) p = '/' + p;
    return m[1].toLowerCase() + p + (m[3] || '');
  };
  const stats = { startPageStatus: Number(startRes.statusCode || 0), sitemapSource: '', sitemapFilesRead: 0, sitemapUrlsFound: 0,
    fromSitemap: 0, fromLinks: 0, linksFound: 0, offSite: 0, nonHtml: 0, duplicates: 0, blockedByRobots: 0, overPageLimit: 0 };
  const t0 = targets[0] || {};
  stats.sitemapSource = t0.rootSitemapType === 'index' ? 'index' : (t0.rootSitemapDeclared ? 'robots.txt' : '/sitemap.xml');
  stats.rootSitemapUrl = t0.rootSitemapUrl || '';
  stats.rootSitemapStatus = t0.rootSitemapStatus || 0;

  const startUrl = resolve(ctx.targetUrl, ctx.targetUrl);
  const seen = new Set([startUrl]);
  const planned = [{ url: startUrl, source: 'start' }];
  function accept(u) {
    if (!u) return null;
    const h = u.replace(/^https?:\/\//i, '').split(/[\/?#:]/)[0].replace(/^www\./, '');
    if (h !== host) { stats.offSite++; return null; }
    if (/\.(jpe?g|png|gif|svg|webp|avif|ico|pdf|zip|css|js|xml|txt|json|mp4|mp3|woff2?)(\?|$)/i.test(u)) { stats.nonHtml++; return null; }
    if (seen.has(u)) { stats.duplicates++; return null; }
    seen.add(u);
    const pathQ = u.replace(/^https?:\/\/[^\/]+/i, '') || '/';
    if (!isAllowed(pathQ)) { stats.blockedByRobots++; return null; }
    return u;
  }

  // Sitemap URLs, grouped by first path segment, then taken round-robin.
  const groups = new Map();
  for (const f of sitemapFiles) {
    const st = Number(f.statusCode || 0);
    const body = typeof f.data === 'string' ? f.data : (typeof f.body === 'string' ? f.body : '');
    if (st < 200 || st >= 300 || !/<urlset[\s>]/i.test(body)) continue;
    stats.sitemapFilesRead++;
    for (const m of body.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>/gi)) {
      stats.sitemapUrlsFound++;
      const u = accept(resolve(m[1], ctx.targetUrl));
      if (!u) continue;
      const seg = (u.replace(/^https?:\/\/[^\/]+/i, '').split('/')[1] || '(root)');
      if (!groups.has(seg)) groups.set(seg, []);
      groups.get(seg).push(u);
    }
  }
  const queues = [...groups.values()];
  let added = true;
  while (planned.length < maxPages && added) {
    added = false;
    for (const q of queues) { if (planned.length >= maxPages) break; const u = q.shift(); if (u) { planned.push({ url: u, source: 'sitemap' }); stats.fromSitemap++; added = true; } }
  }
  stats.overPageLimit += queues.reduce((s, q) => s + q.length, 0);

  // Links on the start page fill any remaining room.
  const html = typeof startRes.data === 'string' ? startRes.data : '';
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    stats.linksFound++;
    const u = accept(resolve(m[1] || m[2] || m[3] || '', startUrl));
    if (!u) continue;
    if (planned.length < maxPages) { planned.push({ url: u, source: 'link' }); stats.fromLinks++; } else stats.overPageLimit++;
  }
  return planned.map((p, i) => ({ runId: ctx.runId, url: p.url, discoveredVia: p.source, crawlOrder: i + 1, plannedPages: planned.length, delayMs: ctx.delayMs, discovery: stats }));
}

if (typeof module !== 'undefined' && typeof $input === 'undefined') {
  module.exports = { planCrawl };
} else {
  const ctx = $('Parse robots.txt').first().json;
  const files = $('Fetch Sitemap Files').all().map(i => i.json);
  const targets = $('Sitemap Targets').all().map(i => i.json);
  return planCrawl(ctx, $input.first().json, files, targets).map(j => ({ json: j }));
}
