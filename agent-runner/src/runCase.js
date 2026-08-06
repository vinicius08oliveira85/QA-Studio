const path = require('path');
const fs = require('fs');
const api = require('./studioApi');
const { aggregateResult, spawnCmd, treeKill, sha256, copyDirSync, removeDirSync, pruneRuns } = require('./utils');
const { generateSpec, generateApiCollection, judge, getAdapter } = require('./agents');
const { runPostmanCollection } = require('./postmanRunner');
const { statePathFor } = require('../helpers/ssoWait');
const { requestFix, waitForFixAction, clearFixMarkers } = require('../helpers/flowControl');

const UI_TYPES = new Set(['Fumaça', 'Funcional']);
const API_TYPES = new Set(['API']);
const ALLOWED_TYPES = new Set([...UI_TYPES, ...API_TYPES]);

/** Falha de infraestrutura (timeout de agent, crash do Playwright, rede) — candidata a retry, não é veredito. */
class InfraError extends Error {}

/** Hash estável dos inputs do caso: se passos/massa/precondições mudarem, o spec não é reutilizado. */
function specCacheKey(ctx) {
  const payload = {
    type: ctx.type,
    baseURL: ctx.baseURL,
    flowMode: ctx.flowMode || 'start',
    sequentialFlow: !!ctx.sequentialFlow,
    preconditions: ctx.preconditions,
    steps: (ctx.steps || []).map((s) => [s.order, s.action, s.expected]),
    mass: (ctx.mass || []).map((m) => [m.name, m.data || '', m.purpose || ''])
  };
  return sha256(JSON.stringify(payload)).slice(0, 12);
}

function specNameFor(ctx) {
  return `case-${ctx.caseId}-${specCacheKey(ctx)}.spec.ts`;
}

/** Remove specs antigos do mesmo caso que ficaram com hash desatualizado. */
function cleanStaleGenerated(root, ctx) {
  const dir = path.join(root, '.generated');
  if (!fs.existsSync(dir)) return;
  const keep = specNameFor(ctx);
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`case-${ctx.caseId}-`) && f !== keep) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
    }
  }
}

