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
  db.prepare(`INSERT INTO bugs (project_id, task_id, test_case_id, code, title, severity, status)
    VALUES (?,?,?,?,?,?,?)`).run(pid, tid, tc2, 'BUG-002', 'Bug secundário', 'Baixa', 'Corrigido');
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

  // Novos campos: veredito executivo, bugs em aberto e pontos de atenção
  assert.ok(body.verdict, 'verdict presente');
  assert.ok(['nao_executado', 'apto', 'apto_ressalvas', 'nao_apto', 'em_execucao'].includes(body.verdict.key));
  assert.strictEqual(body.verdict.key, 'nao_apto'); // 1 falha + 1 bloqueio
  assert.strictEqual(body.verdict.tone, 'red');
  assert.ok(body.verdict.label && body.verdict.summary);
  assert.strictEqual(body.open_bugs_list.length, 1);
  assert.strictEqual(body.open_bugs_list[0].code, 'BUG-001');
  assert.strictEqual(body.open_bugs_list[0].severity, 'Alta');
  assert.strictEqual(body.open_bugs_list[0].test_case_code, 'TC-002');
  assert.strictEqual(body.attention_cases.length, 2); // TC-002 falhou e TC-003 bloqueado
  assert.ok(body.attention_cases.some((c) => c.code === 'TC-002' && c.result === 'Falhou'));
  assert.ok(body.attention_cases.some((c) => c.code === 'TC-003' && c.result === 'Bloqueado'));
  assert.ok(body.last_activity, 'last_activity presente');
});

test('veredito apto para tarefa com aprovação total', async () => {
  const db = require('../server/db.js');
  const { tid, tc1, tc2, tc3 } = seedTask(db);
  // Todos os casos passam
  db.prepare("UPDATE executions SET result='Passou' WHERE test_case_id IN (?,?,?)").run(tc1, tc2, tc3);
  db.prepare("UPDATE bugs SET status='Fechado' WHERE task_id=?").run(tid);
  const reports = require('../server/routes/reports.js')(db);
  const handler = routeHandler(reports);
  const { body } = await callHandler(handler, tid);
  assert.strictEqual(body.summary.passRate, 100);
  assert.strictEqual(body.verdict.key, 'apto');
  assert.strictEqual(body.verdict.tone, 'green');
  assert.strictEqual(body.attention_cases.length, 0);
  assert.strictEqual(body.open_bugs_list.length, 0);
});

test('veredito sem execução quando não há execuções', async () => {
  const db = require('../server/db.js');
  const pid = Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run('Proj2').lastInsertRowid);
  const tid = Number(db.prepare('INSERT INTO tasks (project_id, code, title) VALUES (?,?,?)')
    .run(pid, 'TAR-999', 'Tarefa sem execução').lastInsertRowid);
  const reports = require('../server/routes/reports.js')(db);
  const handler = routeHandler(reports);
  const { body } = await callHandler(handler, tid);
  assert.strictEqual(body.summary.executedCases, 0);
  assert.strictEqual(body.verdict.key, 'nao_executado');
  assert.strictEqual(body.verdict.tone, 'gray');
  assert.strictEqual(body.last_activity, null);
});

test('veredito bloqueado quando todos os casos executados estão bloqueados', async () => {
  const db = require('../server/db.js');
  const { tid, tc1, tc2, tc3 } = seedTask(db);
  // Bloqueia todos os casos executados, sem falhas
  db.prepare("UPDATE executions SET result='Bloqueado' WHERE test_case_id IN (?,?,?)").run(tc1, tc2, tc3);
  db.prepare("UPDATE bugs SET status='Fechado' WHERE task_id=?").run(tid);
  const reports = require('../server/routes/reports.js')(db);
  const handler = routeHandler(reports);
  const { body } = await callHandler(handler, tid);
  assert.strictEqual(body.summary.failed, 0);
  assert.strictEqual(body.summary.blocked, 3);
  assert.strictEqual(body.summary.passRate, 0);
  assert.strictEqual(body.verdict.key, 'bloqueado');
  assert.strictEqual(body.verdict.tone, 'red');
  assert.strictEqual(body.attention_cases.length, 3);
});

test('execução pendente impede veredito apto sem ressalvas', async () => {
  const db = require('../server/db.js');
  const { tid, tc1, tc2, tc3 } = seedTask(db);
  // TC-001 e TC-002 passam; TC-003 fica com execução Pendente (inconclusiva)
  db.prepare("UPDATE executions SET result='Passou' WHERE test_case_id IN (?,?)").run(tc1, tc2);
  db.prepare("UPDATE executions SET result='Pendente' WHERE test_case_id=? AND result != 'Passou'")
    .run(tc3);
  db.prepare("UPDATE bugs SET status='Fechado' WHERE task_id=?").run(tid);
  const reports = require('../server/routes/reports.js')(db);
  const handler = routeHandler(reports);
  const { body } = await callHandler(handler, tid);
  // passRate 67% (2/3), sem falhas nem bloqueios → em execução
  assert.strictEqual(body.summary.passRate, 67);
  assert.strictEqual(body.summary.pending, 1);
  assert.notStrictEqual(body.verdict.key, 'apto');
  assert.ok(['em_execucao', 'apto_ressalvas'].includes(body.verdict.key));
});

test('relatório retorna 404 para tarefa inexistente', async () => {
  const db = require('../server/db.js');
  const reports = require('../server/routes/reports.js')(db);
  const handler = routeHandler(reports);

  const { status, body } = await callHandler(handler, 999999);

  assert.strictEqual(status, 404);
  assert.ok(body.error);
});
