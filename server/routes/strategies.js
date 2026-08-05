const express = require('express');

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
    const task = db.resolveTask(task_id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const projectId = project_id || task.project_id;
    if (Number(projectId) !== Number(task.project_id)) {
      return res.status(400).json({ error: 'Tarefa não pertence ao projeto informado' });
    }
    const r = db.prepare(
      'INSERT INTO test_strategies (project_id, task_id, requirement_id, name, description, approach, risk_scope, entry_criteria, exit_criteria, status, source) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(projectId, task_id, requirement_id || null, name, description, approach, risk_scope, entry_criteria, exit_criteria, status, source);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { requirement_id, name, description, approach, risk_scope, entry_criteria, exit_criteria, status, source } = req.body || {};
    const cur = db.prepare('SELECT * FROM test_strategies WHERE id = ?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Estratégia não encontrada' });
    db.prepare("UPDATE test_strategies SET requirement_id=?, name=?, description=?, approach=?, risk_scope=?, entry_criteria=?, exit_criteria=?, status=?, source=?, updated_at=datetime('now') WHERE id=?")
      .run(
        requirement_id !== undefined ? requirement_id : cur.requirement_id,
        name !== undefined ? name : cur.name,
        description !== undefined ? description : cur.description,
        approach !== undefined ? approach : cur.approach,
        risk_scope !== undefined ? risk_scope : cur.risk_scope,
        entry_criteria !== undefined ? entry_criteria : cur.entry_criteria,
        exit_criteria !== undefined ? exit_criteria : cur.exit_criteria,
        status !== undefined ? status : cur.status,
        source !== undefined ? source : cur.source,
        req.params.id
      );
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM test_strategies WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
