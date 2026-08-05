const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const api = require('./studioApi');
const { aggregateResult } = require('./utils');
const { generateSpec, generateApiCollection, judge, getAdapter } = require('./agents');
const { runPostmanCollection } = require('./postmanRunner');

const UI_TYPES = new Set(['Fumaça', 'Funcional']);
const API_TYPES = new Set(['API']);
const ALLOWED_TYPES = new Set([...UI_TYPES, ...API_TYPES]);

function parseSteps(tc) {
  let steps = tc.steps;
  if (typeof steps === 'string') {
    try { steps = JSON.parse(steps); } catch { steps = []; }
  }
  return (steps || []).map((s, i) => ({
    order: Number(s.order) || i + 1,
    action: s.action || '',
    expected: s.expected || ''
  }));
}

function collectScreenshots(root, caseId) {
  const dir = path.join(root, 'artifacts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(`step-${caseId}-`) && f.endsWith('.png'))
    .map((f) => path.join(dir, f))
    .sort();
}

function runPlaywright(root, specPath, { headed } = {}) {
  return new Promise((resolve) => {
    // Quote relative paths so spaces in the repo folder (e.g. "Novo QA") do not break the CLI.
    const relSpec = path.relative(root, specPath).replace(/\\/g, '/');
    const env = { ...process.env };
    if (headed) {
      env.HEADED = '1';
      delete env.HEADLESS;
    } else {
      env.HEADED = '0';
      env.HEADLESS = '1';
    }
    const cmd = `npx playwright test "${relSpec}" --config "playwright.config.js"`;

    const child = spawn(cmd, {
      cwd: root,
      env,
      shell: true,
      windowsHide: true
    });
    let log = '';
    child.stdout.on('data', (d) => { const t = d.toString(); log += t; process.stdout.write(t); });
    child.stderr.on('data', (d) => { const t = d.toString(); log += t; process.stderr.write(t); });
    child.on('error', (err) => resolve({ exitCode: 1, log: String(err.message) }));
    child.on('close', (code) => resolve({ exitCode: code ?? 1, log }));
  });
}

async function postBlocked(tc, agentKey, notes) {
  const steps = parseSteps(tc);
  return api.createExecution({
    project_id: tc.project_id,
    task_id: tc.task_id,
    test_case_id: tc.id,
    environment: process.env.TEST_ENV || 'Homologação',
    tester: `agent:${agentKey}`,
    result: 'Bloqueado',
    actual_result: notes,
    notes,
    step_results: steps.map((s) => ({
      order: s.order,
      actual: notes,
      result: 'Não Executado'
    }))
  });
}

function fallbackJudgment(steps, runOut) {
  const blocked = /BLOQUEADO:/i.test(runOut.log || '');
  const step_results = steps.map((s) => ({
    order: s.order,
    actual: runOut.log.slice(0, 500),
    result: blocked ? 'Não Executado' : (runOut.exitCode === 0 ? 'Passou' : 'Falhou')
  }));
  if (blocked) {
    const m = String(runOut.log).match(/BLOQUEADO:[^\n]+/);
    return {
      result: 'Bloqueado',
      actual_result: m ? m[0] : 'Bloqueado por dependência externa',
      notes: 'Fallback: marker BLOQUEADO no log do Playwright',
      step_results
    };
  }
  return {
    result: aggregateResult(step_results),
    actual_result: runOut.log.slice(0, 1000),
    notes: 'Fallback judgment (agent JSON missing)',
    step_results
  };
}

/**
 * Run a single Studio test case (UI Playwright or API Postman).
 * @returns {{ ok: boolean, result: string, executionId?: number, code: string }}
 */
async function runOneCase(caseId, { root, agentName, headed, reuseSpec, skipJudge } = {}) {
  const cwd = root;
  const { key: agentKey } = getAdapter(agentName);

  const tc = await api.getTestCase(caseId);
  if (!ALLOWED_TYPES.has(tc.type)) {
    throw new Error(`Tipo não suportado: ${tc.type}. Use Fumaça, Funcional ou API.`);
  }

  const mass = await api.getMassForCase(tc.id, tc.task_id);
  const steps = parseSteps(tc);
  const ctx = {
    caseId: tc.id,
    code: tc.code,
    title: tc.title,
    type: tc.type,
    preconditions: tc.preconditions || '',
    steps,
    mass,
    baseURL: process.env.TARGET_BASE_URL
  };

  console.log(`[agent-runner] Caso ${tc.code} (${tc.type}) via agent:${agentKey}`);

  let judgment;
  try {
    let runOut;
    if (API_TYPES.has(tc.type)) {
      console.log('[agent-runner] Gerando coleção Postman...');
      const { collection, persistedPath } = await generateApiCollection(ctx, { agentName: agentKey, cwd });
      console.log(`[agent-runner] Coleção persistida: ${persistedPath}`);
      console.log('[agent-runner] Executando requests...');
      runOut = await runPostmanCollection(collection, { baseURL: ctx.baseURL });
      process.stdout.write(runOut.log);
    } else {
      const specPath = path.join(cwd, '.generated', `case-${tc.id}.spec.ts`);
      if (reuseSpec && fs.existsSync(specPath)) {
        console.log(`[agent-runner] Reusando spec existente: ${specPath}`);
      } else {
        console.log('[agent-runner] Gerando spec Playwright...');
        const gen = await generateSpec(ctx, { agentName: agentKey, cwd });
        console.log(`[agent-runner] Spec: ${gen.specPath} (persistida: ${gen.persistedPath})`);
      }
      console.log('[agent-runner] Executando Playwright...');
      runOut = await runPlaywright(cwd, specPath, { headed });
      runOut.screenshots = collectScreenshots(cwd, tc.id);
    }

    if (skipJudge) {
      judgment = fallbackJudgment(steps, runOut);
      judgment.notes = (judgment.notes || '') + ' (skipJudge)';
    } else {
      console.log('[agent-runner] Julgando resultado...');
      try {
        judgment = await judge(ctx, runOut, { agentName: agentKey, cwd });
      } catch (judgeErr) {
        console.warn('[agent-runner] Judge falhou, usando fallback:', judgeErr.message);
        judgment = fallbackJudgment(steps, runOut);
      }
    }
    if (!judgment.step_results?.length && steps.length) {
      judgment = { ...judgment, ...fallbackJudgment(steps, runOut), notes: judgment.notes };
    }
  } catch (err) {
    console.error('[agent-runner] Falha no fluxo:', err.message);
    const exec = await postBlocked(tc, agentKey, err.message);
    return { ok: false, result: 'Bloqueado', executionId: exec.id, code: tc.code, error: err.message };
  }

  const exec = await api.createExecution({
    project_id: tc.project_id,
    task_id: tc.task_id,
    test_case_id: tc.id,
    environment: process.env.TEST_ENV || 'Homologação',
    tester: `agent:${agentKey}`,
    result: judgment.result,
    actual_result: judgment.actual_result,
    notes: judgment.notes,
    step_results: judgment.step_results
  });

  console.log(`[agent-runner] Execução id=${exec.id} result=${judgment.result}`);
  return {
    ok: judgment.result === 'Passou',
    result: judgment.result,
    executionId: exec.id,
    code: tc.code
  };
}

module.exports = {
  runOneCase,
  ALLOWED_TYPES,
  UI_TYPES,
  API_TYPES,
  parseSteps
};
