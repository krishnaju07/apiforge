// ═══════════════════════════════════════════════════════════
//  APIForge – HTTP Engine, cURL Parser/Generator, Test Runner
// ═══════════════════════════════════════════════════════════

export const abortControllers = {};

export function buildUrl(url, params) {
  const enabled = (params || []).filter(p => p.enabled !== false && p.key);
  if (!enabled.length) return url;
  const qs = enabled
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`)
    .join('&');
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
}

export function applyAuth(auth, headers, extraParams, resolveEnv) {
  if (!auth || auth.type === 'none') return;
  const re = (s) => resolveEnv ? resolveEnv(s) : (s || '');
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${re(auth.token)}`;
  } else if (auth.type === 'basic' && auth.username) {
    headers['Authorization'] = `Basic ${btoa(`${re(auth.username)}:${re(auth.password || '')}`)}`;
  } else if (auth.type === 'apikey' && auth.keyValue) {
    const name = re(auth.keyName || 'X-API-Key');
    const val = re(auth.keyValue);
    if (auth.keyIn === 'query') extraParams.push({ key: name, value: val, enabled: true });
    else headers[name] = val;
  } else if (auth.type === 'jwt' && auth.jwt) {
    headers['Authorization'] = `Bearer ${re(auth.jwt)}`;
  } else if (auth.type === 'oauth2' && auth.oauth2?.accessToken) {
    headers['Authorization'] = `Bearer ${re(auth.oauth2.accessToken)}`;
  }
}

export function buildBody(tab, resolveEnv) {
  const re = (s) => resolveEnv ? resolveEnv(s) : (s || '');
  const { bodyType, bodyText, formdata, urlencoded } = tab;
  if (!bodyType || bodyType === 'none') return { body: undefined, contentType: null };
  if (bodyType === 'json') return { body: re(bodyText || ''), contentType: 'application/json' };
  if (bodyType === 'raw') return { body: re(bodyText || ''), contentType: 'text/plain' };
  if (bodyType === 'graphql') return { body: re(bodyText || '{}'), contentType: 'application/json' };
  if (bodyType === 'urlencoded') {
    const body = (urlencoded || []).filter(f => f.enabled !== false && f.key)
      .map(f => `${encodeURIComponent(re(f.key))}=${encodeURIComponent(re(f.value || ''))}`)
      .join('&');
    return { body, contentType: 'application/x-www-form-urlencoded' };
  }
  if (bodyType === 'formdata') {
    const fd = new FormData();
    (formdata || []).filter(f => f.enabled !== false && f.key)
      .forEach(f => fd.append(re(f.key), re(f.value || '')));
    return { body: fd, contentType: null };
  }
  return { body: undefined, contentType: null };
}

// Headers browsers forbid being set via fetch()
const FORBIDDEN_HEADERS = new Set([
  'accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'cookie',
  'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive', 'origin',
  'referer', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via', 'priority',
]);

