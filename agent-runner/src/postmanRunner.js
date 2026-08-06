/**
 * Executes a Postman Collection v2.1 with native fetch (no Newman required).
 * Supports {{baseUrl}} / {{baseURL}} and simple {{var}} from collection variables + env.
 */

function resolveVars(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const k = key.trim();
    if (vars[k] !== undefined) return String(vars[k]);
    if (process.env[k] !== undefined) return String(process.env[k]);
    return `{{${k}}}`;
  });
}

function urlToString(url, vars) {
  if (typeof url === 'string') return resolveVars(url, vars);
  if (url?.raw) return resolveVars(url.raw, vars);
  if (url?.host) {
    const protocol = url.protocol ? resolveVars(String(url.protocol).replace(/:?$/, ''), vars) : 'https';
    const host = (Array.isArray(url.host) ? url.host.join('.') : url.host);
    const pathPart = Array.isArray(url.path) ? '/' + url.path.join('/') : (url.path || '');
    const query = Array.isArray(url.query)
      ? '?' + url.query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join('&')
      : '';
    return resolveVars(`${protocol}://${host}${pathPart}${query}`, vars);
  }
  return '';
}

function collectItems(items, acc = []) {
  for (const it of items || []) {
    if (it.item) collectItems(it.item, acc);
    else if (it.request) acc.push(it);
  }
  return acc;
}

function buildVars(collection, baseURL, extraVars = {}) {
  const vars = { baseUrl: baseURL, baseURL, ...extraVars };
  for (const v of collection?.variable || []) {
    if (v?.key) vars[v.key] = v.value ?? '';
  }
  return vars;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function runPostmanCollection(collection, { baseURL, timeoutMs, vars: extraVars } = {}) {
  const vars = buildVars(collection, baseURL || process.env.TARGET_BASE_URL || '', extraVars);
  const requests = collectItems(collection.item);
  const results = [];
  let log = '';
  const perRequestTimeout = timeoutMs || Number(process.env.POSTMAN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < requests.length; i++) {
    const item = requests[i];
    const req = item.request || {};
    const method = (req.method || 'GET').toUpperCase();
    const url = urlToString(req.url, vars);
    const headers = {};
    for (const h of req.header || []) {
      if (!h.disabled && h.key) headers[resolveVars(h.key, vars)] = resolveVars(h.value || '', vars);
    }
    let body;
    if (req.body?.mode === 'raw' && req.body.raw) {
      body = resolveVars(req.body.raw, vars);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = req.body.options?.raw?.language === 'json'
          ? 'application/json'
          : 'text/plain';
      }
    }

    const started = Date.now();
    let status = 0;
    let ok = false;
    let responseText = '';
    let error = null;
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: ['GET', 'HEAD'].includes(method) ? undefined : body,
        signal: AbortSignal.timeout(perRequestTimeout)
      });
      status = res.status;
      ok = res.ok;
      responseText = await res.text();
    } catch (err) {
      error = err.name === 'TimeoutError' || /abort/i.test(err?.message || '')
        ? `timeout após ${perRequestTimeout}ms`
        : err.message;
    }
    const durationMs = Date.now() - started;
    const line = `[${i + 1}] ${method} ${url} → ${error || status} (${durationMs}ms)\n`;
    log += line;
    results.push({
      order: i + 1,
      name: item.name || `Request ${i + 1}`,
      method,
      url,
      status,
      ok,
      durationMs,
      responsePreview: responseText.slice(0, 2000),
      error
    });
  }

  const failed = results.some((r) => r.error || !r.ok);
  return {
    exitCode: failed ? 1 : 0,
    log,
    requestResults: results
  };
}

module.exports = { runPostmanCollection, collectItems };
