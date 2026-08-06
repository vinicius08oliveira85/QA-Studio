const fs = require('fs');
const path = require('path');
const api = require('./studioApi');
const { getAdapter } = require('./agents');
const { buildSuiteJudgePrompt } = require('./suitePrompts');
const { extractJson } = require('./utils');
const { emitSuiteEvent } = require('../helpers/suiteRuntime');

const EXECUTED_RESULTS = new Set(['Passou', 'Falhou', 'Bloqueado']);

function fallbackFor(testCase, runResult) {
  const result = EXECUTED_RESULTS.has(runResult.result) ? runResult.result : 'Não Executado';
  const actual = runResult.error || (
    result === 'Passou' ? 'Playwright concluiu o caso sem erros.' : 'Caso não executado.'
  );
  return {
    caseId: String(testCase.caseId),
    result,
    actual_result: actual,
    notes: `Resultado estrutural do Playwright (${runResult.reportStatus || 'unknown'})`,
    step_results: (testCase.steps || []).map((step) => ({
      order: step.order,
      actual,
      result: result === 'Passou' ? 'Passou' : result === 'Falhou' ? 'Falhou' : 'Não Executado'
    }))
  };
}

function normalizeJudgments(cases, runResults, parsed) {
  const byId = new Map(
    (parsed?.results || []).map((item) => [String(item.caseId), item])
  );
  const runById = new Map(runResults.map((item) => [String(item.caseId), item]));
  return cases.map((testCase) => {
    const id = String(testCase.caseId);
    const runResult = runById.get(id) || {
      result: 'Não Executado',
      reportStatus: 'absent',
      error: ''
    };
    const fallback = fallbackFor(testCase, runResult);
    const judged = byId.get(id);
    if (!judged || runResult.result === 'Não Executado') return fallback;
    const allowed = new Set(['Passou', 'Falhou', 'Não Executado', 'Bloqueado']);
    return {
      ...fallback,
      result: allowed.has(judged.result) ? judged.result : fallback.result,
      actual_result: judged.actual_result || fallback.actual_result,
      notes: judged.notes || fallback.notes,
      step_results: Array.isArray(judged.step_results) && judged.step_results.length
        ? judged.step_results
        : fallback.step_results
    };
  });
}

async function judgeSuite(cases, runResults, { agentName, root, skipJudge } = {}) {
  if (skipJudge) return normalizeJudgments(cases, runResults, null);
  const { adapter } = getAdapter(agentName);
  try {
    console.log('[agent-runner] Julgando suíte em uma chamada...');
    const raw = await adapter.prompt(buildSuiteJudgePrompt(cases, runResults), { cwd: root });
    return normalizeJudgments(cases, runResults, extractJson(raw));
  } catch (error) {
    console.warn('[agent-runner] Judge em lote falhou; usando resultados Playwright:', error.message);
    return normalizeJudgments(cases, runResults, null);
  }
}

function failedExecutionPath(root, testCase) {
  const dir = path.join(root, 'artifacts', 'failed-executions');
  fs.mkdirSync(dir, { recursive: true });
  const code = String(testCase.code || testCase.caseId).replace(/[^\w.-]/g, '_');
  return path.join(dir, `suite-${Date.now()}-${code}.json`);
}

async function persistSuiteResults(cases, judgments, { agentName, root } = {}) {
  const byId = new Map(judgments.map((item) => [String(item.caseId), item]));
  const persisted = [];
  for (const testCase of cases) {
    const judgment = byId.get(String(testCase.caseId));
    if (!judgment || !EXECUTED_RESULTS.has(judgment.result)) {
      persisted.push({ ...judgment, code: testCase.code, recorded: false });
      continue;
    }
    const payload = {
      project_id: testCase.project_id,
      task_id: testCase.task_id,
      test_case_id: testCase.caseId,
      environment: process.env.TEST_ENV || 'Homologação',
      tester: `agent:${agentName}`,
      result: judgment.result,
      actual_result: judgment.actual_result,
      notes: judgment.notes,
      step_results: judgment.step_results
    };
    try {
      const execution = await api.createExecution(payload);
      const item = {
        ...judgment,
        code: testCase.code,
        executionId: execution?.id,
        recorded: true
      };
      persisted.push(item);
      emitSuiteEvent('case.recorded', item);
    } catch (error) {
      const file = failedExecutionPath(root, testCase);
      fs.writeFileSync(file, JSON.stringify({ error: error.message, payload }, null, 2), 'utf8');
      persisted.push({
        ...judgment,
        code: testCase.code,
        recorded: false,
        error: error.message,
        fallbackFile: file
      });
    }
  }
  return persisted;
}

module.exports = { judgeSuite, persistSuiteResults, normalizeJudgments };
