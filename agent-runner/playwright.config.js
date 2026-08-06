// @ts-check
const path = require('path');
const fs = require('fs');
const { defineConfig } = require('@playwright/test');

const baseURL = process.env.TARGET_BASE_URL || 'http://localhost:3000';

// Sessão SSO salva (artifacts/.state.json) para reutilizar login entre casos da fila.
const statePath =
  process.env.PLAYWRIGHT_STATE && fs.existsSync(process.env.PLAYWRIGHT_STATE)
    ? process.env.PLAYWRIGHT_STATE
    : undefined;

module.exports = defineConfig({
  testDir: path.join(__dirname, '.generated'),
  outputDir: path.join(__dirname, 'artifacts', 'test-results'),
  timeout: 900_000,
  expect: { timeout: 15_000 },
  retries: Number(process.env.PLAYWRIGHT_RETRIES || 0),
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'artifacts', 'html-report'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, 'artifacts', 'report.json') }]
  ],
  use: {
    baseURL,
    headless: process.env.HEADED !== '1',
    launchOptions: process.env.HEADED === '1' ? { slowMo: 250 } : undefined,
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    ...(statePath ? { storageState: statePath } : {})
  },
  projects: [{ name: 'chromium', use: { channel: undefined, browserName: 'chromium' } }]
});
