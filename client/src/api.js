const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' })
};

export const fmtDate = (d) => {
  if (!d) return '';
  const date = new Date(d.includes('T') ? d : d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const fmtDateShort = (d) => {
  if (!d) return '';
  const date = new Date(d.includes('T') ? d : d + 'T00:00:00');
  return date.toLocaleDateString('pt-BR');
};
