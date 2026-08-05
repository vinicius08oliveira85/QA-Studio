const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    res.json(db.prepare(`
      SELECT rr.*,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id) AS total_cases,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id AND rrc.result = 'Passou') AS passed,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id AND rrc.result = 'Falhou') AS failed,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id AND rrc.result = 'Bloqueado') AS blocked
      FROM regression_runs rr
      WHERE rr.project_id = ? ORDER BY rr.start_date DESC
    `).all(projectId));
  });

  router.get('/:id', (req, res) => {
    const run = db.prepare(`
      SELECT rr.*,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id) AS total_cases,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id AND rrc.result = 'Passou') AS passed,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id AND rrc.result = 'Falhou') AS failed,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id AND rrc.result = 'Bloqueado') AS blocked,
        (SELECT COUNT(*) FROM regression_run_cases rrc WHERE rrc.run_id = rr.id AND rrc.result = 'Pendente') AS pending
      FROM regression_runs rr WHERE rr.id = ?
    `).get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Regressão não encontrada' });
    run.cases = db.prepare(`
      SELECT rrc.*, tc.code, tc.title, tc.type, tc.execution_mode, tc.priority,
        r.code AS requirement_code, r.title AS requirement_title,
        (SELECT COUNT(*) FROM bugs b WHERE b.test_case_id = tc.id AND b.status IN ('Aberto','Em Correção')) AS open_bugs
      FROM regression_run_cases rrc
      JOIN test_cases tc ON tc.id = rrc.test_case_id
      LEFT JOIN requirements r ON r.id = tc.requirement_id
      WHERE rrc.run_id = ? ORDER BY tc.code
    `).all(req.params.id);
    run.available_cases = db.prepare(`
      SELECT tc.* FROM test_cases tc
      WHERE tc.project_id = ? AND tc.regression_relevant = 1
        AND tc.id NOT IN (SELECT test_case_id FROM regression_run_cases WHERE run_id = ?)
      ORDER BY tc.code
    `).all(run.project_id, req.params.id);
    res.json(run);
  });

  router.post('/', (req, res) => {
    const { project_id, name, environment = 'Homologação', notes = '' } = req.body || {};
    if (!project_id || !name) return res.status(400).json({ error: 'Projeto e nome são obrigatórios' });
    const r = db.prepare(
      'INSERT INTO regression_runs (project_id, name, environment, notes) VALUES (?,?,?,?)'
    ).run(project_id, name, environment, notes);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const { name, status, environment, notes } = req.body || {};
    db.prepare("UPDATE regression_runs SET name=?, status=?, environment=?, notes=?, updated_at=datetime('now') WHERE id=?")
      .run(name, status, environment, notes, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM regression_runs WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/cases', (req, res) => {
    const { test_case_id } = req.body || {};
    const exists = db.prepare('SELECT id FROM regression_run_cases WHERE run_id=? AND test_case_id=?').get(req.params.id, test_case_id);
    if (!exists) {
      db.prepare('INSERT INTO regression_run_cases (run_id, test_case_id) VALUES (?,?)').run(req.params.id, test_case_id);
    }
    res.json({ ok: true });
  });

  router.post('/:id/populate', (req, res) => {
    const rows = db.prepare(`
      SELECT tc.id FROM test_cases tc
      WHERE tc.project_id = (SELECT project_id FROM regression_runs WHERE id = ?)
        AND tc.regression_relevant = 1
        AND tc.id NOT IN (SELECT test_case_id FROM regression_run_cases WHERE run_id = ?)
    `).all(req.params.id, req.params.id);
    const ins = db.prepare('INSERT OR IGNORE INTO regression_run_cases (run_id, test_case_id) VALUES (?,?)');
    for (const row of rows) ins.run(req.params.id, row.id);
    res.json({ added: rows.length });
  });

  router.put('/cases/:cid', (req, res) => {
    const { result, notes = '' } = req.body || {};
    db.prepare('UPDATE regression_run_cases SET result=?, notes=? WHERE id=?').run(result, notes, req.params.cid);
    res.json({ ok: true });
  });

  router.delete('/:id/cases/:testCaseId', (req, res) => {
    db.prepare('DELETE FROM regression_run_cases WHERE run_id=? AND test_case_id=?')
      .run(req.params.id, req.params.testCaseId);
    res.json({ ok: true });
  });

  return router;
};