export async function executeRequest(tab, resolveEnv, signal) {
  const re = (s) => (resolveEnv ? resolveEnv(s) : s) || '';
  const headers = {};
  (tab.headers || []).filter(h => h.enabled !== false && h.key)
    .forEach(h => {
      const key = re(h.key);
      const lower = key.toLowerCase();
      // Strip browser-controlled/forbidden headers — they cause fetch() to silently fail
      if (lower.startsWith('sec-') || lower.startsWith('proxy-') || FORBIDDEN_HEADERS.has(lower)) return;
      headers[key] = re(h.value || '');
    });

  const extraParams = [];
  applyAuth(tab.auth, headers, extraParams, resolveEnv);
  const { body, contentType } = buildBody(tab, resolveEnv);
  if (contentType && !headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = contentType;
  if (tab.bodyType === 'formdata') { delete headers['Content-Type']; delete headers['content-type']; }

  const allParams = [
    ...(tab.params || []).filter(p => p.enabled !== false && p.key)
      .map(p => ({ key: re(p.key), value: re(p.value || ''), enabled: true })),
    ...extraParams,
  ];
  const finalUrl = buildUrl(re(tab.url), allParams);
  const method = (tab.method || 'GET').toUpperCase();
  const start = performance.now();

  // FormData can't be JSON-serialised — send directly via browser fetch
  if (tab.bodyType === 'formdata') {
    const res = await fetch(finalUrl, { method, headers, signal, body, redirect: 'follow' });
    return _buildDirectResult(res, finalUrl, start);
  }

  // If proxy disabled by user, go direct from browser (works when browser has network access to API)
  const proxyEnabled = typeof window !== 'undefined'
    ? (window.__apiforgeProxyEnabled !== undefined ? window.__apiforgeProxyEnabled : true)
    : true;

  if (!proxyEnabled) {
    const res = await fetch(finalUrl, {
      method, headers, signal, redirect: 'follow',
      body: !['GET', 'HEAD'].includes(method) && body !== undefined ? body : undefined,
    });
    return _buildDirectResult(res, finalUrl, start);
  }

  // All other requests go through the proxy (/apiforge-proxy in dev, /api/proxy on Vercel)
  // so Node.js makes the actual call — no CORS restrictions, any header allowed.
  const proxyBody = !['GET', 'HEAD'].includes(method) && body !== undefined ? body : null;
  let proxyRes;
  try {
    proxyRes = await fetch('/apiforge-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: finalUrl, method, headers, body: proxyBody }),
      signal,
    });
  } catch (networkErr) {
    if (networkErr.name === 'AbortError') throw networkErr;
    // Proxy not reachable (e.g. production build) — fall back to direct fetch
    const res = await fetch(finalUrl, {
      method, headers, signal, redirect: 'follow',
      body: !['GET', 'HEAD'].includes(method) && body !== undefined ? body : undefined,
    });
    return _buildDirectResult(res, finalUrl, start);
  }

  const elapsed = Math.round(performance.now() - start);
  const proxyCt = proxyRes.headers.get('content-type') || '';
  if (!proxyCt.includes('json')) {
    // Proxy middleware not registered — dev server needs restart
    throw new Error('Proxy not ready. Restart the dev server (npm start) and try again.');
  }
  const data = await proxyRes.json();
  if (data.error) throw new Error(data.error);

  const rawText = data.body || '';
  const size = new TextEncoder().encode(rawText).length;
  const ct = (data.headers || {})['content-type'] || '';
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch {}

  return {
    status: data.status, statusText: data.statusText || '',
    headers: data.headers || {}, raw: rawText, parsed, contentType: ct,
    finalUrl: data.finalUrl || finalUrl, redirected: false, size, time: elapsed,
  };
}

async function _buildDirectResult(res, finalUrl, start) {
  const elapsed = Math.round(performance.now() - start);
  const rawText = await res.text();
  const size = new TextEncoder().encode(rawText).length;
  const ct = res.headers.get('content-type') || '';
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch {}
  const resHeaders = {};
  res.headers.forEach((v, k) => { resHeaders[k] = v; });
  return {
    status: res.status, statusText: res.statusText,
    headers: resHeaders, raw: rawText, parsed, contentType: ct,
    finalUrl: res.url || finalUrl, redirected: res.redirected, size, time: elapsed,
  };
}

export function runPreScript(code, envGet, envSet) {
  if (!code || !code.trim()) return { logs: [], error: null };
  const logs = [];
  const consoleSpy = {
    log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ')),
    warn: (...a) => logs.push('[WARN] ' + a.join(' ')),
    error: (...a) => logs.push('[ERR] ' + a.join(' ')),
    info: (...a) => logs.push('[INFO] ' + a.join(' ')),
  };
  const env = { get: (k) => { try { return envGet(k); } catch { return undefined; } }, set: (k, v) => { try { envSet(k, v); } catch {} } };
  const pm = { environment: { get: env.get, set: env.set }, globals: { get: () => undefined, set: () => {} } };
  try {
    // eslint-disable-next-line no-new-func
    new Function('env', 'console', 'pm', code)(env, consoleSpy, pm);
    return { logs, error: null };
  } catch (e) { return { logs, error: e.message }; }
}

