const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDir = path.join(os.tmpdir(), `qa-taskatt-${process.pid}`);
const tmpDb = path.join(tmpDir, 'qa.db');

before(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.env.QA_DB_PATH = tmpDb;
});

after(() => {
  try { require('../server/db.js').close(); } catch { /* já fechado */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* melhor esforço */ }
  delete process.env.QA_DB_PATH;
});

function seed(db) {
  const pid = Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run('Proj').lastInsertRowid);
  const tid = Number(db.prepare('INSERT INTO tasks (project_id, code, title) VALUES (?,?,?)')
    .run(pid, 'TAR-001', 'Tarefa').lastInsertRowid);
  return { pid, tid };
}

function routeHandler(router, method, p) {
  const layer = router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
  assert.ok(layer, `rota ${method.toUpperCase()} ${p} registrada`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('tabela task_attachments existe no schema', () => {
  const db = require('../server/db.js');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(tables.includes('task_attachments'));
});

test('POST /:id/attachments grava arquivo e registra o anexo', async () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  const tasks = require('../server/routes/tasks.js')(db);
  const handler = routeHandler(tasks, 'post', '/:id/attachments');

  const res = makeRes();
  const req = {
    params: { id: String(tid) },
    body: { filename: 'print.png', mime: 'image/png', data: PNG.toString('base64') }
  };
  await call(handler, req, res);
  assert.strictEqual(res.lastStatus, 201);
  assert.ok(res.body.id);
  assert.ok(res.body.path.startsWith('attachments/'));

  const row = db.prepare('SELECT * FROM task_attachments WHERE id=?').get(res.body.id);
  assert.strictEqual(row.task_id, tid);
  assert.strictEqual(row.filename, 'print.png');
  const abs = path.join(db.attachmentsDir(), path.basename(row.path));
  assert.ok(fs.existsSync(abs), 'arquivo gravado em disco');
});

test('POST /:id/attachments rejeita extensão não permitida', async () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  const tasks = require('../server/routes/tasks.js')(db);
  const handler = routeHandler(tasks, 'post', '/:id/attachments');

  const res = makeRes();
  await call(handler, {
    params: { id: String(tid) },
    body: { filename: 'script.exe', data: Buffer.from('x').toString('base64') }
  }, res);
  assert.strictEqual(res.lastStatus, 400);
  assert.ok(/não permitida/.test(res.body.error));
});

test('POST /:id/attachments rejeita dados vazios', async () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  const tasks = require('../server/routes/tasks.js')(db);
  const handler = routeHandler(tasks, 'post', '/:id/attachments');
  const res = makeRes();
  await call(handler, { params: { id: String(tid) }, body: { filename: 'a.png', data: '' } }, res);
  assert.strictEqual(res.lastStatus, 400);
  assert.ok(/vazio/.test(res.body.error));
});

test('GET /:id/attachments com tarefa inexistente devolve 404', () => {
  const db = require('../server/db.js');
  const tasks = require('../server/routes/tasks.js')(db);
  const handler = routeHandler(tasks, 'get', '/:id/attachments');
  const res = makeRes();
  call(handler, { params: { id: '99999' } }, res);
  assert.strictEqual(res.lastStatus, 404);
});

test('POST /:id/attachments com tarefa inexistente devolve 404', async () => {
  const db = require('../server/db.js');
  const tasks = require('../server/routes/tasks.js')(db);
  const handler = routeHandler(tasks, 'post', '/:id/attachments');
  const res = makeRes();
  await call(handler, { params: { id: '99999' }, body: { filename: 'a.txt', data: Buffer.from('a').toString('base64') } }, res);
  assert.strictEqual(res.lastStatus, 404);
});

test('GET /:id/attachments lista os anexos de uma tarefa', async () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  const tasks = require('../server/routes/tasks.js')(db);
  const up = routeHandler(tasks, 'post', '/:id/attachments');
  const list = routeHandler(tasks, 'get', '/:id/attachments');

  for (const f of ['a.png', 'spec.txt']) {
    await call(up, { params: { id: String(tid) }, body: { filename: f, data: Buffer.from(f).toString('base64') } }, makeRes());
  }
  const res = makeRes();
  call(list, { params: { id: String(tid) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.strictEqual(res.body.length, 2);
  const names = res.body.map((a) => a.filename).sort();
  assert.deepStrictEqual(names, ['a.png', 'spec.txt']);
  // Não expõe o caminho interno
  assert.ok(res.body.every((a) => !('path' in a)));
});

test('GET /attachments/:attId serve o arquivo; 404 sem anexo', async () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  const tasks = require('../server/routes/tasks.js')(db);
  const up = routeHandler(tasks, 'post', '/:id/attachments');
  const down = routeHandler(tasks, 'get', '/attachments/:attId');

  let res = makeRes();
  await call(up, { params: { id: String(tid) }, body: { filename: 'shot.png', data: PNG.toString('base64') } }, res);
  const attId = res.body.id;

  res = makeRes();
  call(down, { params: { attId: String(attId) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(res.sentFile && fs.existsSync(res.sentFile));

  res = makeRes();
  call(down, { params: { attId: '99999' } }, res);
  assert.strictEqual(res.lastStatus, 404);
});

test('DELETE /attachments/:attId remove arquivo e linha', async () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  const tasks = require('../server/routes/tasks.js')(db);
  const up = routeHandler(tasks, 'post', '/:id/attachments');
  const del = routeHandler(tasks, 'delete', '/attachments/:attId');

  let res = makeRes();
  await call(up, { params: { id: String(tid) }, body: { filename: 'a.png', data: PNG.toString('base64') } }, res);
  const attId = res.body.id;
  const savedPath = db.prepare('SELECT path FROM task_attachments WHERE id=?').get(attId).path;
  const abs = path.join(db.attachmentsDir(), path.basename(savedPath));
  assert.ok(fs.existsSync(abs));

  res = makeRes();
  call(del, { params: { attId: String(attId) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(!fs.existsSync(abs), 'arquivo removido do disco');
  const row = db.prepare('SELECT id FROM task_attachments WHERE id=?').get(attId);
  assert.strictEqual(row, undefined);
});

test('DELETE /:id (tarefa) também remove os arquivos anexados', async () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  const tasks = require('../server/routes/tasks.js')(db);
  const up = routeHandler(tasks, 'post', '/:id/attachments');
  const del = routeHandler(tasks, 'delete', '/:id');

  let res = makeRes();
  await call(up, { params: { id: String(tid) }, body: { filename: 'a.png', data: PNG.toString('base64') } }, res);
  const savedPath = db.prepare('SELECT path FROM task_attachments WHERE id=?').get(res.body.id).path;
  const abs = path.join(db.attachmentsDir(), path.basename(savedPath));
  assert.ok(fs.existsSync(abs));

  res = makeRes();
  call(del, { params: { id: String(tid) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(!fs.existsSync(abs), 'anexo removido junto com a tarefa');
});

function call(handler, req, res) {
  return handler(req, res);
}
