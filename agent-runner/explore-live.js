/**
 * Exploração ao vivo: conecta no browser persistente (CDP) e percorre os fluxos
 * principais do CPM, salvando snapshots de acessibilidade + screenshots em
 * artifacts/explore/. NÃO fecha o browser ao final.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname);
const OUT = path.join(ROOT, 'artifacts', 'explore');
fs.mkdirSync(OUT, { recursive: true });
const TARGET = process.env.TARGET_BASE_URL || 'https://cpm.hom.levesaude.com.br';
const CDP = process.env.QA_FLOW_CDP || fs.readFileSync(path.join(ROOT, 'artifacts', '.cdp-endpoint'), 'utf8').trim();

function log(m) { console.log('[explore] ' + m); }

async function snap(page, label) {
  const safe = String(label).replace(/[^A-Za-z0-9_-]+/g, '_');
  const txt = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(OUT, `txt-${safe}.txt`), txt);
  await page.screenshot({ path: path.join(OUT, `shot-${safe}.png`), fullPage: false });
  log(`${label} (url=${page.url()}) — ${txt.length} chars de texto, screenshot salvo`);
  return txt;
}

async function combo(page, name, pattern) {
  const c = page.getByRole('combobox', { name: new RegExp(`^${name}$`, 'i') });
  await c.click({ timeout: 15000 });
  await page.waitForTimeout(600);
  const opts = page.getByRole('option');
  const n = await opts.count();
  for (let i = 0; i < n; i++) {
    const t = ((await opts.nth(i).textContent()) || '').replace(/\s+/g, ' ').trim();
    if (pattern.test(t)) { log(`  combo ${name} → ${t}`); await opts.nth(i).click(); await page.waitForTimeout(900); return t; }
  }
  throw new Error(`Opção de ${name} não encontrada (pattern ${pattern}). Texto: ${(await c.innerText()).slice(0,80)}`);
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  log(`conectado. page=${page.url()}`);

  await snap(page, '00-estado-atual');

  // — FLOW 1: navegação para ambulatorial —
  log('FLOW 1 — Atendimento → Ambulatorial');
  if (!/atendimento\/ambulatorial/.test(page.url())) {
    await page.goto(TARGET + '/atendimento/ambulatorial', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForTimeout(1500);
  await snap(page, '01-ambulatorial');

  // — FLOW 2: selecionar agenda —
  log('FLOW 2 — selecionar agenda');
  try {
    await combo(page, 'Clínica', /LEVE\s*CL[IÍ]NICA\s+TIJUCA\s*[-—]\s*Rio de Janeiro/i);
    await snap(page, '02-clinica-tijuca');
    await combo(page, 'Especialidade', /Cl[ií]nica\s*m[eé]dica/i);
    await snap(page, '03-especialidade');
    await combo(page, 'Profissional', /Dr\.?\s*Physician/i);
    await page.waitForTimeout(2500);
    await snap(page, '04-fila-pacientes');
  } catch (e) {
    log('ERRO no FLOW 2: ' + e.message);
    await snap(page, '04b-erro-selecao');
  }

  // — FLOW 3: fila de pacientes —
  log('FLOW 3 — fila de pacientes');
  const filaText = await page.locator('body').innerText();
  fs.writeFileSync(path.join(OUT, 'txt-fila-pacientes.txt'), filaText);
  // encontra nomes de pacientes em linhas (tentativa heurística)
  const rows = page.locator('tr');
  const rowCount = await rows.count().catch(() => 0);
  log(`linhas na tabela: ${rowCount}`);
  if (rowCount > 0) {
    for (let i = 0; i < Math.min(rowCount, 6); i++) {
      const t = ((await rows.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      log(`  linha ${i}: ${t}`);
    }
  }
  // botão Iniciar
  const iniciar = page.getByRole('button', { name: /Iniciar/i });
  log(`botões "Iniciar": ${await iniciar.count().catch(() => 0)}`);

  // — FLOW 4: abrir prontuário do 1º paciente com Iniciar —
  const firstIniciar = iniciar.first();
  if (await firstIniciar.count().catch(() => 0)) {
    log('FLOW 4 — abrindo prontuário (1º Iniciar)');
    await firstIniciar.click({ timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await snap(page, '05-prontuario');
    // abas
    for (const tab of ['Subjetivo', 'Objetivo', 'Avaliação', 'Plano']) {
      const t = page.getByRole('tab', { name: new RegExp(tab, 'i') }).first();
      if (await t.count().catch(() => 0)) {
        await t.click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await snap(page, `06-aba-${tab}`);
      } else {
        log(`  aba ${tab} não encontrada (role=tab)`);
      }
    }
    // botões IA
    for (const btn of ['Estruturar com a IA', 'Sugerir plano Clínico']) {
      const b = page.getByRole('button', { name: new RegExp(btn, 'i') }).first();
      log(`botão "${btn}": ${await b.count().catch(() => 0)}`);
    }
    // reabre Plano para inspecionar modal
    const plano = page.getByRole('tab', { name: /Plano/i }).first();
    if (await plano.count().catch(() => 0)) {
      await plano.click();
      await page.waitForTimeout(1200);
      await snap(page, '07-plano');
    }
  } else {
    log('FLOW 4 — nenhum botão Iniciar visível; fila vazia ou tela diferente.');
  }

  await browser.close().catch(() => {});
  log('exploração concluída (browser persistente mantido vivo).');
}

main().catch((e) => { console.error('[explore] FALHA:', e.message); process.exit(1); });
