/**
 * Login helper: abre um Chromium visível no CPM e aguarda o usuário concluir o
 * SSO Microsoft. Ao detectar a sessão, salva o storageState em
 * artifacts/sso-state-<hash>.json (mesmo arquivo usado pelos specs).
 *
 * Uso: node login-cpm.js
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('@playwright/test');

const TARGET = process.env.TARGET_BASE_URL || 'https://cpm.hom.levesaude.com.br';
const ROOT = path.join(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const origin = new URL(TARGET).origin;
const hash = crypto.createHash('sha256').update(origin).digest('hex').slice(0, 8);
const STATE = path.join(ARTIFACTS, `sso-state-${hash}.json`);
const DONE = path.join(ARTIFACTS, '.sso-login-done');

function isLoggedIn(page) {
  return page.evaluate(() => {
    const has = (txt) => {
      const el = Array.from(document.querySelectorAll('button, a')).find(
        (e) => e.textContent && e.textContent.trim().toLowerCase() === txt.toLowerCase()
      );
      return !!el;
    };
    return has('Sair') || has('Meu acesso') || /dashboard|agendas|atendimento|admin/i.test(location.pathname);
  }).catch(() => false);
}

(async () => {
  try { fs.unlinkSync(DONE); } catch { /* ok */ }
  console.log('[login] Abrindo ' + TARGET + ' (browser visível).');
  console.log('[login] Complete o login Microsoft na janela. A sessão será salva automaticamente.');

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});

  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) {
      const state = await ctx.storageState({ path: STATE });
      fs.writeFileSync(DONE, new Date().toISOString());
      console.log('[login] OK — sessão salva em ' + STATE + ' (' + state.cookies.length + ' cookies).');
      await browser.close();
      process.exit(0);
    }
    await page.waitForTimeout(1000);
  }
  console.log('[login] Timeout (20 min) aguardando login.');
  await browser.close();
  process.exit(1);
})().catch((e) => {
  console.error('[login] Erro:', e.message);
  process.exit(1);
});
