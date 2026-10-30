// Automated tests for every Code node in the SEO Growth Agent.
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNode } = require('./harness');

const ALLOW = 'books.toscrape.com,quotes.toscrape.com,example.com';
const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

// ---------- M1: URL validation ----------
test('M1 accepts authorized URLs and normalizes them', () => {
  const out = runNode('validate-url.js', { input: [
    { targetUrl: 'https://books.toscrape.com/', allowedDomains: ALLOW, maxPages: 20 },
    { targetUrl: 'books.toscrape.com/catalogue/page-2.html', allowedDomains: ALLOW, maxPages: 20 },
    { targetUrl: 'https://WWW.Example.com/#top', allowedDomains: ALLOW, maxPages: 20 }
  ] });
  assert.deepEqual(out.map(o => o.isValid), [true, true, true]);
  assert.equal(out[1].normalizedUrl, 'https://books.toscrape.com/catalogue/page-2.html');
  assert.equal(out[2].normalizedUrl, 'https://www.example.com/');
});

test('M1 rejects unsafe or unauthorized URLs with a clear code', () => {
  const cases = {
    'htp://books.toscrape.com': 'UNSUPPORTED_PROTOCOL',
    'http://localhost:5678': 'PRIVATE_HOST_BLOCKED',
    'http://127.0.0.1': 'IP_ADDRESS_NOT_ALLOWED',
    'http://192.168.1.10/admin': 'IP_ADDRESS_NOT_ALLOWED',
    'https://www.amazon.com': 'NOT_IN_ALLOWLIST',
    '': 'EMPTY_URL',
    'https://user:pass@books.toscrape.com': 'CREDENTIALS_IN_URL',
    'https://books.toscrape.com:8080/': 'NON_STANDARD_PORT',
    'javascript:alert(1)': 'INVALID_FORMAT',
    'https://books.toscrape.com.evil.com': 'NOT_IN_ALLOWLIST'
  };
  const out = runNode('validate-url.js', { input: Object.keys(cases).map(u => ({ targetUrl: u, allowedDomains: ALLOW, maxPages: 20 })) });
  Object.values(cases).forEach((code, i) => {
    assert.equal(out[i].isValid, false, Object.keys(cases)[i]);
    assert.ok(out[i].reason.startsWith(code), `${Object.keys(cases)[i]} → ${out[i].reason}`);
  });
});

// ---------- M2: robots.txt ----------
const ready = { normalizedUrl: 'https://books.toscrape.com/', hostname: 'books.toscrape.com', maxPages: 20 };
const robots = (statusCode, data) => runNode('parse-robots.js', { input: [{ statusCode, data }], nodes: { 'Ready for Crawl': [ready] } })[0];

test('M2 robots.txt: missing file allows everything, server error blocks everything', () => {
  assert.equal(robots(404, 'Not found').robotsMode, 'NOT_FOUND_ALLOW_ALL');
  assert.equal(robots(404, '').startAllowed, true);
  assert.equal(robots(503, '').robotsMode, 'UNREACHABLE_BLOCK_ALL');
  assert.equal(robots(503, '').startAllowed, false);
});

test('M2 robots.txt: Disallow, longest-match Allow, crawl-delay and sitemap lines', () => {
  const r = robots(200, 'User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\nAllow: /private/ok.html$\nCrawl-delay: 3\nSitemap: https://books.toscrape.com/sitemap.xml\n');
  assert.equal(r.robotsGroupUsed, 'wildcard');
  assert.equal(r.startAllowed, true);
  assert.equal(r.delayMs, 3000);
  assert.deepEqual(r.sitemaps, ['https://books.toscrape.com/sitemap.xml']);
  assert.equal(robots(200, 'User-agent: *\nDisallow: /\n').startAllowed, false);
});

// ---------- M2.1: sitemap discovery ----------
const ctx = { runId: 't', targetUrl: 'https://shop.example/', hostname: 'shop.example', origin: 'https://shop.example', maxPages: 10,
  robotsMode: 'PARSED', robotsRules: [{ type: 'disallow', path: '/cart/' }], sitemaps: ['https://shop.example/sitemap_index.xml'], delayMs: 1500 };
