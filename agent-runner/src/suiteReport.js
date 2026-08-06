const fs = require('fs');
const crypto = require('crypto');

const FAIL_STATUSES = new Set(['failed', 'timedout', 'interrupted']);

function idOf(testCase) {
  return String(testCase.caseId ?? testCase.id);
}

function loadReport(reportOrPath) {
  if (typeof reportOrPath !== 'string') return reportOrPath || {};
  const text = fs.existsSync(reportOrPath)
    ? fs.readFileSync(reportOrPath, 'utf8')
    : reportOrPath;
  return JSON.parse(text);
}

function errorMessage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.message || value.value || '';
}

function collectSpec(spec, bucket) {
  const match = String(spec.title || '').match(/^CASE::([^:]+)::/);
  if (!match) return;
  const record = bucket.get(match[1]) || { statuses: [], errors: [], duration: 0 };
  for (const test of spec.tests || []) {
    if (test.status) record.statuses.push(String(test.status));
    for (const result of test.results || []) {
      if (result.status) record.statuses.push(String(result.status));
      record.duration += Number(result.duration) || 0;
      const errors = [
        result.error,
        ...(result.errors || []),
        test.error,
        ...(test.errors || [])
      ].map(errorMessage).filter(Boolean);
      record.errors.push(...errors);
    }
  }
  if (!record.statuses.length && spec.status) record.statuses.push(String(spec.status));
  bucket.set(match[1], record);
}

function walkReport(node, bucket) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.specs)) {
    for (const spec of node.specs) collectSpec(spec, bucket);
  }
  if (Array.isArray(node.suites)) {
    for (const suite of node.suites) walkReport(suite, bucket);
  }
}

function normalizedStatus(statuses) {
  const lowered = statuses.map((status) => status.toLowerCase());
  const failed = lowered.find((status) => FAIL_STATUSES.has(status));
  if (failed) return { result: 'Falhou', reportStatus: failed };
  if (lowered.includes('passed')) return { result: 'Passou', reportStatus: 'passed' };
  const skipped = lowered.find((status) => status === 'skipped');
  return { result: 'Não Executado', reportStatus: skipped || lowered[0] || 'absent' };
}

