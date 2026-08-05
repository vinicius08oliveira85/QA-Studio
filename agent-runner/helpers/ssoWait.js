const fs = require('fs');
const path = require('path');

const MARKER = path.join(__dirname, '..', 'artifacts', '.sso-ready');

function clearSsoMarker() {
  try { fs.unlinkSync(MARKER); } catch { /* ignore */ }
}

function signalSsoContinue() {
  fs.mkdirSync(path.dirname(MARKER), { recursive: true });
  fs.writeFileSync(MARKER, String(Date.now()), 'utf8');
}

async function isLoggedIn(page) {
  try {
    if (await page.getByRole('button', { name: /^Sair$/i }).count()) return true;
    if (await page.getByRole('link', { name: /meu acesso/i }).count()) return true;
    if (/\/(dashboard|agendas|atendimento|admin)/i.test(page.url())) return true;
  } catch { /* ignore */ }
  return false;
}

/**
 * Pause until QA confirms SSO in Studio, unless already authenticated.
 */
async function waitForManualLogin(page, opts = {}) {
  await page.waitForTimeout(800);
  if (!opts.force && await isLoggedIn(page)) {
    console.log('[SSO] Sessão já autenticada — seguindo sem espera.');
    return;
  }

  clearSsoMarker();
  const timeoutMs = opts.timeoutMs || 15 * 60 * 1000;
  const started = Date.now();

  console.log('[SSO] Aguardando login manual (SSO). Complete o login no browser aberto.');
  console.log('[SSO] Depois clique em "Já fiz login" no painel do Agent no Studio.');

  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(MARKER)) {
      clearSsoMarker();
      console.log('[SSO] Confirmação recebida — retomando o teste.');
      await page.waitForTimeout(800);
      return;
    }
    // Sempre detecta sessão após o usuário concluir SSO, mesmo com force:true
    if (await isLoggedIn(page)) {
      console.log('[SSO] Login detectado automaticamente — retomando.');
      return;
    }
    await page.waitForTimeout(800);
  }

  throw new Error('Timeout aguardando login SSO manual (15 min). Clique em "Já fiz login" no Studio após autenticar.');
}

module.exports = { waitForManualLogin, clearSsoMarker, signalSsoContinue, MARKER, isLoggedIn };
