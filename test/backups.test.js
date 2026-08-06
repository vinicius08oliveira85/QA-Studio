const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDb = path.join(os.tmpdir(), `qa-backup-${process.pid}.db`);
const artifacts = [tmpDb, tmpDb + '-wal', tmpDb + '-shm'];

let server;
let base;

before(async () => {
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  process.env.QA_DB_PATH = tmpDb;
  process.env.VERCEL = '1'; // server/index.js não faz listen automático

  const app = require('../server/index.js');
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  delete process.env.QA_DB_PATH;
  delete process.env.VERCEL;
});

async function call(method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${p} -> ${res.status}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  return txt ? JSON.parse(txt) : {};
}

test('export/import de projeto preserva dados e remapeia FKs', async () => {
  // 1. Cria projeto de origem com dados em todas as áreas
  const pid = (await call('POST', '/projects', { name: 'Backup Demo', system: 'Portal Web' })).id;
  const tid = (await call('POST', '/tasks', { project_id: pid, title: 'Tarefa 1' })).id;

  const req1 = await call('POST', '/requirements', { project_id: pid, task_id: tid, title: 'Login', priority: 'Alta' });
  await call('POST', `/requirements/${req1.id}/business-rules`, { rule: 'Senha mínima de 8 caracteres' });

  const strat = await call('POST', '/strategies', { project_id: pid, task_id: tid, name: 'Estratégia v1' });
  const scen = await call('POST', '/scenarios', { project_id: pid, task_id: tid, requirement_id: req1.id, title: 'Cenário login' });

  const tc1 = await call('POST', '/test-cases', {
    project_id: pid, task_id: tid, scenario_id: scen.id, requirement_id: req1.id, strategy_id: strat.id,
    title: 'Login com sucesso', type: 'Funcional', priority: 'Alta', regression_relevant: 1,
    steps: [{ order: 1, action: 'Abrir portal', expected: 'Login exibido' }]
  });
  await call('POST', `/test-cases/${tc1.id}/test-mass`, { name: 'Usuários', data: 'maria@empresa.com' });

  const ex1 = await call('POST', '/executions', {
    project_id: pid, task_id: tid, test_case_id: tc1.id, environment: 'Homologação', result: 'Passou',
    step_results: [{ step_order: 1, result: 'Passou', actual: 'ok' }]
  });

  const bug = await call('POST', '/bugs', {
    project_id: pid, task_id: tid, execution_id: ex1.id, test_case_id: tc1.id, title: 'Bug no login', severity: 'Alta'
  });
  await call('POST', `/bugs/${bug.id}/retests`, { result: 'Passou', notes: 'Corrigido' });

  const run = await call('POST', '/regressions', { project_id: pid, name: 'Regressão R1' });
  await call('POST', `/regressions/${run.id}/cases`, { test_case_id: tc1.id });

  const rel = await call('POST', '/releases', { project_id: pid, name: 'Release 1', version: '1.0.0' });
  await call('POST', `/releases/${rel.id}/requirements`, { requirement_id: req1.id });

  await call('POST', '/automations', { project_id: pid, test_case_id: tc1.id, title: 'Automatizar login', tool: 'Playwright' });

  // 2. Export: conteúdo esperado e nada de settings (chave Gemini)
  const data = await call('GET', `/backups/projects/${pid}/export`);
  assert.strictEqual(data.app, 'qa-studio');
  assert.strictEqual(data.type, 'project-export');
  assert.strictEqual(data.version, 1);
  assert.strictEqual(data.project.name, 'Backup Demo');
  assert.strictEqual(data.tasks.length, 1);
  assert.strictEqual(data.requirements.length, 1);
  assert.strictEqual(data.business_rules.length, 1);
  assert.strictEqual(data.test_strategies.length, 1);
  assert.strictEqual(data.test_scenarios.length, 1);
  assert.strictEqual(data.test_cases.length, 1);
  assert.strictEqual(data.test_mass.length, 1);
  assert.strictEqual(data.executions.length, 1);
  assert.strictEqual(data.execution_steps.length, 1);
  assert.strictEqual(data.bugs.length, 1);
  assert.strictEqual(data.bug_retests.length, 1);
  assert.strictEqual(data.regression_runs.length, 1);
  assert.strictEqual(data.regression_run_cases.length, 1);
  assert.strictEqual(data.releases.length, 1);
  assert.strictEqual(data.release_requirements.length, 1);
  assert.strictEqual(data.automations.length, 1);
  assert.ok(!('settings' in data), 'settings não são exportadas');
  assert.strictEqual(JSON.parse(data.test_cases[0].steps)[0].action, 'Abrir portal');

  // 3. Import: projeto novo com ids remapeados
  const result = await call('POST', '/backups/import', data);
  assert.ok(result.id && result.id !== pid, 'importa com id novo');
  assert.strictEqual(result.name, 'Backup Demo');
  assert.strictEqual(result.counts.tasks, 1);
  assert.strictEqual(result.counts.cases, 1);
  assert.strictEqual(result.counts.bugs, 1);

  const db = require('../server/db.js');
  const importedBug = db.prepare('SELECT * FROM bugs WHERE project_id = ?').get(result.id);
  assert.ok(importedBug, 'bug importado');
  const importedExec = db.prepare('SELECT * FROM executions WHERE id = ?').get(importedBug.execution_id);
  const importedCase = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(importedBug.test_case_id);
  const importedReq = db.prepare('SELECT * FROM requirements WHERE id = ?').get(importedCase.requirement_id);
  assert.strictEqual(importedExec.project_id, result.id, 'execução remapeada para o novo projeto');
  assert.strictEqual(importedCase.project_id, result.id, 'caso remapeado para o novo projeto');
  assert.ok(importedReq.task_id, 'requisito com task remapeada');
  assert.strictEqual(importedBug.test_case_id, importedCase.id, 'bug aponta para o caso importado');
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS c FROM bug_retests WHERE bug_id = ?').get(importedBug.id).c, 1
  );
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS c FROM regression_run_cases WHERE test_case_id = ?').get(importedCase.id).c, 1
  );
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS c FROM release_requirements WHERE requirement_id = ?').get(importedReq.id).c, 1
  );

  // 4. Re-export do importado: mesmo conteúdo
  const data2 = await call('GET', `/backups/projects/${result.id}/export`);
  assert.strictEqual(data2.project.name, 'Backup Demo');
  assert.strictEqual(data2.test_cases.length, 1);
  assert.strictEqual(data2.bug_retests.length, 1);
  assert.strictEqual(data2.release_requirements.length, 1);
});

test('import rejeita backups inválidos sem alterar nada', async () => {
  const db = require('../server/db.js');
  const beforeCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c;

  let err;
  try { await call('POST', '/backups/import', { foo: 1 }); } catch (e) { err = e; }
  assert.ok(err && err.status === 400, 'assinatura inválida rejeitada');

  try {
    await call('POST', '/backups/import', { app: 'qa-studio', type: 'project-export', version: 99, project: { name: 'X' }, tasks: [] });
  } catch (e) { err = e; }
  assert.ok(err && err.status === 400, 'versão inválida rejeitada');

  try {
    await call('POST', '/backups/import', { app: 'qa-studio', type: 'project-export', version: 1, project: null, tasks: [] });
  } catch (e) { err = e; }
  assert.ok(err && err.status === 400, 'projeto ausente rejeitado');

  const afterCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c;
  assert.strictEqual(afterCount, beforeCount, 'nenhum projeto criado nos casos inválidos');
});

test('export de projeto inexistente retorna 404', async () => {
  let err;
  try { await call('GET', '/backups/projects/999999/export'); } catch (e) { err = e; }
  assert.ok(err && err.status === 404);
});
