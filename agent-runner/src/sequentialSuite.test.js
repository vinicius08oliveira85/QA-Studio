/**
 * Testes da orquestração da suíte contínua (healing / falha técnica).
 * Rode: npm run test:unit
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isTechnicalFailure } = require('./sequentialSuite');

describe('isTechnicalFailure', () => {
  it('trata SUT_ERROR, FLOW_CONTEXT_LOST e timeout como técnicos', () => {
    assert.equal(
      isTechnicalFailure({ error: 'SUT_ERROR: agenda indisponível' }, { log: '' }),
      true
    );
    assert.equal(
      isTechnicalFailure({ error: 'FLOW_CONTEXT_LOST: prontuário ausente' }, { log: '' }),
      true
    );
    assert.equal(
      isTechnicalFailure({ error: '' }, { log: 'Timeout 30000ms exceeded while waiting for locator' }),
      true
    );
    assert.equal(isTechnicalFailure({ error: '' }, { infraTimeout: true, log: '' }), true);
  });

  it('não trata falha funcional de asserção como técnica', () => {
    assert.equal(
      isTechnicalFailure(
        { error: 'Esperado nome do paciente Maria no prontuário' },
        { log: 'expect(locator).toContainText failed' }
      ),
      false
    );
  });
});