export function runTests(code, response) {
  if (!code || !code.trim()) return [];
  const results = [];
  let _name = '';
  function addResult(pass, msg) { results.push({ name: _name, pass, msg: pass ? '' : msg }); }
  function expect(actual) {
    const chain = {
      to: {
        equal: (exp) => addResult(actual === exp, `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(exp)}`),
        eql: (exp) => addResult(JSON.stringify(actual) === JSON.stringify(exp), `Deep equal failed`),
        exist: () => addResult(actual !== null && actual !== undefined && actual !== '', `Expected value to exist, got ${JSON.stringify(actual)}`),
        include: (sub) => addResult(String(actual).includes(String(sub)), `"${actual}" does not include "${sub}"`),
        match: (re) => addResult(re instanceof RegExp ? re.test(String(actual)) : false, `Does not match`),
        be: {
          above: (n) => addResult(actual > n, `${actual} is not above ${n}`),
          below: (n) => addResult(actual < n, `${actual} is not below ${n}`),
          a: (t) => addResult(typeof actual === t, `typeof is "${typeof actual}", not "${t}"`),
          true: () => addResult(actual === true, `Expected true, got ${actual}`),
          false: () => addResult(actual === false, `Expected false, got ${actual}`),
          ok: () => addResult(!!actual, `Expected truthy`),
        },
        not: {
          equal: (exp) => addResult(actual !== exp, `Should not equal ${exp}`),
          exist: () => addResult(actual === null || actual === undefined, `Expected to not exist`),
          include: (sub) => addResult(!String(actual).includes(String(sub)), `Should not include "${sub}"`),
        },
        have: { property: (k) => addResult(actual && k in actual, `Missing property "${k}"`) },
      },
    };
    return chain;
  }
  function test(name, fn) {
    _name = name;
    const before = results.length;
    try {
      fn();
      if (results.length === before) results.push({ name, pass: true, msg: '' });
    } catch (e) { results.push({ name, pass: false, msg: e.message }); }
  }
  const resp = {
    status: response.status, statusText: response.statusText,
    headers: response.headers || {}, time: response.time || 0, size: response.size || 0,
    json: () => response.parsed !== null && response.parsed !== undefined ? response.parsed : JSON.parse(response.raw),
    text: () => response.raw || '',
  };
  const pm = { test, expect, response: resp, environment: { get: () => null, set: () => {} } };
  try {
    // eslint-disable-next-line no-new-func
    new Function('test', 'expect', 'response', 'pm', code)(test, expect, resp, pm);
  } catch (e) { results.push({ name: 'Script Error', pass: false, msg: e.message }); }
  return results;
}

export function parseCurl(raw) {
  const result = { method: 'GET', url: '', headers: [], params: [], body: '', bodyType: 'none', auth: null };

  // Normalize line continuations: POSIX (backslash) and Windows CMD (caret)
  let src = raw
    .replace(/\\\r?\n\s*/g, ' ')   // POSIX: \ + newline
    .replace(/\^[ \t]*\r?\n[ \t]*/g, ' ')  // CMD: ^ + newline (line continuation)
    .replace(/\r?\n/g, ' ')
    .trim();

  // Normalize Windows CMD ^ escaping: ^" → ", ^{ → {, ^\^" → \"  etc.
  // In CMD, ^ is the escape char: ^X → X (applied left-to-right handles ^\^" → \")
  if (src.includes('^')) {
    src = src.replace(/\^(.)/g, '$1');
  }

  // Safe O(n) tokenizer — no regex backtracking, handles quoted args correctly
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src[i] === ' ' || src[i] === '\t') { i++; continue; }
    if (src[i] === "'") {
      i++;
      let t = '';
      while (i < n && src[i] !== "'") t += src[i++];
      if (i < n) i++;
      tokens.push(t);
    } else if (src[i] === '"') {
      i++;
      let t = '';
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) { i++; const c = src[i]; t += c === 'n' ? '\n' : c === 't' ? '\t' : c; }
        else t += src[i];
        i++;
      }
      if (i < n) i++;
      tokens.push(t);
    } else {
      let t = '';
      while (i < n && src[i] !== ' ' && src[i] !== '\t' && src[i] !== "'" && src[i] !== '"') t += src[i++];
      if (t) tokens.push(t);
      // Handle --flag='value' or --flag="value" with no space before quote
      if (i < n && (src[i] === "'" || src[i] === '"')) {
        const q = src[i++];
        let qt = '';
        while (i < n && src[i] !== q) {
          if (src[i] === '\\' && i + 1 < n) { i++; const c = src[i]; qt += c === 'n' ? '\n' : c === 't' ? '\t' : c; }
          else qt += src[i];
          i++;
        }
        if (i < n) i++;
        if (tokens.length > 0 && tokens[tokens.length - 1].endsWith('=')) {
          tokens[tokens.length - 1] += qt;
        } else {
          tokens.push(qt);
        }
      }
    }
  }

  // Flags that consume the next token as a value we don't use
  const skipFlags = new Set(['-o', '--output', '-m', '--max-time', '--connect-timeout',
    '--max-redirs', '-A', '--user-agent', '-e', '--referer', '--proxy', '-x',
    '--cert', '--key', '--cacert', '-F', '--form', '-b', '--cookie', '-c',
    '--cookie-jar', '--interface', '--resolve', '--retry', '-T', '--upload-file']);

  let idx = 0;
  if (tokens[0] === 'curl') idx++;

  while (idx < tokens.length) {
    let tok = tokens[idx];

    // Expand --flag=value into two tokens and re-process
    if (tok.startsWith('-') && tok.includes('=')) {
      const eq = tok.indexOf('=');
      tokens.splice(idx, 1, tok.substring(0, eq), tok.substring(eq + 1));
      continue;
    }

    if (tok === '-X' || tok === '--request') {
      idx++;
      if (idx < tokens.length) result.method = tokens[idx].toUpperCase();
    } else if (tok === '-H' || tok === '--header') {
      idx++;
      if (idx < tokens.length) {
        const ci = tokens[idx].indexOf(':');
        if (ci > -1) {
          const key = tokens[idx].substring(0, ci).trim();
          const value = tokens[idx].substring(ci + 1).trim();
          if (key.toLowerCase() === 'authorization') {
            if (value.startsWith('Bearer ')) result.auth = { type: 'bearer', token: value.substring(7) };
            else if (value.startsWith('Basic ')) {
              try {
                const dec = atob(value.substring(6));
                const ci2 = dec.indexOf(':');
                if (ci2 > -1) result.auth = { type: 'basic', username: dec.substring(0, ci2), password: dec.substring(ci2 + 1) };
              } catch {}
            }
          } else {
            result.headers.push({ key, value, enabled: true });
          }
        }
      }
    } else if (tok === '-d' || tok === '--data' || tok === '--data-raw' || tok === '--data-binary' || tok === '--data-urlencode') {
      idx++;
      if (idx < tokens.length && result.body === '') {
        result.body = tokens[idx];
        if (result.method === 'GET') result.method = 'POST';
        try { JSON.parse(result.body); result.bodyType = 'json'; } catch { result.bodyType = 'raw'; }
      }
    } else if (tok === '-u' || tok === '--user') {
      idx++;
      if (idx < tokens.length && !result.auth) {
        const ci = tokens[idx].indexOf(':');
        result.auth = { type: 'basic', username: ci > -1 ? tokens[idx].substring(0, ci) : tokens[idx], password: ci > -1 ? tokens[idx].substring(ci + 1) : '' };
      }
    } else if (tok === '--url') {
      idx++;
      if (idx < tokens.length) _parseCurlUrl(tokens[idx], result);
    } else if (skipFlags.has(tok)) {
      idx++;
    } else if (!tok.startsWith('-')) {
      if (tok.startsWith('http://') || tok.startsWith('https://')) {
        _parseCurlUrl(tok, result);
      } else if (result.url === '') {
        result.url = tok;
      }
    }
    idx++;
  }

  if (result.headers.length === 0) {
    result.headers = [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'Accept', value: '*/*', enabled: true },
    ];
  }
  return result;
}

