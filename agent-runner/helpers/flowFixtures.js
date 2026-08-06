/**
 * Fixtures Playwright para fila sequencial: reusa a mesma page via CDP
 * (browserSession.js sobe o Chromium uma vez).
 */
const base = require('@playwright/test');
const { chromium } = require('@playwright/test');

function resolveRelative(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return url;
  return new URL(url, process.env.TARGET_BASE_URL).href;
}

function applyBaseUrl(page) {
  const goto = page.goto.bind(page);
  const waitForURL = page.waitForURL.bind(page);
  page.goto = (url, options) => goto(resolveRelative(url), options);
  page.waitForURL = (url, options) => waitForURL(resolveRelative(url), options);
  return page;
}

const test = base.test.extend({
  // Descarta context/page padrão do runner; usa a page do browser persistente.
  context: async ({}, use) => {
    const endpoint = process.env.QA_FLOW_CDP;
    if (!endpoint) {
      throw new Error('FLOW_CONTEXT_LOST: QA_FLOW_CDP ausente — browser sequencial não iniciado.');
    }
    const browser = await chromium.connectOverCDP(endpoint);
    // Mesmo context[0] do Playwright MCP / Agent ao vivo (não o último newContext).
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('FLOW_CONTEXT_LOST: nenhum contexto CDP disponível.');
    }
    await use(context);
    // Não fecha o browser/context — a fila continua na mesma sessão.
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] || await context.newPage();
    await use(applyBaseUrl(page));
  }
});

module.exports = { test, expect: base.expect, resolveRelative };
