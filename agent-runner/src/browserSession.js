const fs = require('fs');
const { chromium } = require('@playwright/test');

let launchedBrowser = null;
let cdpEndpoint = null;

/**
 * Injeta storageState no context padrão do CDP (contexts[0]).
 * Playwright MCP e o Agent ao vivo usam esse context — não criar newContext.
 */
async function applyStorageState(context, statePath) {
  if (!statePath || !fs.existsSync(statePath) || process.env.SSO_STATE_OFF === '1') return;
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (Array.isArray(state.cookies) && state.cookies.length) {
      await context.addCookies(state.cookies);
      console.log(`[FLOW] Cookies SSO restaurados (${state.cookies.length}) no context CDP padrão`);
    }
    for (const origin of state.origins || []) {
      if (!origin?.origin || !Array.isArray(origin.localStorage) || !origin.localStorage.length) continue;
      const page = context.pages()[0] || await context.newPage();
      await page.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
      await page.evaluate((items) => {
        for (const item of items) {
          try { localStorage.setItem(item.name, item.value); } catch { /* ignore */ }
        }
      }, origin.localStorage).catch(() => {});
    }
  } catch (err) {
    console.warn(`[FLOW] Não foi possível restaurar storageState: ${err.message}`);
  }
}

/**
 * Sobe um Chromium com CDP usando o context padrão (índice 0).
 * Os specs da fila e o Playwright MCP reutilizam a mesma page.
 */
async function start({ headed = true, statePath, baseURL } = {}) {
  if (launchedBrowser) await stop();

  const port = Number(process.env.QA_FLOW_CDP_PORT) || (9300 + Math.floor(Math.random() * 400));
  // slowMo alto deixa o Agent ao vivo (MCP) muito lento; default 0.
  const slowMo = Number(process.env.QA_FLOW_SLOW_MO ?? 0);
  launchedBrowser = await chromium.launch({
    headless: !headed,
    args: [`--remote-debugging-port=${port}`],
    slowMo: Number.isFinite(slowMo) ? slowMo : 0
  });

  cdpEndpoint = `http://127.0.0.1:${port}`;
  process.env.QA_FLOW_CDP = cdpEndpoint;
  process.env.PLAYWRIGHT_MCP_CDP_ENDPOINT = cdpEndpoint;

  const connected = await chromium.connectOverCDP(cdpEndpoint);
  const context = connected.contexts()[0];
  if (!context) {
    throw new Error('FLOW_CONTEXT_LOST: Chromium CDP sem context padrão.');
  }
  await applyStorageState(context, statePath);

  const page = context.pages()[0] || await context.newPage();

  // Evita about:blank enquanto o agent gera/opera (~minutos).
  const target = baseURL || process.env.TARGET_BASE_URL;
  if (target) {
    console.log(`[FLOW] Abrindo alvo ${target}`);
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } catch (err) {
      console.warn(`[FLOW] Aviso: não foi possível abrir o alvo agora (${err.message}). O Agent tentará de novo.`);
    }
  }

  console.log(`[FLOW] Browser persistente em ${cdpEndpoint} (context[0] para MCP)`);
  return { cdpEndpoint, port };
}

async function stop() {
  if (launchedBrowser) {
    try { await launchedBrowser.close(); } catch { /* already closed */ }
  }
  launchedBrowser = null;
  cdpEndpoint = null;
  delete process.env.QA_FLOW_CDP;
  delete process.env.PLAYWRIGHT_MCP_CDP_ENDPOINT;
  console.log('[FLOW] Browser persistente encerrado');
}

function getCdpEndpoint() {
  return cdpEndpoint || process.env.QA_FLOW_CDP || null;
}

/**
 * Conecta na page do context CDP padrão (mesmo que o Playwright MCP usa).
 */
async function connectDefaultPage() {
  const endpoint = getCdpEndpoint();
  if (!endpoint) return null;
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  if (!context) return null;
  const page = context.pages()[0] || await context.newPage();
  return { browser, context, page };
}

async function snapshot() {
  const connected = await connectDefaultPage();
  if (!connected) return null;
  const { page } = connected;
  const heading = await page.locator('h1:visible, h2:visible, [role="heading"]:visible')
    .first()
    .innerText()
    .catch(() => '');
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    heading: String(heading || '').trim().slice(0, 300),
    pages: (connected.context.pages() || []).length
  };
}

module.exports = { start, stop, getCdpEndpoint, snapshot, connectDefaultPage };