const urlset = urls => ({ statusCode: 200, data: '<urlset>' + urls.map(u => `<url><loc>${u}</loc></url>`).join('') + '</urlset>' });

test('M2.1 follows a sitemap index and prefers product sitemaps', () => {
  const idx = '<sitemapindex><sitemap><loc>https://shop.example/post-sitemap.xml</loc></sitemap><sitemap><loc>https://shop.example/product-sitemap.xml</loc></sitemap><sitemap><loc>https://shop.example/old.xml.gz</loc></sitemap></sitemapindex>';
  const out = runNode('sitemap-targets.js', { input: [{ statusCode: 200, data: idx }], nodes: { 'Parse robots.txt': [ctx] } });
  assert.deepEqual(out.map(o => o.sitemapUrl), ['https://shop.example/product-sitemap.xml', 'https://shop.example/post-sitemap.xml']);
});

test('M2.1 samples pages across sections and respects robots, site and page limit', () => {
  const products = Array.from({ length: 30 }, (_, i) => `https://www.shop.example/product/p${i}/`);
  const files = [urlset(products), urlset(['https://shop.example/blog/a/', 'https://shop.example/cart/', 'https://other.com/x', 'https://shop.example/logo.png'])];
  const targets = [{ rootSitemapType: 'index', rootSitemapDeclared: true, rootSitemapUrl: ctx.sitemaps[0], rootSitemapStatus: 200 }];
  const out = runNode('plan-crawl-list.js', { input: [{ statusCode: 200, data: '<a href="/contact/">Contact</a>' }],
    nodes: { 'Parse robots.txt': [ctx], 'Fetch Sitemap Files': files, 'Sitemap Targets': targets } });
  assert.equal(out.length, 10);
  assert.equal(out[0].discoveredVia, 'start');
  assert.ok(out.some(o => o.url === 'https://shop.example/blog/a/'), 'blog section is sampled, not only products');
  assert.ok(!out.some(o => /cart|other\.com|logo/.test(o.url)));
  const d = out[0].discovery;
  assert.equal(d.blockedByRobots, 1); assert.equal(d.offSite, 1); assert.equal(d.nonHtml, 1);
});

test('M2.1 falls back to start-page links when there is no sitemap', () => {
  const out = runNode('plan-crawl-list.js', { input: [{ statusCode: 200, data: '<a href="/a/">A</a><a href="/b/">B</a><a href="/a/">A again</a>' }],
    nodes: { 'Parse robots.txt': [{ ...ctx, sitemaps: [] }], 'Fetch Sitemap Files': [{ statusCode: 404, data: 'Not found' }],
      'Sitemap Targets': [{ rootSitemapType: 'none', rootSitemapUrl: 'https://shop.example/sitemap.xml', rootSitemapStatus: 404 }] } });
  assert.deepEqual(out.map(o => o.discoveredVia), ['start', 'link', 'link']);
  assert.equal(out[0].discovery.sitemapUrlsFound, 0);
});

test('M2.1 handles sites in a subfolder: folder sitemap fallback and audit scope', () => {
  const sub = { ...ctx, targetUrl: 'https://user.github.io/shop/', hostname: 'user.github.io', origin: 'https://user.github.io', sitemaps: [] };
  const targets = runNode('sitemap-targets.js', { input: [{ statusCode: 404, data: 'Not found' }], nodes: { 'Parse robots.txt': [sub] } });
  assert.deepEqual(targets.map(t => t.sitemapUrl), ['https://user.github.io/sitemap.xml', 'https://user.github.io/shop/sitemap.xml']);
  const files = [{ statusCode: 404, data: 'Not found' }, urlset(['https://user.github.io/shop/products/a/', 'https://user.github.io/shop/about/'])];
  const out = runNode('plan-crawl-list.js', { input: [{ statusCode: 200, data: '<a href="/other-project/">x</a><a href="/shop/journal/">j</a>' }],
    nodes: { 'Parse robots.txt': [sub], 'Fetch Sitemap Files': files, 'Sitemap Targets': targets } });
  assert.deepEqual(out.map(o => o.url), ['https://user.github.io/shop/', 'https://user.github.io/shop/products/a/', 'https://user.github.io/shop/about/', 'https://user.github.io/shop/journal/']);
  assert.equal(out[0].discovery.sitemapSource, 'folder');
  assert.equal(out[0].discovery.offSite, 1, 'another project on the same domain is out of scope');
});

