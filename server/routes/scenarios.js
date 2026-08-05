const express = require('express');
const { validateTaskOwnership, mergeUpdate } = require('../helpers');

module.exports = (db) => {
  const router = express.Router();
  const LIST_SQL = `
    SELECT sc.*,
      r.code AS requirement_code, r.title AS requirement_title,
      (SELECT COUNT(*) FROM test_cases tc WHERE tc.scenario_id = sc.id) AS cases_count
    FROM test_scenarios sc
    LEFT JOIN requirements r ON r.id = sc.requirement_id`;

  router.get('/', (req, res) => {
    const { projectId, taskId } = req.query;
    if (taskId) {
      return res.json(db.prepare(`${LIST_SQL} WHERE sc.task_id = ? ORDER BY sc.title`).all(taskId));
    }
    if (projectId) {
      return res.json(db.prepare(`${LIST_SQL} WHERE sc.project_id = ? ORDER BY sc.title`).all(projectId));
    }
    return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`${LIST_SQL} WHERE sc.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cenário não encontrado' });
    row.test_cases = db.prepare('SELECT * FROM test_cases WHERE scenario_id = ? ORDER BY code').all(req.params.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { project_id, task_id, requirement_id, title, description = '', preconditions = '', source = 'manual' } = req.body || {};
    if (!task_id || !title) return res.status(400).json({ error: 'Tarefa e título são obrigatórios' });
    const owned = validateTaskOwnership(db, task_id, project_id);
    if (owned.error) return res.status(owned.status).json({ error: owned.error });
    const projectId = project_id || owned.task.project_id;
    const r = db.prepare(
      'INSERT INTO test_scenarios (project_id, task_id, requirement_id, title, description, preconditions, source) VALUES (?,?,?,?,?,?,?)'
    ).run(projectId, task_id, requirement_id || null, title, description, preconditions, source);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const keys = ['requirement_id', 'title', 'description', 'preconditions', 'source'];
    const cur = db.prepare('SELECT * FROM test_scenarios WHERE id = ?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Cenário não encontrado' });
    const m = mergeUpdate(cur, req.body || {}, keys);
    db.prepare("UPDATE test_scenarios SET requirement_id=?, title=?, description=?, preconditions=?, source=?, updated_at=datetime('now') WHERE id=?")
      .run(m.requirement_id, m.title, m.description, m.preconditions, m.source, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare('SELECT id FROM test_scenarios WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cenário não encontrado' });
    db.prepare('DELETE FROM test_scenarios WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
