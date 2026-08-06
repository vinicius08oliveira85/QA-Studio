const { chromium } = require('@playwright/test');
const api = require('./studioApi');
const browserSession = require('./browserSession');
const { runLive } = require('./agents/opencodeLive');
const { buildLiveCasePrompt } = require('./suitePrompts');
const { persistSuiteResults } = require('./suiteResults');
const { parseSteps } = require('./runCase');
const { extractJson } = require('./utils');
const {
  requestFix,
  waitForFixAction,
  clearFixMarkers
} = require('../helpers/flowControl');
const { emitSuiteEvent } = require('../helpers/suiteRuntime');
const { waitForManualLogin } = require('../helpers/ssoWait');

const UI_TYPES = new Set(['Fumaça', 'Funcional']);
const ALLOWED = new Set(['Passou', 'Falhou', 'Bloqueado', 'Não Executado']);

async function loadLiveCases(caseIds, baseURL) {
  return Promise.all(caseIds.map(async (id) => {
    const testCase = await api.getTestCase(id);
    if (!UI_TYPES.has(testCase.type)) {
      throw new Error(`Agent ao vivo aceita apenas casos UI; ${testCase.code} é ${testCase.type}.`);
    }
    return {
      ...testCase,
      caseId: testCase.id,
      steps: parseSteps(testCase),
      mass: await api.getMassForCase(testCase.id, testCase.task_id),
      baseURL
    };
  }));
}

function itemEvent(testCase, result) {
  emitSuiteEvent('case.result', {
    caseId: testCase.caseId,
    code: testCase.code,
    status: result.result,
    error: result.error || result.actual_result || '',
    durationMs: result.duration || 0,
    reportStatus: result.reportStatus || 'live'
  });
}

/**
 * Extrai o veredito JSON do stdout do OpenCode live.
 */
