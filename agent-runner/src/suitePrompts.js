function caseId(testCase) {
  return String(testCase.caseId ?? testCase.id);
}

function formatSteps(steps) {
  return (steps || []).map((step, index) => {
    const order = step.order ?? index + 1;
    return `${order}. ACTION: ${step.action || ''}\n   EXPECTED: ${step.expected || ''}`;
  }).join('\n') || '(no steps)';
}

function formatMass(mass) {
  return (mass || []).map((item) => {
    const value = item.data ?? item.value ?? '';
    return `- ${item.name || 'data'}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  }).join('\n') || '(none)';
}

function optionalContext(opts) {
  const blocks = [];
  const previous = opts.previousCase ?? opts.previous;
  const state = opts.currentState ?? opts.state;
  if (previous) blocks.push(`=== PREVIOUS CASE / CONTEXT ===\n${JSON.stringify(previous, null, 2)}`);
  if (state) blocks.push(`=== CURRENT BROWSER STATE ===\n${typeof state === 'string' ? state : JSON.stringify(state, null, 2)}`);
  if (opts.fixHint) blocks.push(`=== FIX HINT ===\n${String(opts.fixHint).slice(0, 3000)}`);
  return blocks.length ? `\n${blocks.join('\n\n')}\n` : '';
}

function buildSuitePrompt(cases, opts = {}) {
  const firstMode = opts.firstMode || 'start';
  const details = (cases || []).map((testCase, index) => {
    const id = caseId(testCase);
    const mode = index === 0 ? firstMode : 'continue';
    return `=== CASE ${index + 1} ===
- id: ${id}
- code: ${testCase.code || ''}
- title: ${testCase.title || ''}
- type: ${testCase.type || ''}
- baseURL: ${testCase.baseURL || ''}
- mode: ${mode}
- preconditions: ${testCase.preconditions || '(none)'}
- steps:
${formatSteps(testCase.steps)}
- mass:
${formatMass(testCase.mass)}`;
  }).join('\n\n');

  return `You are a senior QA automation engineer. Generate ONE complete Playwright TypeScript spec containing every case below, in order.

Required imports:
import { test, expect } from '../helpers/flowFixtures';
import { waitForManualLogin } from '../helpers/ssoWait';
import { runSuiteCase } from '../helpers/suiteRuntime';

Call test.describe.configure({ mode: 'serial' }). Create exactly one test per case with the exact title:
CASE::<id>::<code>::<title>

For every case:
- Place // CASE_START:<id>:<start|continue> immediately before its test and // CASE_END:<id> immediately after it.
- Wrap all test actions with await runSuiteCase({ caseId: <id>, code: '<code>', title: '<title>' }, async () => { ... }).
- Wrap each numbered step in test.step and save its screenshot as artifacts/step-<id>-N.png, where N is the step number.
- Never use page.waitForTimeout(); use locator assertions, expect.poll, or event/state waits.
- Use resilient locators (role, label, getByText of a SINGLE segment) and assert each expected result.

Navigation and hierarchical paths (mandatory):
- Navigate with RELATIVE paths only: page.goto('/') or page.goto('/path'). NEVER hardcode an absolute origin (http:// or https://).
- Interpret paths like "A / B > C > D > E" LEFT-TO-RIGHT as SEPARATE clicks/selections — NEVER one locator with the whole path (forbidden examples: text='Atendimento/Ambulatorial', getByText('A > B > C')).
- First segments are usually sidebar/menu; later segments are often labeled comboboxes/fields. Select the EXACT option from the step.
- CRITICAL: "LEVE CLINICA TIJUCA" is NOT "LEVE CLINICA BARRA DA TIJUCA". Reject options containing "Barra". Prefer the full label from the step.

Mode rules:
- The first case uses mode "${firstMode}"; every later case uses "continue".
- start may call page.goto('/') and MUST call waitForManualLogin.
- continue MUST inherit the current page, MUST NOT call page.goto('/') or waitForManualLogin, and MUST first validate the inherited screen. If invalid, throw new Error('FLOW_CONTEXT_LOST: ' + reason).
- Do not reset or recreate the browser context between cases.
- Microsoft SSO: landing often shows only "Entrar com Microsoft"; click it if present, then waitForManualLogin (start mode only).

Reply with one TypeScript code fence only, with no prose outside it.
${optionalContext(opts)}
${details}`;
}

function buildSuiteJudgePrompt(cases, results, opts = {}) {
  const fix = opts.fixHint ? `\nFix hint: ${String(opts.fixHint).slice(0, 1500)}\n` : '';
  return `Judge these Playwright suite results conservatively against every executed case.

CASES:
${JSON.stringify(cases || [], null, 2)}

PLAYWRIGHT RESULTS:
${JSON.stringify(results || [], null, 2)}
${fix}
Return ONLY one valid JSON object, without markdown:
{"results":[{"caseId":"<id>","result":"Passou|Falhou|Bloqueado|Não Executado","actual_result":"short observed outcome","notes":"short evidence or error","step_results":[{"order":1,"actual":"observed outcome","result":"Passou|Falhou|Não Executado"}]}]}

Include exactly one result for every executed case, preserving case order and one step_results item per expected step. Failed, timedOut, or interrupted means Falhou; skipped or absent means Não Executado; unclear evidence must not pass.`;
}

/**
 * Prompt para o Agent ao vivo (OpenCode + Playwright MCP no CDP existente).
 * Um caso por chamada — snapshot/click reais; sem gerar .spec.ts.
 */
function buildLiveCasePrompt(testCase, opts = {}) {
  const id = caseId(testCase);
  const mode = opts.mode || 'start';
  const index = opts.index ?? 0;
  const total = opts.total ?? 1;
  const previous = opts.previousCase
    ? `\n=== PREVIOUS CASE OUTCOME ===\n${JSON.stringify(opts.previousCase, null, 2)}\n`
    : '';
  const state = opts.currentState
    ? `\n=== CURRENT BROWSER STATE ===\n${typeof opts.currentState === 'string' ? opts.currentState : JSON.stringify(opts.currentState, null, 2)}\n`
    : '';
  const fix = opts.fixHint
    ? `\n=== FIX HINT (retry) ===\n${String(opts.fixHint).slice(0, 3000)}\n`
    : '';

  return `QA live tester via Playwright MCP. Browser already open on CDP — do NOT launch/close another browser. Be FAST: minimize tool calls.

Case ${index + 1}/${total} mode=${mode} id=${id} code=${testCase.code || ''} title=${testCase.title || ''}
baseURL=${testCase.baseURL || process.env.TARGET_BASE_URL || ''}
preconditions: ${testCase.preconditions || '(none)'}
steps:
${formatSteps(testCase.steps)}
mass:
${formatMass(testCase.mass)}
${previous}${state}${fix}
TOOL RULES (critical — wrong args waste minutes):
- browser_click/type/select require "target" (string). NEVER omit target.
- Snapshot refs: pass the bare id only, e.g. target="e29". NEVER target="ref=e29" (Unknown engine "ref").
- Prefer role/text selectors (faster, stable): target="text=Atendimento" or target="role=button[name=\\"Atendimento\\"]" or target="role=combobox[name=\\"Clínica\\"]".
- Paths like "A / B > C > D" = SEPARATE clicks left-to-right. Never one locator with "/" or ">".
- Snapshot ONCE before a batch of actions and once after each CASE step (not after every micro-click). Skip redundant snapshots.
- No waitForTimeout. Do not retry the same failing target more than once — switch strategy (role/text) immediately.
- "LEVE CLINICA TIJUCA" ≠ "LEVE CLINICA BARRA DA TIJUCA".

Mode: start may navigate home; SSO may already be done. continue = stay on current screen, no re-login. Wrong screen → Falhou + FLOW_CONTEXT_LOST.

Finish with ONLY JSON:
{"caseId":"${id}","result":"Passou|Falhou|Bloqueado","actual_result":"...","notes":"...","step_results":[{"order":1,"actual":"...","result":"Passou|Falhou|Não Executado"}]}
One step_results per step. Unclear evidence ≠ Passou.`;
}

function buildLiveSuitePrompt(cases, opts = {}) {
  const list = (cases || []).map((testCase, index) => ({
    ...testCase,
    promptIndex: index
  }));
  return list.map((testCase, index) => buildLiveCasePrompt(testCase, {
    ...opts,
    index,
    total: list.length,
    mode: index === 0 ? (opts.firstMode || 'start') : 'continue'
  })).join('\n\n---\n\n');
}

module.exports = {
  buildSuitePrompt,
  buildSuiteJudgePrompt,
  buildLiveCasePrompt,
  buildLiveSuitePrompt
};
