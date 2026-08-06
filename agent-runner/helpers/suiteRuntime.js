const EVENT_PREFIX = '[QA_EVENT] ';

function emitSuiteEvent(type, payload = {}) {
  const event = {
    type,
    at: new Date().toISOString(),
    ...payload
  };
  process.stdout.write(EVENT_PREFIX + JSON.stringify(event) + '\n');
}

async function runSuiteCase(meta, run) {
  const payload = {
    caseId: Number(meta.caseId),
    code: meta.code,
    title: meta.title
  };
  emitSuiteEvent('case.started', payload);
  const started = Date.now();
  try {
    await run();
    emitSuiteEvent('case.finished', {
      ...payload,
      status: 'Passou',
      durationMs: Date.now() - started
    });
  } catch (error) {
    emitSuiteEvent('case.finished', {
      ...payload,
      status: 'Falhou',
      durationMs: Date.now() - started,
      error: String(error?.message || error).slice(0, 2000)
    });
    throw error;
  }
}

module.exports = { EVENT_PREFIX, emitSuiteEvent, runSuiteCase };
