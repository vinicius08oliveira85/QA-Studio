const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    res.json(db.prepare(`
      SELECT a.*, tc.code AS test_case_code, tc.title AS test_case_title
      FROM automations a
      LEFT JOIN test_cases tc ON tc.id = a.test_case_id
      WHERE a.project_id = ? ORDER BY a.updated_at DESC
    `).all(projectId));
  });

  // Casos candidatos a automação (processos repetitivos)
  router.get('/suggestions', (req, res) => {
    const { projectId } = req.query;
    res.json(db.prepare(`
      SELECT tc.id, tc.code, tc.title, tc.type, tc.execution_mode, tc.automation_tool,
        tc.regression_relevant,
        (SELECT COUNT(*) FROM executions e WHERE e.test_case_id = tc.id) AS exec_count,
        (SELECT COUNT(*) FROM test_mass tm WHERE tm.test_case_id = tc.id) AS mass_count
      FROM test_cases tc
      WHERE tc.project_id = ? AND tc.automated = 0
      ORDER BY exec_count DESC, tc.code
    `).all(projectId));
  });

  router.post('/', (req, res) => {
    const { project_id, test_case_id, title, description = '', tool = '', frequency = '', owner = '', status = 'Sugerido' } = req.body || {};
    if (!project_id || !title) return res.status(400).json({ error: 'Projeto e título são obrigatórios' });
    const r = db.prepare(
      'INSERT INTO automations (project_id, test_case_id, title, description, tool, frequency, owner, status) VALUES (?,?,?,?,?,?,?,?)'
    ).run(project_id, test_case_id || null, title, description, tool, frequency, owner, status);
    if (test_case_id) {
      db.prepare("UPDATE test_cases SET automated=1, automation_tool=?, updated_at=datetime('now') WHERE id=?").run(tool, test_case_id);
    }
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { test_case_id, title, description, tool, frequency, owner, status } = req.body || {};
    db.prepare("UPDATE automations SET test_case_id=?, title=?, description=?, tool=?, frequency=?, owner=?, status=?, updated_at=datetime('now') WHERE id=?")
      .run(test_case_id || null, title, description, tool, frequency, owner, status, req.params.id);
    if (test_case_id) {
      db.prepare("UPDATE test_cases SET automated=1, automation_tool=?, updated_at=datetime('now') WHERE id=?").run(tool || '', test_case_id);
    }
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const a = db.prepare('SELECT * FROM automations WHERE id=?').get(req.params.id);
    db.prepare('DELETE FROM automations WHERE id=?').run(req.params.id);
    if (a?.test_case_id) {
      db.prepare("UPDATE test_cases SET automated=0, updated_at=datetime('now') WHERE id=?").run(a.test_case_id);
    }
    res.json({ ok: true });
  });

  return router;
};
