const BASE = '/api';

function appToken() {
  try {
    return localStorage.getItem('qa_app_token') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_TOKEN) || '';
  } catch { return ''; }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = appToken();
  if (token) headers['x-app-token'] = token;
  const res = await fetch(BASE + path, {
    headers,
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
  const raw = String(d).trim();
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const fmtDateShort = (d) => {
  if (!d) return '';
  const raw = String(d).trim();
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return date.toLocaleDateString('pt-BR');
};
