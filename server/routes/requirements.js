const express = require('express');

module.exports = (db) => {
  const router = express.Router();
  const LIST_SQL = `
    SELECT r.*,
      (SELECT COUNT(*) FROM business_rules br WHERE br.requirement_id = r.id) AS rules_count,
      (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) AS cases_count,
      (SELECT COUNT(*) FROM executions e JOIN test_cases tc2 ON tc2.id = e.test_case_id WHERE tc2.requirement_id = r.id) AS executions_count
    FROM requirements r`;

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    res.json(db.prepare(`${LIST_SQL} WHERE r.project_id = ? ORDER BY r.code`).all(projectId));
  });

  router.get('/:id', (req, res) => {
    const reqRow = db.prepare(`${LIST_SQL} WHERE r.id = ?`).get(req.params.id);
    if (!reqRow) return res.status(404).json({ error: 'Requisito não encontrado' });
    reqRow.business_rules = db.prepare('SELECT * FROM business_rules WHERE requirement_id = ? ORDER BY id').all(req.params.id);
    reqRow.test_cases = db.prepare('SELECT * FROM test_cases WHERE requirement_id = ? ORDER BY code').all(req.params.id);
    res.json(reqRow);
  });

  router.post('/', (req, res) => {
    const { project_id, code, title, description = '', priority = 'Média', status = 'Ativo', module = '' } = req.body || {};
    if (!project_id || !title) return res.status(400).json({ error: 'Projeto e título são obrigatórios' });
    const c = code || db.nextCode('requirements', 'REQ', project_id);
    const r = db.prepare(
      'INSERT INTO requirements (project_id, code, title, description, priority, status, module) VALUES (?,?,?,?,?,?,?)'
    ).run(project_id, c, title, description, priority, status, module);
    res.json({ id: Number(r.lastInsertRowid), code: c });
  });

  router.put('/:id', (req, res) => {
    const { code, title, description, priority, status, module } = req.body || {};
    db.prepare("UPDATE requirements SET code=?, title=?, description=?, priority=?, status=?, module=?, updated_at=datetime('now') WHERE id=?")
      .run(code, title, description, priority, status, module, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM requirements WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Regras de negócio vinculadas ao requisito
  router.post('/:id/business-rules', (req, res) => {
    const { rule, category = 'Regra de Negócio' } = req.body || {};
    if (!rule) return res.status(400).json({ error: 'Regra é obrigatória' });
    const r = db.prepare('INSERT INTO business_rules (requirement_id, rule, category) VALUES (?,?,?)')
      .run(req.params.id, rule, category);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/business-rules/:rid', (req, res) => {
    const { rule, category } = req.body || {};
    db.prepare('UPDATE business_rules SET rule=?, category=? WHERE id=?').run(rule, category, req.params.rid);
    res.json({ ok: true });
  });

  router.delete('/business-rules/:rid', (req, res) => {
    db.prepare('DELETE FROM business_rules WHERE id=?').run(req.params.rid);
    res.json({ ok: true });
  });

  return router;
};
