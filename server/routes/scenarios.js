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
    const { projectId } = req.query;
    res.json(db.prepare(`${LIST_SQL} WHERE sc.project_id = ? ORDER BY sc.title`).all(projectId));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`${LIST_SQL} WHERE sc.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cenário não encontrado' });
    row.test_cases = db.prepare('SELECT * FROM test_cases WHERE scenario_id = ? ORDER BY code').all(req.params.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { project_id, requirement_id, title, description = '', preconditions = '' } = req.body || {};
    if (!project_id || !title) return res.status(400).json({ error: 'Projeto e título são obrigatórios' });
    const r = db.prepare(
      'INSERT INTO test_scenarios (project_id, requirement_id, title, description, preconditions) VALUES (?,?,?,?,?)'
    ).run(project_id, requirement_id || null, title, description, preconditions);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { requirement_id, title, description, preconditions } = req.body || {};
    db.prepare("UPDATE test_scenarios SET requirement_id=?, title=?, description=?, preconditions=?, updated_at=datetime('now') WHERE id=?")
      .run(requirement_id || null, title, description, preconditions, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM test_scenarios WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
