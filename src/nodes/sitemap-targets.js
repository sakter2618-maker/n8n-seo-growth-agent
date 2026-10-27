// Milestone 2.1a: decide which sitemap file(s) to read.
// Order: "Sitemap:" lines in robots.txt, otherwise /sitemap.xml.
// If that file is a sitemap index (common on WordPress/WooCommerce/Shopify), read up to 5 child
// sitemaps, preferring products, categories, pages and posts.
function sitemapTargets(ctx, res) {
  const rootUrl = (ctx.sitemaps && ctx.sitemaps[0]) || (ctx.origin + '/sitemap.xml');
  const status = Number(res.statusCode || 0);
  const body = typeof res.data === 'string' ? res.data : (typeof res.body === 'string' ? res.body : '');
  const locs = re => [...body.matchAll(re)].map(m => m[1].trim().replace(/&amp;/g, '&'));
  const base = { runId: ctx.runId, rootSitemapUrl: rootUrl, rootSitemapStatus: status, rootSitemapDeclared: !!(ctx.sitemaps && ctx.sitemaps.length) };
  if (status >= 200 && status < 300 && /<sitemapindex[\s>]/i.test(body)) {
    const children = locs(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/gi);
    const score = u => (/product/i.test(u) ? 0 : /categor|collection|product_cat/i.test(u) ? 1 : /page/i.test(u) ? 2 : /post/i.test(u) ? 3 : 4);
    const chosen = children.filter(u => !/\.gz(\?|$)/i.test(u)).sort((a, b) => score(a) - score(b)).slice(0, 5);
    if (chosen.length) return chosen.map(u => ({ ...base, rootSitemapType: 'index', childSitemapsInIndex: children.length, sitemapUrl: u }));
  }
  // Plain urlset, missing, or unreadable: fetch the root URL again in the next step and let the planner decide.
  return [{ ...base, rootSitemapType: /<urlset[\s>]/i.test(body) ? 'urlset' : 'none', childSitemapsInIndex: 0, sitemapUrl: rootUrl }];
}

if (typeof module !== 'undefined' && typeof $input === 'undefined') {
  module.exports = { sitemapTargets };
} else {
  const ctx = $('Parse robots.txt').first().json;
  return sitemapTargets(ctx, $input.first().json).map(j => ({ json: j }));
}