function _parseCurlUrl(url, result) {
  try {
    const u = new URL(url);
    result.url = u.origin + u.pathname;
    u.searchParams.forEach((v, k) => result.params.push({ key: k, value: v, enabled: true }));
  } catch { result.url = url; }
}

export function generateCurl(tab, resolveEnv) {
  const re = (s) => (resolveEnv ? resolveEnv(s) : s) || '';
  const lines = ['curl', `  -X ${tab.method}`];
  const allParams = (tab.params || []).filter(p => p.enabled !== false && p.key);
  const url = buildUrl(re(tab.url), allParams.map(p => ({ key: re(p.key), value: re(p.value || ''), enabled: true })));
  lines.push(`  '${url}'`);
  (tab.headers || []).filter(h => h.enabled !== false && h.key)
    .forEach(h => lines.push(`  -H '${re(h.key)}: ${re(h.value || '')}'`));
  if (tab.auth) {
    if (tab.auth.type === 'bearer' && tab.auth.token) lines.push(`  -H 'Authorization: Bearer ${re(tab.auth.token)}'`);
    else if (tab.auth.type === 'basic' && tab.auth.username) lines.push(`  -u '${re(tab.auth.username)}:${re(tab.auth.password || '')}'`);
    else if (tab.auth.type === 'apikey' && tab.auth.keyValue && tab.auth.keyIn !== 'query') lines.push(`  -H '${re(tab.auth.keyName || 'X-API-Key')}: ${re(tab.auth.keyValue)}'`);
    else if (tab.auth.type === 'jwt' && tab.auth.jwt) lines.push(`  -H 'Authorization: Bearer ${re(tab.auth.jwt)}'`);
  }
  if (!['GET', 'HEAD'].includes(tab.method) && tab.bodyType !== 'none' && tab.bodyText) {
    lines.push(`  --data-raw '${re(tab.bodyText).replace(/'/g, "'\\''")}'`);
  }
  return lines.join(' \\\n');
}
