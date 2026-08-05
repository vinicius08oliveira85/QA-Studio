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
const { parseArgs } = require('./utils');
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
  for (const id of caseIds) {
    try {
      const r = await runOneCase(id, {
        root: ROOT,
        agentName: agentKey,
        headed: args.headed,
        reuseSpec: args.reuseSpec,
        skipJudge: args.skipJudge
      });
      results.push(r);
    } catch (err) {
      console.error(`[agent-runner] Caso ${id} erro:`, err.message);
      results.push({ ok: false, result: 'Bloqueado', code: String(id), error: err.message });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`[agent-runner] Concluído: ${results.length - failed}/${results.length} Passou`);
  for (const r of results) {
    console.log(`  - ${r.code}: ${r.result}${r.executionId ? ` (exec #${r.executionId})` : ''}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