// ---------- M3: extraction ----------
const pages = runNode('extract-seo-data.js', { input: fixture('edge-cases.json') });

test('M3 extracts tags correctly from messy HTML', () => {
  const p = pages[0];
  assert.equal(p.title, "Tom & Jerry's Shop");
  assert.equal(p.metaDescription, 'Best "toys" in town');
  assert.equal(p.isNoindex, true);
  assert.equal(p.canonicalTagCount, 2);
  assert.equal(p.canonicalUrl, 'https://example.com/index.html');
  assert.deepEqual(p.h1, ['Main Title', 'Second H1'], 'H1s inside comments and scripts are ignored');
  assert.equal(p.internalLinks, 4); assert.equal(p.externalLinks, 1); assert.equal(p.nofollowLinks, 1);
  assert.equal(p.imagesMissingAlt, 1); assert.equal(p.imagesEmptyAlt, 1);
  assert.equal(p.lang, 'bn');
  assert.equal(p.html, undefined, 'raw HTML is dropped');
});

test('M3 flags JavaScript-rendered pages and skips failed or non-HTML pages', () => {
  assert.equal(pages[1].jsRenderedSuspected, true);
  assert.equal(pages[2].extractionStatus, 'SKIPPED_FETCH_FAILED');
  assert.equal(pages[3].extractionStatus, 'SKIPPED_NOT_HTML');
});

// ---------- M4: PageSpeed ----------
const req = [{ runId: 't', url: 'https://example.com/', strategy: 'mobile' }];
const psi = res => runNode('pagespeed-results.js', { input: [res], nodes: { 'Build PageSpeed Requests': req } })[0];

test('M4 reads lab scores, field data and top opportunities', () => {
  const r = psi({ statusCode: 200, body: { lighthouseResult: { categories: { performance: { score: 0.62 } }, audits: {
    'largest-contentful-paint': { numericValue: 4321 }, 'total-blocking-time': { numericValue: 120 }, 'cumulative-layout-shift': { numericValue: 0.0123 },
    'render-blocking-resources': { title: 'Eliminate render-blocking resources', score: 0.3, details: { overallSavingsMs: 800 } } } },
    loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2100 }, INTERACTION_TO_NEXT_PAINT: { percentile: 250 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 } } } } });
  assert.equal(r.psiStatus, 'OK'); assert.equal(r.performanceScore, 62); assert.equal(r.lcpLab, '4.3 s');
  assert.equal(r.fieldDataSource, 'url'); assert.equal(r.fieldCwvAssessment, 'FAILED');
  assert.match(r.topOpportunities, /render-blocking/);
});

test('M4 records failures instead of inventing numbers', () => {
  assert.equal(psi({ statusCode: 429, body: {} }).psiStatus, 'RATE_LIMITED');
  assert.equal(psi({ statusCode: 429, body: {} }).performanceScore, null);
  assert.equal(psi({ statusCode: 400, body: { error: { message: 'FAILED_DOCUMENT_REQUEST' } } }).psiStatus, 'API_ERROR_400');
  assert.equal(psi({ error: { message: 'timeout' } }).psiStatus, 'NETWORK_ERROR');
});

