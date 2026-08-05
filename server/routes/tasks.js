const express = require('express');
const { mergeUpdate } = require('../helpers');

module.exports = (db) => {
  const router = express.Router();

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
    db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
