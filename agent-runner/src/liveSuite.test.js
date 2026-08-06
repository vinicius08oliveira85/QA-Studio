/**
 * Testes do Agent ao vivo: parse de veredito, prompts e wiring MCP/CDP.
 * Rode: npm run test:unit
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseLiveCaseResult, isTechnicalFailure } = require('./liveSuite');
const { buildLiveCasePrompt } = require('./suitePrompts');
const { ensureLiveConfig } = require('./agents/opencodeLive');
const browserSession = require('./browserSession');

const sampleCase = {
  caseId: 101,
  code: 'TC-001',
  title: 'Abrir Ambulatorial',
  type: 'Fumaça',
  baseURL: 'https://example.test/',
  preconditions: 'Logado',
  steps: [
    { order: 1, action: 'Clicar Atendimento', expected: 'Menu abre' },
    { order: 2, action: 'Clicar Ambulatorial', expected: 'Tela ambulatorial' }
  ],
  mass: []
};

describe('buildLiveCasePrompt', () => {
  it('exige target sem prefixo ref= e proíbe caminho colado', () => {
    const prompt = buildLiveCasePrompt(sampleCase, {
      mode: 'start',
      index: 0,
      total: 2
    });
    assert.match(prompt, /target="e29"/);
    assert.match(prompt, /NEVER target="ref=e29"/);
    assert.match(prompt, /role\/text/);
    assert.match(prompt, /mode=start/);
    assert.match(prompt, /"caseId":"101"/);
  });

  it('continue proíbe reset de sessão', () => {
    const prompt = buildLiveCasePrompt(sampleCase, {
      mode: 'continue',
      index: 1,
      total: 2,
      previousCase: { caseId: 100, result: 'Passou' }
    });
    assert.match(prompt, /mode=continue/);
    assert.match(prompt, /no re-login/i);
    assert.match(prompt, /PREVIOUS CASE OUTCOME/);
  });
});

describe('parseLiveCaseResult', () => {
  it('aceita JSON de Passou', () => {
    const raw = JSON.stringify({
      caseId: '101',
      result: 'Passou',
      actual_result: 'Menu Ambulatorial visível',
      notes: 'cliquei Atendimento depois Ambulatorial',
      step_results: [
        { order: 1, actual: 'ok', result: 'Passou' },
        { order: 2, actual: 'ok', result: 'Passou' }
      ]
    });
    const out = parseLiveCaseResult(raw, sampleCase);
    assert.equal(out.result, 'Passou');
    assert.equal(out.step_results.length, 2);
    assert.equal(out.error, '');
  });

  it('marca Falhou quando não há JSON', () => {
    const out = parseLiveCaseResult('não consegui clicar', sampleCase);
    assert.equal(out.result, 'Falhou');
    assert.equal(out.reportStatus, 'liveParseFailed');
    assert.equal(isTechnicalFailure(out), true);
  });

  it('Falhou funcional não é técnico se mensagem de negócio', () => {
    const out = parseLiveCaseResult(JSON.stringify({
      caseId: '101',
      result: 'Falhou',
      actual_result: 'Campo Unidade mostrou valor errado LEVE CLINICA BARRA',
      notes: 'asserção de negócio'
    }), sampleCase);
    assert.equal(out.result, 'Falhou');
    assert.equal(isTechnicalFailure(out), false);
  });
});

describe('ensureLiveConfig', () => {
  it('grava MCP Playwright com --cdp-endpoint', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-live-cfg-'));
    const cdp = 'http://127.0.0.1:9333';
    const file = ensureLiveConfig(dir, cdp);
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(cfg.mcp.playwright.enabled, true);
    assert.ok(cfg.mcp.playwright.command.some((arg) => String(arg).includes(`--cdp-endpoint=${cdp}`)));
  });
});

describe('browserSession context[0] para MCP', () => {
  before(async () => {
    await browserSession.start({
      headed: false,
      baseURL: 'data:text/html,<h1>Live MCP wiring</h1><button>Atendimento</button>'
    });
  });

  after(async () => {
    await browserSession.stop();
  });

  it('expõe QA_FLOW_CDP e snapshot no context padrão', async () => {
    const cdp = browserSession.getCdpEndpoint();
    assert.match(cdp, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(process.env.PLAYWRIGHT_MCP_CDP_ENDPOINT, cdp);
    const snap = await browserSession.snapshot();
    assert.ok(snap);
    assert.match(snap.heading || snap.title || '', /Live MCP|wiring/i);
  });

  it('connectDefaultPage usa a mesma page', async () => {
    const connected = await browserSession.connectDefaultPage();
    assert.ok(connected?.page);
    const text = await connected.page.locator('h1').innerText();
    assert.match(text, /Live MCP wiring/);
  });
});
