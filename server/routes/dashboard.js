const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { projectId } = req.query;
    const d = {};
    const p = projectId;

    d.totalRequirements = db.prepare('SELECT COUNT(*) AS c FROM requirements WHERE project_id=?').get(p).c;
    d.coveredRequirements = db.prepare(
      'SELECT COUNT(DISTINCT requirement_id) AS c FROM test_cases WHERE project_id=? AND requirement_id IS NOT NULL'
    ).get(p).c;
    d.totalCases = db.prepare('SELECT COUNT(*) AS c FROM test_cases WHERE project_id=?').get(p).c;
    d.regressionCases = db.prepare('SELECT COUNT(*) AS c FROM test_cases WHERE project_id=? AND regression_relevant=1').get(p).c;
    d.automatedCases = db.prepare('SELECT COUNT(*) AS c FROM test_cases WHERE project_id=? AND automated=1').get(p).c;
    d.totalExecutions = db.prepare('SELECT COUNT(*) AS c FROM executions WHERE project_id=?').get(p).c;
    d.passed = db.prepare('SELECT COUNT(*) AS c FROM executions WHERE project_id=? AND result=\'Passou\'').get(p).c;
    d.failed = db.prepare('SELECT COUNT(*) AS c FROM executions WHERE project_id=? AND result=\'Falhou\'').get(p).c;
    d.blocked = db.prepare('SELECT COUNT(*) AS c FROM executions WHERE project_id=? AND result=\'Bloqueado\'').get(p).c;
    d.pending = d.totalExecutions - d.passed - d.failed - d.blocked;
    d.passRate = d.totalExecutions ? Math.round((d.passed / d.totalExecutions) * 100) : 0;

    d.openBugs = db.prepare("SELECT COUNT(*) AS c FROM bugs WHERE project_id=? AND status IN ('Aberto','Em Correção')").get(p).c;
    d.totalBugs = db.prepare('SELECT COUNT(*) AS c FROM bugs WHERE project_id=?').get(p).c;
    d.bugsBySeverity = db.prepare('SELECT severity, COUNT(*) AS c FROM bugs WHERE project_id=? GROUP BY severity').all(p);
    d.bugsByStatus = db.prepare('SELECT status, COUNT(*) AS c FROM bugs WHERE project_id=? GROUP BY status').all(p);

    d.casesByType = db.prepare('SELECT type, COUNT(*) AS c FROM test_cases WHERE project_id=? GROUP BY type').all(p);
    d.casesByMode = db.prepare('SELECT execution_mode, COUNT(*) AS c FROM test_cases WHERE project_id=? GROUP BY execution_mode').all(p);

    d.recentExecutions = db.prepare(`
      SELECT e.*, tc.code AS test_case_code, tc.title AS test_case_title
      FROM executions e JOIN test_cases tc ON tc.id = e.test_case_id
      WHERE e.project_id = ? ORDER BY e.execution_date DESC, e.id DESC LIMIT 8
    `).all(p);

    d.recentBugs = db.prepare(`
      SELECT b.*, tc.code AS test_case_code FROM bugs b
      LEFT JOIN test_cases tc ON tc.id = b.test_case_id
      WHERE b.project_id = ? ORDER BY b.created_at DESC LIMIT 6
    `).all(p);

    d.releases = db.prepare('SELECT * FROM releases WHERE project_id=? ORDER BY created_at DESC').all(p);
    d.regressionRuns = db.prepare('SELECT * FROM regression_runs WHERE project_id=? ORDER BY start_date DESC').all(p);
    d.openAutomations = db.prepare("SELECT COUNT(*) AS c FROM automations WHERE project_id=? AND status IN ('Sugerido','Em Desenvolvimento')").get(p).c;

    d.lowCoverage = db.prepare(`
      SELECT r.code, r.title, r.priority,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) AS cases_count
      FROM requirements r WHERE r.project_id = ?
        AND (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) = 0
      ORDER BY r.code
    `).all(p);

    res.json(d);
  });

  return router;
};
