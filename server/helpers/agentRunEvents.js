const { readFixRequest } = require('../../agent-runner/helpers/flowControl');

const EVENT_PREFIX = '[QA_EVENT] ';

function upsertItem(job, payload) {
  const id = Number(payload.caseId);
  const index = (job.items || []).findIndex((item) => Number(item.caseId) === id);
  const previous = index >= 0 ? job.items[index] : {};
  const next = {
    ...previous,
    caseId: id,
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.status || payload.result ? { status: payload.status || payload.result } : {}),
    ...(payload.error !== undefined ? { error: payload.error } : {}),
    ...(payload.durationMs !== undefined ? { durationMs: payload.durationMs } : {}),
    ...(payload.reportStatus !== undefined ? { reportStatus: payload.reportStatus } : {}),
    ...(payload.executionId !== undefined ? { executionId: payload.executionId } : {}),
    ...(payload.recorded !== undefined ? { recorded: payload.recorded } : {})
  };
  if (index >= 0) job.items[index] = next;
  else job.items.push(next);
  return next;
}

function applyStructuredEvent(job, event) {
  job.lastEvent = event;
  switch (event.type) {
    case 'suite.started':
      job.phase = 'generating_suite';
      job.items = (event.items || []).map((item) => ({ ...item }));
      break;
    case 'suite.generated':
      job.phase = 'running_suite';
      job.waitingFix = false;
      job.suiteCacheKey = event.cacheKey || null;
      job.suiteReused = !!event.reused;
      break;
    case 'case.started':
      job.phase = 'running_case';
      job.currentCaseId = Number(event.caseId);
      job.currentCaseCode = event.code || null;
      upsertItem(job, { ...event, status: 'Executando' });
      break;
    case 'case.finished':
    case 'case.result':
      upsertItem(job, event);
      break;
    case 'case.recorded':
      upsertItem(job, event);
      break;
    case 'suite.healing':
      job.phase = 'healing';
      job.currentCaseId = Number(event.caseId);
      job.currentCaseCode = event.code || null;
      job.fixPrompt = event.error || '';
      break;
    case 'suite.waitingFix':
      job.phase = 'waiting_fix';
      job.waitingFix = true;
      job.currentCaseId = Number(event.caseId);
      job.currentCaseCode = event.code || null;
      job.fixPrompt = event.error || '';
      break;
    case 'suite.stopped':
      job.phase = 'stopped_after_fail';
      job.queueStopped = true;
      break;
    case 'suite.finished':
      job.phase = 'finishing';
      job.summary = {
        passed: event.passed || 0,
        failed: event.failed || 0,
        total: event.total || 0
      };
      for (const item of event.items || []) upsertItem(job, item);
      break;
    default:
      break;
  }
}

function parseEvents(job, chunk) {
  job.eventBuffer = (job.eventBuffer || '') + chunk;
  const lines = job.eventBuffer.split(/\r?\n/);
  job.eventBuffer = lines.pop() || '';
  for (const line of lines) {
    const index = line.indexOf(EVENT_PREFIX);
    if (index === -1) continue;
    try {
      applyStructuredEvent(job, JSON.parse(line.slice(index + EVENT_PREFIX.length)));
    } catch {
      // Log permanece disponível; evento inválido não derruba o job.
    }
  }
}

function applyLegacySignals(job, chunk) {
  if (/\[SSO\].*Aguardando/i.test(chunk) || /\[SSO\].*login manual/i.test(chunk)) {
    job.waitingSso = true;
    job.phase = 'waiting_sso';
  }
  if (/\[SSO\].*Continuando|\[SSO\].*Confirmação|\[SSO\].*retomando/i.test(chunk)) {
    job.waitingSso = false;
    job.phase = 'running';
  }
  if (/\[FLOW\].*WAITING_FIX/i.test(chunk)) {
    job.waitingFix = true;
    job.phase = 'waiting_fix';
    const request = readFixRequest();
    if (request) {
      job.fixPrompt = request.error || '';
      job.currentCaseId = request.caseId || null;
      job.currentCaseCode = request.code || null;
    }
  }
  if (/\[FLOW\].*FIX_ACTION=/i.test(chunk)) {
    job.waitingFix = false;
    job.phase = 'running';
  }
  if (/\[FLOW\].*STOPPED_AFTER_FAIL/i.test(chunk)) {
    job.phase = 'stopped_after_fail';
    job.queueStopped = true;
  }
}

function appendJobOutput(job, chunk, { parseStructured = false } = {}) {
  const text = String(chunk || '');
  job.log += text;
  if (job.log.length > 100_000) job.log = job.log.slice(-80_000);
  if (parseStructured) parseEvents(job, text);
  applyLegacySignals(job, text);
}

/** Reaplica eventos do log (útil se o processo morrer antes do poll da UI). */
function reconcileJobFromLog(job) {
  if (!job?.log) return;
  job.eventBuffer = '';
  parseEvents(job, job.log.endsWith('\n') ? job.log : job.log + '\n');
}

/** Extrai mensagem legível do log quando o runner encerra com erro. */
function readableRunnerError(job, exitCode) {
  const log = String(job.log || '');
  const patterns = [
    /Falha ao gerar\/regenerar a suíte:[^\n]+/i,
    /Suíte inválida após regeneração:[^\n]+/i,
    /Error: Suíte inválida[^\n]*/i,
    /\[FLOW\] WAITING_FIX[^\n]*/i
  ];
  for (const re of patterns) {
    const matches = log.match(new RegExp(re.source, 'gi'));
    if (matches?.length) {
      const last = matches[matches.length - 1].replace(/^Error:\s*/i, '').trim();
      if (/gerar|regener|inválida/i.test(last)) {
        return `Falha ao regenerar a suíte — use Cancelar ou rode novamente. (${last.slice(0, 240)})`;
      }
      return last.slice(0, 400);
    }
  }
  if (job.queueStopped) {
    return job.error || 'Fila parada após falha — próximos casos não executados.';
  }
  return job.error || `Runner exit ${exitCode}`;
}

function finalizeJobError(job, exitCode) {
  reconcileJobFromLog(job);
  job.error = readableRunnerError(job, exitCode);
  if (job.queueStopped) job.phase = 'stopped_after_fail';
  else if (/regenerar|gerar a suíte|inválida/i.test(job.error || '')) job.phase = 'generation_failed';
  else job.phase = 'error';
}

module.exports = {
  appendJobOutput,
  applyStructuredEvent,
  upsertItem,
  reconcileJobFromLog,
  readableRunnerError,
  finalizeJobError
};
