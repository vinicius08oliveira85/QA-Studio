const BASE = (process.env.QA_API_BASE || 'http://localhost:3001/api').replace(/\/$/, '');

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch { /* ignore */ }
    throw new Error(`API ${options.method || 'GET'} ${path}: ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
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
