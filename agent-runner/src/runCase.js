const path = require('path');
const fs = require('fs');
const api = require('./studioApi');
const { aggregateResult, spawnCmd, treeKill } = require('./utils');
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

/** Remove screenshots de execuções anteriores do mesmo caso para o judge não ver evidência obsoleta. */
function cleanCaseScreenshots(root, caseId) {
  const dir = path.join(root, 'artifacts');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`step-${caseId}-`) && f.endsWith('.png')) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* arquivo em uso */ }
    }
  }
}

/** Extrai mensagens de erro estruturadas do report.json do Playwright. */
function parsePlaywrightReport(root) {
  const p = path.join(root, 'artifacts', 'report.json');
  if (!fs.existsSync(p)) return [];
  try {
    const rep = JSON.parse(fs.readFileSync(p, 'utf8'));
    const errors = [];
    for (const suite of rep.suites || []) {
      for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
          for (const res of t.results || []) {
            for (const err of res.errors || []) {
              if (err?.message) errors.push(err.message.split('\n').slice(0, 12).join('\n'));
            }
          }
        }
      }
    }
    return errors.filter(Boolean).slice(0, 3);
  } catch { return []; }
}

/** Compila o spec com `playwright test --list` para validar o TypeScript antes de rodar. */
function validateSpec(root, specPath) {
  return new Promise((resolve) => {
    const relSpec = path.relative(root, specPath).replace(/\\/g, '/');
    const child = spawnCmd('npx', ['playwright', 'test', relSpec, '--config', 'playwright.config.js', '--list'], {
      cwd: root,
      env: { ...process.env, HEADED: '0', HEADLESS: '1' }
    });
    let out = '';
    let settled = false;
    const finish = (err) => { if (!settled) { settled = true; resolve(err); } };

    const timer = setTimeout(() => {
      treeKill(child);
      finish('Tempo limite ao validar o spec (--list).');
    }, Number(process.env.PLAYWRIGHT_VALIDATE_TIMEOUT_MS) || 90_000);
    timer.unref?.();

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); finish(`Falha ao iniciar o Playwright: ${err.message}`); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return finish(null);
      const lines = out.split('\n').filter((l) => l.trim()).slice(0, 20);
      finish(lines.join('\n') || `Playwright --list saiu com código ${code}.`);
    });
  });
}

function runPlaywright(root, specPath, { headed } = {}) {
  return new Promise((resolve) => {
    // Pass relative path as an argument so spaces in the repo folder (e.g. "Novo QA") do not break the CLI.
    const relSpec = path.relative(root, specPath).replace(/\\/g, '/');
    const env = { ...process.env };
    if (headed) {
      env.HEADED = '1';
      delete env.HEADLESS;
    } else {
      env.HEADED = '0';
      env.HEADLESS = '1';
    }

    // Reutiliza sessão salva (login SSO manual) entre casos da fila.
    const statePath = path.join(root, 'artifacts', '.state.json');
    if (fs.existsSync(statePath) && process.env.SSO_STATE_OFF !== '1') env.PLAYWRIGHT_STATE = statePath;

    // Limpa artefatos da execução anterior para não reutilizar evidência/erro obsoleta.
    for (const rel of ['artifacts/report.json', 'artifacts/test-results']) {
      try { fs.rmSync(path.join(root, rel), { recursive: true, force: true }); } catch { /* ignore */ }
    }

    const child = spawnCmd('npx', ['playwright', 'test', relSpec, '--config', 'playwright.config.js'], {
      cwd: root,
      env
    });
    let log = '';
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };

    const timeoutMs = Number(process.env.PLAYWRIGHT_TIMEOUT_MS) || 15 * 60 * 1000;
    const timer = setTimeout(() => {
      log += '\n[agent-runner] Playwright excedeu o tempo limite e foi encerrado.\n';
      treeKill(child);
      finish({ exitCode: 1, log });
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on('data', (d) => { const t = d.toString(); log += t; process.stdout.write(t); });
    child.stderr.on('data', (d) => { const t = d.toString(); log += t; process.stderr.write(t); });
    child.on('error', (err) => { clearTimeout(timer); finish({ exitCode: 1, log: String(err.message) }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ exitCode: code ?? 1, log, reportErrors: parsePlaywrightReport(root) });
    });
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
  const pwErrors = (runOut.reportErrors || []).join('\n---\n');
  const detail = pwErrors
    ? `Playwright report.json:\n${pwErrors}`
    : runOut.log.slice(0, 1000);
  const step_results = steps.map((s) => ({
    order: s.order,
    actual: pwErrors || runOut.log.slice(0, 500),
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
    actual_result: detail,
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
      cleanCaseScreenshots(cwd, tc.id);
      const specPath = path.join(cwd, '.generated', `case-${tc.id}.spec.ts`);
      if (reuseSpec && fs.existsSync(specPath)) {
        console.log(`[agent-runner] Reusando spec existente: ${specPath}`);
      } else {
        console.log('[agent-runner] Gerando spec Playwright...');
        let gen = await generateSpec(ctx, { agentName: agentKey, cwd });
        console.log(`[agent-runner] Spec: ${gen.specPath} (persistida: ${gen.persistedPath})`);

        let specErr = await validateSpec(cwd, specPath);
        if (specErr) {
          console.warn('[agent-runner] Spec não compilou; regenerando com o erro...');
          gen = await generateSpec(ctx, { agentName: agentKey, cwd, fixHint: specErr });
          console.log(`[agent-runner] Spec regenerada: ${gen.specPath}`);
          specErr = await validateSpec(cwd, specPath);
          if (specErr) {
            throw new Error(`Spec inválido mesmo após regeneração:\n${specErr}`);
          }
        }
      }
      console.log('[agent-runner] Executando Playwright...');
      runOut = await runPlaywright(cwd, specPath, { headed });
      runOut.screenshots = collectScreenshots(cwd, tc.id);
      if (runOut.screenshots.length < steps.length) {
        console.warn(
          `[agent-runner] Aviso: ${steps.length} passo(s), ${runOut.screenshots.length} screenshot(s) capturada(s) — evidência incompleta para o judge.`
        );
      }
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
