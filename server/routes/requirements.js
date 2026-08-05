const express = require('express');
const { validateTaskOwnership, mergeUpdate } = require('../helpers');

module.exports = (db) => {
  const router = express.Router();
  const LIST_SQL = `
    SELECT r.*,
      (SELECT COUNT(*) FROM business_rules br WHERE br.requirement_id = r.id) AS rules_count,
      (SELECT COUNT(*) FROM test_scenarios sc WHERE sc.requirement_id = r.id) AS scenarios_count,
      (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) AS cases_count,
      (SELECT COUNT(*) FROM executions e JOIN test_cases tc2 ON tc2.id = e.test_case_id WHERE tc2.requirement_id = r.id) AS executions_count
    FROM requirements r`;

  router.get('/', (req, res) => {
    const { projectId, taskId } = req.query;
    if (taskId) {
      return res.json(db.prepare(`${LIST_SQL} WHERE r.task_id = ? ORDER BY r.code`).all(taskId));
    }
    if (projectId) {
      return res.json(db.prepare(`${LIST_SQL} WHERE r.project_id = ? ORDER BY r.code`).all(projectId));
    }
    return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
  });

  router.get('/context', (req, res) => {
    const { projectId, taskId } = req.query;
    let rows;
    if (taskId) {
      rows = db.prepare('SELECT * FROM requirements WHERE task_id = ? ORDER BY code').all(taskId);
    } else if (projectId) {
      rows = db.prepare('SELECT * FROM requirements WHERE project_id = ? ORDER BY code').all(projectId);
    } else {
      return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
    }
    for (const r of rows) {
      r.business_rules = db.prepare('SELECT rule, category FROM business_rules WHERE requirement_id = ? ORDER BY id').all(r.id);
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const reqRow = db.prepare(`${LIST_SQL} WHERE r.id = ?`).get(req.params.id);
    if (!reqRow) return res.status(404).json({ error: 'Requisito não encontrado' });
    reqRow.business_rules = db.prepare('SELECT * FROM business_rules WHERE requirement_id = ? ORDER BY id').all(req.params.id);
    reqRow.test_cases = db.prepare('SELECT * FROM test_cases WHERE requirement_id = ? ORDER BY code').all(req.params.id);
    res.json(reqRow);
  });

  router.post('/', (req, res) => {
    const { project_id, task_id, code, title, description = '', priority = 'Média', status = 'Ativo', module = '', source = 'manual' } = req.body || {};
    if (!task_id || !title) return res.status(400).json({ error: 'Tarefa e título são obrigatórios' });
    const owned = validateTaskOwnership(db, task_id, project_id);
    if (owned.error) return res.status(owned.status).json({ error: owned.error });
    const projectId = project_id || owned.task.project_id;
    const c = code || db.nextCode('requirements', 'REQ', projectId);
    const r = db.prepare(
      'INSERT INTO requirements (project_id, task_id, code, title, description, priority, status, module, source) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(projectId, task_id, c, title, description, priority, status, module, source);
    res.status(201).json({ id: Number(r.lastInsertRowid), code: c });
  });

  router.put('/:id', (req, res) => {
    const keys = ['code', 'title', 'description', 'priority', 'status', 'module', 'source'];
    const cur = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Requisito não encontrado' });
    const m = mergeUpdate(cur, req.body || {}, keys);
    db.prepare("UPDATE requirements SET code=?, title=?, description=?, priority=?, status=?, module=?, source=?, updated_at=datetime('now') WHERE id=?")
      .run(m.code, m.title, m.description, m.priority, m.status, m.module, m.source, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare('SELECT id FROM requirements WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Requisito não encontrado' });
    db.prepare('DELETE FROM requirements WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/business-rules', (req, res) => {
    const { rule, category = 'Regra de Negócio', source = 'manual' } = req.body || {};
    if (!rule) return res.status(400).json({ error: 'Regra é obrigatória' });
    const reqRow = db.prepare('SELECT id FROM requirements WHERE id=?').get(req.params.id);
    if (!reqRow) return res.status(404).json({ error: 'Requisito não encontrado' });
    const r = db.prepare('INSERT INTO business_rules (requirement_id, rule, category, source) VALUES (?,?,?,?)')
      .run(req.params.id, rule, category, source);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/business-rules/:rid', (req, res) => {
    const { rule, category } = req.body || {};
    const row = db.prepare('SELECT id FROM business_rules WHERE id=?').get(req.params.rid);
    if (!row) return res.status(404).json({ error: 'Regra não encontrada' });
    db.prepare('UPDATE business_rules SET rule=?, category=? WHERE id=?').run(rule, category, req.params.rid);
    res.json({ ok: true });
  });

  router.delete('/business-rules/:rid', (req, res) => {
    const row = db.prepare('SELECT id FROM business_rules WHERE id=?').get(req.params.rid);
    if (!row) return res.status(404).json({ error: 'Regra não encontrada' });
    db.prepare('DELETE FROM business_rules WHERE id=?').run(req.params.rid);
    res.json({ ok: true });
  });

  return router;
};