/** Scanner estático: faz valer as regras do prompt no spec gerado (não depende do agent obedecer). */
function staticSpecViolations(src, ctx) {
  const issues = [];
  const flowMode = ctx.flowMode || 'start';
  const sequential = !!ctx.sequentialFlow;
  const waits = (src.match(/\.waitForTimeout\(/g) || []).length;
  if (waits > 0) {
    issues.push(`page.waitForTimeout usado ${waits}x — substituir por expect(...).toBeVisible()/expect.poll(...)`);
  }
  const shots = (src.match(new RegExp(`step-${ctx.caseId}-`, 'g')) || []).length;
  if (shots < (ctx.steps || []).length) {
    issues.push(`Screenshots por passo ausentes: esperado ${ctx.steps.length}, encontrado ${shots}`);
  }

  if (sequential || flowMode === 'continue') {
    if (!/helpers\/flowFixtures/.test(src)) {
      issues.push("Fila sequencial: importar { test, expect } de '../helpers/flowFixtures'");
    }
  }

  if (flowMode === 'continue') {
    if (/page\.goto\(\s*['"`]\/['"`]\s*\)/.test(src)) {
      issues.push("Modo continue: page.goto('/') é proibido — herde a tela aberta");
    }
    if (/waitForManualLogin/.test(src)) {
      issues.push('Modo continue: waitForManualLogin / novo SSO é proibido');
    }
    if (!/FLOW_CONTEXT_LOST/.test(src)) {
      issues.push("Modo continue: deve lançar Error('FLOW_CONTEXT_LOST: ...') se a tela herdada não bater");
    }
  } else if (!/waitForManualLogin/.test(src)) {
    issues.push('waitForManualLogin não é chamado após a primeira navegação');
  }
  return issues;
}

/** Falha técnica / de ambiente (imprevisto), candidata a regenerar spec — não é veredito de negócio. */
function isUnexpectedFailure(runOut, judgment) {
  if (detectFlowContextLost(runOut).length) return true;
  if (detectSutErrors(runOut).length) return true;
  if (judgment?.result === 'Bloqueado') return true;
  if (runOut?.infraTimeout) return true;
  const blob = [runOut?.log || '', ...(runOut?.reportErrors || [])].join('\n');
  if (runOut?.exitCode !== 0 && /Timeout|locator\.|strict mode|not found|waiting for|Executable doesn't exist/i.test(blob)) {
    return true;
  }
  return false;
}

function unexpectedHint(runOut, judgment) {
  const parts = [];
  const sut = detectSutErrors(runOut);
  if (sut.length) parts.push('SUT_ERROR: ' + sut.join(' | '));
  const flow = detectFlowContextLost(runOut);
  if (flow.length) parts.push('FLOW_CONTEXT_LOST: ' + flow.join(' | '));
  if (judgment?.actual_result) parts.push(judgment.actual_result);
  if (!parts.length) {
    const blob = [...(runOut?.reportErrors || []), runOut?.log || ''].join('\n');
    if (blob) parts.push(blob.replace(/\s+/g, ' ').slice(0, 800));
  }
  return parts.join('\n').slice(0, 1800);
}

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

function runPlaywright(root, specPath, { headed, statePath, useFlowCdp } = {}) {
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

    // Fila sequencial: conecta no Chromium já aberto (browserSession).
    if (useFlowCdp) {
      if (!process.env.QA_FLOW_CDP) {
        return resolve({ exitCode: 1, log: 'FLOW_CONTEXT_LOST: QA_FLOW_CDP ausente', reportErrors: [] });
      }
      env.QA_FLOW_CDP = process.env.QA_FLOW_CDP;
      delete env.PLAYWRIGHT_STATE; // cookies já estão no context CDP
    } else if (statePath && fs.existsSync(statePath) && process.env.SSO_STATE_OFF !== '1') {
      // Reutiliza sessão salva (login SSO manual) entre casos da fila isolada.
      env.PLAYWRIGHT_STATE = statePath;
    }

    // Limpa artefatos da execução anterior para não reutilizar evidência/erro obsoleta.
    for (const rel of ['artifacts/report.json', 'artifacts/test-results', 'artifacts/html-report']) {
      try { removeDirSync(path.join(root, rel)); } catch { /* ignore */ }
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
      finish({ exitCode: 1, log, infraTimeout: true });
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on('data', (d) => { const t = d.toString(); log += t; process.stdout.write(t); });
    child.stderr.on('data', (d) => { const t = d.toString(); log += t; process.stderr.write(t); });
    child.on('error', (err) => { clearTimeout(timer); finish({ exitCode: 1, log: String(err.message), infraTimeout: true }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ exitCode: code ?? 1, log, reportErrors: parsePlaywrightReport(root) });
    });
  });
}

/** Grava a execução com retry (em studioApi) e fallback local se a API cair — o veredito nunca se perde. */
async function recordExecution(root, payload, tc) {
  try {
    const exec = await api.createExecution(payload);
    return { exec, recorded: true };
  } catch (err) {
    const dir = path.join(root, 'artifacts', 'failed-executions');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `exec-${Date.now()}-${String(tc.code || tc.id).replace(/[^\w.-]/g, '_')}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify({ error: err.message, payload }, null, 2), 'utf8');
    } catch { /* ignore */ }
    console.error(`[agent-runner] Não foi possível gravar a execução no QA Studio (${err.message}). Veredito preservado em ${file}`);
    return { exec: null, recorded: false, file };
  }
}

async function postBlocked(tc, agentKey, notes, root) {
  const payload = {
    project_id: tc.project_id,
    task_id: tc.task_id,
    test_case_id: tc.id,
    environment: process.env.TEST_ENV || 'Homologação',
    tester: `agent:${agentKey}`,
    result: 'Bloqueado',
    actual_result: notes,
    notes,
    step_results: parseSteps(tc).map((s) => ({
      order: s.order,
      actual: notes,
      result: 'Não Executado'
    }))
  };
  return recordExecution(root, payload, tc);
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

/** Valida a estrutura mínima da coleção Postman (method + url por request). */
function validateApiCollection(collection) {
  const issues = [];
  const walk = (items) => {
    for (const it of items || []) {
      if (it.item) { walk(it.item); continue; }
      const req = it.request || {};
      const method = String(req.method || '').trim().toUpperCase();
      const urlRaw = typeof req.url === 'string' ? req.url : (req.url?.raw || '');
      if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method)) {
        issues.push(`Item "${it.name || '(sem nome)'}" sem method HTTP válido`);
      }
      if (!String(urlRaw || '').trim()) {
        issues.push(`Item "${it.name || '(sem nome)'}" sem url`);
      }
    }
  };
  walk(collection?.item);
  return issues;
}

/** Massa de teste (name→data) vira variáveis {{var}} resolvidas no request da coleção. */
function massVars(mass) {
  const vars = {};
  for (const m of mass || []) {
    const v = m.data ?? m.value ?? '';
    vars[m.name] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return vars;
}

/**
 * O Playwright imprime o trecho de código que falhou; essas linhas contêm o
 * literal do marcador e não são a mensagem lançada em runtime.
 */
function looksLikeSourceLine(line) {
  return /new Error\s*\(|throw\s|['"`]\s*\+|\+\s*['"`]|\);\s*$|^\s*>?\s*\d+\s*\|/.test(line);
}

/** Extrai mensagens "<MARCADOR>: <texto>" realmente lançadas na execução. */
function detectMarker(runOut, marker) {
  const src = [...(runOut?.reportErrors || []), runOut?.log || ''].join('\n---\n');
  const re = new RegExp(`${marker}:\\s*([^\\r\\n]+)`, 'gi');
  const found = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const nl = src.indexOf('\n', m.index);
    const line = src.slice(lineStart, nl === -1 ? undefined : nl);
    if (looksLikeSourceLine(line)) continue;
    const text = m[1].trim();
    if (text && !found.includes(text)) found.push(text);
  }
  return found.slice(0, 5);
}

/** Extrai mensagens "SUT_ERROR: <texto>" lançadas pelo spec (tela de erro do SUT). */
function detectSutErrors(runOut) {
  return detectMarker(runOut, 'SUT_ERROR');
}

/** Extrai "FLOW_CONTEXT_LOST: <texto>" (tela herdada da fila sequencial não bateu). */
function detectFlowContextLost(runOut) {
  return detectMarker(runOut, 'FLOW_CONTEXT_LOST');
}

/** Empacota screenshots + report + html + test-results + spec em artifacts/runs/<ts>-<code>/ e poda o histórico. */
function bundleEvidence(root, { caseCode, caseId, artifactPath, runOut, judgment, execution }) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeCode = String(caseCode || caseId).replace(/[^\w.-]/g, '_');
  const dir = path.join(root, 'artifacts', 'runs', `run-${ts}-${safeCode}`);
  fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
  const copy = (src, rel) => {
    try {
      if (!fs.existsSync(src)) return;
      const dest = path.join(dir, rel);
      if (fs.statSync(src).isDirectory()) copyDirSync(src, dest);
      else fs.copyFileSync(src, dest);
    } catch (e) { console.warn(`[agent-runner] Aviso: não foi possível copiar ${rel}: ${e.message}`); }
  };
  copy(path.join(root, 'artifacts', 'report.json'), 'report.json');
  copy(path.join(root, 'artifacts', 'html-report'), 'html-report');
  copy(path.join(root, 'artifacts', 'test-results'), 'test-results');
  if (artifactPath) copy(artifactPath, path.basename(artifactPath));
  for (const s of runOut.screenshots || []) {
    try { fs.copyFileSync(s, path.join(dir, 'screenshots', path.basename(s))); } catch { /* ignore */ }
  }
  if (judgment) {
    const slim = { result: judgment.result, actual_result: judgment.actual_result, notes: judgment.notes, step_results: judgment.step_results };
    try { fs.writeFileSync(path.join(dir, 'judgment.json'), JSON.stringify(slim, null, 2), 'utf8'); } catch { /* ignore */ }
  }
  if (execution) {
    try { fs.writeFileSync(path.join(dir, 'execution.json'), JSON.stringify(execution, null, 2), 'utf8'); } catch { /* ignore */ }
  }
  pruneRuns(root);
  return dir;
}

