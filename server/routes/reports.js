const express = require('express');

/**
 * Relatório consolidado de teste de uma tarefa.
 * GET /api/reports/task/:taskId
 */
module.exports = (db) => {
  const router = express.Router();

  router.get('/task/:taskId', (req, res) => {
    const task = db.resolveTask(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    const taskId = Number(task.id);

    // Última execução de cada caso (1ª linha de um SELECT ordenado desc)
    const executions = db.prepare(`
      SELECT e.*, tc.code AS test_case_code, tc.title AS test_case_title
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      WHERE e.task_id = ?
      ORDER BY e.execution_date DESC, e.id DESC
    `).all(taskId);

    const lastByCase = new Map();
    for (const ex of executions) {
      if (!lastByCase.has(ex.test_case_id)) lastByCase.set(ex.test_case_id, ex);
    }

    const cases = db.prepare(`
      SELECT tc.*,
        r.code AS requirement_code, r.title AS requirement_title,
        (SELECT COUNT(*) FROM executions e WHERE e.test_case_id = tc.id) AS executions_count,
        (SELECT COUNT(*) FROM bugs b WHERE b.test_case_id = tc.id) AS bugs_count
      FROM test_cases tc
      LEFT JOIN requirements r ON r.id = tc.requirement_id
      WHERE tc.task_id = ?
      ORDER BY tc.id
    `).all(taskId);

    const rows = cases.map((tc) => {
      const last = lastByCase.get(tc.id) || null;
      return {
        id: tc.id,
        code: tc.code,
        title: tc.title,
        type: tc.type,
        execution_mode: tc.execution_mode,
        priority: tc.priority,
        status: tc.status,
        requirement_id: tc.requirement_id,
        requirement_code: tc.requirement_code,
        requirement_title: tc.requirement_title,
        executions_count: Number(tc.executions_count),
        bugs_count: Number(tc.bugs_count),
        last_execution: last ? {
          id: last.id,
          execution_date: last.execution_date,
          result: last.result,
          environment: last.environment,
          tester: last.tester,
          actual_result: last.actual_result,
          notes: last.notes
        } : null
      };
    });

    // Resumo baseado no ÚLTIMO resultado de cada caso (estado atual da tarefa)
    const summary = {
      totalCases: rows.length,
      executedCases: 0,
      notExecutedCases: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      passRate: 0
    };
    for (const r of rows) {
      if (!r.last_execution) { summary.notExecutedCases += 1; continue; }
      summary.executedCases += 1;
      if (r.last_execution.result === 'Passou') summary.passed += 1;
      else if (r.last_execution.result === 'Falhou') summary.failed += 1;
      else if (r.last_execution.result === 'Bloqueado') summary.blocked += 1;
    }
    summary.passRate = summary.executedCases
      ? Math.round((summary.passed / summary.executedCases) * 100)
      : 0;

    // Cobertura por requisito
    const reqs = db.prepare(`
      SELECT r.id, r.code, r.title
      FROM requirements r
      WHERE r.task_id = ?
      ORDER BY r.code
    `).all(taskId);
    const requirements = reqs.map((r) => {
      const linked = rows.filter((c) => c.requirement_id === r.id);
      const executed = linked.filter((c) => c.last_execution);
      return {
        id: r.id,
        code: r.code,
        title: r.title,
        total_cases: linked.length,
        executed_cases: executed.length,
        passed: executed.filter((c) => c.last_execution.result === 'Passou').length,
        failed: executed.filter((c) => c.last_execution.result === 'Falhou').length,
        blocked: executed.filter((c) => c.last_execution.result === 'Bloqueado').length
      };
    });
    const coveredReqs = requirements.filter((r) => r.total_cases > 0 && r.executed_cases > 0).length;

    // Bugs em aberto e por severidade
    const openBugs = db.prepare(
      `SELECT COUNT(*) AS c FROM bugs WHERE task_id = ? AND status IN ('Aberto','Em Correção')`
    ).get(taskId).c;
    const bugsBySeverity = db.prepare(
      `SELECT severity, COUNT(*) AS c FROM bugs WHERE task_id = ? GROUP BY severity ORDER BY c DESC`
    ).all(taskId);

    res.json({
      task: {
        id: task.id,
        code: task.code,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee
      },
      generated_at: new Date().toISOString(),
      summary: {
        ...summary,
        requirements_total: requirements.length,
        requirements_covered: coveredReqs,
        requirement_coverage: requirements.length
          ? Math.round((coveredReqs / requirements.length) * 100)
          : 0,
        open_bugs: Number(openBugs),
        bugs_by_severity: bugsBySeverity
      },
      requirements,
      cases: rows,
      executions: executions.slice(0, 20)
    });
  });

  return router;
};
