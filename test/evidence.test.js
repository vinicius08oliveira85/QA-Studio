const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDb = path.join(os.tmpdir(), `qa-evidence-${process.pid}.db`);
const artifacts = [tmpDb, tmpDb + '-wal', tmpDb + '-shm'];

before(() => {
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  process.env.QA_DB_PATH = tmpDb;
});

after(() => {
  for (const f of artifacts) { try { fs.rmSync(f, { force: true }); } catch {} }
  delete process.env.QA_DB_PATH;
});

function seed(db) {
  const pid = Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run('Proj').lastInsertRowid);
  const tid = Number(db.prepare('INSERT INTO tasks (project_id, code, title) VALUES (?,?,?)')
    .run(pid, 'TAR-001', 'Tarefa').lastInsertRowid);
  const tc = Number(db.prepare('INSERT INTO test_cases (project_id, task_id, code, title, steps) VALUES (?,?,?,?,?)')
    .run(pid, tid, 'TC-001', 'Caso', JSON.stringify([{ order: 1, action: 'A', expected: 'B' }])).lastInsertRowid);
  const ex = Number(db.prepare(
    'INSERT INTO executions (project_id, task_id, test_case_id, result) VALUES (?,?,?,?)'
  ).run(pid, tid, tc, 'Passou').lastInsertRowid);
  return { pid, tid, tc, ex };
}

/** Extrai o handler de uma rota do router. */
function routeHandler(router, method, p) {
  const layer = router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
  assert.ok(layer, `rota ${method.toUpperCase()} ${p} registrada`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function call(handler, req, res) {
  return handler(req, res);
}

function makeRes() {
  let status = 200;
  let body;
  let sent;
  return {
    status(s) { status = s; return this; },
    json(b) { body = b; },
    sendFile(abs, cb) { sent = abs; if (cb) cb(); },
    setHeader() {},
    get lastStatus() { return status; },
    get body() { return body; },
    get sentFile() { return sent; }
  };
}

test('coluna attachment_path existe em executions (migração)', () => {
  const db = require('../server/db.js');
  const cols = db.prepare('PRAGMA table_info(executions)').all().map((c) => c.name);
  assert.ok(cols.includes('attachment_path'));
});

test('POST /:id/attachment grava arquivo e atualiza attachment_path', async () => {
  const db = require('../server/db.js');
  const { ex } = seed(db);
  const executions = require('../server/routes/executions.js')(db);
  const handler = routeHandler(executions, 'post', '/:id/attachment');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const res = makeRes();
  const req = {
    params: { id: String(ex) },
    body: { filename: 'screenshot.png', data: png.toString('base64') }
  };
  await call(handler, req, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(res.body?.ok);
  assert.ok(res.body.attachment_path.startsWith('attachments/'));

  const row = db.prepare('SELECT attachment_path FROM executions WHERE id=?').get(ex);
  assert.strictEqual(row.attachment_path, res.body.attachment_path);
  const abs = path.join(db.attachmentsDir(), path.basename(row.attachment_path));
  assert.ok(fs.existsSync(abs), 'arquivo de evidência gravado em disco');
});

test('POST /:id/attachment rejeita extensão não permitida', async () => {
  const db = require('../server/db.js');
  const { ex } = seed(db);
  const executions = require('../server/routes/executions.js')(db);
  const handler = routeHandler(executions, 'post', '/:id/attachment');
  const res = makeRes();
  const req = {
    params: { id: String(ex) },
    body: { filename: 'malware.exe', data: Buffer.from('x').toString('base64') }
  };
  await call(handler, req, res);
  assert.strictEqual(res.lastStatus, 400);
  assert.ok(/não permitida/.test(res.body.error));
});

test('POST /:id/attachment sobrescreve evidência anterior', async () => {
  const db = require('../server/db.js');
  const { ex } = seed(db);
  const executions = require('../server/routes/executions.js')(db);
  const handler = routeHandler(executions, 'post', '/:id/attachment');

  const a = Buffer.from('AAAA').toString('base64');
  const b = Buffer.from('BBBB').toString('base64');
  let res = makeRes();
  await call(handler, { params: { id: String(ex) }, body: { filename: 'a.png', data: a } }, res);
  const first = res.body.attachment_path;
  res = makeRes();
  await call(handler, { params: { id: String(ex) }, body: { filename: 'b.png', data: b } }, res);
  const second = res.body.attachment_path;
  assert.notStrictEqual(first, second);

  const row = db.prepare('SELECT attachment_path FROM executions WHERE id=?').get(ex);
  assert.strictEqual(row.attachment_path, second);
  // arquivo antigo removido
  const oldAbs = path.join(db.attachmentsDir(), path.basename(first));
  assert.ok(!fs.existsSync(oldAbs), 'arquivo antigo removido');
});

test('GET /:id/attachment devolve 404 sem evidência', () => {
  const db = require('../server/db.js');
  const { ex } = seed(db);
  const executions = require('../server/routes/executions.js')(db);
  const handler = routeHandler(executions, 'get', '/:id/attachment');
  const res = makeRes();
  call(handler, { params: { id: String(ex) } }, res);
  assert.strictEqual(res.lastStatus, 404);
});

test('GET /:id/attachment serve o arquivo quando existe', async () => {
  const db = require('../server/db.js');
  const { ex } = seed(db);
  const executions = require('../server/routes/executions.js')(db);
  const up = routeHandler(executions, 'post', '/:id/attachment');
  const down = routeHandler(executions, 'get', '/:id/attachment');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let res = makeRes();
  await call(up, { params: { id: String(ex) }, body: { filename: 'shot.png', data: png.toString('base64') } }, res);
  res = makeRes();
  call(down, { params: { id: String(ex) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(res.sentFile && fs.existsSync(res.sentFile));
});

test('DELETE /:id/attachment remove arquivo e limpa o campo', async () => {
  const db = require('../server/db.js');
  const { ex } = seed(db);
  const executions = require('../server/routes/executions.js')(db);
  const up = routeHandler(executions, 'post', '/:id/attachment');
  const del = routeHandler(executions, 'delete', '/:id/attachment');

  let res = makeRes();
  await call(up, { params: { id: String(ex) }, body: { filename: 'a.png', data: Buffer.from('AAAA').toString('base64') } }, res);
  const saved = res.body.attachment_path;
  const abs = path.join(db.attachmentsDir(), path.basename(saved));
  assert.ok(fs.existsSync(abs));

  res = makeRes();
  call(del, { params: { id: String(ex) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  const row = db.prepare('SELECT attachment_path FROM executions WHERE id=?').get(ex);
  assert.strictEqual(row.attachment_path, '');
  assert.ok(!fs.existsSync(abs), 'arquivo removido do disco');
});

test('DELETE /:id (execução) também remove o arquivo de evidência', async () => {
  const db = require('../server/db.js');
  const { ex } = seed(db);
  const executions = require('../server/routes/executions.js')(db);
  const up = routeHandler(executions, 'post', '/:id/attachment');
  const del = routeHandler(executions, 'delete', '/:id');

  let res = makeRes();
  await call(up, { params: { id: String(ex) }, body: { filename: 'a.png', data: Buffer.from('AAAA').toString('base64') } }, res);
  const saved = res.body.attachment_path;
  const abs = path.join(db.attachmentsDir(), path.basename(saved));
  assert.ok(fs.existsSync(abs));

  res = makeRes();
  call(del, { params: { id: String(ex) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(!fs.existsSync(abs), 'evidência removida junto com a execução');
});