/** Gera (ou reusa) o spec com cache por hash, valida compilação e faz valer as regras, com 1 regeneração. */
async function ensureSpec(ctx, { root, agentKey, reuseSpec }) {
  const specPath = path.join(root, '.generated', specNameFor(ctx));
  cleanStaleGenerated(root, ctx);
  const gen = (fixHint) => generateSpec(ctx, { agentName: agentKey, cwd: root, fixHint, specPath });

  if (reuseSpec && fs.existsSync(specPath)) {
    const violations = staticSpecViolations(fs.readFileSync(specPath, 'utf8'), ctx);
    if (violations.length) {
      console.warn('[agent-runner] Spec reusado viola regras; regenerando...');
      console.warn('  - ' + violations.join('\n  - '));
      await gen(violations.join('\n'));
    } else {
      console.log(`[agent-runner] Reusando spec: ${specPath}`);
    }
  } else {
    console.log('[agent-runner] Gerando spec Playwright...');
    await gen();
  }

  for (let round = 0; round < 2; round++) {
    const src = fs.readFileSync(specPath, 'utf8');
    const violations = staticSpecViolations(src, ctx);
    const compileErr = await validateSpec(root, specPath);
    if (!compileErr && !violations.length) return specPath;
    if (round === 1) {
      throw new InfraError(`Spec inválido após regeneração:\n${compileErr || violations.join('\n')}`);
    }
    const reason = compileErr ? `erro de compilação` : 'regras violadas';
    console.warn(`[agent-runner] Regenerando spec (${reason})...`);
    await gen(compileErr || violations.join('\n'));
  }
  return specPath;
}

