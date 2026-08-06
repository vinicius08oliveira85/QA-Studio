#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

try {
  const res = require('dotenv').config({ path: path.join(ROOT, '.env') });
  require('dotenv').config({ path: path.join(ROOT, '..', '.env') });
  if (res.error) {
    console.warn('[agent-runner] dotenv: ' + res.error.message);
  }
} catch (err) {
  console.warn('[agent-runner] dotenv ignorado:', err.message);
}

const api = require('./studioApi');
const { parseArgs, checkUrl, sleep } = require('./utils');
const { getAdapter } = require('./agents');
const { runOneCase, ALLOWED_TYPES, UI_TYPES } = require('./runCase');
const { runSequentialSuite } = require('./sequentialSuite');
const { runLiveSuite } = require('./liveSuite');
const browserSession = require('./browserSession');
const { clearFixMarkers } = require('../helpers/flowControl');
const { statePathFor } = require('../helpers/ssoWait');

async function replayFailed() {
  const dir = path.join(ROOT, 'artifacts', 'failed-executions');
  if (!fs.existsSync(dir)) {
    console.log('[agent-runner] Nada para reprocessar.');
    process.exitCode = 0;
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.log('[agent-runner] Nenhuma execução pendente em ' + path.relative(ROOT, dir));
    process.exitCode = 0;
    return;
  }
  let ok = 0;
  let fail = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const exec = await api.createExecution(data.payload);
      fs.unlinkSync(p);
      console.log(`[agent-runner] Regravado ${f} → exec #${exec?.id}`);
      ok++;
    } catch (err) {
      console.error(`[agent-runner] Falhou ${f}: ${err.message}`);
      fail++;
    }
  }
  console.log(`[agent-runner] Reprocessamento: ${ok} gravado(s), ${fail} falha(s).`);
  process.exitCode = fail ? 1 : 0;
}

