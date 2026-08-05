const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDb = path.join(os.tmpdir(), `qa-unit-${process.pid}.db`);
const artifacts = [tmpDb, tmpDb + '-wal', tmpDb + '-shm'];

before(() => {
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  process.env.QA_DB_PATH = tmpDb;
});

after(() => {
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  delete process.env.QA_DB_PATH;
});

test('db abre contra banco temporário e aplica o schema', () => {
  const db = require('../server/db.js');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(tables.includes('projects'));
  assert.ok(tables.includes('test_cases'));
});

test('db.nextCode gera códigos sequenciais por projeto', () => {
  const db = require('../server/db.js');
  const proj = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Projeto Teste');
  const projectId = Number(proj.lastInsertRowid);
  const task = db.prepare('INSERT INTO tasks (project_id, code, title) VALUES (?, ?, ?)').run(projectId, 'TAR-001', 'Tarefa');
  const taskId = Number(task.lastInsertRowid);

  assert.strictEqual(db.nextCode('requirements', 'REQ', projectId), 'REQ-001');
  db.prepare('INSERT INTO requirements (project_id, task_id, code, title) VALUES (?, ?, ?, ?)').run(projectId, taskId, 'REQ-001', 'Requisito 1');
  assert.strictEqual(db.nextCode('requirements', 'REQ', projectId), 'REQ-002');
  db.prepare('INSERT INTO requirements (project_id, task_id, code, title) VALUES (?, ?, ?, ?)').run(projectId, taskId, 'REQ-007', 'Requisito 7');
  assert.strictEqual(db.nextCode('requirements', 'REQ', projectId), 'REQ-008');
});

test('db.nextCode respeita escopo do projeto', () => {
  const db = require('../server/db.js');
  const p1 = Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run('P1').lastInsertRowid);
  const p2 = Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run('P2').lastInsertRowid);
  const t1 = Number(db.prepare('INSERT INTO tasks (project_id, code, title) VALUES (?, ?, ?)').run(p1, 'TAR-001', 'T').lastInsertRowid);
  const t2 = Number(db.prepare('INSERT INTO tasks (project_id, code, title) VALUES (?, ?, ?)').run(p2, 'TAR-001', 'T').lastInsertRowid);

  db.prepare('INSERT INTO requirements (project_id, task_id, code, title) VALUES (?, ?, ?, ?)').run(p1, t1, 'REQ-001', 'R');
  db.prepare('INSERT INTO requirements (project_id, task_id, code, title) VALUES (?, ?, ?, ?)').run(p2, t2, 'REQ-042', 'R');

  assert.strictEqual(db.nextCode('requirements', 'REQ', p1), 'REQ-002');
  assert.strictEqual(db.nextCode('requirements', 'REQ', p2), 'REQ-043');
});

test('db.tx faz rollback quando a fn lança', () => {
  const db = require('../server/db.js');
  db.prepare('INSERT INTO projects (name) VALUES (?)').run('Ptx');
  assert.throws(() => {
    db.tx(() => {
      db.prepare('INSERT INTO projects (name) VALUES (?)').run('dentro-da-tx');
      throw new Error('falha proposital');
    });
  }, /falha proposital/);
  const found = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE name = ?').get('dentro-da-tx');
  assert.strictEqual(Number(found.c), 0);
});

test('db.tx confirma mudanças sem erro', () => {
  const db = require('../server/db.js');
  db.prepare('INSERT INTO projects (name) VALUES (?)').run('Ptx2');
  const result = db.tx(() => {
    const ins = db.prepare('INSERT INTO projects (name) VALUES (?)').run('confirmada');
    return Number(ins.lastInsertRowid);
  });
  assert.ok(result > 0);
  const found = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE name = ?').get('confirmada');
  assert.strictEqual(Number(found.c), 1);
});

test('db.resolveTask devolve null para id inexistente', () => {
  const db = require('../server/db.js');
  assert.strictEqual(db.resolveTask(999999), null);
});
