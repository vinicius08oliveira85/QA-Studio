const api = require('./studioApi');
const browserSession = require('./browserSession');
const { generateSuite, runSuite } = require('./suiteExecutor');
const { judgeSuite, persistSuiteResults } = require('./suiteResults');
const { parseSteps } = require('./runCase');
const {
  requestFix,
  waitForFixAction,
  clearFixMarkers
} = require('../helpers/flowControl');
const { emitSuiteEvent } = require('../helpers/suiteRuntime');

const UI_TYPES = new Set(['Fumaça', 'Funcional']);

async function loadSuiteCases(caseIds, baseURL) {
  return Promise.all(caseIds.map(async (id) => {
    const testCase = await api.getTestCase(id);
    if (!UI_TYPES.has(testCase.type)) {
      throw new Error(`Fila contínua aceita apenas casos UI; ${testCase.code} é ${testCase.type}.`);
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

function isTechnicalFailure(result, runOutput) {
  if (runOutput.infraTimeout) return true;
  const text = `${result.error || ''}\n${runOutput.log || ''}`;
  if (/SUT_ERROR:|FLOW_CONTEXT_LOST:/i.test(text)) return true;
  if (/ECONN|browser.*closed|Target closed|Executable doesn't exist/i.test(text)) return true;
  // Seletor/timeout de infraestrutura — não asserção de negócio (toContainText/toHaveText).
  if (/Timeout\s*\d+ms exceeded|waiting for locator|strict mode violation|element\(s\) not found/i.test(text)) {
    return true;
  }
  return false;
}

function compactError(result, runOutput) {
  const error = String(result.error || '').trim();
  if (error) return error.slice(0, 2400);
  return String(runOutput.log || '').replace(/\s+/g, ' ').slice(-1800);
}

function itemEvent(testCase, result) {
  emitSuiteEvent('case.result', {
    caseId: testCase.caseId,
    code: testCase.code,
    status: result.result,
    error: result.error || '',
    durationMs: result.duration || 0,
    reportStatus: result.reportStatus || ''
  });
}

function terminalResult(result, value, error) {
  return {
    ...result,
    result: value,
    error: error || result.error || ''
  };
}

/**
 * Aguarda Regenerar/Pular/Parar sem fechar o browser.
 * @returns {Promise<'regen'|'skip'|'stop'>}
 */
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

/**
 * Gera a suíte; se falhar (OpenCode vazio/inválido), pede decisão ao usuário
 * em vez de derrubar o job e fechar o Chromium.
 */
async function generateSuiteOrAskFix(pending, opts, { finalById }) {
  const failedCase = pending[0];
  try {
    return await generateSuite(pending, opts);
  } catch (err) {
    const error = `Falha ao gerar/regenerar a suíte: ${err.message}`;
    console.error(`[agent-runner] ${error}`);
    // Marca o healing automático como esgotado para este caso.
    while (true) {
      const action = await askUserFix(failedCase, error);
      if (action === 'regen') {
        try {
          return await generateSuite(pending, {
            ...opts,
            force: true,
            fixHint: `${opts.fixHint || ''}\n${error}`.trim()
          });
        } catch (retryErr) {
          console.error('[agent-runner] Regeneração ainda falhou:', retryErr.message);
          opts = {
            ...opts,
            force: true,
            fixHint: `Regeneração falhou de novo:\n${retryErr.message}`
          };
          continue;
        }
      }
      if (action === 'skip') {
        const skipped = {
          caseId: String(failedCase.caseId),
          result: 'Não Executado',
          reportStatus: 'skippedByUser',
          error: 'Caso pulado após falha ao gerar a suíte.',
          duration: 0
        };
        finalById.set(String(failedCase.caseId), skipped);
        itemEvent(failedCase, skipped);
        return { skipped: true };
      }
      const stopped = {
        caseId: String(failedCase.caseId),
        result: 'Bloqueado',
        reportStatus: 'generationFailed',
        error,
        duration: 0
      };
      finalById.set(String(failedCase.caseId), stopped);
      itemEvent(failedCase, stopped);
      emitSuiteEvent('suite.stopped', {
        caseId: failedCase.caseId,
        code: failedCase.code,
        reason: 'generation_failed'
      });
      return { stopped: true };
    }
  }
}

async function runSequentialSuite(options) {
  const {
    root,
    caseIds,
    agentName,
    skipJudge = false,
    baseURL = process.env.TARGET_BASE_URL
  } = options;
  const cases = await loadSuiteCases(caseIds, baseURL);
  const finalById = new Map();
  const autoHealed = new Set();
  let pending = [...cases];
  let firstMode = 'start';
  let fixHint = '';
  let forceGeneration = false;

  emitSuiteEvent('suite.started', {
    total: cases.length,
    items: cases.map((item, position) => ({
      caseId: item.caseId,
      code: item.code,
      title: item.title,
      position,
      status: 'Pendente'
    }))
  });

  while (pending.length) {
    const currentState = await browserSession.snapshot().catch(() => null);
    const generated = await generateSuiteOrAskFix(
      pending,
      {
        root,
        agentName,
        firstMode,
        fixHint,
        currentState,
        force: forceGeneration
      },
      { finalById }
    );

    if (generated.stopped) break;
    if (generated.skipped) {
      pending = pending.slice(1);
      firstMode = 'start';
      fixHint = '';
      forceGeneration = false;
      continue;
    }

    emitSuiteEvent('suite.generated', {
      count: pending.length,
      cacheKey: generated.cacheKey,
      reused: generated.reused,
      firstMode
    });

    const runOutput = await runSuite(root, generated.specPath, pending);
    const results = runOutput.results;
    results.forEach((result, index) => itemEvent(pending[index], result));

    let failedIndex = results.findIndex((item) => item.result === 'Falhou');
    if (failedIndex === -1 && runOutput.exitCode !== 0) {
      failedIndex = results.findIndex((item) => item.result === 'Não Executado');
      if (failedIndex === -1) failedIndex = 0;
      results[failedIndex] = terminalResult(
        results[failedIndex],
        'Falhou',
        compactError(results[failedIndex], runOutput) || 'Playwright encerrou com erro.'
      );
    }

    const completedLimit = failedIndex === -1 ? results.length : failedIndex;
    for (let index = 0; index < completedLimit; index++) {
      if (results[index].result === 'Passou') {
        finalById.set(String(pending[index].caseId), results[index]);
      }
    }

    if (failedIndex === -1) {
      for (let index = completedLimit; index < results.length; index++) {
        finalById.set(String(pending[index].caseId), results[index]);
      }
      break;
    }

    const failedCase = pending[failedIndex];
    const failedResult = results[failedIndex];
    const remaining = pending.slice(failedIndex);
    const technical = isTechnicalFailure(failedResult, runOutput);
    const error = compactError(failedResult, runOutput);

    if (!technical) {
      const terminal = terminalResult(failedResult, 'Falhou', error);
      finalById.set(String(failedCase.caseId), terminal);
      itemEvent(failedCase, terminal);
      emitSuiteEvent('suite.stopped', {
        caseId: failedCase.caseId,
        code: failedCase.code,
        reason: 'functional_failure'
      });
      break;
    }

    if (!autoHealed.has(String(failedCase.caseId))) {
      autoHealed.add(String(failedCase.caseId));
      console.warn(`[agent-runner] Self-healing automático em ${failedCase.code}...`);
      emitSuiteEvent('suite.healing', {
        caseId: failedCase.caseId,
        code: failedCase.code,
        automatic: true,
        error
      });
      pending = remaining;
      firstMode = 'continue';
      fixHint = error;
      forceGeneration = true;
      continue;
    }

    const action = await askUserFix(failedCase, error);

    if (action === 'regen') {
      pending = remaining;
      firstMode = 'continue';
      fixHint = `Regeneração solicitada pelo usuário:\n${error}`;
      forceGeneration = true;
      continue;
    }
    if (action === 'skip') {
      const skipped = {
        ...failedResult,
        result: 'Não Executado',
        reportStatus: 'skippedByUser',
        error: 'Caso pulado pelo usuário após falha técnica.'
      };
      finalById.set(String(failedCase.caseId), skipped);
      itemEvent(failedCase, skipped);
      pending = pending.slice(failedIndex + 1);
      firstMode = 'start';
      fixHint = '';
      forceGeneration = false;
      continue;
    }

    const stopped = terminalResult(
      failedResult,
      'Bloqueado',
      error || 'Fila parada pelo usuário.'
    );
    finalById.set(String(failedCase.caseId), stopped);
    itemEvent(failedCase, stopped);
    emitSuiteEvent('suite.stopped', {
      caseId: failedCase.caseId,
      code: failedCase.code,
      reason: 'user_stop'
    });
    break;
  }

  const runResults = cases.map((testCase) => {
    const existing = finalById.get(String(testCase.caseId));
    if (existing) return existing;
    const notRun = {
      caseId: String(testCase.caseId),
      result: 'Não Executado',
      error: '',
      duration: 0,
      reportStatus: 'notRunAfterFailure'
    };
    itemEvent(testCase, notRun);
    return notRun;
  });
  const judgments = await judgeSuite(cases, runResults, {
    agentName,
    root,
    skipJudge
  });
  const results = await persistSuiteResults(cases, judgments, {
    agentName,
    root
  });
  const passed = results.filter((item) => item.result === 'Passou').length;
  const failed = results.filter((item) => ['Falhou', 'Bloqueado'].includes(item.result)).length;
  emitSuiteEvent('suite.finished', { passed, failed, total: cases.length, items: results });
  return { results, passed, failed, skipped: cases.length - passed - failed };
}

module.exports = {
  runSequentialSuite,
  loadSuiteCases,
  isTechnicalFailure,
  generateSuiteOrAskFix
};
