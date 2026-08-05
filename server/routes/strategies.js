const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    res.json(db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.strategy_id = s.id) AS cases_count
      FROM test_strategies s
      WHERE s.project_id = ? ORDER BY s.name
    `).all(projectId));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.strategy_id = s.id) AS cases_count
      FROM test_strategies s WHERE s.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Estratégia não encontrada' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { project_id, name, description = '', approach = '', risk_scope = '', entry_criteria = '', exit_criteria = '', status = 'Ativo' } = req.body || {};
    if (!project_id || !name) return res.status(400).json({ error: 'Projeto e nome são obrigatórios' });
    const r = db.prepare(
      'INSERT INTO test_strategies (project_id, name, description, approach, risk_scope, entry_criteria, exit_criteria, status) VALUES (?,?,?,?,?,?,?,?)'
    ).run(project_id, name, description, approach, risk_scope, entry_criteria, exit_criteria, status);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { name, description, approach, risk_scope, entry_criteria, exit_criteria, status } = req.body || {};
    db.prepare("UPDATE test_strategies SET name=?, description=?, approach=?, risk_scope=?, entry_criteria=?, exit_criteria=?, status=?, updated_at=datetime('now') WHERE id=?")
      .run(name, description, approach, risk_scope, entry_criteria, exit_criteria, status, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM test_strategies WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