function fmtMs(ms) {
  return `${((ms || 0) / 1000).toFixed(1)}s`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.replayFailed) {
    await replayFailed();
    return;
  }

  if (!args.caseId && !args.taskId) {
    console.error('Uso:');
    console.error('  npm run test:agent -- --caseId=<id> [--agent=opencode|cursor] [--headless]');
    console.error('  npm run test:agent -- --taskId=<id> [--type=Fumaça|Funcional|API] [--all-modes] [--sequential-flow] [--agent=...]');
    console.error('  npm run test:agent -- --replay-failed');
    console.error('  (browser visível por padrão; --headless para CI)');
    process.exit(2);
  }

  if (!process.env.TARGET_BASE_URL) {
    console.error('Defina TARGET_BASE_URL (app externo sob teste). Veja agent-runner/.env.example');
    process.exit(2);
  }

  try {
    const status = await checkUrl(process.env.TARGET_BASE_URL);
    console.log(`[agent-runner] Pré-flight: ${process.env.TARGET_BASE_URL} respondeu ${status}`);
  } catch (err) {
    console.error(`[agent-runner] Pré-flight falhou — ${process.env.TARGET_BASE_URL} inacessível: ${err.message}`);
    process.exit(2);
  }

  const agentName = args.agent || process.env.AGENT || 'opencode';
  const { key: agentKey } = getAdapter(agentName);
  const sequentialFlow = !!args.sequentialFlow;

  // Continuidade de tela exige browser visível e um Chromium vivo.
  if (sequentialFlow) args.headed = true;

  console.log(`[agent-runner] API=${api.BASE}`);
  console.log(`[agent-runner] TARGET=${process.env.TARGET_BASE_URL}`);
  console.log(`[agent-runner] AGENT=${agentKey}`);
  console.log(`[agent-runner] BROWSER=${args.headed ? 'headed (visível)' : 'headless'}`);
  // Agent sequencial: modo live (MCP no CDP) por padrão; LIVE_SUITE=0 volta à geração de specs.
  const liveSuite = sequentialFlow && process.env.LIVE_SUITE !== '0';
  if (sequentialFlow) {
    console.log(liveSuite
      ? '[agent-runner] FLOW=live (OpenCode + Playwright MCP no mesmo Chromium)'
      : '[agent-runner] FLOW=sequential (suíte Playwright gerada em lote)');
  }

  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, '.generated'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'specs'), { recursive: true });
  clearFixMarkers();

  let caseIds = [];
  if (args.caseId) {
    caseIds = [args.caseId];
  } else {
    const list = await api.listTestCases({
      taskId: args.taskId,
      type: args.type || undefined,
      executionMode: args.automatedOnly ? 'Automatizado' : undefined
    });
    const eligibleTypes = sequentialFlow ? UI_TYPES : ALLOWED_TYPES;
    caseIds = list
      .filter((c) => eligibleTypes.has(c.type))
      .filter((c) => !args.type || c.type === args.type)
      .map((c) => c.id);
    console.log(`[agent-runner] Fila tarefa ${args.taskId}: ${caseIds.length} caso(s)${args.automatedOnly ? ' Automatizado' : ''}`);
    if (!caseIds.length) {
      const types = sequentialFlow ? 'Fumaça/Funcional' : 'Fumaça/Funcional/API';
      console.error(`Nenhum caso elegível na fila (tipo ${types}${args.automatedOnly ? ' + Automatizado' : ''}).`);
      process.exit(2);
    }
  }

  if (sequentialFlow) {
    const statePath = statePathFor(process.env.TARGET_BASE_URL);
    await browserSession.start({
      headed: true,
      statePath,
      baseURL: process.env.TARGET_BASE_URL
    });
  }

  const results = [];
  const caseRetries = sequentialFlow ? 0 : Number(process.env.CASE_RETRIES || 1);
  if (sequentialFlow) {
    try {
      const suite = liveSuite
        ? await runLiveSuite({
          root: ROOT,
          caseIds,
          agentName: 'opencode-live',
          baseURL: process.env.TARGET_BASE_URL
        })
        : await runSequentialSuite({
          root: ROOT,
          caseIds,
          agentName: agentKey,
          skipJudge: args.skipJudge,
          baseURL: process.env.TARGET_BASE_URL
        });
      for (const item of suite.results) {
        results.push({
          ...item,
          ok: item.result === 'Passou',
          skipped: item.result === 'Não Executado'
        });
      }
    } finally {
      await browserSession.stop();
      clearFixMarkers();
    }
  } else {
    for (const id of caseIds) {
      let last = null;
      for (let attempt = 0; attempt <= caseRetries; attempt++) {
        if (attempt > 0) {
          await sleep(2000 * attempt);
          console.log(`[agent-runner] Retentando caso ${id} (tentativa ${attempt + 1}/${caseRetries + 1})...`);
        }
        try {
          last = await runOneCase(id, {
            root: ROOT,
            agentName: agentKey,
            headed: args.headed,
            reuseSpec: args.reuseSpec,
            skipJudge: args.skipJudge
          });
          if (last.result !== 'Bloqueado' || attempt >= caseRetries) break;
          console.warn(`[agent-runner] Caso ${id} Bloqueado por infraestrutura — retry...`);
        } catch (err) {
          console.error(`[agent-runner] Caso ${id} erro de infra:`, err.message);
          last = { ok: false, result: 'Bloqueado', code: String(id), error: err.message };
          if (attempt >= caseRetries) break;
        }
      }
      results.push(last);
    }
  }

  const failed = results.filter((r) => ['Falhou', 'Bloqueado'].includes(r?.result)).length;
  const skipped = results.filter((r) => r?.skipped || r?.result === 'Não Executado').length;
  console.log(`[agent-runner] Concluído: ${results.filter((r) => r?.ok).length}/${results.length} Passou` + (skipped ? ` (${skipped} pulado(s))` : ''));
  for (const r of results) {
    const t = r.timings;
    const dur = t ? ` (total ${fmtMs(t.totalMs)}: api ${fmtMs(t.apiMs)} / spec ${fmtMs(t.specMs)} / run ${fmtMs(t.runMs)} / judge ${fmtMs(t.judgeMs)})` : '';
    console.log(`  - ${r.code}: ${r.result}${r.executionId ? ` (exec #${r.executionId})` : ''}${r.recorded === false ? ' (NÃO gravado — fallback local)' : ''}${dur}`);
    if (r.evidenceDir) console.log(`      evidência: ${r.evidenceDir}`);
    if (r.error) console.log(`      erro: ${r.error}`);
  }

  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  const summary = {
    ranAt: new Date().toISOString(),
    agent: agentKey,
    baseURL: process.env.TARGET_BASE_URL,
    api: api.BASE,
    sequentialFlow,
    liveSuite: sequentialFlow && process.env.LIVE_SUITE !== '0',
    caseRetries,
    passed: results.filter((r) => r?.ok).length,
    failed,
    skipped,
    results
  };
  fs.writeFileSync(path.join(ROOT, 'artifacts', 'results.json'), JSON.stringify(summary, null, 2), 'utf8');
  const bundles = results.map((r) => r.evidenceDir).filter(Boolean);
  fs.writeFileSync(
    path.join(ROOT, 'artifacts', 'last-run.json'),
    JSON.stringify({ ranAt: summary.ranAt, bundles, passed: summary.passed, failed: summary.failed, sequentialFlow }, null, 2),
    'utf8'
  );
  console.log(`[agent-runner] Resumo: artifacts/results.json${bundles.length ? ` · bundles em last-run.json` : ''}`);
  console.log('[agent-runner] Relatório visual da fila: npx playwright show-report artifacts/html-report');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => {
  console.error(err);
  try { await browserSession.stop(); } catch { /* ok */ }
  process.exit(1);
});
