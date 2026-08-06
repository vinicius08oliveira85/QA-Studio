const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDb = path.join(os.tmpdir(), `qa-reports-${process.pid}.db`);
const artifacts = [tmpDb, tmpDb + '-wal', tmpDb + '-shm'];

before(() => {
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  process.env.QA_DB_PATH = tmpDb;
});

after(() => {
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  delete process.env.QA_DB_PATH;
});

function seedTask(db) {
  const pid = Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run('Proj').lastInsertRowid);
  const tid = Number(db.prepare('INSERT INTO tasks (project_id, code, title, status) VALUES (?,?,?,?)')
    .run(pid, 'GMPTL-141', 'Tarefa teste', 'Em Andamento').lastInsertRowid);
  const r1 = Number(db.prepare('INSERT INTO requirements (project_id, task_id, code, title) VALUES (?,?,?,?)')
    .run(pid, tid, 'REQ-001', 'Requisito A').lastInsertRowid);
  const r2 = Number(db.prepare('INSERT INTO requirements (project_id, task_id, code, title) VALUES (?,?,?,?)')
    .run(pid, tid, 'REQ-002', 'Requisito B').lastInsertRowid);

  const tc1 = Number(db.prepare(`INSERT INTO test_cases (project_id, task_id, requirement_id, code, title, type, execution_mode)
    VALUES (?,?,?,?,?,?,?)`).run(pid, tid, r1, 'TC-001', 'Caso 1', 'Funcional', 'Manual').lastInsertRowid);
  const tc2 = Number(db.prepare(`INSERT INTO test_cases (project_id, task_id, requirement_id, code, title, type, execution_mode)
    VALUES (?,?,?,?,?,?,?)`).run(pid, tid, r1, 'TC-002', 'Caso 2', 'Funcional', 'Automatizado').lastInsertRowid);
  const tc3 = Number(db.prepare(`INSERT INTO test_cases (project_id, task_id, requirement_id, code, title, type, execution_mode)
    VALUES (?,?,?,?,?,?,?)`).run(pid, tid, r2, 'TC-003', 'Caso 3', 'API', 'Manual').lastInsertRowid);
  const tc4 = Number(db.prepare(`INSERT INTO test_cases (project_id, task_id, code, title)
    VALUES (?,?,?,?)`).run(pid, tid, 'TC-004', 'Caso sem requisito').lastInsertRowid);

  // Execuções: TC-001 passou duas vezes (última conta), TC-002 falhou, TC-003 bloqueado
  db.prepare(`INSERT INTO executions (project_id, task_id, test_case_id, result, actual_result)
    VALUES (?,?,?,?,?)`).run(pid, tid, tc1, 'Falhou', 'primeira');
  db.prepare(`INSERT INTO executions (project_id, task_id, test_case_id, result, actual_result)
    VALUES (?,?,?,?,?)`).run(pid, tid, tc1, 'Passou', 'segunda');
  db.prepare(`INSERT INTO executions (project_id, task_id, test_case_id, result, actual_result)
    VALUES (?,?,?,?,?)`).run(pid, tid, tc2, 'Falhou', 'bug de login');
  db.prepare(`INSERT INTO executions (project_id, task_id, test_case_id, result)
    VALUES (?,?,?,?)`).run(pid, tid, tc3, 'Bloqueado');

  db.prepare(`INSERT INTO bugs (project_id, task_id, test_case_id, code, title, severity, status)
    VALUES (?,?,?,?,?,?,?)`).run(pid, tid, tc2, 'BUG-001', 'Bug no login', 'Alta', 'Aberto');
  return { pid, tid, tc1, tc2, tc3, tc4, r1, r2 };
}

/** Extrai o handler da rota GET /task/:taskId do router. */
function routeHandler(reports) {
  const layer = reports.stack.find((l) => l.route && l.route.path === '/task/:taskId');
  assert.ok(layer, 'rota /task/:taskId registrada');
  return layer.route.stack[0].handle;
}

async function callHandler(handler, taskId) {
  let status = 200;
  let body;
  const req = { params: { taskId: String(taskId) } };
  const res = {
    status(s) { status = s; return this; },
    json(b) { body = b; }
  };
  await handler(req, res);
  return { status, body };
}

test('rota /task/:taskId registrada no router', () => {
  const db = require('../server/db.js');
  const reports = require('../server/routes/reports.js')(db);
  routeHandler(reports);
});

test('resposta do relatório tem shape esperado', async () => {
  const db = require('../server/db.js');
  const { tid } = seedTask(db);
  const reports = require('../server/routes/reports.js')(db);
  const handler = routeHandler(reports);

  const { status, body } = await callHandler(handler, tid);

  assert.strictEqual(status, 200);
  assert.strictEqual(body.task.code, 'GMPTL-141');
  assert.strictEqual(body.summary.totalCases, 4);
  assert.strictEqual(body.summary.executedCases, 3);
  assert.strictEqual(body.summary.notExecutedCases, 1);
  assert.strictEqual(body.summary.passed, 1);       // TC-001 (última execução Passou)
  assert.strictEqual(body.summary.failed, 1);       // TC-002
  assert.strictEqual(body.summary.blocked, 1);      // TC-003
  assert.strictEqual(body.summary.passRate, 33);    // 1/3 arredondado
  assert.strictEqual(body.summary.requirements_total, 2);
  assert.strictEqual(body.summary.open_bugs, 1);
  assert.strictEqual(body.cases.length, 4);
  assert.strictEqual(body.requirements.length, 2);

  const tc1 = body.cases.find((c) => c.code === 'TC-001');
  assert.strictEqual(tc1.last_execution.result, 'Passou');
  assert.strictEqual(tc1.last_execution.actual_result, 'segunda');
  assert.strictEqual(tc1.executions_count, 2);
  assert.strictEqual(tc1.requirement_code, 'REQ-001');

  const tc4 = body.cases.find((c) => c.code === 'TC-004');
  assert.strictEqual(tc4.last_execution, null);

  const req1 = body.requirements.find((r) => r.code === 'REQ-001');
  assert.strictEqual(req1.total_cases, 2);
  assert.strictEqual(req1.executed_cases, 2);
  assert.strictEqual(req1.passed, 1);
  assert.strictEqual(req1.failed, 1);

  assert.strictEqual(body.executions.length, 4);
  assert.strictEqual(body.executions[0].result, 'Bloqueado'); // ordem: mais recente primeiro
});

test('relatório retorna 404 para tarefa inexistente', async () => {
  const db = require('../server/db.js');
  const reports = require('../server/routes/reports.js')(db);
  const handler = routeHandler(reports);

  const { status, body } = await callHandler(handler, 999999);

  assert.strictEqual(status, 404);
  assert.ok(body.error);
});
