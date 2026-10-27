// Milestone 5: turn extracted page data into evidence-based findings.
// Rules are fixed and transparent: every finding lists the exact pages and values that triggered it.
// No AI and no guessing here. One finding per rule, with all affected pages.

function buildFindings(pages, ctx, psi, disc) {
  const okAll = pages.filter(p => p.extractionStatus === 'OK');
  // Pages that look JavaScript-rendered get ONE finding (JS_RENDERED_SUSPECTED) and are left out of
  // content checks, so we never report "missing title/H1" when the content simply loads later.
  const ok = okAll.filter(p => !p.jsRenderedSuspected);
  const audited = pages.length;
  const findings = [];
  const SEV = { High: 3, Medium: 2, Low: 1, Info: 0 };
  const MAX_EXAMPLES = 10;

  function add(id, category, severity, title, affected, evidenceFn, recommendation, reference) {
    if (!affected.length) return;
    const examples = affected.slice(0, MAX_EXAMPLES).map(evidenceFn);
    findings.push({
      findingId: id, category, severity, title,
      affectedPages: affected.length,
      pagesAudited: audited,
      affectedShare: audited ? Math.round((affected.length / audited) * 100) / 100 : 0,
      evidence: examples.join(' | ') + (affected.length > MAX_EXAMPLES ? ' | …and ' + (affected.length - MAX_EXAMPLES) + ' more' : ''),
      affectedUrls: affected.map(p => p.url || p).slice(0, 50),
      recommendation, reference
    });
  }
  const path = u => String(u || '').replace(/^https?:\/\/[^\/]+/i, '') || '/';
  const groupBy = (arr, key) => {
    const m = {};
    for (const p of arr) { const k = key(p); if (k === null || k === undefined || k === '') continue; (m[k] = m[k] || []).push(p); }
    return Object.values(m).filter(g => g.length > 1);
  };

  // ---- Crawl / indexability ----
  add('FETCH_FAILED', 'Crawlability', 'High', 'Pages could not be loaded',
    pages.filter(p => p.fetchStatus !== 'OK'), p => path(p.url) + ' → ' + p.fetchStatus,
    'Fix or redirect broken URLs and update internal links that point to them.',
    'https://developers.google.com/search/docs/crawling-indexing/http-network-errors');
  add('JS_RENDERED_SUSPECTED', 'Data confidence', 'High', 'Page content may be loaded by JavaScript (audit data may be incomplete)',
    okAll.filter(p => p.jsRenderedSuspected), p => path(p.url) + ' → ' + p.wordCount + ' words, ' + p.scriptCount + ' scripts',
    'Confirm with Google Search Console URL Inspection. Consider server-side rendering so content is in the initial HTML.',
    'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics');
  add('NOINDEX', 'Indexability', 'High', 'Pages tell search engines not to index them',
    ok.filter(p => p.isNoindex), p => path(p.url) + ' → meta robots "' + p.metaRobots + '"',
    'If these pages should appear in Google, remove "noindex". If intentional, no action needed.',
    'https://developers.google.com/search/docs/crawling-indexing/block-indexing');
  add('MISSING_VIEWPORT', 'Mobile', 'High', 'No mobile viewport tag',
    ok.filter(p => !p.viewportPresent), p => path(p.url),
    'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the page head.',
    'https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing');

  // ---- Titles ----
  add('MISSING_TITLE', 'Titles', 'High', 'Pages have no title',
    ok.filter(p => !p.title), p => path(p.url),
    'Write a unique, descriptive <title> for each page.',
    'https://developers.google.com/search/docs/appearance/title-link');
  add('MULTIPLE_TITLE_TAGS', 'Titles', 'Medium', 'Pages have more than one <title> tag',
    ok.filter(p => p.titleTagCount > 1), p => path(p.url) + ' → ' + p.titleTagCount + ' title tags',
    'Keep exactly one <title> tag in the head.',
    'https://developers.google.com/search/docs/appearance/title-link');
  const dupTitles = groupBy(ok, p => p.title ? p.title.toLowerCase() : null);
  add('DUPLICATE_TITLE', 'Titles', 'Medium', 'Different pages share the same title',
    dupTitles.flat(), p => path(p.url) + ' → "' + p.title + '"',
    'Give every page its own title that describes that page specifically.',
    'https://developers.google.com/search/docs/appearance/title-link');
  add('TITLE_TOO_LONG', 'Titles', 'Low', 'Titles longer than 60 characters (may be cut off in results)',
    ok.filter(p => p.titleLength > 60), p => path(p.url) + ' → ' + p.titleLength + ' chars',
    'Shorten to roughly 50–60 characters with the most important words first. (60 is an industry guideline, not a Google rule.)',
    'https://developers.google.com/search/docs/appearance/title-link');
  add('TITLE_TOO_SHORT', 'Titles', 'Low', 'Titles shorter than 20 characters',
    ok.filter(p => p.title && p.titleLength < 20), p => path(p.url) + ' → "' + p.title + '" (' + p.titleLength + ' chars)',
    'Expand the title so it describes the page and its main keyword.',
    'https://developers.google.com/search/docs/appearance/title-link');

  // ---- Meta descriptions ----
  add('MISSING_META_DESCRIPTION', 'Meta description', 'Medium', 'Meta description missing or empty',
    ok.filter(p => p.metaDescriptionLength === 0),
    p => path(p.url) + (p.metaDescriptionPresent ? ' → tag present but empty' : ' → no tag'),
    'Write a unique 1–2 sentence summary (about 70–160 characters) for each page. Google may use it as the search snippet.',
    'https://developers.google.com/search/docs/appearance/snippet');
  const dupDesc = groupBy(ok, p => p.metaDescriptionLength ? p.metaDescription.toLowerCase() : null);
  add('DUPLICATE_META_DESCRIPTION', 'Meta description', 'Low', 'Different pages share the same meta description',
    dupDesc.flat(), p => path(p.url),
    'Make each description specific to its page.',
    'https://developers.google.com/search/docs/appearance/snippet');
  add('META_DESCRIPTION_TOO_LONG', 'Meta description', 'Low', 'Meta descriptions longer than 160 characters',
    ok.filter(p => p.metaDescriptionLength > 160), p => path(p.url) + ' → ' + p.metaDescriptionLength + ' chars',
    'Trim to about 160 characters. (Industry guideline; Google truncates by pixel width.)',
    'https://developers.google.com/search/docs/appearance/snippet');
  add('MULTIPLE_META_DESCRIPTIONS', 'Meta description', 'Low', 'Pages have more than one meta description tag',
    ok.filter(p => p.metaDescriptionTagCount > 1), p => path(p.url) + ' → ' + p.metaDescriptionTagCount + ' tags',
    'Keep exactly one meta description tag.',
    'https://developers.google.com/search/docs/appearance/snippet');

  // ---- Headings ----
  add('MISSING_H1', 'Headings', 'Medium', 'Pages have no H1 heading',
    ok.filter(p => p.h1Count === 0), p => path(p.url),
    'Add one clear H1 that states the page topic.',
    'https://developers.google.com/search/docs/fundamentals/seo-starter-guide');
  add('MULTIPLE_H1', 'Headings', 'Low', 'Pages have more than one H1',
    ok.filter(p => p.h1Count > 1), p => path(p.url) + ' → ' + p.h1Count + ' H1s',
    'Usually one H1 per page is clearest. Multiple H1s are not an error for Google, so treat this as a tidy-up.',
    'https://developers.google.com/search/docs/fundamentals/seo-starter-guide');
  add('NO_H2_STRUCTURE', 'Headings', 'Low', 'Pages use no H2 subheadings',
    ok.filter(p => p.h2Count === 0 && p.wordCount >= 150), p => path(p.url) + ' → 0 H2, ' + p.h3Count + ' H3, ' + p.wordCount + ' words',
    'Use H2s for main sections so the page structure is clear to readers and search engines.',
    'https://developers.google.com/search/docs/fundamentals/seo-starter-guide');

  // ---- Canonical / duplicates ----
  add('MULTIPLE_CANONICALS', 'Canonical', 'High', 'Pages declare more than one canonical URL',
    ok.filter(p => p.canonicalTagCount > 1), p => path(p.url) + ' → ' + p.canonicalTagCount + ' canonical tags',
    'Keep exactly one rel="canonical". With conflicting canonicals Google may ignore them all.',
    'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls');
  const dupContent = groupBy(ok, p => p.wordCount >= 20 ? p.contentHash : null);
  add('DUPLICATE_CONTENT', 'Canonical', 'High', 'Different URLs serve identical content',
    dupContent.flat(), p => path(p.url) + ' (canonical: ' + (p.canonicalUrl ? path(p.canonicalUrl) : 'none') + ')',
    'Pick one preferred URL. 301-redirect the others to it, or add rel="canonical" pointing to it.',
    'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls');
  add('MISSING_CANONICAL', 'Canonical', 'Medium', 'Pages have no canonical tag',
    ok.filter(p => p.canonicalTagCount === 0), p => path(p.url),
    'Add a self-referencing rel="canonical" on each indexable page.',
    'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls');
  add('CANONICAL_POINTS_ELSEWHERE', 'Canonical', 'Info', 'Canonical points to a different URL',
    ok.filter(p => p.canonicalIsSelf === false && p.canonicalTagCount === 1), p => path(p.url) + ' → ' + p.canonicalUrl,
    'Check this is intended. These pages will usually not be shown in Google themselves.',
    'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls');

  // ---- Images / links / content ----
  const altPages = ok.filter(p => p.imagesMissingAlt > 0);
  add('IMAGES_MISSING_ALT', 'Images', 'Medium', 'Images without alt text',
    altPages, p => path(p.url) + ' → ' + p.imagesMissingAlt + ' of ' + p.imageCount + ' images',
    'Add short descriptive alt text to meaningful images (alt="" is fine for purely decorative ones).',
    'https://developers.google.com/search/docs/appearance/google-images');
  add('EMPTY_ANCHOR_LINKS', 'Links', 'Low', 'Links with no text',
    ok.filter(p => p.emptyAnchorLinks > 0), p => path(p.url) + ' → ' + p.emptyAnchorLinks + ' links',
    'Give each link visible text (or aria-label / image alt) that says where it goes.',
    'https://developers.google.com/search/docs/crawling-indexing/links-crawlable');
  add('THIN_CONTENT', 'Content', 'Low', 'Pages with very little text (under 100 words)',
    ok.filter(p => !p.jsRenderedSuspected && p.wordCount < 100), p => path(p.url) + ' → ' + p.wordCount + ' words',
    'Add helpful, original content, or consider whether the page needs to be indexed.',
    'https://developers.google.com/search/docs/fundamentals/creating-helpful-content');
  add('MISSING_LANG', 'International', 'Low', 'No lang attribute on <html>',
    ok.filter(p => !p.lang), p => path(p.url),
    'Add lang="en" (or the correct language) to the <html> tag.',
    'https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites');
  add('MISSING_OPEN_GRAPH', 'Social', 'Low', 'No Open Graph title/image for social sharing',
    ok.filter(p => !p.ogTitlePresent || !p.ogImagePresent),
    p => path(p.url) + ' → og:title ' + (p.ogTitlePresent ? 'yes' : 'no') + ', og:image ' + (p.ogImagePresent ? 'yes' : 'no'),
    'Add og:title, og:description and og:image so shared links show a proper preview.',
    'https://ogp.me/');

  // ---- Site-level ----
  if (ctx) {
    if (/^http:/i.test(ctx.targetUrl)) add('NOT_HTTPS', 'Security', 'Medium', 'Site audited over plain HTTP',
      [{ url: ctx.targetUrl }], p => p.url, 'Serve the site over HTTPS and redirect HTTP to HTTPS.',
      'https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes');
    if (ctx.robotsMode === 'NOT_FOUND_ALLOW_ALL') add('ROBOTS_TXT_MISSING', 'Crawlability', 'Low', 'No robots.txt file',
      [{ url: ctx.robotsUrl }], p => p.url + ' → HTTP ' + ctx.robotsStatusCode,
      'Not required, but a robots.txt lets you list your sitemap and control crawling.',
      'https://developers.google.com/search/docs/crawling-indexing/robots/intro');
    const d = disc || {};
    if (d.sitemapUrlsFound === 0) add('SITEMAP_NOT_FOUND', 'Crawlability', 'Medium', 'No readable XML sitemap found',
      [{ url: d.rootSitemapUrl || ctx.robotsUrl }], p => p.url + ' → HTTP ' + (d.rootSitemapStatus || 'no response') + ', 0 URLs read',
      'Create an XML sitemap listing every page you want in Google, link it from robots.txt and submit it in Search Console.',
      'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap');
    else if (d.sitemapUrlsFound > 0 && !(ctx.sitemaps || []).length) add('SITEMAP_NOT_DECLARED', 'Crawlability', 'Low', 'Sitemap exists but robots.txt does not list it',
      [{ url: ctx.robotsUrl }], p => p.url + ' → no "Sitemap:" line (sitemap found at ' + d.rootSitemapUrl + ' with ' + d.sitemapUrlsFound + ' URLs)',
      'Add "Sitemap: ' + (d.rootSitemapUrl || '') + '" to robots.txt so every search engine can find it.',
      'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap');
  }

  // ---- PageSpeed (filled in by Milestone 4 when available) ----
  for (const r of (psi || [])) {
    if (r.psiStatus !== 'OK') {
      add('PSI_UNAVAILABLE_' + String(r.strategy || 'unknown').toUpperCase(), 'Data confidence', 'Info',
        'PageSpeed could not be measured (' + r.strategy + ')', [{ url: r.url }],
        p => path(p.url) + ' → ' + r.psiStatus + (r.psiError ? ': ' + r.psiError : ''),
        'No performance numbers were recorded for this run. Re-run later or add a PageSpeed API key.', r.reportUrl);
      continue;
    }
    const s = r.performanceScore;
    if (s !== null && s < 50) add('PSI_POOR_PERFORMANCE_' + r.strategy.toUpperCase(), 'Performance', 'High',
      'Poor PageSpeed performance (' + r.strategy + ')', [{ url: r.url }],
      p => path(p.url) + ' → score ' + s + '/100, LCP ' + r.lcpLab + ', TBT ' + r.tbtLab + ', CLS ' + r.clsLab + ' (lab)',
      'Start with the biggest opportunities listed by PageSpeed: ' + (r.topOpportunities || 'see report') + '.', r.reportUrl);
    else if (s !== null && s < 90) add('PSI_NEEDS_IMPROVEMENT_' + r.strategy.toUpperCase(), 'Performance', 'Medium',
      'PageSpeed performance needs improvement (' + r.strategy + ')', [{ url: r.url }],
      p => path(p.url) + ' → score ' + s + '/100, LCP ' + r.lcpLab + ', TBT ' + r.tbtLab + ', CLS ' + r.clsLab + ' (lab)',
      'Work through the top opportunities: ' + (r.topOpportunities || 'see report') + '.', r.reportUrl);
    if (r.fieldCwvAssessment === 'FAILED') add('CWV_FAILED_' + r.strategy.toUpperCase(), 'Performance', 'High',
      'Real-user Core Web Vitals failing (' + r.strategy + ')', [{ url: r.url }],
      p => path(p.url) + ' → field LCP ' + r.lcpField + ', INP ' + r.inpField + ', CLS ' + r.clsField + ' (Chrome UX Report, 28 days)',
      'Fix the failing metric first; real-user data is what Google uses for page experience.', r.reportUrl);
  }

  // ---- Prioritize: severity first, then how much of the site is affected ----
  for (const f of findings) {
    f.priorityScore = Math.round((SEV[f.severity] * 10 + Math.min(1, f.affectedShare) * 10) * 10) / 10;
  }
  findings.sort((a, b) => b.priorityScore - a.priorityScore || a.findingId.localeCompare(b.findingId));
  findings.forEach((f, i) => { f.priorityRank = i + 1; f.priority = { High: 'P1 · Fix first', Medium: 'P2 · Plan next', Low: 'P3 · Nice to have', Info: 'P4 · Review' }[f.severity]; });
  return findings;
}

