const BASE = (process.env.QA_API_BASE || 'http://localhost:3001/api').replace(/\/$/, '');

const TIMEOUT_MS = Number(process.env.QA_API_TIMEOUT_MS) || 30_000;
const MAX_RETRIES = Number(process.env.QA_API_RETRIES) || 2;

const appToken = process.env.QA_APP_TOKEN || process.env.APP_TOKEN || '';

async function fetchWithTimeout(path, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(BASE + path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(appToken ? { 'x-app-token': appToken } : {}), ...(options.headers || {}) },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, options = {}, attempt = 0) {
  let res;
  try {
    res = await fetchWithTimeout(path, options);
  } catch (err) {
    if (attempt < MAX_RETRIES && err.name === 'AbortError') {
      await sleep(500 * (attempt + 1));
      return request(path, options, attempt + 1);
    }
    throw new Error(
      `API ${options.method || 'GET'} ${path}: não foi possível conectar a ${BASE} (${err.name === 'AbortError' ? `timeout após ${TIMEOUT_MS}ms` : err.message})`
    );
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch { /* ignore */ }
    // Retenta falhas transitórias de servidor (5xx) com backoff.
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(500 * (attempt + 1));
      return request(path, options, attempt + 1);
    }
    throw new Error(`API ${options.method || 'GET'} ${path}: HTTP ${res.status} — ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTestCase(caseId) {
  return request(`/test-cases/${caseId}`);
}

async function listTestCases({ taskId, type, executionMode } = {}) {
  const q = new URLSearchParams();
  if (taskId) q.set('taskId', String(taskId));
  if (type) q.set('type', type);
  const rows = await request(`/test-cases?${q.toString()}`);
  let list = rows || [];
  if (executionMode) {
    list = list.filter((c) => c.execution_mode === executionMode);
  }
  return list;
}

async function getMassForCase(caseId, taskId) {
  const detail = await getTestCase(caseId);
  if (Array.isArray(detail.test_mass) && detail.test_mass.length) return detail.test_mass;
  if (!taskId && !detail.task_id) return [];
  const all = await request(`/test-cases/mass/all?taskId=${taskId || detail.task_id}`);
  return (all || []).filter((m) => Number(m.test_case_id) === Number(caseId));
}

async function createExecution(payload) {
  return request('/executions', { method: 'POST', body: payload });
}

module.exports = {
  BASE,
  getTestCase,
  listTestCases,
  getMassForCase,
  createExecution
};
