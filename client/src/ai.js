import { api } from './api.js';

export const SCOPE_LABELS = {
  requisitos: 'Requisitos + Regras de Negócio (novos)',
  completar: 'Completar requisitos existentes',
  estrategias: 'Estratégia de Teste',
  cenarios: 'Cenários de Teste',
  casos: 'Casos de Teste + Massa',
  completo: 'Fluxo completo (tudo)'
};

const sanitize = (value, allowed, def) => (allowed.includes(value) ? value : def);

export function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* continua */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* continua */ }
  }
  return null;
}

function contentModel(scope) {
  const parts = [];
  if (scope === 'requisitos' || scope === 'completo') {
    parts.push(
      '1. REQUISITOS (array "requirements"): cada um com code (REQ-XXX), title (o que o sistema deve fazer, claro e verificável), module, priority ("Alta" | "Média" | "Baixa" baseado em risco de negócio), status "Ativo", description (comportamento esperado em detalhe) e business_rules: array de { rule, category } com 2 a 6 regras de negócio por requisito (category sugerida: "Regra de Negócio", "Validação de Campos", "Segurança", "Integração", "Performance").'
    );
  }
  if (scope === 'completar') {
    parts.push(
      'REQUISITOS (array "requirements"): para CADA requisito listado no contexto, retorne module (módulo/sistema onde se aplica), priority ("Alta" | "Média" | "Baixa"), status (um de "Ativo" | "Em Análise" | "Homologado" | "Cancelado"), description (refinada, mantendo a essência e ampliando o comportamento esperado) e business_rules: array de { rule, category } com 2 a 6 regras no formato "Se... então..." (category sugerida: "Regra de Negócio", "Validação de Campos", "Segurança", "Integração", "Performance"). Mantenha o code igual ao informado.'
    );
  }
  if (scope === 'estrategias' || scope === 'completo') {
    parts.push(
      '2. ESTRATÉGIAS (array "strategies"): UMA por requisito do contexto (requirement_id = índice do requisito). Cada uma com name (ex.: "Estratégia de teste - {código do requisito}"), description, approach (abordagem de teste coerente com as regras do requisito), risk_scope (riscos e itens dentro/fora de escopo), entry_criteria, exit_criteria e status "Ativo".'
    );
  }
  if (scope === 'cenarios' || scope === 'completo') {
    parts.push(
      '3. CENÁRIOS (array "scenarios"): cada um com requirement_id (índice do requisito correspondente), title, description e preconditions. Cubra fluxos feliz, alternativo e de exceção.'
    );
  }
  if (scope === 'casos' || scope === 'completo') {
    parts.push(
      '4. CASOS DE TESTE (array "test_cases"): cada um com scenario_id (índice do cenário), requirement_id (índice do requisito), code (TC-XXX), title, type ("Funcional" | "API" | "Fumaça" | "Regressão"), execution_mode ("Manual" | "Automatizado"), priority ("Alta" | "Média" | "Baixa"), status "Pronto", preconditions, regression_relevant (1 para fluxos críticos/repetitivos, senão 0), automated 0 e steps: array de { order, action, expected } com 3 a 10 passos numerados a partir de 1 (action = o que o QA executa, expected = resultado esperado verificável).'
    );
    parts.push(
      '5. MASSA DE TESTE (array "test_mass"): para os casos que precisam de dados: test_case_id (índice do caso em "test_cases"), name (identificação), data (um dado por linha: usuários, e-mails, payloads, valores de borda) e purpose (objetivo da massa / regra que valida).'
    );
  }
  return parts.join('\n');
}

