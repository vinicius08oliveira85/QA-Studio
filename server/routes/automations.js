const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId é obrigatório' });
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
    if (!projectId) return res.status(400).json({ error: 'projectId é obrigatório' });
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
    if (test_case_id) {
      const tc = db.prepare('SELECT project_id FROM test_cases WHERE id=?').get(test_case_id);
      if (!tc) return res.status(404).json({ error: 'Caso de teste não encontrado' });
      if (Number(tc.project_id) !== Number(project_id)) {
        return res.status(400).json({ error: 'Caso de teste não pertence ao projeto informado' });
      }
    }
    const r = db.tx(() => {
      const ins = db.prepare(
        'INSERT INTO automations (project_id, test_case_id, title, description, tool, frequency, owner, status) VALUES (?,?,?,?,?,?,?,?)'
      ).run(project_id, test_case_id || null, title, description, tool, frequency, owner, status);
      if (test_case_id) {
        db.prepare("UPDATE test_cases SET automated=1, automation_tool=?, updated_at=datetime('now') WHERE id=?").run(tool, test_case_id);
      }
      return Number(ins.lastInsertRowid);
    });
    res.status(201).json({ id: r });
  });

  router.put('/:id', (req, res) => {
    const { test_case_id, title, description, tool, frequency, owner, status } = req.body || {};
    const existing = db.prepare('SELECT id, test_case_id FROM automations WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Automação não encontrada' });
    if (test_case_id) {
      const tc = db.prepare('SELECT project_id FROM test_cases WHERE id=?').get(test_case_id);
      if (!tc) return res.status(404).json({ error: 'Caso de teste não encontrado' });
      const auto = db.prepare('SELECT project_id FROM automations WHERE id=?').get(req.params.id);
      if (Number(tc.project_id) !== Number(auto.project_id)) {
        return res.status(400).json({ error: 'Caso de teste não pertence ao projeto informado' });
      }
    }
    db.tx(() => {
      db.prepare("UPDATE automations SET test_case_id=?, title=?, description=?, tool=?, frequency=?, owner=?, status=?, updated_at=datetime('now') WHERE id=?")
        .run(test_case_id || null, title, description, tool, frequency, owner, status, req.params.id);
      if (test_case_id && Number(test_case_id) !== Number(existing.test_case_id)) {
        db.prepare("UPDATE test_cases SET automated=1, automation_tool=?, updated_at=datetime('now') WHERE id=?").run(tool || '', test_case_id);
        if (existing.test_case_id) {
          db.prepare("UPDATE test_cases SET automated=0, updated_at=datetime('now') WHERE id=?").run(existing.test_case_id);
        }
      }
    });
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const a = db.prepare('SELECT * FROM automations WHERE id=?').get(req.params.id);
    if (!a) return res.status(404).json({ error: 'Automação não encontrada' });
    db.tx(() => {
      db.prepare('DELETE FROM automations WHERE id=?').run(req.params.id);
      if (a?.test_case_id) {
        db.prepare("UPDATE test_cases SET automated=0, updated_at=datetime('now') WHERE id=?").run(a.test_case_id);
      }
    });
    res.json({ ok: true });
  });

  return router;
};
