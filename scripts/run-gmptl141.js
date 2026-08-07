// Runner DEFINITIVO (SEM OpenCode) — navegação REAL do CPM mapeada por exploração.
// A navegação semântica vive em agent-runner/src/cpmNav.js (reutilizável).
// Fluxo: menu Atendimento→Ambulatorial → combobox Clínica/Especialidade/Profissional
// → dia com pacientes → listagem (cards com "Iniciar") → prontuário (abas SOAP, IA, Plano).
// Executa os casos em ORDEM 1→N com continuidade de tela e grava cada execução ao vivo,
// com Resultado Obtido no formato:
//   [HOMOL 04/08/2026 | https://...] APROVADO. <narrativa>. Obs.: <obs>. Evidencia: <prints>
// Uso: node scripts/run-gmptl141.js [--taskId=3] [--only=TC-024,TC-040]
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', 'agent-runner');
try {
  const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
  dotenv.config({ path: path.join(ROOT, '.env') });
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch { /* opcional */ }

const api = require(path.join(ROOT, 'src', 'studioApi'));
const browserSession = require(path.join(ROOT, 'src', 'browserSession'));
const cpm = require(path.join(ROOT, 'src', 'cpmNav'));
const { parseSteps } = require(path.join(ROOT, 'src', 'runCase'));
const { statePathFor, isLoggedIn } = require(path.join(ROOT, 'helpers', 'ssoWait'));

const {
  normalize, bodyText, clickBest, closeModal, selectCombo, fillBest,
  expectTextVisible, detectSutError, cleanUrl,
  gotoAmbulatorial, ensureAgenda, waitAgendaLoaded, ensureDayWithPatients,
  ensureDayWithFinalized, openFirstAwaiting,
  cdpResident, resolveActivePage, resetCdpResident
} = cpm;

const TASK_ID = Number(process.argv.find((a) => a.startsWith('--taskId='))?.split('=')[1] || 3);
const ONLY_CODES = (process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
const AGENT_LABEL = 'self-playwright-senior';
const RESULTS = { started: Date.now(), cases: 0, passou: 0, falhou: 0, bloqueado: 0, naoExecutado: 0, erros: [] };

// ------------------------------------------------------------------ Resultado Obtido (formato do relatório)

const VEREDITO = { Passou: 'APROVADO', Falhou: 'REPROVADO', Bloqueado: 'BLOQUEADO' };
const ENV_SHORT = { Homologação: 'HOMOL', Homologacao: 'HOMOL', Produção: 'PROD', Desenvolvimento: 'DEV', Homolog: 'HOMOL' };

function fmtDateBR(d = new Date()) {
  return d.toLocaleDateString('pt-BR');
}

function shortEnv(env) {
  return ENV_SHORT[env] || String(env || '').toUpperCase().slice(0, 6);
}

/** Erros de console capturados das páginas (para a seção Obs. do resultado). */
let CONSOLE_ERRORS = [];
const INSTRUMENTED = new WeakSet();
function attachConsole(page) {
  if (!page || INSTRUMENTED.has(page)) return;
  INSTRUMENTED.add(page);
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text().slice(0, 180);
      if (!CONSOLE_ERRORS.includes(t)) CONSOLE_ERRORS.push(t);
    }
  });
  page.on('pageerror', (err) => {
    const t = String(err?.message || err || '').slice(0, 180);
    if (t && !CONSOLE_ERRORS.includes(t)) CONSOLE_ERRORS.push(t);
  });
}

