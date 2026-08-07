/**
 * Grava os vereditos da execução Playwright direta como execuções no QA Studio.
 * Lê artifacts/results-pw/*.json (vereditos por caso) e os casos da API.
 */
const fs = require('fs');
const path = require('path');
const api = require('./src/studioApi');
const { parseSteps } = require('./src/runCase');

const RES_DIR = path.join(__dirname, 'artifacts', 'results-pw');
const CODES = ['TC-001', 'TC-002', 'TC-003', 'TC-004', 'TC-005', 'TC-006', 'TC-007', 'TC-008', 'TC-009', 'TC-010'];

async function main() {
  const verdicts = new Map();
  for (const code of CODES) {
    const f = path.join(RES_DIR, `${code}.json`);
    if (fs.existsSync(f)) verdicts.set(code, JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  const cases = await Promise.all(CODES.map(async (code) => {
    // acha o caso pelo código na tarefa 1
    const list = await api.listTestCases({ taskId: 1 });
    return list.find((c) => c.code === code);
  }));
  const byId = new Map(cases.filter(Boolean).map((c) => [c.code, c]));

  let ok = 0, fail = 0;
  for (const code of CODES) {
    const tc = byId.get(code);
    const v = verdicts.get(code);
    if (!tc || !v) {
      console.log(`${code}: CASO OU VEREDITO AUSENTE (${tc ? 'sem veredito' : 'sem caso'})`);
      fail++;
      continue;
    }
    const steps = parseSteps(tc);
    const stepResult = v.result === 'Passou' ? 'Passou' : v.result === 'Bloqueado' ? 'Não Executado' : 'Falhou';
    const payload = {
      project_id: tc.project_id,
      task_id: tc.task_id,
      test_case_id: tc.id,
      environment: process.env.TEST_ENV || 'Homologação',
      tester: 'agent:playwright-direto',
      result: v.result,
      actual_result: v.actual,
      notes: `Execução direta via Playwright (sem OpenCode). ${v.result === 'Passou' ? '' : 'Falha: ' + v.actual.slice(0, 200)}`,
      step_results: steps.map((s) => ({
        order: s.order,
        action: s.action,
        expected: s.expected,
        actual: v.result === 'Passou' ? 'Executado via Playwright (evidência em agent-runner/artifacts).' : v.actual.slice(0, 300),
        result: stepResult
      }))
    };
    try {
      const exec = await api.createExecution(payload);
      console.log(`${code}: ${v.result} → exec #${exec?.id}`);
      ok++;
    } catch (err) {
      console.log(`${code}: ${v.result} → ERRO ao gravar: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nGravadas: ${ok}, falhas: ${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