function schemaScope(scope) {
  const req = `{
  "requirements": [
    { "code": "REQ-001", "title": "", "module": "", "priority": "Alta|Média|Baixa", "status": "Ativo", "description": "", "business_rules": [ { "rule": "", "category": "" } ] }
  ]
}`;
  const completeReq = `{
  "requirements": [
    { "code": "REQ-001", "module": "", "priority": "Alta|Média|Baixa", "status": "Ativo|Em Análise|Homologado|Cancelado", "description": "", "business_rules": [ { "rule": "", "category": "" } ] }
  ]
}`;
  const scen = `{
  "scenarios": [
    { "requirement_id": 0, "title": "", "description": "", "preconditions": "" }
  ]
}`;
  const strats = `{
  "strategies": [
    { "requirement_id": 0, "name": "", "description": "", "approach": "", "risk_scope": "", "entry_criteria": "", "exit_criteria": "", "status": "Ativo" }
  ]
}`;
  const cases = `{
  "test_cases": [
    { "scenario_id": 0, "requirement_id": 0, "code": "TC-001", "title": "", "type": "Funcional|API|Fumaça|Regressão", "execution_mode": "Manual|Automatizado", "priority": "Alta|Média|Baixa", "status": "Pronto", "preconditions": "", "regression_relevant": 0, "automated": 0, "steps": [ { "order": 1, "action": "", "expected": "" } ] }
  ],
  "test_mass": [
    { "test_case_id": 0, "name": "", "data": "", "purpose": "" }
  ]
}`;
  const full = `{
  "requirements": [
    { "code": "REQ-001", "title": "", "module": "", "priority": "Alta|Média|Baixa", "status": "Ativo", "description": "", "business_rules": [ { "rule": "", "category": "" } ] }
  ],
  "strategies": [
    { "requirement_id": 0, "name": "", "description": "", "approach": "", "risk_scope": "", "entry_criteria": "", "exit_criteria": "", "status": "Ativo" }
  ],
  "scenarios": [
    { "requirement_id": 0, "title": "", "description": "", "preconditions": "" }
  ],
  "test_cases": [
    { "scenario_id": 0, "requirement_id": 0, "code": "TC-001", "title": "", "type": "Funcional|API|Fumaça|Regressão", "execution_mode": "Manual|Automatizado", "priority": "Alta|Média|Baixa", "status": "Pronto", "preconditions": "", "regression_relevant": 0, "automated": 0, "steps": [ { "order": 1, "action": "", "expected": "" } ] }
  ],
  "test_mass": [
    { "test_case_id": 0, "name": "", "data": "", "purpose": "" }
  ]
}`;
  return { requisitos: req, completar: completeReq, estrategias: strats, cenarios: scen, casos: cases, completo: full }[scope];
}

function selectReqs(existing, selectedReqIds) {
  const all = existing.reqList || [];
  if (!selectedReqIds || selectedReqIds.length === 0) return all;
  return all.filter((r) => selectedReqIds.includes(Number(r.id)));
}

function formatRequirement(r, i) {
  const rules = (r.business_rules || [])
    .map((br) => `  - ${br.category ? '[' + br.category + '] ' : ''}${br.rule}`)
    .join('\n');
  return `${i}: ${r.code} - ${r.title}${r.module ? ` (módulo: ${r.module})` : ''}${r.priority ? ` [prioridade: ${r.priority}]` : ''}
  Descrição: ${r.description || '(sem descrição)'}
  Regras de negócio:
${rules || '  (nenhuma regra)'}`;
}

export function buildPrompt({ project, title, description, scope, existing = {}, selectedReqIds = [] }) {
  const scopeInstructions = {
    requisitos: 'Gere SOMENTE requisitos e regras de negócio.',
    completar: 'Complete os requisitos listados no contexto: defina módulo, prioridade, status, refine a descrição e gere as regras de negócio. NÃO crie requisitos novos e NÃO repita códigos diferentes dos informados.',
    estrategias: 'Gere UMA estratégia de teste POR requisito listado no contexto, analisando as regras de negócio de cada um para definir abordagem, riscos e critérios.',
    cenarios: 'Gere SOMENTE cenários de teste, referenciando os REQUISITOS EXISTENTES listados abaixo pelo índice.',
    casos: 'Gere SOMENTE casos de teste e massa de teste, referenciando os CENÁRIOS e REQUISITOS EXISTENTES listados abaixo pelo índice.',
    completo: 'Gere TUDO: requisitos, regras de negócio, estratégias, cenários, casos de teste e massa de teste (referenciando pelo índice dentro do próprio JSON gerado).'
  }[scope];

  const usesContext = scope === 'estrategias' || scope === 'cenarios' || scope === 'casos' || scope === 'completar';
  const selectedReqs = usesContext ? selectReqs(existing, selectedReqIds) : [];

  let existingBlock = '';
  if (usesContext) {
    const lines = selectedReqs.map(formatRequirement).join('\n\n');
    existingBlock = `
=== REQUISITOS EXISTENTES (referencie pelo ÍNDICE da lista, ex.: 0 para o primeiro) ===
${lines || '(nenhum requisito selecionado)'}`;

    if (scope === 'casos') {
      const selIds = new Set(selectedReqs.map((r) => Number(r.id)));
      const scns = (existing.scnList || []).filter((s) => selIds.has(Number(s.requirement_id)));
      existingBlock += `
Cenários existentes (referencie pelo índice na ordem abaixo):
${scns.map((s, i) => `${i}: ${s.title}`).join('\n') || '(nenhum cenário para os requisitos selecionados)'}`;
    }
  }

  return `Você é um Analista de Qualidade (QA) sênior, especialista em engenharia de testes de software.
Vou descrever uma funcionalidade. Gere a documentação de testes completa, em português do Brasil, com dados realistas e profissionais.

=== CONTEXTO DO PROJETO ===
- Projeto: ${project?.name || ''}
- Sistema: ${project?.system || ''}
- Funcionalidade (título): ${title || '(não informado)'}
- Descrição (texto livre):
${description || '(não informado)'}

=== CÓDIGOS JÁ EXISTENTES (NÃO duplique; continue a sequência) ===
- Requisitos: ${existing.reqCodes || '(nenhum)'}
- Cenários: ${existing.scCodes || '(nenhum)'}
- Casos de teste: ${existing.tcCodes || '(nenhum)'}${existingBlock}

=== ESCOPO SOLICITADO ===
${scopeInstructions}

=== MODELO DE CONTEÚDO ===
${contentModel(scope)}

=== FORMATO DE SAÍDA ===
Responda APENAS com JSON válido, sem texto fora dele e sem \`\`\`json. Use exatamente este schema:
${schemaScope(scope)}

=== REGRAS ===
1. ${scope === 'completar' ? 'Complete TODOS os requisitos listados, com regras consistentes com a descrição.' : 'Gere de 1 a 5 requisitos; 1 a 3 cenários por requisito; 1 a 4 casos por cenário (conforme a complexidade).'}
2. Inclua casos de borda, fluxos de exceção e regras de segurança quando fizer sentido.
3. Use somente os valores exatos dos enums (Alta/Média/Baixa, Manual/Automatizado, etc.).
4. Requisitos sempre com 2 a 6 regras de negócio no formato "Se... então..." (ou restrição).
5. Passos com 3 a 10 itens numerados: action = o que o QA executa, expected = resultado verificável.
6. Dados fictícios plausíveis; nada de informações sensíveis reais.`;
}

