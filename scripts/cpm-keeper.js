// Keeper de exploração: sobe o Chromium VISÍVEL (browserSession) e fica vivo
// executando comandos incrementais vindos de .freebuff/cpm-cmd.json.
// Uso: node scripts/cpm-keeper.js
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', 'agent-runner');
try {
  const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
  dotenv.config({ path: path.join(ROOT, '.env') });
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch { /* opcional */ }

const browserSession = require(path.join(ROOT, 'src', 'browserSession'));
const { statePathFor, isLoggedIn } = require(path.join(ROOT, 'helpers', 'ssoWait'));

const WORK = path.join(__dirname, '..', '.freebuff');
const CMD_FILE = path.join(WORK, 'cpm-cmd.json');
const OUT_FILE = path.join(WORK, 'cpm-out.json');

fs.mkdirSync(WORK, { recursive: true });

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Dump estruturado do DOM para eu decidir o próximo passo (testador sênior). */
async function dumpScreen(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    const text = (el) => (el.innerText || el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const items = (sel) => [...document.querySelectorAll(sel)].filter(visible).map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      name: text(el),
      aria: el.getAttribute('aria-label') || '',
      expanded: el.getAttribute('aria-expanded') || '',
      selected: el.getAttribute('aria-selected') || ''
    }));
    const buttons = items('button, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="option"], [role="treeitem"]');
    const links = items('a');
    const selects = [...document.querySelectorAll('select:not([hidden])')].filter(visible).map((s) => ({
      label: String(s.labels && s.labels[0] ? (s.labels[0].innerText || '') : '') || s.getAttribute('aria-label') || '',
      value: s.value,
      options: [...s.options].map((o) => o.text.trim()).slice(0, 30)
    }));
    const combos = [...document.querySelectorAll('[role="combobox"]')].filter(visible).map((c) => ({
      label: String(c.labels && c.labels[0] ? (c.labels[0].innerText || '') : '') || c.getAttribute('aria-label') || c.getAttribute('placeholder') || '',
      value: (c.innerText || c.value || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      expanded: c.getAttribute('aria-expanded') || ''
    }));
    const inputs = [...document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')].filter(visible).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      label: String((el.labels && el.labels[0] ? el.labels[0].innerText : '') || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      value: String(el.value || '').slice(0, 40)
    }));
    const dialogs = items('[role="dialog"], .modal, [class*="modal"]').filter((d) => d.name).map((d) => ({ tag: d.tag, name: d.name.slice(0, 80) }));
    const headings = items('h1,h2,h3,h4,[role="heading"]').map((h) => h.name).filter(Boolean).slice(0, 15);
    const tables = [...document.querySelectorAll('table')].filter(visible).slice(0, 3).map((t) => {
      const rows = [...t.querySelectorAll('tbody tr')].slice(0, 8).map((r) => [...r.querySelectorAll('td,th')].map((c) => c.innerText.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).join(' | '));
      return { cols: [...t.querySelectorAll('thead th')].map((c) => c.innerText.trim().slice(0, 30)), rows };
    });
    return {
      url: location.href,
      title: document.title,
      headings,
      buttons: buttons.slice(0, 60),
      links: links.slice(0, 30),
      selects: selects.slice(0, 15),
      combos: combos.slice(0, 15),
      inputs: inputs.slice(0, 25),
      dialogs: dialogs.slice(0, 5),
      tables
    };
  });
}

/** Clica no primeiro elemento (visível) cujo texto casa, priorizando roles de UI. */
async function clickText(page, label) {
  const locators = [
    () => page.getByRole('menuitem', { name: label, exact: false }).first(),
    () => page.getByRole('button', { name: label, exact: false }).first(),
    () => page.getByRole('tab', { name: label, exact: false }).first(),
    () => page.getByRole('treeitem', { name: label, exact: false }).first(),
    () => page.getByRole('option', { name: label, exact: false }).first(),
    () => page.getByRole('link', { name: label, exact: false }).first(),
    () => page.getByText(label, { exact: false }).first()
  ];
  for (const mk of locators) {
    try {
      const loc = mk();
      await loc.waitFor({ state: 'visible', timeout: 2500 });
      await loc.click({ timeout: 3000 });
      await page.waitForTimeout(400);
      return { ok: true, via: 'locator', label };
    } catch { /* próximo */ }
  }
  // Fallback: varre o DOM normalizado e clica no melhor candidato.
  const q = normalize(label);
  const res = await page.evaluate((query) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="treeitem"], [role="option"], label, .dropdown-item, li a, td')].filter(visible);
    let best = null, bestScore = 0;
    for (const el of els) {
      const t = norm((el.innerText || el.getAttribute('aria-label') || el.textContent || '').trim());
      if (!t) continue;
      let score = 0;
      if (t.includes(query)) score = 100 + query.length;
      else if (query.includes(t) && t.length >= 3) score = 50 + t.length;
      else {
        const qt = query.split(' '), tt = t.split(' ');
        score = qt.filter((w) => w.length >= 3 && tt.includes(w)).length * 20;
      }
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (best && bestScore >= 15) {
      best.scrollIntoView({ block: 'center' });
      best.click();
      return { ok: true, via: 'dom', text: (best.innerText || best.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80), score: bestScore };
    }
    return { ok: false, score: bestScore };
  }, q);
  if (res.ok) await page.waitForTimeout(400);
  return res;
}

