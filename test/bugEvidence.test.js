const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Subdiretório único: isola o banco E o diretório de anexos (dirname do db) de outras suítes.
const tmpDir = path.join(os.tmpdir(), `qa-bugevidence-${process.pid}`);
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
  const tc = Number(db.prepare('INSERT INTO test_cases (project_id, task_id, code, title) VALUES (?,?,?,?)')
    .run(pid, tid, 'TC-001', 'Caso').lastInsertRowid);
  const bug = Number(db.prepare(
    'INSERT INTO bugs (project_id, task_id, test_case_id, code, title) VALUES (?,?,?,?,?)'
  ).run(pid, tid, tc, 'BUG-001', 'Bug').lastInsertRowid);
  return { pid, tid, tc, bug };
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

test('coluna attachment_path existe em bugs (migração)', () => {
  const db = require('../server/db.js');
  const cols = db.prepare('PRAGMA table_info(bugs)').all().map((c) => c.name);
  assert.ok(cols.includes('attachment_path'));
});

test('POST /:id/attachment (bug) grava arquivo e atualiza attachment_path', async () => {
  const db = require('../server/db.js');
  const { bug } = seed(db);
  const bugs = require('../server/routes/bugs.js')(db);
  const handler = routeHandler(bugs, 'post', '/:id/attachment');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const res = makeRes();
  await call(handler, { params: { id: String(bug) }, body: { filename: 'bug-shot.png', data: png.toString('base64') } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(res.body?.ok);
  assert.ok(res.body.attachment_path.startsWith('attachments/'));

  const row = db.prepare('SELECT attachment_path FROM bugs WHERE id=?').get(bug);
  assert.strictEqual(row.attachment_path, res.body.attachment_path);
  const abs = path.join(db.attachmentsDir(), path.basename(row.attachment_path));
  assert.ok(fs.existsSync(abs), 'arquivo de evidência do bug gravado em disco');
});

test('POST /:id/attachment (bug) rejeita extensão não permitida', async () => {
  const db = require('../server/db.js');
  const { bug } = seed(db);
  const bugs = require('../server/routes/bugs.js')(db);
  const handler = routeHandler(bugs, 'post', '/:id/attachment');
  const res = makeRes();
  await call(handler, {
    params: { id: String(bug) },
    body: { filename: 'malware.exe', data: Buffer.from('x').toString('base64') }
  }, res);
  assert.strictEqual(res.lastStatus, 400);
  assert.ok(/não permitida/.test(res.body.error));
});

test('POST /:id/attachment (bug) sobrescreve evidência anterior', async () => {
  const db = require('../server/db.js');
  const { bug } = seed(db);
  const bugs = require('../server/routes/bugs.js')(db);
  const handler = routeHandler(bugs, 'post', '/:id/attachment');

  const a = Buffer.from('AAAA').toString('base64');
  const b = Buffer.from('BBBB').toString('base64');
  let res = makeRes();
  await call(handler, { params: { id: String(bug) }, body: { filename: 'a.png', data: a } }, res);
  const first = res.body.attachment_path;
  res = makeRes();
  await call(handler, { params: { id: String(bug) }, body: { filename: 'b.png', data: b } }, res);
  const second = res.body.attachment_path;
  assert.notStrictEqual(first, second);

  const row = db.prepare('SELECT attachment_path FROM bugs WHERE id=?').get(bug);
  assert.strictEqual(row.attachment_path, second);
  const oldAbs = path.join(db.attachmentsDir(), path.basename(first));
  assert.ok(!fs.existsSync(oldAbs), 'arquivo antigo removido');
});

test('GET /:id/attachment (bug) devolve 404 sem evidência', () => {
  const db = require('../server/db.js');
  const { bug } = seed(db);
  const bugs = require('../server/routes/bugs.js')(db);
  const handler = routeHandler(bugs, 'get', '/:id/attachment');
  const res = makeRes();
  call(handler, { params: { id: String(bug) } }, res);
  assert.strictEqual(res.lastStatus, 404);
});

test('GET /:id/attachment (bug) serve o arquivo quando existe', async () => {
  const db = require('../server/db.js');
  const { bug } = seed(db);
  const bugs = require('../server/routes/bugs.js')(db);
  const up = routeHandler(bugs, 'post', '/:id/attachment');
  const down = routeHandler(bugs, 'get', '/:id/attachment');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let res = makeRes();
  await call(up, { params: { id: String(bug) }, body: { filename: 'shot.png', data: png.toString('base64') } }, res);
  res = makeRes();
  call(down, { params: { id: String(bug) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(res.sentFile && fs.existsSync(res.sentFile));
});

test('DELETE /:id/attachment (bug) remove arquivo e limpa o campo', async () => {
  const db = require('../server/db.js');
  const { bug } = seed(db);
  const bugs = require('../server/routes/bugs.js')(db);
  const up = routeHandler(bugs, 'post', '/:id/attachment');
  const del = routeHandler(bugs, 'delete', '/:id/attachment');

  let res = makeRes();
  await call(up, { params: { id: String(bug) }, body: { filename: 'a.png', data: Buffer.from('AAAA').toString('base64') } }, res);
  const saved = res.body.attachment_path;
  const abs = path.join(db.attachmentsDir(), path.basename(saved));
  assert.ok(fs.existsSync(abs));

  res = makeRes();
  call(del, { params: { id: String(bug) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  const row = db.prepare('SELECT attachment_path FROM bugs WHERE id=?').get(bug);
  assert.strictEqual(row.attachment_path, '');
  assert.ok(!fs.existsSync(abs), 'arquivo removido do disco');
});

test('DELETE /:id (bug) também remove o arquivo de evidência', async () => {
  const db = require('../server/db.js');
  const { bug } = seed(db);
  const bugs = require('../server/routes/bugs.js')(db);
  const up = routeHandler(bugs, 'post', '/:id/attachment');
  const del = routeHandler(bugs, 'delete', '/:id');

  let res = makeRes();
  await call(up, { params: { id: String(bug) }, body: { filename: 'a.png', data: Buffer.from('AAAA').toString('base64') } }, res);
  const saved = res.body.attachment_path;
  const abs = path.join(db.attachmentsDir(), path.basename(saved));
  assert.ok(fs.existsSync(abs));

  res = makeRes();
  call(del, { params: { id: String(bug) } }, res);
  assert.strictEqual(res.lastStatus, 200);
  assert.ok(!fs.existsSync(abs), 'evidência removida junto com o bug');
});
