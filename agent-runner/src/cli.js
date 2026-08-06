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
const { runOneCase, ALLOWED_TYPES } = require('./runCase');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.caseId && !args.taskId) {
    console.error('Uso:');
    console.error('  npm run test:agent -- --caseId=<id> [--agent=opencode|cursor] [--headless]');
    console.error('  npm run test:agent -- --taskId=<id> [--type=Fumaça|Funcional|API] [--all-modes] [--agent=...]');
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

  console.log(`[agent-runner] API=${api.BASE}`);
  console.log(`[agent-runner] TARGET=${process.env.TARGET_BASE_URL}`);
  console.log(`[agent-runner] AGENT=${agentKey}`);
  console.log(`[agent-runner] BROWSER=${args.headed ? 'headed (visível)' : 'headless'}`);

  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, '.generated'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'specs'), { recursive: true });

  let caseIds = [];
  if (args.caseId) {
    caseIds = [args.caseId];
  } else {
    const list = await api.listTestCases({
      taskId: args.taskId,
      type: args.type || undefined,
      executionMode: args.automatedOnly ? 'Automatizado' : undefined
    });
    caseIds = list
      .filter((c) => ALLOWED_TYPES.has(c.type))
      .filter((c) => !args.type || c.type === args.type)
      .map((c) => c.id);
    console.log(`[agent-runner] Fila tarefa ${args.taskId}: ${caseIds.length} caso(s)${args.automatedOnly ? ' Automatizado' : ''}`);
    if (!caseIds.length) {
      console.error('Nenhum caso elegível na fila (tipo Fumaça/Funcional/API' + (args.automatedOnly ? ' + Automatizado' : '') + ').');
      process.exit(2);
    }
  }

  const results = [];
  const caseRetries = Number(process.env.CASE_RETRIES || 1);

  for (const id of caseIds) {
    let last = null;
    for (let attempt = 0; attempt <= caseRetries; attempt++) {
      if (attempt > 0) {
        await sleep(2000 * attempt);
        console.log(`[agent-runner] Retentando caso ${id} (tentativa ${attempt + 1}/${caseRetries + 1})...`);
      }
      try {
        const r = await runOneCase(id, {
          root: ROOT,
          agentName: agentKey,
          headed: args.headed,
          reuseSpec: args.reuseSpec,
          skipJudge: args.skipJudge
        });
        last = r;
        // Só infra (Bloqueado) é retryável; veredito Falhou/Passou é definitivo.
        if (r.result !== 'Bloqueado' || attempt >= caseRetries) break;
        console.warn(`[agent-runner] Caso ${id} Bloqueado por infraestrutura — retry...`);
      } catch (err) {
        console.error(`[agent-runner] Caso ${id} erro de infra:`, err.message);
        last = { ok: false, result: 'Bloqueado', code: String(id), error: err.message };
        if (attempt >= caseRetries) break;
      }
    }
    results.push(last);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`[agent-runner] Concluído: ${results.length - failed}/${results.length} Passou`);
  for (const r of results) {
    console.log(`  - ${r.code}: ${r.result}${r.executionId ? ` (exec #${r.executionId})` : ''}${r.recorded === false ? ' (NÃO gravado — fallback local)' : ''}`);
    if (r.evidenceDir) console.log(`      evidência: ${r.evidenceDir}`);
    if (r.error) console.log(`      erro: ${r.error}`);
  }
  console.log('[agent-runner] Relatório visual da fila: npx playwright show-report artifacts/html-report');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
