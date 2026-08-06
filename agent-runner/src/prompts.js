function buildGeneratePrompt(ctx, opts = {}) {
  const steps = (ctx.steps || [])
    .map((s) => `${s.order}. ACTION: ${s.action}\n   EXPECTED: ${s.expected}`)
    .join('\n');
  const mass = (ctx.mass || [])
    .map((m) => `- ${m.name}: ${m.data}${m.purpose ? ` (${m.purpose})` : ''}`)
    .join('\n') || '(nenhuma)';
  const fixHint = opts.fixHint
    ? `\n=== FIX REQUEST (a versão anterior não compilou) ===\n${opts.fixHint.slice(0, 2000)}\nCorrija o TypeScript e reenvie o arquivo completo.\n`
    : '';

  return `You are a senior QA automation engineer. Generate a single Playwright test file (@playwright/test) for an EXTERNAL web app.

=== TARGET ===
- baseURL: ${ctx.baseURL}
- Case: ${ctx.code} — ${ctx.title}
- Type: ${ctx.type}
- Preconditions: ${ctx.preconditions || '(none)'}

=== STEPS (follow in order; use page.screenshot after each step) ===
${steps || '(no steps)'}

=== TEST DATA (mass) ===
${mass}
${fixHint}
=== OUTPUT RULES ===
1. Reply with ONE TypeScript code fence only (language typescript). No prose outside the fence.
2. Use import { test, expect } from '@playwright/test';
3. Also: import { waitForManualLogin } from '../helpers/ssoWait';
4. test.describe('${ctx.code}', ...) with one test('${ctx.title.replace(/'/g, "\\'")}', async ({ page }) => { ... }).
5. Navigate with RELATIVE paths only: await page.goto('/...') (page.goto('/') for the root). NEVER hardcode an absolute origin (http://...). baseURL is already set in the Playwright config from TARGET_BASE_URL.
6. Wrap the actions of each step N in: await test.step('Passo N — <short title>', async () => { ... });
7. After the first navigation, call await waitForManualLogin(page, { force: true }) once for SSO. Do NOT call it again later if already logged in.
8. After login, assert session with resilient checks (e.g. button "Sair", navigation visible, OR url matching /dashboard|/agendas|/atendimento) — never require a single exact path.
9. Interpret hierarchical step paths like "A / B > C > D > E" literally left-to-right:
   - First segments may be sidebar/menu (e.g. Atendimento → Ambulatorial).
   - Later segments are often form/combobox context on the page (Clínica, Especialidade, Profissional). Look for labeled comboboxes/fields and select the EXACT intended option.
   - CRITICAL disambiguation: "LEVE CLINICA TIJUCA" is NOT "LEVE CLINICA BARRA DA TIJUCA". Reject options containing "Barra". Prefer the full label from the step (e.g. "LEVE CLINICA TIJUCA - Rio de Janeiro").
10. Map each step action to Playwright locators/actions; use massa data where relevant.
11. After each step N, call: await page.screenshot({ path: 'artifacts/step-${ctx.caseId}-N.png', fullPage: true });
12. Soft-assert expected outcomes with expect(...). Prefer resilient selectors (role, label, text).
13. Do NOT hardcode passwords or try to automate SSO credentials.
14. SYNCHRONIZATION: never use page.waitForTimeout() to wait for app state. Wait with expect(locator).toBeVisible()/toContainText(), expect.poll(...) or test.step(...) with real conditions. The only allowed fixed delays are the per-step screenshots.
15. File must be self-contained and runnable by: npx playwright test
`;
}

function buildApiCollectionPrompt(ctx, opts = {}) {
  const steps = (ctx.steps || [])
    .map((s) => `${s.order}. ACTION: ${s.action}\n   EXPECTED: ${s.expected}`)
    .join('\n');
  const mass = (ctx.mass || [])
    .map((m) => `- ${m.name}: ${m.data}${m.purpose ? ` (${m.purpose})` : ''}`)
    .join('\n') || '(nenhuma)';
  const fixHint = opts.fixHint
    ? `\n=== FIX REQUEST (a versão anterior era inválida) ===\n${opts.fixHint.slice(0, 2000)}\nCorrija a coleção e reenvie o JSON completo.\n`
    : '';

  return `You are an API QA engineer. Generate a Postman Collection v2.1 JSON for an EXTERNAL API.

=== TARGET ===
- baseURL: ${ctx.baseURL}  (use {{baseUrl}} in request URLs)
- Case: ${ctx.code} — ${ctx.title}
- Preconditions: ${ctx.preconditions || '(none)'}

=== STEPS (one HTTP request per step when possible) ===
${steps || '(no steps)'}

=== TEST DATA (mass) ===
${mass}
${fixHint}
=== OUTPUT RULES ===
1. Reply with ONE json code fence only. No prose outside the fence.
2. Valid Postman Collection v2.1 with info.name = "${ctx.code}", variable baseUrl = "${ctx.baseURL}".
3. Each step becomes an item with request (method, header, url.raw using {{baseUrl}}/..., optional body.mode=raw).
4. Every item MUST have a request with a valid "method" and a non-empty "url.raw" (or url.host). No request may be missing these.
5. Infer method/path/body from ACTION text; assert expectations via realistic status codes in item descriptions.
6. Do not invent auth tokens unless preconditions/mass provide them; use Authorization header only when data exists.
`;
}

function buildJudgePrompt(ctx, runOut, opts = {}) {
  const steps = (ctx.steps || [])
    .map((s) => `${s.order}. expected: ${s.expected} | action: ${s.action}`)
    .join('\n');
  const shots = (runOut.screenshots || []).join('\n') || '(none)';
  const pwErrors = (runOut.reportErrors || []).length
    ? `\n=== PLAYWRIGHT ERRORS (report.json) ===\n${runOut.reportErrors.join('\n---\n')}\n`
    : '';
  const apiExtra = runOut.requestResults
    ? `\n=== API REQUEST RESULTS ===\n${JSON.stringify(runOut.requestResults, null, 2).slice(0, 8000)}\n`
    : '';
  const fixHint = opts.fixHint
    ? `\n=== FIX REQUEST (a resposta anterior foi inválida) ===\n${opts.fixHint.slice(0, 1500)}\n`
    : '';

  return `You are a QA lead judging an automated run against expected step outcomes.

=== CASE ===
${ctx.code} — ${ctx.title} (type=${ctx.type})

=== EXPECTED STEPS ===
${steps}

=== RUN ===
- exitCode: ${runOut.exitCode}
- stdout/stderr (truncated):
${(runOut.log || '').slice(0, 8000)}
${pwErrors}
=== SCREENSHOT PATHS ===
${shots}
${apiExtra}
${fixHint}
=== OUTPUT ===
Respond with ONLY valid JSON (no markdown fence required, but allowed):
{
  "result": "Passou" | "Falhou" | "Bloqueado",
  "actual_result": "short summary of what happened",
  "notes": "agent notes",
  "step_results": [
    { "order": 1, "actual": "what was observed", "result": "Passou" | "Falhou" | "Não Executado" }
  ]
}

Rules:
- Include one step_results entry per expected step order.
- If the run crashed before executing, use result "Bloqueado" and mark steps "Não Executado".
- If any step failed assertions / non-2xx (for API), overall result "Falhou".
- Be conservative: unclear evidence → "Falhou" with explanation in actual.
`;
}

module.exports = { buildGeneratePrompt, buildApiCollectionPrompt, buildJudgePrompt };
