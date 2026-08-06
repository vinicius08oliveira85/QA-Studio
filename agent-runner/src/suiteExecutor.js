const fs = require('fs');
const path = require('path');
const { getAdapter } = require('./agents');
const { buildSuitePrompt } = require('./suitePrompts');
const { suiteCacheKey, validateSuiteSpec, parseSuiteReport } = require('./suiteReport');
const { extractCodeFence, spawnCmd, treeKill, removeDirSync } = require('./utils');
const { persistArtifact } = require('./persist');

function compileSuite(root, specPath) {
  return new Promise((resolve) => {
    const rel = path.relative(root, specPath).replace(/\\/g, '/');
    const child = spawnCmd(
      'npx',
      ['playwright', 'test', rel, '--config', 'playwright.config.js', '--list'],
      { cwd: root, env: { ...process.env, HEADED: '0', HEADLESS: '1' } }
    );
    let output = '';
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      resolve(error);
    };
    const timer = setTimeout(() => {
      treeKill(child);
      finish('Timeout ao validar a suíte Playwright.');
    }, Number(process.env.PLAYWRIGHT_VALIDATE_TIMEOUT_MS) || 90_000);
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish(error.message);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0 ? null : output.trim().slice(0, 4000));
    });
  });
}

async function generateSuite(cases, options) {
  const {
    root,
    agentName,
    firstMode = 'start',
    fixHint = '',
    currentState = null,
    force = false
  } = options;
  const key = suiteCacheKey(cases, { firstMode, fixHint });
  const specPath = path.join(root, '.generated', `suite-${key}.spec.ts`);
  fs.mkdirSync(path.dirname(specPath), { recursive: true });

  const validate = async () => {
    if (!fs.existsSync(specPath)) return ['Spec não encontrado'];
    const source = fs.readFileSync(specPath, 'utf8');
    const issues = validateSuiteSpec(source, cases, { firstMode });
    const compileError = issues.length ? null : await compileSuite(root, specPath);
    return [...issues, ...(compileError ? [compileError] : [])];
  };

  if (!force && !fixHint && fs.existsSync(specPath)) {
    const issues = await validate();
    if (!issues.length) {
      console.log(`[agent-runner] Reusando suíte em lote: ${path.basename(specPath)}`);
      return { specPath, cacheKey: key, reused: true };
    }
  }

  const { key: agentKey, adapter } = getAdapter(agentName);
  let hint = fixHint;
  for (let attempt = 0; attempt < 2; attempt++) {
    console.log(`[agent-runner] Gerando suíte em lote via agent:${agentKey}${attempt ? ' (correção)' : ''}...`);
    const raw = await adapter.prompt(buildSuitePrompt(cases, {
      firstMode,
      fixHint: hint,
      currentState
    }), { cwd: root });
    const source = extractCodeFence(raw, 'typescript') || extractCodeFence(raw, 'ts');
    if (!source) {
      hint = `A resposta não continha um code fence TypeScript válido. Head: ${String(raw).slice(0, 800)}`;
      continue;
    }
    fs.writeFileSync(specPath, source.endsWith('\n') ? source : source + '\n', 'utf8');
    const issues = await validate();
    if (!issues.length) {
      persistArtifact(root, specPath, path.basename(specPath));
      return { specPath, cacheKey: key, reused: false };
    }
    hint = `Corrija estes problemas obrigatórios:\n${issues.join('\n')}`;
  }
  throw new Error(`Suíte inválida após regeneração: ${hint}`);
}

function cleanRunArtifacts(root) {
  for (const rel of ['artifacts/test-results', 'artifacts/html-report']) {
    try { removeDirSync(path.join(root, rel)); } catch { /* ignore */ }
  }
  try { fs.unlinkSync(path.join(root, 'artifacts', 'report.json')); } catch { /* ignore */ }
}

function runSuite(root, specPath, cases) {
  cleanRunArtifacts(root);
  return new Promise((resolve) => {
    const rel = path.relative(root, specPath).replace(/\\/g, '/');
    const env = { ...process.env, HEADED: '1' };
    delete env.HEADLESS;
    const child = spawnCmd(
      'npx',
      ['playwright', 'test', rel, '--config', 'playwright.config.js'],
      { cwd: root, env }
    );
    let log = '';
    let done = false;
    const finish = (exitCode, infraTimeout = false) => {
      if (done) return;
      done = true;
      const reportPath = path.join(root, 'artifacts', 'report.json');
      let results;
      try {
        results = parseSuiteReport(reportPath, cases);
      } catch (error) {
        results = parseSuiteReport({}, cases);
        log += `\n[agent-runner] Relatório inválido: ${error.message}\n`;
      }
      resolve({ exitCode, log, results, reportPath, infraTimeout });
    };
    const timeout = setTimeout(() => {
      log += '\n[agent-runner] Suíte excedeu o timeout e foi encerrada.\n';
      treeKill(child);
      finish(1, true);
    }, Number(process.env.PLAYWRIGHT_TIMEOUT_MS) || 15 * 60 * 1000);
    child.stdout.on('data', (data) => {
      const text = data.toString();
      log += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      log += text;
      process.stderr.write(text);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      log += `\n${error.message}\n`;
      finish(1, true);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      finish(code ?? 1);
    });
  });
}

module.exports = { generateSuite, runSuite, compileSuite };