function buildSummary(pages, ctx, findings, disc) {
  const by = s => findings.filter(f => f.severity === s).length;
  // Transparent rule-based score: start at 100, subtract per finding = weight × share of pages affected.
  const W = { High: 15, Medium: 7, Low: 2, Info: 0 };
  let score = 100;
  for (const f of findings) score -= W[f.severity] * Math.max(0.2, Math.min(1, f.affectedShare));
  return {
    runId: ctx ? ctx.runId : '', auditTarget: ctx ? ctx.targetUrl : '', auditedAt: new Date().toISOString(),
    pagesAudited: pages.length,
    pagesOk: pages.filter(p => p.extractionStatus === 'OK').length,
    pagesFailed: pages.filter(p => p.fetchStatus !== 'OK').length,
    pagesExcludedJsRendered: pages.filter(p => p.extractionStatus === 'OK' && p.jsRenderedSuspected).length,
    robotsMode: ctx ? ctx.robotsMode : '',
    pagesFromSitemap: (disc && disc.fromSitemap) || 0, pagesFromLinks: (disc && disc.fromLinks) || 0, sitemapUrlsFound: (disc && disc.sitemapUrlsFound) || 0,
    findingsTotal: findings.length, high: by('High'), medium: by('Medium'), low: by('Low'), info: by('Info'),
    seoHealthScore: Math.max(0, Math.round(score)),
    scoreMethod: '100 minus (High 15 / Medium 7 / Low 2) × share of pages affected (min 20%) per finding. Our own rule-based score, not a Google metric.',
    topFindings: findings.slice(0, 5).map(f => f.priority + ': ' + f.title).join(' ; ')
  };
}

if (typeof module !== 'undefined' && typeof $input === 'undefined') {
  module.exports = { buildFindings, buildSummary };
} else {
  const pages = $('Extract SEO Data').all().map(i => i.json);
  const ctx = $('Parse robots.txt').first().json;
  let psi = [];
  try { psi = $('PageSpeed Results').all().map(i => i.json); } catch (e) { psi = []; }
  let disc = {};
  try { disc = $('Plan Crawl List').first().json.discovery || {}; } catch (e) { disc = {}; }
  const findings = buildFindings(pages, ctx, psi, disc);
  const summary = buildSummary(pages, ctx, findings, disc);
  return findings.map(f => ({ json: Object.assign({ runId: summary.runId, auditTarget: summary.auditTarget, recordType: 'finding' }, f) }))
    .concat([{ json: Object.assign({ recordType: 'summary' }, summary) }]);
}