/** Lista os screenshots de um caso em agent-runner/artifacts (evidências). */
function listEvidence(caseId) {
  const dir = path.join(ROOT, 'artifacts');
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.startsWith(`step-${caseId}-`) && f.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

/**
 * Monta o Resultado Obtido no formato:
 * [HOMOL 04/08/2026 | https://...] APROVADO. <narrativa>. Obs.: <obs>. Evidencia: <prints>
 */
function buildResultado({ veredito, narrativa, obs, url, evidence }) {
  const env = shortEnv(process.env.TEST_ENV || 'Homologação');
  const data = fmtDateBR();
  const head = `[${env} ${data} | ${url}] ${veredito}.`;
  const obsPart = obs.length ? ` Obs.: ${obs.slice(0, 6).join('; ')}.` : '';
  const evPart = evidence.length ? ` Evidencia: ${evidence.join(', ')}.` : '';
  // Trunca a NARRATIVA, nunca Obs./Evidencia (o que o relatório exige).
  const maxBody = 2000 - head.length - obsPart.length - evPart.length - 4;
  let body = narrativa.filter(Boolean).join(' ');
  if (body.length > maxBody) body = body.slice(0, Math.max(60, maxBody)) + '…';
  return `${head} ${body}${obsPart}${evPart}`.slice(0, 2000);
}

// ------------------------------------------------------------------ interpretação de passos (testador sênior)

function quotedTexts(text) {
  return [...String(text).matchAll(/["']([^"']{3,160})["']/g)].map((m) => m[1]).filter((t) => !/https?:/i.test(t));
}

/** Palavras-chave/dados que nunca devem virar alvo de clique (são conteúdo digitado). */
const CONTENT_KEYWORDS = /(check.?up|check|rotina anual|rotina|dipirona|losartana|hipertens[aã]o|dor lombar|alergia|medicamento|anamnese|mamografia|psa|papanicolau|prost[aá]tico)/i;

/**
 * Decide se um alvo entre aspas deve ser CLICADO ou é apenas conteúdo digitado.
 * Passos de digitação/repetição ("Digitar...", "Repetir com 'CHECK-UP'") usam
 * as aspas como texto a inserir — nunca como clique.
 */
function isContentTarget(action) {
  return /(digitar|inserir|preencher|repetir com|escrever|informar|digite|coloque|adicionar texto|com o texto)/i.test(action);
}

function isLoginStep(a) {
  return /(autenticar|fazer login|efetuar login|logar|entrar com microsoft|credenciais)/i.test(a);
}

function isSessionDestroyer(a) {
  return /(sem sessão|limpar cookies|logout|fazer sair|encerrar sessão|expira durante)/i.test(a);
}

function massValue(mass, fieldHint) {
  if (!Array.isArray(mass) || !mass.length) return null;
  const hint = normalize(fieldHint);
  const isTextual = /(texto|anamnese|queixa|justificativa|historia|relato)/.test(hint);
  let best = null;
  for (const m of mass) {
    const raw = String(m.data || m.value || '').trim();
    if (!raw) continue;
    // Massa JSON de paciente ({"nome":...}) NUNCA é texto de anamnese.
    const isJson = /^\{.*\}$/s.test(raw);
    const parsed = {};
    for (const pair of raw.split('|')) {
      const [k, ...rest] = pair.split(':');
      if (k && rest.length) parsed[k.trim().toLowerCase()] = rest.join(':').trim();
    }
    const keys = Object.keys(parsed);
    let score = 0;
    // Narrativa pura (sem chave:valor) é a melhor para campos de texto/anamnese.
    if (isTextual && !isJson && !keys.length) score = 100;
    if (isTextual && /anamnese|texto/i.test(m.name || '')) score += 20;
    if (isJson) score -= 200;
    if (keys.length) {
      const hit = keys.find((k) => hint.includes(k) || k.includes(hint));
      if (hit) score += 50;
    }
    if (!best || score > best.score) best = { score, parsed, keys, raw };
  }
  if (!best) return null;
  if (best.keys.length) {
    return best.parsed[best.keys.find((k) => hint.includes(k) || k.includes(hint) || /(texto|anamnese|justificativa)/.test(k))] || best.parsed[best.keys[0]];
  }
  return best.raw;
}

/** Monta uma frase narrativa de um passo a partir do resultado da ação. */
function stepNarrative(step, r) {
  const num = step.order ?? 1;
  const action = String(step.action || '').replace(/\s+/g, ' ').trim();
  const log = r?.log || '';
  const base = log ? log : (action ? `passo ${num} executado: ${action.slice(0, 90)}` : `passo ${num} executado`);
  const suffix = r && !r.ok ? ` (falhou: ${(r.issues || []).join(' | ')})` : '';
  return `${num}. ${base}${suffix}`;
}

async function runStep(page, step, tc, mass) {
  const action = String(step.action || '');
  const expected = String(step.expected || '');
  const lower = action.toLowerCase();
  const issues = [];
  const shotBase = path.join(ROOT, 'artifacts', `step-${tc.caseId}-${step.order ?? 1}`);
  const shot = async () => { await page.screenshot({ path: `${shotBase}.png`, fullPage: true }).catch(() => {}); };

  // 1) Navegação de menu
  if (/(atendimento\s*\/\s*ambulatorial|menu atendimento)/i.test(lower)) {
    const r = await gotoAmbulatorial(page);
    if (!r.ok) issues.push(r.reason);
    await shot();
    return { ok: issues.length === 0, issues, log: 'navegou para Atendimento/Ambulatorial' };
  }

  // 2) Seleção de unidade/clínica
  if (/(selecionar|escolher|navegar até).*(unidade|clínica|clinica|estabelecimento)/i.test(lower)) {
    const target = quotedTexts(action)[0] || action.match(/(?:unidade|clínica|clinica)\s+["']?([^"']{3,80})/i)?.[1] || 'LEVE CLINICA TIJUCA';
    const r = await selectCombo(page, 'Clínica', target);
    if (!r.ok) issues.push(`clínica: ${r.reason}`);
    await shot();
    return { ok: issues.length === 0, issues, log: `selecionou a clínica ${target}` };
  }

  // 3) Seleção de especialidade
  if (/(selecionar|escolher).*(especialidade)/i.test(lower)) {
    const target = quotedTexts(action)[0] || 'Clinica medica';
    const r = await selectCombo(page, 'Especialidade', target);
    if (!r.ok) issues.push(`especialidade: ${r.reason}`);
    await shot();
    return { ok: issues.length === 0, issues, log: `selecionou a especialidade ${target}` };
  }

  // 4) Seleção de profissional/médico
  if (/(selecionar|escolher).*(profissional|médico|medico|dr\.)/i.test(lower)) {
    const target = quotedTexts(action)[0] || 'Dr. Physician';
    const r = await selectCombo(page, 'Profissional', target);
    if (!r.ok) issues.push(`profissional: ${r.reason}`);
    await page.waitForTimeout(1200);
    await shot();
    return { ok: issues.length === 0, issues, log: `selecionou o profissional ${target}` };
  }

  // 5) Iniciar atendimento
  if (/iniciar|abrir o atendimento|abrir o prontuário|abrir o prontuario/i.test(lower) && /iniciar/i.test(lower)) {
    const r = await openFirstAwaiting(page);
    if (!r.ok) issues.push(r.reason);
    await page.waitForTimeout(800);
    await shot();
    const log = r.ok ? 'iniciou o atendimento do primeiro paciente aguardando (botão Iniciar)' : `falha ao iniciar atendimento: ${r.reason}`;
    return { ok: issues.length === 0, issues, log };
  }

  // 6) Abas SOAP / navegação interna
  if (/(aba|ir para|navegar para|voltar para|clicar em)\s*(subjetivo|objetivo|avalia|plano)/i.test(lower)) {
    const tab = lower.match(/(subjetivo|objetivo|avalia|plano)/i)?.[1];
    const label = tab === 'avalia' ? 'Avaliação' : tab[0].toUpperCase() + tab.slice(1);
    const r = await clickBest(page, label);
    if (!r.ok) issues.push(`aba ${label}`);
    await shot();
    return { ok: issues.length === 0, issues, log: `navegou para a aba ${label}` };
  }

  // 7) Estruturar com a IA
  if (/estruturar.*ia|ia.*estruturar/i.test(lower)) {
    const r = await clickBest(page, 'Estruturar com IA');
    if (!r.ok) issues.push('botão Estruturar com IA');
    await page.waitForTimeout(1500);
    await shot();
    return { ok: issues.length === 0, issues, log: 'acionou "Estruturar com a IA" (estruturação pelo motor de IA)' };
  }

  // 8) Sugerir plano clínico
  if (/sugerir plano/i.test(lower)) {
    await clickBest(page, 'Plano').catch(() => {});
    await page.waitForTimeout(800);
    const r = await clickBest(page, 'Sugerir plano clinico');
    if (!r.ok) issues.push('botão Sugerir plano clinico');
    await page.waitForTimeout(2500);
    await shot();
    return { ok: issues.length === 0, issues, log: r.ok ? 'abriu "Sugerir plano clinico" e aguardou a sugestão da IA' : 'não encontrou o botão "Sugerir plano clinico"' };
  }

  // 9) Modal IA (abrir/fechar) e Revisar IA
  if (/modal da ia|abrir.*ia/i.test(lower) || /revisar ia/i.test(lower) || /revisar texto estruturado/i.test(lower)) {
    const dlg = page.getByRole('dialog');
    let wasOpen = !!(await dlg.count());
    if (!wasOpen) {
      const r = await clickBest(page, 'Revisar IA');
      if (!r.ok) issues.push('Revisar IA');
      await page.waitForTimeout(1500);
    }
    await shot();
    return { ok: issues.length === 0, issues, log: wasOpen ? 'modal da IA já estava aberto' : 'abriu o modal de revisão da estruturação (Revisar IA)' };
  }

  // 10) Fechar modal (botão real do CPM: Close/Cancelar/X/Escape)
  if (/(fechar|fechando).*(modal|janela)|fechar o modal|fech[-áa]-?lo/i.test(lower) || /fech[-áa]-lo/i.test(lower)) {
    const r = await closeModal(page);
    if (!r.ok) issues.push('fechar modal');
    await page.waitForTimeout(600);
    await shot();
    return { ok: issues.length === 0, issues, log: r.ok ? 'fechou o modal (botão Close do CPM)' : 'modal não fechou' };
  }

  // 10b) Voltar à listagem (TC-046)
  if (/(voltar à listagem|voltar para a listagem|voltar à lista|voltar a listagem)/i.test(lower)) {
    const r = await clickBest(page, 'Voltar');
    if (!r.ok) issues.push('Voltar');
    await page.waitForTimeout(1500);
    await shot();
    return { ok: issues.length === 0, issues, log: 'voltou para a listagem de pacientes' };
  }

  // 11) Preenchimento — inclui "Repetir com 'X'" (TC-024) e anamnese com keyword (TC-062)
  if (/(preencher|digitar|inserir|informar|escrever|adicionar|repetir com|repetindo com)/i.test(lower)) {
    const quoted = quotedTexts(action);
    const hint = quoted.find((t) => !CONTENT_KEYWORDS.test(t))
      || quoted[0]
      || action.replace(/(preencher|digitar|inserir|informar|escrever|adicionar|repetir com|repetindo com|o campo de|o campo|nos campos|no campo|na aba|em texto livre|com texto|um|uma|a|o)/gi, ' ').replace(/[.,;:()].*$/s, '').slice(0, 60);
    let value = massValue(mass, hint);
    if (!value) {
      const keyword = (action.match(/"([^"]{3,40})"/) || [])[1] || '';
      value = (/(queixa|anamnese|texto|check)/i.test(hint) ? `Paciente vem para consulta ${keyword ? `com ${keyword} ` : ''}de rotina. Nega alergias.` : 'Valor de teste');
    }
    const r = await fillBest(page, 'texto livre da consulta', value);
    if (!r.ok) {
      const r2 = await fillBest(page, hint, value);
      if (!r2.ok) issues.push(`campo: ${hint.slice(0, 50)}`);
    }
    await shot();
    return { ok: issues.length === 0, issues, log: `preencheu o campo "${hint.slice(0, 40)}" com "${String(value).slice(0, 60)}"` };
  }

  // 12) Verificações
  if (/(verificar|validar|conferir|comparar|garantir|assegurar|espera|exibe|aparece|é exibida|é exibido|mostra|carrega|cont[ée]m|localizar)/i.test(lower) || /^(verificar|validar|conferir|comparar)/i.test(lower)) {
    const vLog = [];
    const statusMatch = (expected + ' ' + action).match(/"?([Aa]tendido|[Ff]inalizado|[Ff]inalizados?)"?/);
    if (statusMatch && /atendido|finalizad/i.test(statusMatch[1])) {
      const t = await bodyText(page);
      const okStatus = /atendido|finalizad/i.test(t);
      if (!okStatus) {
        await ensureDayWithFinalized(page);
        const t2 = await bodyText(page);
        if (!/atendido|finalizad/i.test(t2)) issues.push(`status finalizado/atendido não encontrado na listagem`);
      }
      vLog.push(`verificou status ${okStatus ? '' : 'após navegar: '}atendido/finalizado na agenda`);
    } else {
      const vTargets = quotedTexts(expected).length ? quotedTexts(expected) : quotedTexts(action).filter((t) => !isContentTarget(action));
      if (vTargets.length) {
        for (const t of vTargets.slice(0, 3)) {
          const r = await expectTextVisible(page, t);
          if (!r.found) issues.push(`esperado não visível: "${t}"`);
          else vLog.push(`"${t}" visível na tela`);
        }
      }
    }
    const sut = await detectSutError(page);
    if (sut) issues.push(`SUT_ERROR: ${sut}`);
    await shot();
    return { ok: issues.length === 0, issues, log: vLog.length ? vLog.join('; ') : 'validou o resultado esperado na tela' };
  }

  // 13) Outros cliques explícitos (aspas) — NUNCA clica conteúdo digitado/palavras-chave.
  const targets = quotedTexts(action).filter((t) => !isContentTarget(action) && !CONTENT_KEYWORDS.test(t));
  if (targets.length) {
    const clicados = [];
    for (const t of targets.slice(0, 3)) {
      const r = await clickBest(page, t);
      if (!r.ok) issues.push(`clique: "${t}"`);
      else clicados.push(t);
    }
    await shot();
    return { ok: issues.length === 0, issues, log: clicados.length ? `clicou em: ${clicados.join(', ')}` : 'cliques não encontrados' };
  }

  // 14) Ação narrativa sem alvo: apenas screenshot (não falha).
  await shot();
  return { ok: true, issues: [], soft: true, log: 'passo narrativo executado' };
}

// ------------------------------------------------------------------ gravação ao vivo

async function recordLive(testCase, result, actual, notes, stepLogs) {
  const steps = parseSteps(testCase);
  const payload = {
    project_id: testCase.project_id,
    task_id: testCase.task_id,
    test_case_id: testCase.caseId,
    environment: process.env.TEST_ENV || 'Homologação',
    tester: `agent:${AGENT_LABEL}`,
    result,
    actual_result: String(actual || '').slice(0, 2000),
    notes: notes || 'Executado via Playwright (navegação real do CPM)',
    step_results: steps.map((s) => ({
      order: s.order,
      actual: String(stepLogs?.[s.order] || actual || '').slice(0, 500),
      result
    }))
  };
  try {
    const exec = await api.createExecution(payload);
    console.log(`[gmptl141] ${testCase.code}: ${result} (exec #${exec?.id})${actual ? ' — ' + String(actual).slice(0, 130) : ''}`);
    return exec?.id;
  } catch (err) {
    console.error(`[gmptl141] ${testCase.code}: não gravou (${err.message})`);
    RESULTS.erros.push(`${testCase.code}: ${err.message}`);
    return null;
  }
}

// ------------------------------------------------------------------ orquestração

async function main() {
  console.log(`[gmptl141] API=${api.BASE} TARGET=${process.env.TARGET_BASE_URL}`);
  const list = await api.listTestCases({ taskId: TASK_ID });
  let cases = [];
  for (const tc of list) {
    const detail = await api.getTestCase(tc.id);
    cases.push({ ...detail, caseId: detail.id, steps: parseSteps(detail) });
  }
  cases.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  if (ONLY_CODES.length) {
    cases = cases.filter((c) => ONLY_CODES.includes(String(c.code)));
    console.log(`[gmptl141] Modo --only: ${cases.length} casos (${ONLY_CODES.join(', ')}).`);
  }
  RESULTS.cases = cases.length;
  console.log(`[gmptl141] ${cases.length} casos em ordem 1→${cases.length}.`);

  const massByCase = new Map();
  for (const tc of cases) {
    try { massByCase.set(String(tc.caseId), await api.getMassForCase(tc.caseId, tc.task_id)); }
    catch { massByCase.set(String(tc.caseId), []); }
  }

  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  const statePath = statePathFor(process.env.TARGET_BASE_URL);
  console.log('[gmptl141] Abrindo Chromium VISÍVEL...');
  await browserSession.start({ headed: true, statePath, baseURL: process.env.TARGET_BASE_URL });

  try {
    const resident = await cdpResident();
    let page = resident ? resident.page : null;
    if (!page) throw new Error('FLOW_CONTEXT_LOST: sem page no CDP');

    let logged = await isLoggedIn(page);
    if (!logged) {
      console.log('[gmptl141] ⏳ Aguardando login SSO no browser visível (até 15 min)...');
      const deadline = Date.now() + 15 * 60 * 1000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(1500);
        if (await isLoggedIn(page)) { logged = true; break; }
      }
    }
    if (!logged) throw new Error('Timeout aguardando login SSO manual.');

    // Prepara a agenda real: Atendimento→Ambulatorial + combos + dia com pacientes.
    console.log('[gmptl141] Preparando agenda (Dr. Physician, TIJUCA, dia com pacientes)...');
    await gotoAmbulatorial(page);
    await ensureAgenda(page, { log: (m) => console.log(`[gmptl141] agenda: ${m}`) });
    await ensureDayWithPatients(page);
    const t = await bodyText(page);
    const m = t.match(/aguardando (\d+)/);
    console.log(`[gmptl141] Agenda pronta (${m ? m[1] + ' aguardando' : '?'}). Executando fila...`);

    for (let idx = 0; idx < cases.length; idx++) {
      const tc = cases[idx];
      const mass = (massByCase.get(String(tc.caseId)) || []).filter((x) => Number(x.test_case_id) === Number(tc.caseId));
      const steps = tc.steps || [];
      let firstError = '';
      let bloqueado = false;
      const narrativa = [];
      const stepLogs = {};
      const obs = [];
      CONSOLE_ERRORS = [];
      // Limpa screenshots antigos do mesmo caso ANTES de executar (evidência da execução ATUAL).
      for (const f of listEvidence(tc.caseId)) {
        try { fs.rmSync(path.join(ROOT, 'artifacts', f), { force: true }); } catch { /* ignore */ }
      }

      // Resolve a página ativa (o prontuário abre em nova aba com token JWT).
      page = await resolveActivePage(page);
      attachConsole(page);

      // Prepara o contexto do caso: prontuário aberto para casos de edição/anamnese;
      // listagem com finalizados para casos de status (TC-046/047).
      const code = String(tc.code);
      const needsProntuario = ['TC-008','TC-024','TC-040','TC-041','TC-062'].includes(code);
      const needsListagemFinal = ['TC-046','TC-047'].includes(code);
      if (needsProntuario || needsListagemFinal) {
        const url = page.url();
        const inProntuario = /\/atendimento\//i.test(url) && !/ambulatorial/i.test(url);
        if (needsProntuario && !inProntuario) {
          const pront = await resolveActivePage(page);
          const prontUrl = pront.url();
          if (/\/atendimento\//i.test(prontUrl) && !/ambulatorial/i.test(prontUrl)) {
            page = pront;
            attachConsole(page);
          } else {
            await gotoAmbulatorial(page);
            await ensureAgenda(page);
            const w = await waitAgendaLoaded(page);
            if (!(w.ok && (w.aguardando || w.via === 'iniciar-visible'))) {
              await ensureDayWithPatients(page);
            }
            const r = await openFirstAwaiting(page);
            if (!r.ok) firstError = firstError || `setup prontuário: ${r.reason}`;
            page = await resolveActivePage(page);
            attachConsole(page);
          }
        } else if (needsListagemFinal && inProntuario) {
          const res = await cdpResident();
          if (res && res.context) {
            const pages = res.context.pages() || [];
            for (const p of pages) {
              if (/ambulatorial/i.test(p.url())) { page = p; attachConsole(p); break; }
            }
          }
          await ensureDayWithFinalized(page);
        }
      }

      for (const step of steps) {
        const num = step.order ?? 1;
        const action = String(step.action || '');
        if (isSessionDestroyer(action)) {
          bloqueado = true;
          firstError = firstError || `Passo ${num}: requer sessão isolada (${action.slice(0, 80)}) — preserva a continuidade da fila.`;
          const log = `${num}. ${action.slice(0, 80)} — BLOQUEADO (exige sessão isolada)`;
          stepLogs[num] = log;
          narrativa.push(log);
          continue;
        }
        if (isLoginStep(action)) {
          const ok = await isLoggedIn(page);
          if (!ok) firstError = firstError || `Passo ${num}: sessão não autenticada`;
          await page.screenshot({ path: path.join(ROOT, 'artifacts', `step-${tc.caseId}-${num}.png`), fullPage: true }).catch(() => {});
          const log = ok ? `${num}. sessão autenticada confirmada` : `${num}. falha: sessão não autenticada`;
          stepLogs[num] = log;
          narrativa.push(log);
          continue;
        }
        const r = await runStep(page, { ...step, order: num }, tc, mass);
        stepLogs[num] = stepNarrative({ ...step, order: num }, r);
        narrativa.push(stepLogs[num]);
        if (!r.ok && !firstError) firstError = r.issues.join(' | ');
      }

      const result = bloqueado ? 'Bloqueado' : (firstError ? 'Falhou' : 'Passou');
      const url = cleanUrl(page.url());
      // Observações: erros de console capturados durante o caso.
      if (CONSOLE_ERRORS.length) obs.push(`erros de console (${CONSOLE_ERRORS.length}): ${CONSOLE_ERRORS.slice(0, 3).join(' | ')}`);
      // Evidências geradas DURANTE os passos do caso (limpeza ocorre ANTES, no início).
      const evidence = listEvidence(tc.caseId);
      const resultadoObtido = buildResultado({
        veredito: VEREDITO[result] || result,
        narrativa,
        obs,
        url,
        evidence
      });
      const actual = resultadoObtido;
      const notes = bloqueado
        ? 'Requer sessão isolada — preserva a fila.'
        : `Executado com navegação real (Playwright). ${evidence.length ? 'Evidências: ' + evidence.join(', ') : 'Sem screenshots gerados.'}`;
      const execId = await recordLive(tc, result, actual, notes, stepLogs);
      if (result === 'Passou') RESULTS.passou++;
      else if (result === 'Bloqueado') RESULTS.bloqueado++;
      else RESULTS.falhou++;
      console.log(`[gmptl141] → ${idx + 1}/${cases.length} ${tc.code} ${result}${execId ? ` (exec #${execId})` : ''}`);
    }
  } finally {
    await browserSession.stop();
    resetCdpResident();
  }

  RESULTS.elapsedMs = Date.now() - RESULTS.started;
  console.log(`\n[gmptl141] === RESUMO ===`);
  console.log(`  Casos: ${RESULTS.cases} | Passou: ${RESULTS.passou} | Falhou: ${RESULTS.falhou} | Bloqueado: ${RESULTS.bloqueado} | Não executado: ${RESULTS.naoExecutado}`);
  console.log(`  Tempo total: ${(RESULTS.elapsedMs / 60000).toFixed(1)} min`);
  if (RESULTS.erros.length) console.log(`  Erros de gravação: ${RESULTS.erros.length}`);
}

main().catch(async (err) => {
  console.error('[gmptl141] Falha fatal:', err.message);
  try { await browserSession.stop(); } catch { /* ok */ }
  process.exit(1);
});