function parseLiveCaseResult(raw, testCase) {
  const id = String(testCase.caseId);
  const parsed = extractJson(raw);
  const src = parsed?.results?.[0] && String(parsed.results[0].caseId) === id
    ? parsed.results[0]
    : parsed;

  if (src && (src.result || src.actual_result)) {
    const result = ALLOWED.has(src.result) ? src.result : 'Falhou';
    const stepResults = Array.isArray(src.step_results) && src.step_results.length
      ? src.step_results
      : (testCase.steps || []).map((step) => ({
        order: step.order,
        actual: src.actual_result || '',
        result: result === 'Passou' ? 'Passou' : result === 'Falhou' ? 'Falhou' : 'Não Executado'
      }));
    return {
      caseId: id,
      result,
      actual_result: src.actual_result || '',
      notes: src.notes || 'Agent ao vivo (Playwright MCP)',
      step_results: stepResults,
      reportStatus: 'live',
      error: result === 'Passou' ? '' : (src.actual_result || src.notes || '')
    };
  }

  const text = String(raw || '');
  if (/["']result["']\s*:\s*["']Passou["']/i.test(text) || /\bPassou\b/i.test(text) && !/\bFalhou\b/i.test(text)) {
    return {
      caseId: id,
      result: 'Passou',
      actual_result: 'Agent ao vivo indicou Passou (parse parcial).',
      notes: text.slice(-1500),
      step_results: (testCase.steps || []).map((step) => ({
        order: step.order,
        actual: 'Passou (inferido)',
        result: 'Passou'
      })),
      reportStatus: 'liveInferred',
      error: ''
    };
  }

  return {
    caseId: id,
    result: 'Falhou',
    actual_result: 'OpenCode live não retornou JSON de veredito.',
    notes: text.slice(-2000) || 'Resposta vazia do agent ao vivo.',
    step_results: (testCase.steps || []).map((step) => ({
      order: step.order,
      actual: '',
      result: 'Não Executado'
    })),
    reportStatus: 'liveParseFailed',
    error: 'OpenCode live não retornou JSON de veredito.'
  };
}

function isTechnicalFailure(result) {
  const text = `${result.error || ''}\n${result.actual_result || ''}\n${result.notes || ''}`;
  if (/FLOW_CONTEXT_LOST|SUT_ERROR|ECONN|browser.*closed|Target closed|timeout|locator|snapshot|MCP|não retornou JSON/i.test(text)) {
    return true;
  }
  if (result.reportStatus === 'liveParseFailed') return true;
  return false;
}

async function askUserFix(failedCase, error) {
  emitSuiteEvent('suite.waitingFix', {
    caseId: failedCase.caseId,
    code: failedCase.code,
    error
  });
  requestFix({ caseId: failedCase.caseId, code: failedCase.code, error });
  const action = await waitForFixAction();
  clearFixMarkers();
  return action;
}

async function ensureSsoReady(baseURL) {
  const endpoint = browserSession.getCdpEndpoint();
  if (!endpoint) throw new Error('QA_FLOW_CDP ausente antes do SSO.');
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context?.pages()?.[0] || await context.newPage();
  const target = baseURL || process.env.TARGET_BASE_URL;
  if (target && (!page.url() || page.url() === 'about:blank')) {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  }
  console.log('[LIVE] Aguardando SSO (login manual se necessário)…');
  await waitForManualLogin(page, { force: false });
}

async function executeLiveCase(testCase, opts) {
  const started = Date.now();
  const prompt = buildLiveCasePrompt(testCase, opts);
  emitSuiteEvent('case.started', {
    caseId: testCase.caseId,
    code: testCase.code,
    title: testCase.title
  });
  console.log(`[LIVE] Executando ${testCase.code} (mode=${opts.mode}) via OpenCode + Playwright MCP…`);
  const raw = await runLive(prompt, {
    cwd: opts.root,
    cdpEndpoint: browserSession.getCdpEndpoint(),
    timeoutMs: opts.timeoutMs
  });
  const parsed = parseLiveCaseResult(raw, testCase);
  parsed.duration = Date.now() - started;
  emitSuiteEvent('case.finished', {
    caseId: testCase.caseId,
    code: testCase.code,
    status: parsed.result,
    durationMs: parsed.duration,
    error: parsed.error || ''
  });
  return parsed;
}

/**
 * Orquestra a suíte Agent ao vivo: um caso por vez no mesmo Chromium CDP.
 */
async function runLiveSuite(options) {
  const {
    root,
    caseIds,
    agentName = 'opencode-live',
    baseURL = process.env.TARGET_BASE_URL
  } = options;

  const cases = await loadLiveCases(caseIds, baseURL);
  const finalById = new Map();
  const autoHealed = new Set();
  let previousOutcome = null;
  let mode = 'start';
  let stopQueue = false;

  emitSuiteEvent('suite.started', {
    total: cases.length,
    mode: 'live',
    items: cases.map((item, position) => ({
      caseId: item.caseId,
      code: item.code,
      title: item.title,
      position,
      status: 'Pendente'
    }))
  });

  await ensureSsoReady(baseURL);

  for (let index = 0; index < cases.length; index++) {
    if (stopQueue) break;
    const testCase = cases[index];
    let fixHint = '';
    let attempts = 0;
    let done = false;

    while (!done) {
      attempts += 1;
      const currentState = await browserSession.snapshot().catch(() => null);
      let result;
      try {
        result = await executeLiveCase(testCase, {
          root,
          mode,
          index,
          total: cases.length,
          previousCase: previousOutcome,
          currentState,
          fixHint
        });
      } catch (err) {
        result = {
          caseId: String(testCase.caseId),
          result: 'Falhou',
          actual_result: err.message,
          notes: 'Exceção no Agent ao vivo',
          step_results: (testCase.steps || []).map((step) => ({
            order: step.order,
            actual: '',
            result: 'Não Executado'
          })),
          reportStatus: 'liveError',
          error: err.message,
          duration: 0
        };
        emitSuiteEvent('case.finished', {
          caseId: testCase.caseId,
          code: testCase.code,
          status: 'Falhou',
          error: err.message
        });
      }

      if (result.result === 'Passou') {
        finalById.set(String(testCase.caseId), result);
        itemEvent(testCase, result);
        previousOutcome = {
          caseId: testCase.caseId,
          code: testCase.code,
          result: result.result,
          actual_result: result.actual_result
        };
        mode = 'continue';
        done = true;
        break;
      }

      const technical = isTechnicalFailure(result);
      const error = result.error || result.actual_result || 'Falha no Agent ao vivo';

      if (!technical) {
        finalById.set(String(testCase.caseId), result);
        itemEvent(testCase, result);
        emitSuiteEvent('suite.stopped', {
          caseId: testCase.caseId,
          code: testCase.code,
          reason: 'functional_failure'
        });
        stopQueue = true;
        done = true;
        break;
      }

      const healKey = String(testCase.caseId);
      if (!autoHealed.has(healKey) && attempts === 1) {
        autoHealed.add(healKey);
        console.warn(`[LIVE] Self-healing automático em ${testCase.code}…`);
        emitSuiteEvent('suite.healing', {
          caseId: testCase.caseId,
          code: testCase.code,
          automatic: true,
          error
        });
        fixHint = error;
        mode = 'continue';
        continue;
      }

      const action = await askUserFix(testCase, error);
      if (action === 'regen') {
        fixHint = `Regeneração solicitada pelo usuário:\n${error}`;
        mode = 'continue';
        continue;
      }
      if (action === 'skip') {
        const skipped = {
          ...result,
          result: 'Não Executado',
          reportStatus: 'skippedByUser',
          error: 'Caso pulado pelo usuário após falha técnica.'
        };
        finalById.set(String(testCase.caseId), skipped);
        itemEvent(testCase, skipped);
        previousOutcome = { caseId: testCase.caseId, code: testCase.code, result: 'Não Executado' };
        mode = 'start';
        done = true;
        break;
      }

      const stopped = {
        ...result,
        result: 'Bloqueado',
        reportStatus: 'userStop',
        error: error || 'Fila parada pelo usuário.'
      };
      finalById.set(String(testCase.caseId), stopped);
      itemEvent(testCase, stopped);
      emitSuiteEvent('suite.stopped', {
        caseId: testCase.caseId,
        code: testCase.code,
        reason: 'user_stop'
      });
      stopQueue = true;
      done = true;
    }
  }

  const judgments = cases.map((testCase) => {
    const existing = finalById.get(String(testCase.caseId));
    if (existing) return existing;
    const notRun = {
      caseId: String(testCase.caseId),
      result: 'Não Executado',
      actual_result: '',
      notes: 'Não executado após falha/parada anterior.',
      step_results: (testCase.steps || []).map((step) => ({
        order: step.order,
        actual: '',
        result: 'Não Executado'
      })),
      reportStatus: 'notRunAfterFailure',
      error: '',
      duration: 0
    };
    itemEvent(testCase, notRun);
    return notRun;
  });

  const results = await persistSuiteResults(cases, judgments, {
    agentName,
    root
  });
  const passed = results.filter((item) => item.result === 'Passou').length;
  const failed = results.filter((item) => ['Falhou', 'Bloqueado'].includes(item.result)).length;
  emitSuiteEvent('suite.finished', {
    passed,
    failed,
    total: cases.length,
    mode: 'live',
    items: results
  });
  return { results, passed, failed, skipped: cases.length - passed - failed };
}

module.exports = {
  runLiveSuite,
  loadLiveCases,
  parseLiveCaseResult,
  isTechnicalFailure
};
