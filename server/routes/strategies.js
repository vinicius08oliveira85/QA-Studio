const express = require('express');
const { validateTaskOwnership, mergeUpdate } = require('../helpers');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId, taskId } = req.query;
    const base = `
      SELECT s.*,
        r.code AS requirement_code, r.title AS requirement_title,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.strategy_id = s.id) AS cases_count
      FROM test_strategies s
      LEFT JOIN requirements r ON r.id = s.requirement_id`;
    if (taskId) {
      return res.json(db.prepare(`${base} WHERE s.task_id = ? ORDER BY s.name`).all(taskId));
    }
    if (projectId) {
      return res.json(db.prepare(`${base} WHERE s.project_id = ? ORDER BY s.name`).all(projectId));
    }
    return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT s.*,
        r.code AS requirement_code, r.title AS requirement_title,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.strategy_id = s.id) AS cases_count
      FROM test_strategies s
      LEFT JOIN requirements r ON r.id = s.requirement_id
      WHERE s.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Estratégia não encontrada' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { project_id, task_id, requirement_id, name, description = '', approach = '', risk_scope = '', entry_criteria = '', exit_criteria = '', status = 'Ativo', source = 'manual' } = req.body || {};
    if (!task_id || !name) return res.status(400).json({ error: 'Tarefa e nome são obrigatórios' });
    const owned = validateTaskOwnership(db, task_id, project_id);
    if (owned.error) return res.status(owned.status).json({ error: owned.error });
    const projectId = project_id || owned.task.project_id;
    const r = db.prepare(
      'INSERT INTO test_strategies (project_id, task_id, requirement_id, name, description, approach, risk_scope, entry_criteria, exit_criteria, status, source) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(projectId, task_id, requirement_id || null, name, description, approach, risk_scope, entry_criteria, exit_criteria, status, source);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const keys = ['requirement_id', 'name', 'description', 'approach', 'risk_scope', 'entry_criteria', 'exit_criteria', 'status', 'source'];
    const cur = db.prepare('SELECT * FROM test_strategies WHERE id = ?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Estratégia não encontrada' });
    const m = mergeUpdate(cur, req.body || {}, keys);
    db.prepare("UPDATE test_strategies SET requirement_id=?, name=?, description=?, approach=?, risk_scope=?, entry_criteria=?, exit_criteria=?, status=?, source=?, updated_at=datetime('now') WHERE id=?")
      .run(m.requirement_id, m.name, m.description, m.approach, m.risk_scope, m.entry_criteria, m.exit_criteria, m.status, m.source, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare('SELECT id FROM test_strategies WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Estratégia não encontrada' });
    db.prepare('DELETE FROM test_strategies WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