/**
 * Run a single Studio test case (UI Playwright or API Postman).
 * @returns {{ ok: boolean, result: string, executionId?: number, code: string, recorded?: boolean, evidenceDir?: string, error?: string, skipped?: boolean, stopped?: boolean, flowMode?: string }}
 */
async function runOneCase(caseId, {
  root,
  agentName,
  headed,
  reuseSpec,
  skipJudge,
  sequentialFlow = false,
  flowMode = 'start',
  previousCase = null
} = {}) {
  const cwd = root;
  const t0 = Date.now();
  const timings = {};
  const mark = (k) => { timings[k + 'Ms'] = Date.now() - t0; };
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
    baseURL: process.env.TARGET_BASE_URL,
    flowMode: sequentialFlow ? flowMode : 'start',
    sequentialFlow: !!sequentialFlow,
    previousCase: previousCase || null
  };
  mark('api');

  console.log(`[agent-runner] Caso ${tc.code} (${tc.type}) via agent:${agentKey}${sequentialFlow ? ` [flow=${ctx.flowMode}]` : ''}`);

  let judgment;
  let artifactPath;
  let runOut = {};
  let skipped = false;
  let stopped = false;
  try {
    if (API_TYPES.has(tc.type)) {
      console.log('[agent-runner] Gerando coleção Postman...');
      let { collection, collectionPath, persistedPath } = await generateApiCollection(ctx, { agentName: agentKey, cwd });
      artifactPath = collectionPath;
      console.log(`[agent-runner] Coleção persistida: ${persistedPath}`);

      let issues = validateApiCollection(collection);
      if (issues.length) {
        console.warn('[agent-runner] Coleção inválida; regenerando...');
        ({ collection, collectionPath } = await generateApiCollection(ctx, { agentName: agentKey, cwd, fixHint: issues.join('\n') }));
        artifactPath = collectionPath;
        issues = validateApiCollection(collection);
      }
      if (issues.length) {
        throw new InfraError(`Coleção Postman inválida após regeneração:\n${issues.join('\n')}`);
      }

      mark('spec');
      console.log('[agent-runner] Executando requests...');
      runOut = await runPostmanCollection(collection, { baseURL: ctx.baseURL, vars: massVars(mass) });
      process.stdout.write(runOut.log);
      mark('run');
    } else {
      const statePath = statePathFor(ctx.baseURL);
      if (fs.existsSync(statePath)) {
        const maxAgeMs = (Number(process.env.SSO_STATE_MAX_AGE_DAYS) || 7) * 24 * 60 * 60 * 1000;
        try {
          const ageMs = Date.now() - fs.statSync(statePath).mtimeMs;
          if (ageMs > maxAgeMs) {
            console.warn(
              `[agent-runner] Aviso: sessão SSO (${path.relative(root, statePath)}) tem mais de ${Math.round(ageMs / (24 * 60 * 60 * 1000))} dia(s) — pode ter expirado. Rode um caso sem --headless para refazer o login.`
            );
          }
        } catch { /* ignore */ }
      }
      if (!headed && !fs.existsSync(statePath) && process.env.SSO_STATE_OFF !== '1' && process.env.SSO_HEADLESS_WAIT !== '1' && !sequentialFlow) {
        throw new InfraError(
          `SSO requer login manual, mas a execução é headless e não há sessão salva. ` +
          `Rode o primeiro caso sem --headless para salvar a sessão (${path.relative(root, statePath)}), ` +
          `ou defina SSO_HEADLESS_WAIT=1 para aguardar a confirmação "Já fiz login" do Studio.`
        );
      }
      cleanCaseScreenshots(cwd, tc.id);
      let specPath = await ensureSpec(ctx, { root, agentKey, reuseSpec });
      artifactPath = specPath;
      mark('spec');

      const pwOpts = { headed, statePath, useFlowCdp: !!sequentialFlow };
      console.log('[agent-runner] Executando Playwright...');
      runOut = await runPlaywright(cwd, specPath, pwOpts);
      runOut.screenshots = collectScreenshots(cwd, tc.id);
      mark('run');

      // Imprevisto (SUT / seletor / contexto): regenera o spec UMA vez e re-executa.
      if (runOut.exitCode !== 0 && isUnexpectedFailure(runOut, null)) {
        const hint = unexpectedHint(runOut, null) ||
          `Ajuste o fluxo (navegação/seleções/esperas). Se a tela herdada sumiu, lance FLOW_CONTEXT_LOST.`;
        console.warn(`[agent-runner] Imprevisto detectado; regenerando spec e re-executando...`);
        console.warn('  - ' + hint.replace(/\s+/g, ' ').slice(0, 240));
        const gen = await generateSpec(ctx, { agentName: agentKey, cwd, fixHint: hint, specPath });
        const newSpec = gen.specPath || specPath;
        const compileErr = await validateSpec(root, newSpec);
        if (!compileErr) {
          artifactPath = newSpec;
          specPath = newSpec;
          runOut = await runPlaywright(cwd, newSpec, pwOpts);
          runOut.screenshots = collectScreenshots(cwd, tc.id);
          mark('run');
        } else {
          console.warn('[agent-runner] Spec regenerado não compilou; mantendo resultado original.');
        }
      }

      // Ainda imprevisto em fila sequencial → pede decisão na UI (regen / skip / stop).
      while (sequentialFlow && runOut.exitCode !== 0 && isUnexpectedFailure(runOut, null)) {
        const errText = unexpectedHint(runOut, null) || 'Falha inesperada na execução';
        requestFix({ caseId: tc.id, code: tc.code, error: errText });
        const action = await waitForFixAction();
        if (action === 'stop') {
          stopped = true;
          console.log('[FLOW] STOPPED_AFTER_FAIL');
          break;
        }
        if (action === 'skip') {
          skipped = true;
          console.log(`[FLOW] SKIPPED case=${tc.code}`);
          break;
        }
        // regen
        clearFixMarkers();
        const hint = `Usuário pediu regenerar após imprevisto:\n${errText}`;
        console.log('[agent-runner] Regenerando spec a pedido do usuário...');
        const gen = await generateSpec(ctx, { agentName: agentKey, cwd, fixHint: hint, specPath });
        const newSpec = gen.specPath || specPath;
        const compileErr = await validateSpec(root, newSpec);
        if (compileErr) {
          console.warn('[agent-runner] Spec regenerado não compilou:', compileErr);
          runOut = { ...runOut, log: (runOut.log || '') + '\n' + compileErr, exitCode: 1 };
          continue;
        }
        artifactPath = newSpec;
        specPath = newSpec;
        runOut = await runPlaywright(cwd, newSpec, pwOpts);
        runOut.screenshots = collectScreenshots(cwd, tc.id);
        mark('run');
      }

      if (runOut.screenshots.length < steps.length && !skipped && !stopped) {
        console.warn(
          `[agent-runner] Aviso: ${steps.length} passo(s), ${runOut.screenshots.length} screenshot(s) capturada(s) — evidência incompleta para o judge.`
        );
      }
    }

    if (skipped) {
      judgment = {
        result: 'Não Executado',
        actual_result: 'Caso pulado na fila sequencial (imprevisto)',
        notes: 'FLOW skip',
        step_results: steps.map((s) => ({ order: s.order, actual: 'Pulado', result: 'Não Executado' }))
      };
    } else if (stopped) {
      judgment = {
        result: 'Bloqueado',
        actual_result: unexpectedHint(runOut, null) || 'Fila parada pelo usuário após imprevisto',
        notes: 'FLOW stop',
        step_results: steps.map((s) => ({ order: s.order, actual: 'Parado', result: 'Não Executado' }))
      };
    } else if (skipJudge) {
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
    mark('judge');
    if (!judgment.step_results?.length && steps.length) {
      judgment = { ...judgment, ...fallbackJudgment(steps, runOut), notes: judgment.notes };
    }
    // Tela de erro do SUT não é um veredito do teste → Bloqueado (ambiente, retryável).
    const sutErrors = detectSutErrors(runOut);
    if (sutErrors.length && !skipped) {
      judgment = {
        ...judgment,
        result: 'Bloqueado',
        actual_result: sutErrors.join('\n'),
        notes: (judgment.notes || '') + ' | Falha de ambiente no SUT: ' + sutErrors.join(' | ')
      };
    }
    if (detectFlowContextLost(runOut).length && !skipped) {
      judgment = {
        ...judgment,
        result: 'Bloqueado',
        actual_result: unexpectedHint(runOut, judgment),
        notes: (judgment.notes || '') + ' | FLOW_CONTEXT_LOST'
      };
    }
    // Timeout de infraestrutura do Playwright não é um veredito real → Bloqueado (retryável).
    if (runOut.infraTimeout && !skipped) {
      judgment = {
        ...judgment,
        result: 'Bloqueado',
        notes: (judgment.notes || '') + ' | Timeout de infraestrutura do Playwright.'
      };
    }
  } catch (err) {
    console.error('[agent-runner] Falha no fluxo:', err.message);
    const { exec, recorded, file } = await postBlocked(tc, agentKey, err.message, root);
    const evidenceDir = bundleEvidence(root, {
      caseCode: tc.code,
      caseId: tc.id,
      artifactPath,
      runOut,
      judgment: { result: 'Bloqueado', actual_result: err.message, notes: '', step_results: [] },
      execution: { id: exec?.id || null, recorded, error: file || null }
    });
    timings.totalMs = Date.now() - t0;
    return {
      ok: false,
      result: 'Bloqueado',
      executionId: exec?.id,
      code: tc.code,
      caseId: tc.id,
      title: tc.title,
      error: err.message,
      recorded,
      evidenceDir,
      fallbackFile: file,
      timings,
      flowMode: ctx.flowMode,
      lastStep: steps.length ? `${steps[steps.length - 1].order}. ${steps[steps.length - 1].action}` : '',
      stopped: false,
      skipped: false
    };
  }

  // Pular: não grava execução de veredito; só sinaliza para a fila.
  if (skipped) {
    timings.totalMs = Date.now() - t0;
    clearFixMarkers();
    return {
      ok: false,
      result: 'Pulado',
      code: tc.code,
      caseId: tc.id,
      title: tc.title,
      skipped: true,
      stopped: false,
      timings,
      flowMode: ctx.flowMode,
      lastStep: steps.length ? `${steps[steps.length - 1].order}. ${steps[steps.length - 1].action}` : ''
    };
  }

  const payload = {
    project_id: tc.project_id,
    task_id: tc.task_id,
    test_case_id: tc.id,
    environment: process.env.TEST_ENV || 'Homologação',
    tester: `agent:${agentKey}`,
    result: judgment.result === 'Não Executado' ? 'Bloqueado' : judgment.result,
    actual_result: judgment.actual_result,
    notes: judgment.notes,
    step_results: judgment.step_results
  };
  const { exec, recorded, file } = await recordExecution(root, payload, tc);
  const evidenceDir = bundleEvidence(root, { caseCode: tc.code, caseId: tc.id, artifactPath, runOut, judgment, execution: { id: exec?.id || null, recorded } });
  timings.totalMs = Date.now() - t0;

  console.log(`[agent-runner] Execução id=${exec?.id || 'N/A'} result=${judgment.result}`);
  if (judgment.result === 'Falhou') console.log(`[FLOW] STOPPED_AFTER_FAIL case=${tc.code}`);

  clearFixMarkers();
  return {
    ok: judgment.result === 'Passou',
    result: judgment.result,
    executionId: exec?.id,
    code: tc.code,
    caseId: tc.id,
    title: tc.title,
    recorded,
    evidenceDir,
    error: recorded ? undefined : file,
    timings,
    flowMode: ctx.flowMode,
    lastStep: steps.length ? `${steps[steps.length - 1].order}. ${steps[steps.length - 1].action}` : '',
    stopped,
    skipped: false
  };
}

module.exports = {
  runOneCase,
  InfraError,
  ALLOWED_TYPES,
  UI_TYPES,
  API_TYPES,
  parseSteps,
  staticSpecViolations,
  isUnexpectedFailure,
  detectSutErrors,
  detectFlowContextLost
};