// ---------- M5: findings ----------
test('M5 produces evidence-backed, prioritized findings', () => {
  const ctx5 = { runId: 't', targetUrl: 'http://example.com/', robotsMode: 'PARSED', robotsUrl: 'http://example.com/robots.txt', robotsStatusCode: 200, sitemaps: [] };
  const out = runNode('generate-findings.js', { nodes: { 'Extract SEO Data': pages, 'Parse robots.txt': [ctx5],
    'PageSpeed Results': [{ psiStatus: 'RATE_LIMITED', strategy: 'mobile', url: 'http://example.com/' }],
    'Plan Crawl List': [{ discovery: { sitemapUrlsFound: 0, rootSitemapUrl: 'http://example.com/sitemap.xml', rootSitemapStatus: 404 } }] } });
  const summary = out.find(o => o.recordType === 'summary');
  const ids = out.filter(o => o.recordType === 'finding').map(o => o.findingId);
  for (const id of ['FETCH_FAILED', 'JS_RENDERED_SUSPECTED', 'NOINDEX', 'MULTIPLE_CANONICALS', 'IMAGES_MISSING_ALT', 'NOT_HTTPS', 'SITEMAP_NOT_FOUND', 'PSI_UNAVAILABLE_MOBILE']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('MISSING_TITLE'), 'a JavaScript-rendered page is not reported as missing a title');
  const first = out[0];
  assert.equal(first.severity, 'High');
  assert.ok(first.evidence.length > 0 && first.recommendation && first.reference);
  assert.ok(summary.seoHealthScore >= 0 && summary.seoHealthScore <= 100);
});

// ---------- M7: weekly email report ----------
test('M7 weekly report uses only saved runs, shows the trend and the latest findings', () => {
  const runs = [
    { runId: 'run_47', auditTarget: 'https://example.com/', auditedAt: '2026-10-28T04:15:00Z', seoHealthScore: 91, pagesOk: 35, pagesAudited: 35, pagesFailed: 0, high: 0, medium: 5, low: 5, mobileScore: null, desktopScore: null, psiStatus: 'mobile:RATE_LIMITED' },
    { runId: 'run_54', auditTarget: 'https://example.com/', auditedAt: '2026-10-29T11:13:00Z', seoHealthScore: 98, pagesOk: 35, pagesAudited: 35, pagesFailed: 0, high: 0, medium: 0, low: 5, mobileScore: 92, desktopScore: 99, psiStatus: 'mobile:OK, desktop:OK' }
  ];
  const findings = [
    { runId: 'run_54', priorityRank: 2, priority: 'P3', title: 'No robots.txt <file>', affectedPages: 1, pagesAudited: 35, recommendation: 'Add one' },
    { runId: 'run_54', priorityRank: 1, priority: 'P3', title: 'No H2 subheadings', affectedPages: 3, pagesAudited: 35, recommendation: 'Use H2s' }
  ];
  const gsc = { rows: [{ clicks: 3, impressions: 120, ctr: 0.025, position: 18.44 }] };
  const [out] = runNode('weekly-report.js', { input: [gsc], nodes: { 'Get Recent Runs': runs, 'Get Latest Findings': findings } });
  assert.ok(out.html.includes('>120<') && out.html.includes('2.5%') && out.html.includes('18.4'));
  assert.equal(out.latestRunId, 'run_54');
  assert.equal(out.runsInReport, 2);
  assert.match(out.subject, /score 98 \(\+7 since 2026-10-28\)/);
  assert.ok(out.html.indexOf('No H2 subheadings') < out.html.indexOf('No robots.txt'));
  assert.ok(out.html.includes('&lt;file&gt;') && !out.html.includes('<file>'));
  assert.ok(out.html.includes('not measured'));
});

test('M7 weekly report says so when there are no runs instead of inventing data', () => {
  const [out] = runNode('weekly-report.js', { input: [{}], nodes: { 'Get Recent Runs': [{}], 'Get Latest Findings': [{}] } });
  assert.equal(out.runsInReport, 0);
  assert.match(out.subject, /no audit runs/);
});

test('M8 Search Console section: no rows means "no data yet", errors are shown, not hidden', () => {
  const runs = [{ runId: 'run_1', auditTarget: 'https://example.com/', auditedAt: '2026-10-29T11:13:00Z', seoHealthScore: 98 }];
  const [empty] = runNode('weekly-report.js', { input: [{ responseAggregationType: 'auto' }], nodes: { 'Get Recent Runs': runs, 'Get Latest Findings': [{}] } });
  assert.match(empty.html, /No search data yet/);
  const [err] = runNode('weekly-report.js', { input: [{ error: { message: 'Forbidden', description: 'not a verified site' } }], nodes: { 'Get Recent Runs': runs, 'Get Latest Findings': [{}] } });
  assert.match(err.html, /could not be read: not a verified site/);
});
