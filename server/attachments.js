const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Tipos aceitos no upload de evidência (por extensão)
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf', 'txt', 'log', 'json', 'csv', 'html', 'xml', 'zip']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);

/**
 * Grava a evidência base64 no disco e atualiza attachment_path da linha.
 * table: nome da tabela ('executions' | 'bugs') — valores internos, nunca do usuário.
 * Retorna { attachment_path } ou { error }.
 */
function saveAttachment(db, table, id, filename, data) {
  if (!data) return { error: 'Arquivo vazio' };
  let buf;
  try { buf = Buffer.from(String(data), 'base64'); } catch { return { error: 'Base64 inválido' }; }
  if (buf.length === 0) return { error: 'Arquivo vazio' };

  const ext = (path.extname(String(filename)).replace('.', '') || 'png').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return { error: `Extensão não permitida: .${ext}` };
  }

  const dir = db.attachmentsDir();
  const hash = crypto.createHash('sha1').update(String(data)).digest('hex').slice(0, 12);
  const savedName = `${id}-${hash}.${ext}`;
  const abs = path.join(dir, savedName);
  const rel = `attachments/${savedName}`;

  // Grava o novo arquivo primeiro; só remove o antigo depois de gravar com
  // sucesso (se a gravação falhar, a evidência anterior fica preservada).
  fs.writeFileSync(abs, buf);
  const previous = db.prepare(`SELECT attachment_path FROM ${table} WHERE id=?`).get(id)?.attachment_path;
  if (previous && previous !== rel) removeFileByPath(db, previous);
  db.prepare(`UPDATE ${table} SET attachment_path=? WHERE id=?`).run(rel, id);
  return { attachment_path: rel };
}

/** Remove o arquivo de evidência e (por padrão) limpa o campo no banco. */
function removeAttachment(db, table, id, { clearDb = true } = {}) {
  const row = db.prepare(`SELECT attachment_path FROM ${table} WHERE id=?`).get(id);
  if (row?.attachment_path) removeFileByPath(db, row.attachment_path);
  if (clearDb) db.prepare(`UPDATE ${table} SET attachment_path='' WHERE id=?`).run(id);
}

/** Apaga o arquivo por caminho relativo (sem tocar no banco). */
function removeFileByPath(db, relPath) {
  try {
    const abs = path.join(path.resolve(db.attachmentsDir()), path.basename(relPath));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch { /* arquivo já inexistente */ }
}

/** Caminho absoluto da evidência se existir em disco; null caso contrário. */
function resolveAttachment(db, table, id) {
  const row = db.prepare(`SELECT attachment_path FROM ${table} WHERE id=?`).get(id);
  if (!row?.attachment_path) return null;
  const dir = path.resolve(db.attachmentsDir());
  const abs = path.resolve(path.join(dir, path.basename(row.attachment_path)));
  if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) return null;
  return abs;
}

function isImage(abs) {
  return IMAGE_EXT.has(path.extname(abs).replace('.', '').toLowerCase());
}

/** Extensão permitida de um nome de arquivo (sem o ponto); '' se não permitida. */
function allowedExt(filename) {
  const ext = (path.extname(String(filename)).replace('.', '') || 'png').toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : '';
}

/**
 * Grava um anexo de tarefa (vários por tarefa) e insere na tabela task_attachments.
 * Retorna a linha criada ou { error }.
 */
function saveTaskAttachment(db, taskId, filename, data, mime = '') {
  if (!data) return { error: 'Arquivo vazio' };
  let buf;
  try { buf = Buffer.from(String(data), 'base64'); } catch { return { error: 'Base64 inválido' }; }
  if (buf.length === 0) return { error: 'Arquivo vazio' };

  const ext = allowedExt(filename);
  if (!ext) return { error: `Extensão não permitida: .${(path.extname(String(filename)).replace('.', '') || '?').toLowerCase()}` };

  const dir = db.attachmentsDir();
  const hash = crypto.createHash('sha1').update(String(data)).digest('hex').slice(0, 12);
  const savedName = `task-${taskId}-${hash}.${ext}`;
  const abs = path.join(dir, savedName);
  const rel = `attachments/${savedName}`;

  fs.writeFileSync(abs, buf);
  const safeName = String(filename || 'anexo').slice(0, 200);
  const ins = db.prepare(
    'INSERT INTO task_attachments (task_id, filename, path, mime) VALUES (?,?,?,?)'
  ).run(taskId, safeName, rel, mime);
  return { id: Number(ins.lastInsertRowid), filename: String(filename), path: rel, mime };
}

/** Remove o arquivo de um anexo de tarefa e a linha correspondente. */
function removeTaskAttachment(db, attachmentId) {
  const row = db.prepare('SELECT id, path FROM task_attachments WHERE id=?').get(attachmentId);
  if (!row) return false;
  if (row.path) removeFileByPath(db, row.path);
  db.prepare('DELETE FROM task_attachments WHERE id=?').run(attachmentId);
  return true;
}

/** Caminho absoluto de um anexo de tarefa se existir; null caso contrário. */
function resolveTaskAttachment(db, attachmentId) {
  const row = db.prepare('SELECT id, path, filename FROM task_attachments WHERE id=?').get(attachmentId);
  if (!row) return null;
  const dir = path.resolve(db.attachmentsDir());
  const abs = path.resolve(path.join(dir, path.basename(row.path)));
  if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) return null;
  return { abs, filename: row.filename };
}

/** Apaga os arquivos de todos os anexos de uma tarefa (usar antes de excluir a tarefa). */
function removeTaskAttachmentsByTask(db, taskId) {
  const rows = db.prepare('SELECT id, path FROM task_attachments WHERE task_id=?').all(taskId);
  for (const row of rows) {
    if (row.path) removeFileByPath(db, row.path);
  }
  db.prepare('DELETE FROM task_attachments WHERE task_id=?').run(taskId);
}

module.exports = {
  saveAttachment, removeAttachment, removeFileByPath, resolveAttachment, isImage, allowedExt,
  saveTaskAttachment, removeTaskAttachment, resolveTaskAttachment, removeTaskAttachmentsByTask
};
