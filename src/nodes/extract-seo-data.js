// Milestone 3: extract SEO data from each collected page.
// Pure text parsing (no browser), so it sees exactly what a search engine's first fetch sees.
// The raw HTML is dropped at the end so it never reaches Google Sheets.

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function clean(s) { return decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? decode(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3])) : null;
}
function tags(html, name) { return html.match(new RegExp('<' + name + '\\b[^>]*>', 'gi')) || []; }
function blocks(html, name) {
  const out = []; const re = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '\\s*>', 'gi'); let m;
  while ((m = re.exec(html)) !== null) out.push(clean(m[1]));
  return out;
}
function resolve(href, base) {
  href = String(href || '').trim();
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
    let path;
    if (href.startsWith('/')) path = href;
    else if (href.startsWith('?')) path = bPath + href;
    else path = bPath.replace(/[^\/]*$/, '') + href;
    abs = bm[1] + path;
  }
  const m = abs.match(/^(https?:\/\/[^\/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!m) return null;
  const segs = [];
  for (const s of (m[2] || '/').split('/')) {
    if (s === '..') { if (segs.length > 1) segs.pop(); }
    else if (s !== '.') segs.push(s);
  }
  let p = segs.join('/');
  if (!p.startsWith('/')) p = '/' + p;
  return m[1].toLowerCase() + p + (m[3] || '');
}
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); }
function metaByName(metas, key, val) {
  for (const t of metas) { const v = attr(t, key); if (v && v.toLowerCase() === val) return attr(t, 'content'); }
  return null;
}

function extractPage(p) {
  const base = {
    runId: p.runId, auditTarget: p.auditTarget, url: p.url, crawlOrder: p.crawlOrder,
    fetchStatus: p.fetchStatus, statusCode: p.statusCode, contentType: p.contentType, htmlBytes: p.htmlBytes
  };
  if (p.fetchStatus !== 'OK' || !p.isHtml || !p.html) {
    return Object.assign(base, { extractionStatus: p.fetchStatus !== 'OK' ? 'SKIPPED_FETCH_FAILED' : 'SKIPPED_NOT_HTML' });
  }
  const raw = p.html;
  // Remove comments, scripts, styles, templates, noscript before reading content.
  const html = raw.replace(/<!--[\s\S]*?-->/g, '');
  const headM = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
  const head = headM ? headM[1] : html;
  const body = html.replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ');

  const titles = blocks(head, 'title');
  const title = titles[0] || '';
  const metas = tags(head, 'meta');
  // Trim: a description of only spaces/newlines is treated as empty (it shows nothing in Google).
  const mdRaw = metaByName(metas, 'name', 'description');
  const metaDescription = mdRaw === null ? null : mdRaw.replace(/\s+/g, ' ').trim();
  const metaRobots = metaByName(metas, 'name', 'robots');
  const viewport = metaByName(metas, 'name', 'viewport');
  const ogTitle = metaByName(metas, 'property', 'og:title');
  const ogDescription = metaByName(metas, 'property', 'og:description');
  const ogImage = metaByName(metas, 'property', 'og:image');
  const descCount = metas.filter(t => (attr(t, 'name') || '').toLowerCase() === 'description').length;

  const linkTags = tags(head, 'link');
  const canonTags = linkTags.filter(t => (attr(t, 'rel') || '').toLowerCase().split(/\s+/).includes('canonical'));
  const canonicalRaw = canonTags.length ? (attr(canonTags[0], 'href') || '') : '';
  const canonicalUrl = canonicalRaw ? (resolve(canonicalRaw, p.url) || '') : '';
  const hreflangCount = linkTags.filter(t => attr(t, 'hreflang')).length;
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [''])[0];
  const lang = attr(htmlTag, 'lang') || '';

  const h1 = blocks(body, 'h1'), h2 = blocks(body, 'h2'), h3 = blocks(body, 'h3');

  const origin = p.url.match(/^https?:\/\/[^\/?#]+/i)[0].toLowerCase();
  const host = origin.replace(/^https?:\/\//, '').replace(/^www\./, '');
  let internal = 0, external = 0, nofollow = 0, emptyAnchor = 0, otherScheme = 0;
  const internalSet = new Set(), externalSet = new Set();
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi; let am;
  while ((am = aRe.exec(body)) !== null) {
    const t = '<a ' + am[1] + '>';
    const href = attr(t, 'href');
    if (href === null) continue;
    const rel = (attr(t, 'rel') || '').toLowerCase();
    if (/\bnofollow\b/.test(rel)) nofollow++;
    const text = clean(am[2]);
    const hasImgAlt = /<img\b[^>]*\salt\s*=\s*["'][^"']+["']/i.test(am[2]);
    if (!text && !hasImgAlt && !attr(t, 'aria-label') && !attr(t, 'title')) emptyAnchor++;
    const abs = resolve(href, p.url);
    if (!abs) { if (!href.trim().startsWith('#')) otherScheme++; continue; }
    const h = abs.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].replace(/^www\./, '');
    if (h === host) { internal++; internalSet.add(abs); } else { external++; externalSet.add(abs); }
  }

  const imgs = tags(body, 'img');
  const imgNoAlt = imgs.filter(t => attr(t, 'alt') === null).length;
  const imgEmptyAlt = imgs.filter(t => { const a = attr(t, 'alt'); return a !== null && !a.trim(); }).length;

  const text = clean(body.replace(/<head\b[\s\S]*?<\/head\s*>/i, ' '));
  const words = text ? text.split(' ').filter(w => /[\p{L}\p{N}]/u.test(w)).length : 0;
  const scriptCount = (raw.match(/<script\b/gi) || []).length;
  const jsShell = /<div[^>]+id\s*=\s*["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(raw);
  const jsRenderedSuspected = words < 50 && (scriptCount >= 3 || jsShell);

  return Object.assign(base, {
    extractionStatus: 'OK',
    title, titleLength: title.length, titleTagCount: titles.length,
    metaDescription: metaDescription === null ? '' : metaDescription,
    metaDescriptionPresent: metaDescription !== null,
    metaDescriptionLength: metaDescription === null ? 0 : metaDescription.length,
    metaDescriptionTagCount: descCount,
    metaRobots: metaRobots || '',
    isNoindex: /\bnoindex\b/i.test(metaRobots || ''),
    canonicalRaw, canonicalUrl, canonicalTagCount: canonTags.length,
    canonicalIsSelf: canonicalUrl ? canonicalUrl === p.url : null,
    lang, viewportPresent: viewport !== null, hreflangCount,
    ogTitlePresent: ogTitle !== null, ogDescriptionPresent: ogDescription !== null, ogImagePresent: ogImage !== null,
    h1Count: h1.length, h1: h1.slice(0, 5), h2Count: h2.length, h2: h2.slice(0, 10), h3Count: h3.length, h3: h3.slice(0, 10),
    internalLinks: internal, uniqueInternalLinks: internalSet.size,
    externalLinks: external, uniqueExternalLinks: externalSet.size,
    nofollowLinks: nofollow, emptyAnchorLinks: emptyAnchor, nonHttpLinks: otherScheme,
    imageCount: imgs.length, imagesMissingAlt: imgNoAlt, imagesEmptyAlt: imgEmptyAlt,
    wordCount: words, scriptCount, jsRenderedSuspected,
    contentHash: hash(text)
  });
}

if (typeof module !== 'undefined' && typeof $input === 'undefined') {
  module.exports = { extractPage };
} else {
  return $input.all().map(it => ({ json: extractPage(it.json) }));
}
