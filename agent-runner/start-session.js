/**
 * Sobe o browser persistente (browserSession) e aguarda o login SSO manual.
 * Ao detectar a sessão, grava o endpoint CDP + storageState e mantém o browser
 * vivo para a execução dos specs (todos reutilizam o MESMO contexto via CDP).
 *
 * Uso: node start-session.js  (mantém o processo rodando até Ctrl+C)
 */
const path = require('path');
const fs = require('fs');
const browserSession = require('./src/browserSession');
const { statePathFor, isLoggedIn } = require('./helpers/ssoWait');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname);
const TARGET = process.env.TARGET_BASE_URL || 'https://cpm.hom.levesaude.com.br';
const MARKER = path.join(ROOT, 'artifacts', '.cdp-endpoint');
const READY = path.join(ROOT, 'artifacts', '.session-ready');

async function main() {
  try { fs.unlinkSync(READY); } catch { /* ok */ }
  const statePath = statePathFor(TARGET);
  console.log(`[session] Iniciando browser persistente (headed) → ${TARGET}`);
  const { cdpEndpoint } = await browserSession.start({ headed: true, statePath, baseURL: TARGET });
  fs.writeFileSync(MARKER, cdpEndpoint, 'utf8');

  console.log('[session] Aguardando login SSO na janela aberta…');
  console.log('[session] Complete o login Microsoft. A sessão será detectada automaticamente.');

  // Detecta login na page do context CDP padrão.
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(cdpEndpoint);
      const ctx = browser.contexts()[0];
      const page = ctx?.pages()[0];
      if (page && await isLoggedIn(page)) {
        console.log('[session] Login detectado. Salvando sessão…');
        await page.context().storageState({ path: statePath });
        fs.writeFileSync(READY, JSON.stringify({ at: new Date().toISOString(), cdpEndpoint }), 'utf8');
        console.log(`[session] PRONTO. CDP=${cdpEndpoint}`);
        console.log('[session] Browser mantido vivo. Rode os specs com QA_FLOW_CDP=' + cdpEndpoint);
        // Mantém o processo vivo segurando o browser.
        await new Promise(() => {});
        return;
      }
      await browser.close().catch(() => {});
    } catch (e) { /* conecta de novo */ }
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.error('[session] Timeout aguardando login (20 min).');
  await browserSession.stop();
  process.exit(1);
}

main().catch(async (e) => {
  console.error('[session] Erro:', e.message);
  try { await browserSession.stop(); } catch { /* ok */ }
  process.exit(1);
});
