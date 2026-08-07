const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDir = path.join(os.tmpdir(), `qa-aiatt-${process.pid}`);
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function seed(db) {
  const pid = Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run('Proj').lastInsertRowid);
  const tid = Number(db.prepare('INSERT INTO tasks (project_id, code, title) VALUES (?,?,?)')
    .run(pid, 'TAR-001', 'Tarefa').lastInsertRowid);
  return { tid };
}

/** Cria um anexo fake: grava o arquivo em disco e insere a linha. */
function addAttachment(db, tid, filename, buf, mime = '') {
  fs.writeFileSync(path.join(db.attachmentsDir(), filename), buf);
  const ins = db.prepare(
    'INSERT INTO task_attachments (task_id, filename, path, mime) VALUES (?,?,?,?)'
  ).run(tid, filename, `attachments/${filename}`, mime);
  return Number(ins.lastInsertRowid);
}

test('anexo de texto entra como parte text com o conteúdo', () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  addAttachment(db, tid, 'especificacao.txt', Buffer.from('Regra 1: apenas usuário logado acessa a fila.\nRegra 2: check-up ativa protocolos.'));
  const { attachmentParts } = require('../server/routes/ai.js');
  const { parts, names } = attachmentParts(db, tid);
  assert.deepStrictEqual(names, ['especificacao.txt']);
  const text = parts.find((p) => p.text && p.text.includes('=== Anexo: especificacao.txt ==='));
  assert.ok(text, 'parte de texto criada');
  assert.ok(text.text.includes('Regra 1: apenas usuário logado'));
});

test('imagem entra como inline_data com mime correto', () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  addAttachment(db, tid, 'print.png', PNG, 'image/png');
  const { attachmentParts } = require('../server/routes/ai.js');
  const { parts } = attachmentParts(db, tid);
  const img = parts.find((p) => p.inline_data);
  assert.ok(img, 'parte inline_data criada');
  assert.strictEqual(img.inline_data.mime_type, 'image/png');
  assert.strictEqual(img.inline_data.data, PNG.toString('base64'));
});

test('mime é derivado da extensão quando ausente', () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  addAttachment(db, tid, 'foto.jpg', Buffer.from('ffd8ff', 'hex')); // mime vazio
  const { attachmentParts } = require('../server/routes/ai.js');
  const { parts } = attachmentParts(db, tid);
  const img = parts.find((p) => p.inline_data);
  assert.ok(img);
  assert.strictEqual(img.inline_data.mime_type, 'image/jpeg');
});

test('pdf/zip viram apenas menção (não-textual)', () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  addAttachment(db, tid, 'manual.pdf', Buffer.from('%PDF-1.4 fake'));
  const { attachmentParts } = require('../server/routes/ai.js');
  const { parts, names } = attachmentParts(db, tid);
  assert.deepStrictEqual(names, ['manual.pdf']);
  assert.ok(parts.some((p) => p.text && p.text.includes('manual.pdf')));
});

test('arquivo inexistente em disco é ignorado', () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  db.prepare('INSERT INTO task_attachments (task_id, filename, path) VALUES (?,?,?)')
    .run(tid, 'sumiu.txt', 'attachments/nao-existe.txt');
  const { attachmentParts } = require('../server/routes/ai.js');
  const { parts, names } = attachmentParts(db, tid);
  assert.deepStrictEqual(parts, []);
  assert.deepStrictEqual(names, []);
});

test('imagem acima de 8MB por arquivo vira menção', () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  addAttachment(db, tid, 'grande.png', Buffer.alloc(9 * 1024 * 1024, 1), 'image/png');
  const { attachmentParts } = require('../server/routes/ai.js');
  const { parts } = attachmentParts(db, tid);
  assert.strictEqual(parts.filter((p) => p.inline_data).length, 0);
  assert.ok(parts.some((p) => p.text && p.text.includes('não-textual')));
});

test('total inline é limitado (2×8MB > 15MB → só a primeira entra)', () => {
  const db = require('../server/db.js');
  const { tid } = seed(db);
  addAttachment(db, tid, 'a.png', Buffer.alloc(8 * 1024 * 1024, 2), 'image/png');
  addAttachment(db, tid, 'b.png', Buffer.alloc(8 * 1024 * 1024, 3), 'image/png');
  const { attachmentParts } = require('../server/routes/ai.js');
  const { parts } = attachmentParts(db, tid);
  const inline = parts.filter((p) => p.inline_data);
  const mentions = parts.filter((p) => p.text && p.text.includes('não-textual'));
  assert.strictEqual(inline.length, 1);   // 8MB cabe sozinho
  assert.strictEqual(mentions.length, 1); // 8+8=16MB > 15MB de teto total
});
