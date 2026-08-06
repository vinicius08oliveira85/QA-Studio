const path = require('path');
const fs = require('fs');
const opencode = require('./opencode');
const cursor = require('./cursor');
const { buildGeneratePrompt, buildApiCollectionPrompt, buildJudgePrompt } = require('../prompts');
const { extractCodeFence, extractJson, aggregateResult } = require('../utils');
const { persistArtifact } = require('../persist');

const ADAPTERS = {
  opencode,
  cursor
};

function getAdapter(name) {
  const key = (name || process.env.AGENT || 'opencode').toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) throw new Error(`Unknown AGENT="${key}". Use opencode|cursor`);
  return { key, adapter };
}

async function generateSpec(ctx, { agentName, cwd, fixHint, specPath } = {}) {
  const { key, adapter } = getAdapter(agentName);
  const prompt = buildGeneratePrompt(ctx, {
    fixHint,
    flowMode: ctx.flowMode || 'start',
    sequentialFlow: !!ctx.sequentialFlow,
    previousCase: ctx.previousCase || null
  });
  const raw = await adapter.prompt(prompt, { cwd });
  const code = extractCodeFence(raw, 'typescript') || extractCodeFence(raw, 'ts');
  if (!code || !/test\s*\(/.test(code)) {
    throw new Error(`Agent (${key}) did not return a Playwright test. Output head: ${String(raw).slice(0, 400)}`);
  }

  const dir = path.join(cwd, '.generated');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = specPath ? path.basename(specPath) : `case-${ctx.caseId}.spec.ts`;
  const target = specPath || path.join(dir, fileName);
  fs.writeFileSync(target, code.endsWith('\n') ? code : code + '\n', 'utf8');
  const persistedPath = persistArtifact(cwd, target, fileName);
  return { specPath: target, persistedPath, agent: key, raw };
}

async function generateApiCollection(ctx, { agentName, cwd, fixHint } = {}) {
  const { key, adapter } = getAdapter(agentName);
  const prompt = buildApiCollectionPrompt(ctx, { fixHint });
  const raw = await adapter.prompt(prompt, { cwd });
  let collection = extractJson(raw);
  if (!collection?.info || !collection?.item) {
    const fenced = extractCodeFence(raw, 'json');
    collection = fenced ? extractJson(fenced) : null;
  }
  if (!collection?.item) {
    throw new Error(`Agent (${key}) did not return a Postman collection. Output head: ${String(raw).slice(0, 400)}`);
  }

  const dir = path.join(cwd, '.generated');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `case-${ctx.caseId}.postman_collection.json`;
  const collectionPath = path.join(dir, fileName);
  fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');
  const persistedPath = persistArtifact(cwd, collectionPath, fileName);
  return { collectionPath, collection, persistedPath, agent: key, raw };
}

async function judge(ctx, runOut, { agentName, cwd } = {}) {
  const { key, adapter } = getAdapter(agentName);

  const parse = (raw) => {
    const parsed = extractJson(raw);
    if (!parsed || !parsed.result) return { ok: false, raw };
    const stepResults = Array.isArray(parsed.step_results) ? parsed.step_results : [];
    const normalized = stepResults.map((s) => ({
      order: Number(s.order) || 0,
      actual: s.actual || '',
      result: ['Passou', 'Falhou', 'Não Executado', 'Bloqueado', 'Pendente'].includes(s.result)
        ? s.result
        : 'Não Executado'
    }));
    // Completa ordens ausentes para cada passo esperado (evita veredito sem lastro).
    const expectedOrders = new Set((ctx.steps || []).map((s) => s.order));
    for (const order of expectedOrders) {
      if (!normalized.some((r) => r.order === order)) {
        normalized.push({ order, actual: '', result: 'Não Executado' });
      }
    }
    normalized.sort((a, b) => a.order - b.order);

    const allowed = ['Passou', 'Falhou', 'Bloqueado', 'Não Executado', 'Pendente'];
    const result = allowed.includes(parsed.result) ? parsed.result : aggregateResult(normalized);

    return {
      ok: true,
      value: {
        result,
        actual_result: parsed.actual_result || '',
        notes: parsed.notes || '',
        step_results: normalized,
        agent: key,
        raw
      }
    };
  };

  let out = parse(await adapter.prompt(buildJudgePrompt(ctx, runOut), { cwd }));
  if (!out.ok) {
    // Retry 1x enviando o erro de parse para o agent corrigir o JSON.
    const hint = `A resposta anterior não é um JSON válido ou faltou "result". Reenvie apenas o JSON do schema pedido.\nHead da resposta anterior:\n${String(out.raw).slice(0, 1500)}`;
    console.warn('[agent-runner] Judge: resposta inválida; retentando com hint de parse...');
    out = parse(await adapter.prompt(buildJudgePrompt(ctx, runOut, { fixHint: hint }), { cwd }));
  }
  if (!out.ok) {
    throw new Error(`Agent (${key}) did not return judgment JSON. Output head: ${String(out.raw).slice(0, 400)}`);
  }
  return out.value;
}

module.exports = { getAdapter, generateSpec, generateApiCollection, judge };
