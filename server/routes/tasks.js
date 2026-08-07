const express = require('express');
const path = require('node:path');
const { mergeUpdate } = require('../helpers');
const {
  saveTaskAttachment, removeTaskAttachment, resolveTaskAttachment, removeTaskAttachmentsByTask, isImage
} = require('../attachments');

module.exports = (db) => {
  const router = express.Router();

  // ---- Anexos da tarefa (materiais para contexto da IA / QA) ----

  /** Lista os anexos de uma tarefa. */
  router.get('/:id/attachments', (req, res) => {
    const row = db.prepare('SELECT id FROM tasks WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const list = db.prepare(
      'SELECT id, task_id, filename, mime, created_at FROM task_attachments WHERE task_id=? ORDER BY id'
    ).all(req.params.id);
    res.json(list);
  });

  /** Upload de anexo (JSON: { filename, data, mime }). */
  router.post('/:id/attachments', (req, res) => {
    const row = db.prepare('SELECT id FROM tasks WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const { filename = '', data = '', mime = '' } = req.body || {};
    const out = saveTaskAttachment(db, req.params.id, filename, data, mime);
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json(out);
  });

  /** Download de um anexo (inline para imagens). */
  router.get('/attachments/:attId', (req, res) => {
    const found = resolveTaskAttachment(db, req.params.attId);
    if (!found) return res.status(404).json({ error: 'Anexo não encontrado' });
    // Filename do usuário não pode injetar aspas/controle no header.
    const safeName = path.basename(found.filename).replace(/["\r\n\u0000-\u001f]/g, '');
    res.setHeader('Content-Disposition', `${isImage(found.abs) ? 'inline' : 'attachment'}; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(found.abs, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'Falha ao enviar o anexo.' });
    });
  });

  /** Remove um anexo (arquivo + linha). */
  router.delete('/attachments/:attId', (req, res) => {
    if (!removeTaskAttachment(db, req.params.attId)) {
      return res.status(404).json({ error: 'Anexo não encontrado' });
    }
    res.json({ ok: true });
  });

  const LIST_SQL = `
    SELECT t.*,
      (SELECT COUNT(*) FROM requirements r WHERE r.task_id = t.id) AS requirements_count,
      (SELECT COUNT(*) FROM test_cases tc WHERE tc.task_id = t.id) AS cases_count,
      (SELECT COUNT(*) FROM bugs b WHERE b.task_id = t.id AND b.status IN ('Aberto','Em Correção')) AS open_bugs_count
    FROM tasks t`;

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId é obrigatório' });
    res.json(db.prepare(`${LIST_SQL} WHERE t.project_id = ? ORDER BY t.code`).all(projectId));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`${LIST_SQL} WHERE t.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    const {
      project_id,
      code,
      title,
      description = '',
      status = 'Aberta',
      priority = 'Média',
      assignee = ''
    } = req.body || {};
    if (!project_id || !title) return res.status(400).json({ error: 'Projeto e título são obrigatórios' });
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    const c = code || db.nextCode('tasks', 'TAR', project_id);
    try {
      const r = db.prepare(
        `INSERT INTO tasks (project_id, code, title, description, status, priority, assignee)
         VALUES (?,?,?,?,?,?,?)`
      ).run(project_id, c, title, description, status, priority, assignee);
      res.status(201).json({ id: Number(r.lastInsertRowid), code: c });
    } catch (err) {
      if (String(err.message || '').includes('UNIQUE')) {
        return res.status(400).json({ error: 'Código de tarefa já existe neste projeto' });
      }
      throw err;
    }
  });

  router.put('/:id', (req, res) => {
    const keys = ['code', 'title', 'description', 'status', 'priority', 'assignee'];
    const cur = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const m = mergeUpdate(cur, req.body || {}, keys);
    db.prepare(
      `UPDATE tasks SET code=?, title=?, description=?, status=?, priority=?, assignee=?,
        updated_at=datetime('now') WHERE id=?`
    ).run(m.code, m.title, m.description, m.status, m.priority, m.assignee, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const cur = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Tarefa não encontrada' });
    removeTaskAttachmentsByTask(db, req.params.id);
    db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
