/**
 * Testes leves do runner: staticSpecViolations (start vs continue) e
 * detecção de marcadores (SUT_ERROR / FLOW_CONTEXT_LOST).
 * Rode: npm run test:unit
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { staticSpecViolations, detectSutErrors, detectFlowContextLost } = require('./runCase');

const baseCtx = {
  caseId: 42,
  steps: [
    { order: 1, action: 'a', expected: 'b' },
    { order: 2, action: 'c', expected: 'd' }
  ]
};

const shot = (n) => `await page.screenshot({ path: 'artifacts/step-42-${n}.png', fullPage: true });`;

describe('staticSpecViolations', () => {
  it('start: exige waitForManualLogin e screenshots', () => {
    const src = `
import { test, expect } from '@playwright/test';
import { waitForManualLogin } from '../helpers/ssoWait';
test.describe('TC', () => {
  test('t', async ({ page }) => {
    await page.goto('/');
    await waitForManualLogin(page, { force: true });
    ${shot(1)}
    ${shot(2)}
  });
});
`;
    assert.deepEqual(staticSpecViolations(src, { ...baseCtx, flowMode: 'start' }), []);
  });

  it('continue: rejeita goto("/") e waitForManualLogin', () => {
    const src = `
import { test, expect } from '../helpers/flowFixtures';
import { waitForManualLogin } from '../helpers/ssoWait';
test.describe('TC', () => {
  test('t', async ({ page }) => {
    await page.goto('/');
    await waitForManualLogin(page, { force: true });
    if (false) throw new Error('FLOW_CONTEXT_LOST: x');
    ${shot(1)}
    ${shot(2)}
  });
});
`;
    const issues = staticSpecViolations(src, {
      ...baseCtx,
      flowMode: 'continue',
      sequentialFlow: true
    });
    assert.ok(issues.some((i) => /goto\('\/'\)/.test(i)), issues.join('; '));
    assert.ok(issues.some((i) => /waitForManualLogin/.test(i)), issues.join('; '));
  });

  it('continue: aceita spec sem goto root e com FLOW_CONTEXT_LOST', () => {
    const src = `
import { test, expect } from '../helpers/flowFixtures';
test.describe('TC', () => {
  test('t', async ({ page }) => {
    const ok = await page.getByText('Prontuário').isVisible().catch(() => false);
    if (!ok) throw new Error('FLOW_CONTEXT_LOST: prontuário não aberto');
    ${shot(1)}
    ${shot(2)}
  });
});
`;
    assert.deepEqual(
      staticSpecViolations(src, { ...baseCtx, flowMode: 'continue', sequentialFlow: true }),
      []
    );
  });

  it('continue: exige import flowFixtures', () => {
    const src = `
import { test, expect } from '@playwright/test';
test.describe('TC', () => {
  test('t', async ({ page }) => {
    if (!page) throw new Error('FLOW_CONTEXT_LOST: x');
    ${shot(1)}
    ${shot(2)}
  });
});
`;
    const issues = staticSpecViolations(src, {
      ...baseCtx,
      flowMode: 'continue',
      sequentialFlow: true
    });
    assert.ok(issues.some((i) => /flowFixtures/.test(i)), issues.join('; '));
  });
});

describe('detecção de marcadores', () => {
  it('ignora o trecho de código impresso pelo Playwright', () => {
    const runOut = {
      exitCode: 1,
      reportErrors: [
        'Error: expect(locator).toBeVisible() failed\n' +
        '   40 |       if (errorMessage) {\n' +
        ">  41 |         throw new Error('SUT_ERROR: ' + errorMessage.trim());\n" +
        '      |               ^\n'
      ],
      log: "    throw new Error('FLOW_CONTEXT_LOST: ' + reason);\n"
    };
    assert.deepEqual(detectSutErrors(runOut), []);
    assert.deepEqual(detectFlowContextLost(runOut), []);
  });

  it('captura a mensagem lançada em runtime', () => {
    const runOut = {
      exitCode: 1,
      reportErrors: ['Error: SUT_ERROR: Não foi possível carregar a agenda'],
      log: 'Error: FLOW_CONTEXT_LOST: prontuário não está aberto\n'
    };
    assert.deepEqual(detectSutErrors(runOut), ['Não foi possível carregar a agenda']);
    assert.deepEqual(detectFlowContextLost(runOut), ['prontuário não está aberto']);
  });

  it('não duplica a mesma mensagem', () => {
    const runOut = {
      exitCode: 1,
      reportErrors: ['Error: SUT_ERROR: indisponível'],
      log: 'Error: SUT_ERROR: indisponível\n'
    };
    assert.deepEqual(detectSutErrors(runOut), ['indisponível']);
  });
});
