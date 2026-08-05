const express = require('express');

module.exports = (db) => {
  const router = express.Router();
  const LIST_SQL = `
    SELECT tc.*,
      s.title AS scenario_title,
      r.code AS requirement_code, r.title AS requirement_title,
      st.name AS strategy_name,
      (SELECT COUNT(*) FROM executions e WHERE e.test_case_id = tc.id) AS executions_count,
      (SELECT COUNT(*) FROM test_mass tm WHERE tm.test_case_id = tc.id) AS mass_count,
      (SELECT e.result FROM executions e WHERE e.test_case_id = tc.id ORDER BY e.execution_date DESC LIMIT 1) AS last_result
    FROM test_cases tc
    LEFT JOIN test_scenarios s ON s.id = tc.scenario_id
    LEFT JOIN requirements r ON r.id = tc.requirement_id
    LEFT JOIN test_strategies st ON st.id = tc.strategy_id`;

  router.get('/', (req, res) => {
    const { projectId, taskId, type, status, requirementId, scenarioId, regression } = req.query;
    const params = [];
    let sql = `${LIST_SQL} WHERE 1=1`;
    if (taskId) {
      sql += ' AND tc.task_id = ?';
      params.push(taskId);
    } else if (projectId) {
      sql += ' AND tc.project_id = ?';
      params.push(projectId);
    } else {
      return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
    }
    if (type) { sql += ' AND tc.type = ?'; params.push(type); }
    if (status) { sql += ' AND tc.status = ?'; params.push(status); }
    if (requirementId) { sql += ' AND tc.requirement_id = ?'; params.push(requirementId); }
    if (scenarioId) { sql += ' AND tc.scenario_id = ?'; params.push(scenarioId); }
    if (regression === '1') { sql += ' AND tc.regression_relevant = 1'; }
    sql += ' ORDER BY tc.code';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`${LIST_SQL} WHERE tc.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Caso de teste não encontrado' });
    try { row.steps = JSON.parse(row.steps || '[]'); } catch { row.steps = []; }
    row.test_mass = db.prepare('SELECT * FROM test_mass WHERE test_case_id = ? ORDER BY id').all(req.params.id);
    row.executions = db.prepare(`
      SELECT e.*, (SELECT COUNT(*) FROM bugs b WHERE b.execution_id = e.id) AS bugs_count
      FROM executions e WHERE e.test_case_id = ? ORDER BY e.execution_date DESC
    `).all(req.params.id);
    res.json(row);
  });

  router.post('/', (req, res) => {
    const { project_id, task_id, scenario_id, requirement_id, strategy_id, code, title,
      priority = 'Média', type = 'Funcional', execution_mode = 'Manual', status = 'Pronto',
      preconditions = '', steps = [], regression_relevant = 0, automated = 0, automation_tool = '', source = 'manual' } = req.body || {};
    if (!task_id || !title) return res.status(400).json({ error: 'Tarefa e título são obrigatórios' });
    const task = db.resolveTask(task_id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const projectId = project_id || task.project_id;
    if (Number(projectId) !== Number(task.project_id)) {
      return res.status(400).json({ error: 'Tarefa não pertence ao projeto informado' });
    }
    const c = code || db.nextCode('test_cases', 'TC', projectId);
    const r = db.prepare(
      `INSERT INTO test_cases (project_id, task_id, scenario_id, requirement_id, strategy_id, code, title, priority, type, execution_mode, status, preconditions, steps, regression_relevant, automated, automation_tool, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(projectId, task_id, scenario_id || null, requirement_id || null, strategy_id || null, c, title,
      priority, type, execution_mode, status, preconditions, JSON.stringify(steps || []),
      regression_relevant ? 1 : 0, automated ? 1 : 0, automation_tool || '', source);
    res.json({ id: Number(r.lastInsertRowid), code: c });
  });

  router.put('/:id', (req, res) => {
    const { scenario_id, requirement_id, strategy_id, code, title, priority, type, execution_mode,
      status, preconditions, steps, regression_relevant, automated, automation_tool, source } = req.body || {};
    let stepsArr = steps;
    if (typeof steps === 'string') { try { stepsArr = JSON.parse(steps); } catch { stepsArr = []; } }
    const cur = db.prepare('SELECT source FROM test_cases WHERE id=?').get(req.params.id);
    const finalSource = source !== undefined ? source : (cur?.source || 'manual');
    db.prepare(
      `UPDATE test_cases SET scenario_id=?, requirement_id=?, strategy_id=?, code=?, title=?, priority=?,
        type=?, execution_mode=?, status=?, preconditions=?, steps=?, regression_relevant=?, automated=?,
        automation_tool=?, source=?, updated_at=datetime('now') WHERE id=?`
    ).run(scenario_id || null, requirement_id || null, strategy_id || null, code, title, priority,
      type, execution_mode, status, preconditions, JSON.stringify(stepsArr || []),
      regression_relevant ? 1 : 0, automated ? 1 : 0, automation_tool || '', finalSource, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM test_cases WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/duplicate', (req, res) => {
    const orig = db.prepare('SELECT * FROM test_cases WHERE id=?').get(req.params.id);
    if (!orig) return res.status(404).json({ error: 'Caso não encontrado' });
    let steps;
    try { steps = JSON.parse(orig.steps || '[]'); } catch { steps = []; }
    const c = db.nextCode('test_cases', 'TC', orig.project_id);
    const r = db.prepare(
      `INSERT INTO test_cases (project_id, task_id, scenario_id, requirement_id, strategy_id, code, title, priority, type, execution_mode, status, preconditions, steps)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(orig.project_id, orig.task_id, orig.scenario_id, orig.requirement_id, orig.strategy_id, c,
      `${orig.title} (cópia)`, orig.priority, orig.type, orig.execution_mode, 'Pronto', orig.preconditions, JSON.stringify(steps));
    res.json({ id: Number(r.lastInsertRowid), code: c });
  });

  router.get('/mass/all', (req, res) => {
    const { projectId, taskId } = req.query;
    const params = [];
    let sql = `
      SELECT tm.id, tm.name, tm.data, tm.purpose, tm.created_at,
        tc.id AS test_case_id, tc.code AS test_case_code, tc.title AS test_case_title,
        tc.type AS test_case_type,
        r.code AS requirement_code
      FROM test_mass tm
      JOIN test_cases tc ON tc.id = tm.test_case_id
      LEFT JOIN requirements r ON r.id = tc.requirement_id
      WHERE 1=1`;
    if (taskId) {
      sql += ' AND tc.task_id = ?';
      params.push(taskId);
    } else if (projectId) {
      sql += ' AND tc.project_id = ?';
      params.push(projectId);
    } else {
      return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
    }
    sql += ' ORDER BY tc.code, tm.name';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/:id/test-mass', (req, res) => {
    const { name, data = '', purpose = '', source = 'manual' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare('INSERT INTO test_mass (test_case_id, name, data, purpose, source) VALUES (?,?,?,?,?)')
      .run(req.params.id, name, data, purpose, source);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/test-mass/:mid', (req, res) => {
    const { name, data, purpose } = req.body || {};
    db.prepare('UPDATE test_mass SET name=?, data=?, purpose=? WHERE id=?').run(name, data, purpose, req.params.mid);
    res.json({ ok: true });
  });

  router.delete('/test-mass/:mid', (req, res) => {
    db.prepare('DELETE FROM test_mass WHERE id=?').run(req.params.mid);
    res.json({ ok: true });
  });

  return router;
};
