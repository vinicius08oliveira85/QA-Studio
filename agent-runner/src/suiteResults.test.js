/**
 * Testes do julgamento/persistência estrutural da suíte.
 * Rode: npm run test:unit
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJudgments } = require('./suiteResults');

const cases = [
  {
    caseId: 1,
    code: 'TC-001',
    steps: [
      { order: 1, action: 'Login', expected: 'Logado' },
      { order: 2, action: 'Abrir', expected: 'Agenda' }
    ]
  },
  {
    caseId: 2,
    code: 'TC-002',
    steps: [{ order: 1, action: 'Validar', expected: 'Nome' }]
  }
];

describe('normalizeJudgments', () => {
  it('preserva ordem e completa passos ausentes do judge', () => {
    const runResults = [
      { caseId: '1', result: 'Passou', reportStatus: 'passed', error: '' },
      { caseId: '2', result: 'Falhou', reportStatus: 'failed', error: 'nome ausente' }
    ];
    const judged = normalizeJudgments(cases, runResults, {
      results: [
        {
          caseId: '1',
          result: 'Passou',
          actual_result: 'ok',
          notes: 'ok',
          step_results: [{ order: 1, actual: 'Login ok', result: 'Passou' }]
        },
        {
          caseId: '2',
          result: 'Falhou',
          actual_result: 'nome ausente',
          notes: 'falhou',
          step_results: [{ order: 1, actual: 'nome ausente', result: 'Falhou' }]
        }
      ]
    });
    assert.equal(judged[0].result, 'Passou');
    assert.equal(judged[0].step_results.length, 1);
    assert.equal(judged[1].result, 'Falhou');
    assert.equal(judged[1].actual_result, 'nome ausente');
  });

  it('força Não Executado quando Playwright não rodou o caso', () => {
    const runResults = [
      { caseId: '1', result: 'Passou', reportStatus: 'passed', error: '' },
      { caseId: '2', result: 'Não Executado', reportStatus: 'skipped', error: '' }
    ];
    const judged = normalizeJudgments(cases, runResults, {
      results: [
        { caseId: '1', result: 'Passou', actual_result: 'ok', notes: '', step_results: [] },
        { caseId: '2', result: 'Passou', actual_result: 'não deveria', notes: '', step_results: [] }
      ]
    });
    assert.equal(judged[1].result, 'Não Executado');
    assert.notEqual(judged[1].actual_result, 'não deveria');
  });
});
