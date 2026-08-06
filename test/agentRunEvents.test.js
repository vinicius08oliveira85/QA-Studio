const test = require('node:test');
const assert = require('node:assert/strict');
const {
  appendJobOutput,
  applyStructuredEvent
} = require('../server/helpers/agentRunEvents');

function job() {
  return {
    log: '',
    phase: 'running',
    items: [],
    waitingSso: false,
    waitingFix: false
  };
}

test('eventos estruturados criam e atualizam checklist da suíte', () => {
  const target = job();
  applyStructuredEvent(target, {
    type: 'suite.started',
    items: [{ caseId: 1, code: 'TC-001', title: 'Login', position: 0, status: 'Pendente' }]
  });
  applyStructuredEvent(target, {
    type: 'case.started',
    caseId: 1,
    code: 'TC-001'
  });
  assert.equal(target.items[0].status, 'Executando');
  assert.equal(target.currentCaseCode, 'TC-001');

  applyStructuredEvent(target, {
    type: 'case.recorded',
    caseId: 1,
    code: 'TC-001',
    status: 'Passou',
    executionId: 42,
    recorded: true
  });
  assert.deepEqual(
    { status: target.items[0].status, executionId: target.items[0].executionId },
    { status: 'Passou', executionId: 42 }
  );
});

test('parser suporta evento dividido entre chunks', () => {
  const target = job();
  const line = '[QA_EVENT] {"type":"suite.waitingFix","caseId":2,"code":"TC-002","error":"seletor"}\n';
  appendJobOutput(target, line.slice(0, 35), { parseStructured: true });
  assert.equal(target.waitingFix, false);
  appendJobOutput(target, line.slice(35), { parseStructured: true });
  assert.equal(target.waitingFix, true);
  assert.equal(target.phase, 'waiting_fix');
  assert.equal(target.currentCaseId, 2);
  assert.equal(target.fixPrompt, 'seletor');
});

test('suite.finished consolida resumo e itens', () => {
  const target = job();
  applyStructuredEvent(target, {
    type: 'suite.finished',
    passed: 1,
    failed: 1,
    total: 3,
    items: [
      { caseId: 1, code: 'TC-001', status: 'Passou' },
      { caseId: 2, code: 'TC-002', status: 'Falhou' },
      { caseId: 3, code: 'TC-003', status: 'Não Executado' }
    ]
  });
  assert.deepEqual(target.summary, { passed: 1, failed: 1, total: 3 });
  assert.equal(target.items.length, 3);
  assert.equal(target.phase, 'finishing');
});

test('suite.generated limpa waitingFix ao retomar a suíte', () => {
  const target = job();
  target.waitingFix = true;
  target.phase = 'waiting_fix';
  applyStructuredEvent(target, {
    type: 'suite.generated',
    cacheKey: 'abc',
    reused: false
  });
  assert.equal(target.waitingFix, false);
  assert.equal(target.phase, 'running_suite');
  assert.equal(target.suiteCacheKey, 'abc');
});

test('finalizeJobError preserva checklist e mensagem legível de regeneração', () => {
  const { finalizeJobError } = require('../server/helpers/agentRunEvents');
  const target = job();
  target.log = [
    '[QA_EVENT] {"type":"suite.started","items":[{"caseId":1,"code":"TC-001","position":0,"status":"Pendente"}]}',
    '[QA_EVENT] {"type":"case.result","caseId":1,"code":"TC-001","status":"Falhou","error":"timeout"}',
    'Error: Suíte inválida após regeneração: A resposta não continha um code fence TypeScript válido.'
  ].join('\n') + '\n';
  finalizeJobError(target, 1);
  assert.match(target.error, /regenerar a suíte/i);
  assert.equal(target.items[0].status, 'Falhou');
  assert.equal(target.phase, 'generation_failed');
});