const REQ_STATUS = ['Ativo', 'Em Análise', 'Homologado', 'Cancelado'];

async function deleteAll(path, taskId) {
  if (!taskId) return;
  const rows = await api.get(`${path}?taskId=${taskId}`);
  for (const row of rows || []) {
    await api.del(`${path}/${row.id}`);
  }
}

/** Remove artefatos da tarefa conforme o escopo, antes de reaplicar a geração. */
export async function clearTaskScope(taskId, scope) {
  if (!taskId) return;
  if (scope === 'casos') {
    await deleteAll('/test-cases', taskId);
    return;
  }
  if (scope === 'cenarios') {
    await deleteAll('/scenarios', taskId);
    return;
  }
  if (scope === 'estrategias') {
    await deleteAll('/strategies', taskId);
    return;
  }
  if (scope === 'requisitos') {
    await deleteAll('/requirements', taskId);
    return;
  }
  if (scope === 'completo') {
    await deleteAll('/test-cases', taskId);
    await deleteAll('/scenarios', taskId);
    await deleteAll('/strategies', taskId);
    await deleteAll('/requirements', taskId);
  }
}

export async function applyResult(result, { projectId, taskId, scope, existing = {}, selectedReqIds = [], mode = 'replace' }) {
  const summary = { requirements: 0, rules: 0, strategies: 0, scenarios: 0, cases: 0, mass: 0, steps: 0 };
  const selectedReqs = selectReqs(existing, selectedReqIds);
  const reqIdByIndex = [];
  const scIdByIndex = [];
  const tcIdByIndex = [];
  const strategyByReq = {};

  const strategyFor = (rid) => {
    if (strategyByReq[rid]) return strategyByReq[rid];
    return (existing.stratList || []).find((s) => Number(s.requirement_id) === Number(rid))?.id || null;
  };

  if (scope === 'completar') {
    const target = (item, i) =>
      selectedReqs.find((r) => r.code && item.code && String(r.code).toLowerCase() === String(item.code).toLowerCase()) ||
      selectedReqs[i];
    for (let i = 0; i < (result.requirements || []).length; i++) {
      const item = result.requirements[i];
      const t = target(item, i);
      if (!t?.id) continue;
      await api.put(`/requirements/${t.id}`, {
        module: item.module !== undefined ? item.module : t.module,
        priority: sanitize(item.priority, ['Alta', 'Média', 'Baixa'], t.priority),
        status: sanitize(item.status, REQ_STATUS, t.status),
        description: item.description !== undefined ? item.description : t.description,
        source: 'ia'
      });
      const detail = await api.get(`/requirements/${t.id}`);
      for (const br of detail.business_rules || []) {
        await api.del(`/requirements/business-rules/${br.id}`);
      }
      for (const br of item.business_rules || []) {
        if (!br?.rule) continue;
        await api.post(`/requirements/${t.id}/business-rules`, { rule: br.rule, category: br.category || 'Regra de Negócio', source: 'ia' });
        summary.rules++;
      }
      summary.requirements++;
    }
    return summary;
  }

  if (mode === 'replace' && scope !== 'completar') {
    await clearTaskScope(taskId, scope);
  }

  for (const r of result.requirements || []) {
    if (!r?.title) continue;
    const created = await api.post('/requirements', {
      project_id: projectId,
      task_id: taskId,
      code: r.code || '',
      title: r.title,
      description: r.description || '',
      priority: sanitize(r.priority, ['Alta', 'Média', 'Baixa'], 'Média'),
      status: 'Ativo',
      module: r.module || '',
      source: 'ia'
    });
    reqIdByIndex.push(created.id);
    summary.requirements++;
    for (const rule of r.business_rules || []) {
      if (!rule?.rule) continue;
      await api.post(`/requirements/${created.id}/business-rules`, { rule: rule.rule, category: rule.category || 'Regra de Negócio', source: 'ia' });
      summary.rules++;
    }
  }

  if (scope === 'estrategias' || scope === 'completo') {
    for (const st of result.strategies || []) {
      let rid = null;
      let reqObj = null;
      if (scope === 'estrategias') { reqObj = selectedReqs[Number(st.requirement_id)]; rid = reqObj?.id || null; }
      else { rid = reqIdByIndex[Number(st.requirement_id)] || null; }
      if (!rid) continue;
      const created = await api.post('/strategies', {
        project_id: projectId,
        task_id: taskId,
        requirement_id: rid,
        name: st.name || (reqObj ? `Estratégia de teste - ${reqObj.code}` : 'Estratégia de teste'),
        description: st.description || '',
        approach: st.approach || '',
        risk_scope: st.risk_scope || '',
        entry_criteria: st.entry_criteria || '',
        exit_criteria: st.exit_criteria || '',
        status: sanitize(st.status, ['Ativo', 'Arquivo'], 'Ativo'),
        source: 'ia'
      });
      strategyByReq[rid] = created.id;
      summary.strategies++;
    }
  }

  if (scope === 'cenarios' || scope === 'completo') {
    for (const sc of result.scenarios || []) {
      if (!sc?.title) continue;
      let rid = null;
      if (scope === 'cenarios') rid = selectedReqs[Number(sc.requirement_id)]?.id || null;
      else rid = reqIdByIndex[Number(sc.requirement_id)] || null;
      const created = await api.post('/scenarios', {
        project_id: projectId,
        task_id: taskId,
        requirement_id: rid,
        title: sc.title,
        description: sc.description || '',
        preconditions: sc.preconditions || '',
        source: 'ia'
      });
      scIdByIndex.push(created.id);
      summary.scenarios++;
    }
  }

  if (scope === 'casos' || scope === 'completo') {
    let scnList = existing.scnList || [];
    if (scope === 'casos') {
      const selIds = new Set(selectedReqs.map((r) => Number(r.id)));
      scnList = scnList.filter((s) => selIds.has(Number(s.requirement_id)));
    }
    for (const tc of result.test_cases || []) {
      if (!tc?.title) continue;
      let scId = null;
      let rid = null;
      if (scope === 'casos') {
        scId = scnList[Number(tc.scenario_id)]?.id || null;
        rid = selectedReqs[Number(tc.requirement_id)]?.id || null;
      } else {
        scId = scIdByIndex[Number(tc.scenario_id)] || null;
        rid = reqIdByIndex[Number(tc.requirement_id)] || null;
      }
      const steps = (tc.steps || [])
        .filter((s) => s?.action)
        .map((s, i) => ({ order: Number(s.order) || i + 1, action: s.action, expected: s.expected || '' }));
      const created = await api.post('/test-cases', {
        project_id: projectId,
        task_id: taskId,
        scenario_id: scId,
        requirement_id: rid,
        strategy_id: strategyFor(rid),
        code: tc.code || '',
        title: tc.title,
        priority: sanitize(tc.priority, ['Alta', 'Média', 'Baixa'], 'Média'),
        type: sanitize(tc.type, ['Funcional', 'API', 'Fumaça', 'Regressão'], 'Funcional'),
        execution_mode: sanitize(tc.execution_mode, ['Manual', 'Automatizado'], 'Manual'),
        status: 'Pronto',
        preconditions: tc.preconditions || '',
        steps,
        regression_relevant: tc.regression_relevant ? 1 : 0,
        automated: 0,
        source: 'ia'
      });
      tcIdByIndex.push(created.id);
      summary.cases++;
      summary.steps += steps.length;
    }

    for (const m of result.test_mass || []) {
      const tcId = tcIdByIndex[Number(m.test_case_id)];
      if (!tcId || !m?.name) continue;
      await api.post(`/test-cases/${tcId}/test-mass`, { name: m.name, data: m.data || '', purpose: m.purpose || '', source: 'ia' });
      summary.mass++;
    }
  }

  return summary;
}