/** Seleciona uma opção em um <select> ou combobox. */
async function selectOption(page, label, option) {
  const sel = page.locator('select:visible').filter({ hasText: label }).first();
  const selCount = await sel.count().catch(() => 0);
  if (selCount) {
    await sel.selectOption({ label: option }).catch(async () => { await sel.selectOption(option); });
    await page.waitForTimeout(400);
    return { ok: true, via: 'select' };
  }
  // Combobox: clica para abrir e escolhe a opção.
  const box = page.getByRole('combobox').filter({ hasText: label }).first();
  if (await box.count()) {
    await box.click();
    await page.waitForTimeout(400);
    const opt = page.getByRole('option', { name: option, exact: false }).first();
    if (await opt.count()) {
      await opt.click();
      await page.waitForTimeout(400);
      return { ok: true, via: 'combobox' };
    }
    return { ok: false, reason: 'opção não achada no combobox' };
  }
  // Dropdown estilo Angular/PrimeNG: acha o elemento com o texto e clica.
  const r = await clickText(page, option);
  return { ok: r.ok, via: r.ok ? 'click-option' : 'none', reason: r.ok ? '' : 'sem select/combobox e sem clique' };
}

/** Preenche o input visível cujo label mais casa com `hint`. */
async function fillField(page, hint, value) {
  const q = normalize(hint);
  const v = String(value ?? '').trim() || 'Valor de teste';
  const res = await page.evaluate(({ q, v }) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')].filter(visible);
    let best = null, bestScore = 0;
    for (const el of els) {
      const label = norm((el.labels && el.labels[0] ? el.labels[0].innerText : '') || el.getAttribute('aria-label') || el.placeholder || '');
      const tag = el.tagName.toLowerCase();
      let score = 0;
      if (q && label.includes(q)) score = 80 + q.length;
      else if (q && q.includes(label) && label.length >= 3) score = 40 + label.length;
      else if (tag === 'textarea') score = 25;
      else if (q && /(texto|anamnese|justificativa)/.test(q) && label) score = 10;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (best) {
      const proto = best.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(best, v); else best.value = v;
      best.dispatchEvent(new Event('input', { bubbles: true }));
      best.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, label: (best.labels && best.labels[0] ? best.labels[0].innerText : best.placeholder || best.getAttribute('aria-label') || '').trim().slice(0, 60), tag: best.tagName.toLowerCase() };
    }
    return { ok: false, reason: 'nenhum input casou', score: bestScore };
  }, { q, v });
  if (res.ok) await page.waitForTimeout(250);
  return res;
}

async function execute(page, cmd) {
  const t = cmd.type;
  switch (t) {
    case 'dump':
      return { ok: true, screen: await dumpScreen(page) };
    case 'click':
      return await clickText(page, cmd.label);
    case 'select':
      return await selectOption(page, cmd.label, cmd.option);
    case 'fill':
      return await fillField(page, cmd.hint, cmd.value);
    case 'goto':
      await page.goto(cmd.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => ({ err: e.message }));
      await page.waitForTimeout(600);
      return { ok: true, url: page.url() };
    case 'sleep':
      await page.waitForTimeout(Number(cmd.ms) || 1000);
      return { ok: true };
    case 'shot':
      await page.screenshot({ path: path.join(WORK, `${cmd.name || 'shot'}.png`), fullPage: true });
      return { ok: true, shot: cmd.name || 'shot' };
    case 'bodytext':
      return { ok: true, text: await page.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 4000)) };
    case 'logout':
      await page.getByRole('button', { name: /^Sair$/i }).click({ timeout: 3000 }).catch(() => {});
      return { ok: true };
    default:
      return { ok: false, reason: `comando desconhecido: ${t}` };
  }
}

/** Resolve a página ativa: a última criada / com foco / com atendimento (token JWT). */
async function activePage() {
  const endpoint = browserSession.getCdpEndpoint();
  if (!endpoint) return null;
  const { chromium } = require(path.join(ROOT, 'node_modules', '@playwright', 'test'));
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const pages = context.pages();
  let best = pages[0] || null;
  for (const p of pages) {
    if (/\/atendimento\//i.test(p.url()) && !/ambulatorial$/i.test(p.url())) { best = p; break; }
    if (/ambulatorial/i.test(p.url())) best = p;
    if (/agendamento/i.test(p.url())) best = p;
  }
  return { browser, context, page: best };
}

async function main() {
  console.log('[keeper] Abrindo Chromium VISÍVEL (CDP)...');
  await browserSession.start({
    headed: true,
    statePath: statePathFor(process.env.TARGET_BASE_URL),
    baseURL: process.env.TARGET_BASE_URL
  });
  const { page } = await browserSession.connectDefaultPage();
  let logged = await isLoggedIn(page);
  if (!logged) {
    console.log('[keeper] ⏳ Aguardando login SSO no browser visível (até 15 min)...');
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1500);
      if (await isLoggedIn(page)) { logged = true; break; }
    }
  }
  if (!logged) throw new Error('Timeout aguardando login SSO.');
  console.log('[keeper] Pronto. URL inicial:', page.url());

  // Loop de comandos: lê cpm-cmd.json, executa, grava cpm-out.json.
  while (true) {
    await new Promise((r) => setTimeout(r, 400));
    let cmd = null;
    try {
      cmd = JSON.parse(fs.readFileSync(CMD_FILE, 'utf8'));
    } catch { continue; }
    fs.rmSync(CMD_FILE, { force: true });
    if (cmd === null || cmd.type === 'quit') break;
    let out;
    try {
      // Sempre usa a página ativa (novas abas de prontuário são detectadas).
      const conn = await activePage();
      const target = conn?.page || page;
      out = await execute(target, cmd);
      try { await conn?.browser?.close(); } catch { /* keep */ }
    } catch (err) {
      out = { ok: false, error: err.message };
    }
    out.timestamp = Date.now();
    fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  }
  await browserSession.stop();
  console.log('[keeper] Encerrado.');
}

main().catch(async (err) => {
  console.error('[keeper] Erro fatal:', err.message);
  try { await browserSession.stop(); } catch { /* ok */ }
  process.exit(1);
});
