const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  function buildDashboard(scopeCol, scopeId, includeProjectExtras) {
    const d = {};
    const p = scopeId;
    const where = `${scopeCol}=?`;

    d.totalRequirements = db.prepare(`SELECT COUNT(*) AS c FROM requirements WHERE ${where}`).get(p).c;
    d.coveredRequirements = db.prepare(
      `SELECT COUNT(DISTINCT requirement_id) AS c FROM test_cases WHERE ${where} AND requirement_id IS NOT NULL`
    ).get(p).c;
    d.totalCases = db.prepare(`SELECT COUNT(*) AS c FROM test_cases WHERE ${where}`).get(p).c;
    d.regressionCases = db.prepare(`SELECT COUNT(*) AS c FROM test_cases WHERE ${where} AND regression_relevant=1`).get(p).c;
    d.automatedCases = db.prepare(`SELECT COUNT(*) AS c FROM test_cases WHERE ${where} AND automated=1`).get(p).c;
    d.totalExecutions = db.prepare(`SELECT COUNT(*) AS c FROM executions WHERE ${where}`).get(p).c;
    d.passed = db.prepare(`SELECT COUNT(*) AS c FROM executions WHERE ${where} AND result='Passou'`).get(p).c;
    d.failed = db.prepare(`SELECT COUNT(*) AS c FROM executions WHERE ${where} AND result='Falhou'`).get(p).c;
    d.blocked = db.prepare(`SELECT COUNT(*) AS c FROM executions WHERE ${where} AND result='Bloqueado'`).get(p).c;
    d.pending = d.totalExecutions - d.passed - d.failed - d.blocked;
    d.passRate = d.totalExecutions ? Math.round((d.passed / d.totalExecutions) * 100) : 0;

    d.openBugs = db.prepare(`SELECT COUNT(*) AS c FROM bugs WHERE ${where} AND status IN ('Aberto','Em Correção')`).get(p).c;
    d.totalBugs = db.prepare(`SELECT COUNT(*) AS c FROM bugs WHERE ${where}`).get(p).c;
    d.bugsBySeverity = db.prepare(`SELECT severity, COUNT(*) AS c FROM bugs WHERE ${where} GROUP BY severity`).all(p);
    d.bugsByStatus = db.prepare(`SELECT status, COUNT(*) AS c FROM bugs WHERE ${where} GROUP BY status`).all(p);

    d.casesByType = db.prepare(`SELECT type, COUNT(*) AS c FROM test_cases WHERE ${where} GROUP BY type`).all(p);
    d.casesByMode = db.prepare(`SELECT execution_mode, COUNT(*) AS c FROM test_cases WHERE ${where} GROUP BY execution_mode`).all(p);

    d.recentExecutions = db.prepare(`
      SELECT e.*, tc.code AS test_case_code, tc.title AS test_case_title
      FROM executions e JOIN test_cases tc ON tc.id = e.test_case_id
      WHERE e.${where} ORDER BY e.execution_date DESC, e.id DESC LIMIT 8
    `).all(p);

    d.recentBugs = db.prepare(`
      SELECT b.*, tc.code AS test_case_code FROM bugs b
      LEFT JOIN test_cases tc ON tc.id = b.test_case_id
      WHERE b.${where} ORDER BY b.created_at DESC LIMIT 6
    `).all(p);

    d.lowCoverage = db.prepare(`
      SELECT r.code, r.title, r.priority,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) AS cases_count
      FROM requirements r WHERE r.${where}
        AND (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) = 0
      ORDER BY r.code
    `).all(p);

    if (includeProjectExtras) {
      d.totalTasks = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE project_id=?').get(p).c;
      d.releases = db.prepare('SELECT * FROM releases WHERE project_id=? ORDER BY created_at DESC').all(p);
      d.regressionRuns = db.prepare('SELECT * FROM regression_runs WHERE project_id=? ORDER BY start_date DESC').all(p);
      d.openAutomations = db.prepare("SELECT COUNT(*) AS c FROM automations WHERE project_id=? AND status IN ('Sugerido','Em Desenvolvimento')").get(p).c;
    } else {
      d.totalTasks = null;
      d.releases = [];
      d.regressionRuns = [];
      d.openAutomations = 0;
    }

    return d;
  }

  router.get('/', (req, res) => {
    const { projectId, taskId } = req.query;
    if (taskId) {
      const task = db.resolveTask(taskId);
      if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
      return res.json({ ...buildDashboard('task_id', taskId, false), scope: 'task', taskId: Number(taskId), projectId: task.project_id });
    }
    if (projectId) {
      return res.json({ ...buildDashboard('project_id', projectId, true), scope: 'project', projectId: Number(projectId) });
    }
    return res.status(400).json({ error: 'taskId ou projectId é obrigatório' });
  });

  return router;
};