function parseSuiteReport(reportOrPath, cases) {
  const bucket = new Map();
  walkReport(loadReport(reportOrPath), bucket);
  return (cases || []).map((testCase) => {
    const caseId = idOf(testCase);
    const record = bucket.get(caseId) || { statuses: [], errors: [], duration: 0 };
    const status = normalizedStatus(record.statuses);
    return {
      caseId,
      result: status.result,
      error: record.errors[0] || '',
      duration: record.duration,
      reportStatus: status.reportStatus
    };
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function expectedTitle(testCase) {
  return `CASE::${idOf(testCase)}::${testCase.code || ''}::${testCase.title || ''}`;
}

function testTitles(source) {
  const titles = [];
  const pattern = /\btest\s*\(\s*(['"`])(CASE::[\s\S]*?)\1\s*,/g;
  let match;
  while ((match = pattern.exec(source))) titles.push(match[2]);
  return titles;
}

function markerSegments(source) {
  const starts = [];
  const pattern = /\/\/\s*CASE_START:([^:\r\n]+):(start|continue)\s*$/gm;
  let match;
  while ((match = pattern.exec(source))) {
    starts.push({ id: match[1].trim(), mode: match[2], index: match.index });
  }
  return starts.map((start, index) => ({
    ...start,
    source: source.slice(start.index, starts[index + 1]?.index ?? source.length)
  }));
}

function validateImports(source, issues) {
  const flowImport = /import\s*\{\s*test\s*,\s*expect\s*\}\s*from\s*['"]\.\.\/helpers\/flowFixtures['"]/;
  if (!flowImport.test(source)) {
    issues.push("Import obrigatório ausente: { test, expect } de '../helpers/flowFixtures'");
  }
  const runtimeImport = /import\s*\{\s*runSuiteCase\s*\}\s*from\s*['"]\.\.\/helpers\/suiteRuntime['"]/;
  if (!runtimeImport.test(source)) {
    issues.push("Import obrigatório ausente: { runSuiteCase } de '../helpers/suiteRuntime'");
  }
  if (!/test\.describe\.configure\s*\(\s*\{\s*mode\s*:\s*['"]serial['"]\s*\}\s*\)/.test(source)) {
    issues.push("Configuração obrigatória ausente: test.describe.configure({ mode: 'serial' })");
  }
}

function validateSegment(segment, testCase, mode, issues) {
  const id = idOf(testCase);
  const source = segment?.source || '';
  if (!segment || segment.id !== id || segment.mode !== mode) {
    issues.push(`CASE_START inválido para ${id}: esperado ${id}:${mode}`);
    return;
  }
  const end = new RegExp(`//\\s*CASE_END:${escapeRegExp(id)}\\s*$`, 'gm');
  if (countMatches(source, end) !== 1) issues.push(`CASE_END:${id} deve aparecer exatamente uma vez`);
  if (countMatches(source, /\brunSuiteCase\s*\(/g) !== 1) {
    issues.push(`Caso ${id} deve usar runSuiteCase exatamente uma vez`);
  }
  if (mode === 'continue') {
    if (/page\.goto\(\s*['"`]\/['"`]\s*\)/.test(source)) {
      issues.push(`Caso ${id} continue não pode usar page.goto('/')`);
    }
    if (/\bwaitForManualLogin\s*\(/.test(source)) {
      issues.push(`Caso ${id} continue não pode usar waitForManualLogin`);
    }
    if (!/FLOW_CONTEXT_LOST/.test(source)) {
      issues.push(`Caso ${id} continue deve tratar FLOW_CONTEXT_LOST`);
    }
  } else if (!/\bwaitForManualLogin\s*\(/.test(source)) {
    issues.push(`Caso ${id} start deve chamar waitForManualLogin`);
  }
  (testCase.steps || []).forEach((step, index) => {
    const number = step.order ?? index + 1;
    const shot = new RegExp(`artifacts/step-${escapeRegExp(id)}-${escapeRegExp(number)}\\.png`);
    if (!shot.test(source)) issues.push(`Screenshot ausente: artifacts/step-${id}-${number}.png`);
  });
}

/** Rejeita goto absoluto e localizadores com caminho hierárquico colado (A/B ou A > B). */
function validateLocatorHygiene(source, issues) {
  if (/page\.goto\(\s*['"`]https?:\/\//i.test(source)) {
    issues.push("page.goto com URL absoluta (http/https) é proibido — use path relativo '/'");
  }
  const candidates = source.match(
    /(?:getByText|locator)\(\s*(?:['"`]text=)?['"`][^'"`]+['"`]/g
  ) || [];
  for (const match of candidates) {
    const quoted = match.match(/['"`]([^'"`]+)['"`]\s*$/);
    let text = quoted ? quoted[1] : '';
    if (text.startsWith('text=')) text = text.slice(5);
    if (/^(xpath=|css=|id=|#|\.|role=)/i.test(text)) continue;
    if (/https?:\/\//i.test(text) || /artifacts\//i.test(text)) continue;
    // "Atendimento/Ambulatorial" ou "A > B > C"
    if (
      /[A-Za-zÀ-ÿ][^'"`/]*\/[A-Za-zÀ-ÿ]/.test(text) ||
      /[A-Za-zÀ-ÿ].*\s*>\s*.*[A-Za-zÀ-ÿ]/.test(text)
    ) {
      issues.push(`Localizador com caminho colado (use um segmento por clique): ${match.slice(0, 90)}`);
    }
  }
}

function validateSuiteSpec(source, cases, { firstMode = 'start' } = {}) {
  const issues = [];
  validateImports(source, issues);
  if (/\.waitForTimeout\s*\(/.test(source)) issues.push('page.waitForTimeout é proibido');
  validateLocatorHygiene(source, issues);

  const expectedTitles = (cases || []).map(expectedTitle);
  const actualTitles = testTitles(source);
  if (actualTitles.length !== expectedTitles.length ||
      expectedTitles.some((title, index) => actualTitles[index] !== title)) {
    issues.push('Os títulos dos testes devem corresponder exatamente aos casos, na ordem');
  }

  const segments = markerSegments(source);
  if (segments.length !== (cases || []).length) {
    issues.push(`Quantidade de CASE_START inválida: esperado ${(cases || []).length}, encontrado ${segments.length}`);
  }
  (cases || []).forEach((testCase, index) => {
    validateSegment(segments[index], testCase, index === 0 ? firstMode : 'continue', issues);
  });
  const endCount = countMatches(source, /\/\/\s*CASE_END:[^\r\n]+\s*$/gm);
  if (endCount !== (cases || []).length) {
    issues.push(`Quantidade de CASE_END inválida: esperado ${(cases || []).length}, encontrado ${endCount}`);
  }
  return issues;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function suiteCacheKey(cases, opts = {}) {
  const payload = stable({
    // Bump quando regras de validateSuiteSpec mudam (invalida specs ruins em cache).
    validatorVersion: 2,
    cases: cases || [],
    firstMode: opts.firstMode || 'start',
    fixHint: opts.fixHint || ''
  });
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

module.exports = { parseSuiteReport, validateSuiteSpec, suiteCacheKey };
