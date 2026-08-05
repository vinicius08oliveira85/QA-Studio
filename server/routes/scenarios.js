const express = require('express');

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
    const task = db.resolveTask(task_id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const projectId = project_id || task.project_id;
    if (Number(projectId) !== Number(task.project_id)) {
      return res.status(400).json({ error: 'Tarefa não pertence ao projeto informado' });
    }
    const r = db.prepare(
      'INSERT INTO test_scenarios (project_id, task_id, requirement_id, title, description, preconditions, source) VALUES (?,?,?,?,?,?,?)'
    ).run(projectId, task_id, requirement_id || null, title, description, preconditions, source);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { requirement_id, title, description, preconditions, source } = req.body || {};
    const cur = db.prepare('SELECT * FROM test_scenarios WHERE id = ?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Cenário não encontrado' });
    db.prepare("UPDATE test_scenarios SET requirement_id=?, title=?, description=?, preconditions=?, source=?, updated_at=datetime('now') WHERE id=?")
      .run(
        requirement_id !== undefined ? requirement_id : cur.requirement_id,
        title !== undefined ? title : cur.title,
        description !== undefined ? description : cur.description,
        preconditions !== undefined ? preconditions : cur.preconditions,
        source !== undefined ? source : cur.source,
        req.params.id
      );
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM test_scenarios WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
