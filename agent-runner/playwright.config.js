// @ts-check
const path = require('path');
const { defineConfig } = require('@playwright/test');

const baseURL = process.env.TARGET_BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: path.join(__dirname, '.generated'),
  outputDir: path.join(__dirname, 'artifacts', 'test-results'),
  timeout: 900_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: path.join(__dirname, 'artifacts', 'report.json') }]],
  use: {
    baseURL,
    headless: process.env.HEADED !== '1',
    launchOptions: process.env.HEADED === '1' ? { slowMo: 250 } : undefined,
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000
  },
  projects: [{ name: 'chromium', use: { channel: undefined, browserName: 'chromium' } }]
});
