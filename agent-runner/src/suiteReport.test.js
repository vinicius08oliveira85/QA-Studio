const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSuiteReport,
  validateSuiteSpec,
  suiteCacheKey
} = require('./suiteReport');

const cases = [
  {
    id: 10,
    code: 'TC-10',
    title: 'Abrir agenda',
    steps: [{ order: 1, action: 'Abrir', expected: 'Agenda visível' }]
  },
  {
    caseId: 20,
    code: 'TC-20',
    title: 'Selecionar paciente',
    steps: [{ order: 1, action: 'Selecionar', expected: 'Paciente aberto' }]
  },
  {
    id: 30,
    code: 'TC-30',
    title: 'Finalizar',
    steps: [{ order: 1, action: 'Finalizar', expected: 'Concluído' }]
  }
];

describe('parseSuiteReport', () => {
  it('normaliza casos passados, falhos e pulados na ordem de entrada', () => {
    const report = {
      suites: [{
        title: 'raiz',
        suites: [{
          specs: [
            {
              title: 'CASE::10::TC-10::Abrir agenda',
              tests: [{ results: [{ status: 'passed', duration: 120 }] }]
            },
            {
              title: 'CASE::20::TC-20::Selecionar paciente',
              tests: [{
                results: [{
                  status: 'failed',
                  duration: 80,
                  errors: [{ message: 'Esperado paciente aberto' }]
                }]
              }]
            },
            {
              title: 'CASE::30::TC-30::Finalizar',
              tests: [{ results: [{ status: 'skipped', duration: 0 }] }]
            }
          ]
        }]
      }]
    };

    const parsed = parseSuiteReport(report, cases);
    assert.deepEqual(parsed.map((item) => item.result), [
      'Passou',
      'Falhou',
      'Não Executado'
    ]);
    assert.equal(parsed[0].duration, 120);
    assert.equal(parsed[1].error, 'Esperado paciente aberto');
    assert.equal(parsed[1].reportStatus, 'failed');
    assert.equal(parsed[2].reportStatus, 'skipped');
  });

  it('retorna Não Executado quando o caso está ausente', () => {
    const [missing] = parseSuiteReport({ suites: [] }, [cases[0]]);
    assert.deepEqual(missing, {
      caseId: '10',
      result: 'Não Executado',
      error: '',
      duration: 0,
      reportStatus: 'absent'
    });
  });
});

function validSuiteSource() {
  return `
import { test, expect } from '../helpers/flowFixtures';
import { waitForManualLogin } from '../helpers/ssoWait';
import { runSuiteCase } from '../helpers/suiteRuntime';

test.describe.configure({ mode: 'serial' });

// CASE_START:10:start
test('CASE::10::TC-10::Abrir agenda', async ({ page }) => {
  await runSuiteCase({ caseId: 10, code: 'TC-10', title: 'Abrir agenda' }, async () => {
    await page.goto('/');
    await waitForManualLogin(page);
    await test.step('Passo 1', async () => {
      await expect(page.getByText('Agenda')).toBeVisible();
      await page.screenshot({ path: 'artifacts/step-10-1.png' });
    });
  });
});
// CASE_END:10

// CASE_START:20:continue
test('CASE::20::TC-20::Selecionar paciente', async ({ page }) => {
  await runSuiteCase({ caseId: 20, code: 'TC-20', title: 'Selecionar paciente' }, async () => {
    const inherited = await page.getByText('Agenda').isVisible();
    if (!inherited) throw new Error('FLOW_CONTEXT_LOST: agenda ausente');
    await test.step('Passo 1', async () => {
      await page.getByText('Paciente').click();
      await page.screenshot({ path: 'artifacts/step-20-1.png' });
    });
  });
});
// CASE_END:20
`;
}

describe('validateSuiteSpec', () => {
  const validationCases = cases.slice(0, 2);

  it('aceita start seguido de continue válido', () => {
    assert.deepEqual(validateSuiteSpec(validSuiteSource(), validationCases, {
      firstMode: 'start'
    }), []);
  });

  it('rejeita login, goto raiz e ausência de contexto no continue', () => {
    const invalid = validSuiteSource()
      .replace(
        "const inherited = await page.getByText('Agenda').isVisible();\n    if (!inherited) throw new Error('FLOW_CONTEXT_LOST: agenda ausente');",
        "await page.goto('/');\n    await waitForManualLogin(page);"
      );
    const issues = validateSuiteSpec(invalid, validationCases, { firstMode: 'start' });
    assert.ok(issues.some((issue) => /goto/.test(issue)), issues.join('\n'));
    assert.ok(issues.some((issue) => /waitForManualLogin/.test(issue)), issues.join('\n'));
    assert.ok(issues.some((issue) => /FLOW_CONTEXT_LOST/.test(issue)), issues.join('\n'));
  });

  it('exige login no segmento start e screenshots por passo', () => {
    const invalid = validSuiteSource()
      .replace('    await waitForManualLogin(page);\n', '')
      .replace("      await page.screenshot({ path: 'artifacts/step-10-1.png' });\n", '');
    const issues = validateSuiteSpec(invalid, validationCases);
    assert.ok(issues.some((issue) => /start deve chamar/.test(issue)), issues.join('\n'));
    assert.ok(issues.some((issue) => /step-10-1/.test(issue)), issues.join('\n'));
  });

  it('rejeita goto absoluto e caminho hierárquico colado no localizador', () => {
    const invalid = validSuiteSource()
      .replace("await page.goto('/');", "await page.goto('https://cpm.hom.levesaude.com.br/');")
      .replace(
        "await expect(page.getByText('Agenda')).toBeVisible();",
        "await page.locator('text=Atendimento/Ambulatorial').click();"
      );
    const issues = validateSuiteSpec(invalid, validationCases, { firstMode: 'start' });
    assert.ok(issues.some((issue) => /URL absoluta|http\/https/i.test(issue)), issues.join('\n'));
    assert.ok(issues.some((issue) => /caminho colado/i.test(issue)), issues.join('\n'));
  });
});

describe('suiteCacheKey', () => {
  it('é estável e inclui modo e fixHint', () => {
    const key = suiteCacheKey(cases, { firstMode: 'start', fixHint: 'a' });
    assert.equal(key, suiteCacheKey(cases, { fixHint: 'a', firstMode: 'start' }));
    assert.notEqual(key, suiteCacheKey(cases, { firstMode: 'continue', fixHint: 'a' }));
    assert.notEqual(key, suiteCacheKey(cases, { firstMode: 'start', fixHint: 'b' }));
    assert.match(key, /^[a-f0-9]{16}$/);
  });
});
