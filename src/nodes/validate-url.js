// Milestone 1: check that the URL is safe and authorized before any crawling.
// The n8n Code sandbox has no built-in URL parser, so we parse with a strict pattern.
// Every rejection carries a CODE plus a plain-English reason, so logs are easy to read.
const results = [];
for (const item of $input.all()) {
  const cfg = item.json;
  const raw = String(cfg.targetUrl === undefined || cfg.targetUrl === null ? '' : cfg.targetUrl).trim();
  const allowed = String(cfg.allowedDomains || '')
    .split(',')
    .map(s => s.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean);
  const out = {
    inputUrl: raw,
    isValid: false,
    normalizedUrl: '',
    hostname: '',
    reason: '',
    allowedDomains: allowed.join(','),
    maxPages: cfg.maxPages,
    checkedAt: new Date().toISOString()
  };
  const fail = (r) => { out.reason = r; results.push({ json: out }); };

  if (allowed.length === 0) { fail('NO_ALLOWLIST: Agent Config has no allowed domains, so nothing can be audited'); continue; }
  if (!raw) { fail('EMPTY_URL: No URL was provided'); continue; }
  if (raw.length > 2048) { fail('URL_TOO_LONG: URL is longer than 2048 characters'); continue; }
  if (/\s/.test(raw)) { fail('INVALID_FORMAT: Web addresses cannot contain spaces'); continue; }

  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = 'https://' + candidate;

  const m = candidate.match(/^([a-z][a-z0-9+.-]*):\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (!m) { fail('INVALID_FORMAT: This is not a valid web address'); continue; }
  const protocol = m[1].toLowerCase();
  const authority = m[2];
  const path = m[3] || '/';
  const search = m[4] || '';

  if (protocol !== 'http' && protocol !== 'https') { fail('UNSUPPORTED_PROTOCOL: Only http and https are allowed (got ' + protocol + ')'); continue; }
  if (authority.includes('@')) { fail('CREDENTIALS_IN_URL: URLs with a username or password are not allowed'); continue; }
  if (authority.startsWith('[')) { fail('IP_ADDRESS_NOT_ALLOWED: Use a domain name, not an IP address'); continue; }

  const hp = authority.match(/^([^:]+)(?::(\d*))?$/);
  if (!hp) { fail('INVALID_FORMAT: The address has an invalid host or port'); continue; }
  const host = hp[1].toLowerCase().replace(/\.$/, '');
  const port = hp[2] || '';
  out.hostname = host;

  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.includes('..')) { fail('INVALID_FORMAT: The domain name contains characters that are not allowed'); continue; }
  if (/^\d+(\.\d+){3}$/.test(host)) { fail('IP_ADDRESS_NOT_ALLOWED: Use a domain name, not an IP address'); continue; }
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(host) || !host.includes('.')) { fail('PRIVATE_HOST_BLOCKED: Local or internal addresses are blocked to protect your server'); continue; }
  if (port && port !== '80' && port !== '443') { fail('NON_STANDARD_PORT: Only the normal web ports are allowed (got ' + port + ')'); continue; }

  const bare = host.replace(/^www\./, '');
  const isAllowed = allowed.some(d => bare === d || bare.endsWith('.' + d));
  if (!isAllowed) { fail('NOT_IN_ALLOWLIST: ' + host + ' is not an authorized website (' + allowed.join(', ') + ')'); continue; }

  out.normalizedUrl = protocol + '://' + host + (port ? ':' + port : '') + (path.startsWith('/') ? path : '/' + path) + search;
  out.isValid = true;
  out.reason = 'OK';
  results.push({ json: out });
}
return results;
