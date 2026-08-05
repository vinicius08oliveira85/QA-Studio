const BASE = 'http://localhost:3001/api';
let token = {};

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : {};
}
const get = (p) => call('GET', p);
const post = (p, b) => call('POST', p, b);
const put = (p, b) => call('PUT', p, b);
const del = (p) => call('DELETE', p);

(async () => {
  // 1. Projeto
  const prj = await post('/projects', { name: 'Projeto Demo QA', system: 'Portal Web' });
  const pid = prj.id;
  console.log('Projeto criado:', pid);

  // 2. Requisitos + regras
  const req1 = await post('/requirements', { project_id: pid, title: 'Login com credenciais válidas', priority: 'Alta' });
  const req2 = await post('/requirements', { project_id: pid, title: 'Recuperação de senha', priority: 'Média' });
  await post(`/requirements/${req1.id}/business-rules`, { rule: 'Usuário com 5 tentativas erradas fica bloqueado por 30 minutos' });
  await post(`/requirements/${req1.id}/business-rules`, { rule: 'Senha deve ter no mínimo 8 caracteres' });
  console.log('Requisitos:', req1, req2);

  // 3. Estratégia
  const strat = await post('/strategies', { project_id: pid, name: 'Estratégia Homologação v1', approach: 'Caixa preta com base em risco' });

  // 4. Cenários
  const scen = await post('/scenarios', { project_id: pid, requirement_id: req1.id, title: 'Cenário de Login' });

  // 5. Casos de teste (funcional, api, fumaça, regressão)
  const tc1 = await post('/test-cases', { project_id: pid, scenario_id: scen.id, requirement_id: req1.id, strategy_id: strat.id, title: 'Login com sucesso', type: 'Funcional', priority: 'Alta', regression_relevant: 1, steps: [
    { order: 1, action: 'Acessar o portal', expected: 'Página de login abre' },
    { order: 2, action: 'Informar usuário/senha válidos e clicar em Entrar', expected: 'Login realizado, dashboard exibido' }
  ] });
  const tc2 = await post('/test-cases', { project_id: pid, requirement_id: req2.id, title: 'Validação de e-mail em /api/forgot', type: 'API', execution_mode: 'Manual', steps: [
    { order: 1, action: 'POST /api/forgot com e-mail válido', expected: '200 OK, mensagem de sucesso' }
  ] });
  const tc3 = await post('/test-cases', { project_id: pid, title: 'Smoke: home carrega', type: 'Fumaça', regression_relevant: 1, steps: [
    { order: 1, action: 'Abrir home', expected: 'Página carrega sem erro' }
  ] });
  const tc4 = await post('/test-cases', { project_id: pid, title: 'Login com senha incorreta', type: 'Funcional', execution_mode: 'Automatizado', steps: [
    { order: 1, action: 'Login com senha errada', expected: 'Mensagem de erro exibida' }
  ] });
  console.log('Casos criados:', tc1.code, tc2.code, tc3.code, tc4.code);

  // Massa de teste
  await post(`/test-cases/${tc1.id}/test-mass`, { name: 'Usuários válidos', data: 'usuario: maria, senha: 12345678\ne-mail: maria@empresa.com', purpose: 'Login padrão' });
  await post(`/test-cases/${tc1.id}/test-mass`, { name: 'Usuários bloqueados', data: 'usuario: bloqueado01', purpose: 'Regra de bloqueio' });
  console.log('Massa adicionada');

  // 6. Execuções
  const ex1 = await post('/executions', { project_id: pid, test_case_id: tc1.id, environment: 'Homologação', result: 'Passou', step_results: [{ step_order: 1, result: 'Passou', actual: 'ok' }, { step_order: 2, result: 'Passou', actual: 'dashboard aberto' }] });
  const ex2 = await post('/executions', { project_id: pid, test_case_id: tc4.id, environment: 'Homologação', result: 'Falhou', actual_result: 'Mensagem de erro genérica, sem lockout', notes: 'Falha ao exibir mensagem', step_results: [{ step_order: 1, result: 'Falhou', actual: 'Erro 500' }] });
  console.log('Execuções:', ex1.id, ex2.id);

  // 7. Bug vindo da execução falha
  const bug = await post('/bugs', { project_id: pid, execution_id: ex2.id, test_case_id: tc4.id, title: 'Erro 500 ao tentar login com senha incorreta', severity: 'Alta', steps_to_reproduce: '1. Acessar portal\n2. Informar senha errada', expected_result: 'Mensagem amigável', actual_result: 'Erro 500' });
  console.log('Bug criado:', bug);

  // 8. Reteste do bug (falha -> Em Correção; passa -> Fechado)
  await post(`/bugs/${bug.id}/retests`, { result: 'Falhou', notes: 'Reproduzido ainda' });
  await post(`/bugs/${bug.id}/retests`, { result: 'Passou', notes: 'Corrigido e validado' });
  const bugCheck = await get(`/bugs/${bug.id}`);
  console.log('Status bug após retestes:', bugCheck.status, 'retests:', bugCheck.retests.length);

  // 9. Regressão
  const run = await post('/regressions', { project_id: pid, name: 'Regressão Release 1.0', environment: 'Homologação' });
  await post(`/regressions/${run.id}/populate`);
  await post(`/regressions/${run.id}/cases`, { test_case_id: tc2.id });
  const runDetail = await get(`/regressions/${run.id}`);
  console.log('Regressão casos:', runDetail.cases.length, 'disponíveis para adicionar:', runDetail.available_cases.length);
  const rrcId = runDetail.cases.find(c => c.test_case_id === tc1.id).id;
  await put(`/regressions/cases/${rrcId}`, { result: 'Passou' });

  // 10. Automação
  const sugg = await get('/automations/suggestions?projectId=' + pid);
  console.log('Sugestões automação:', sugg.length);
  const auto = await post('/automations', { project_id: pid, test_case_id: tc2.id, title: 'Automatizar teste de API de recuperação', tool: 'Playwright/API', frequency: 'A cada release' });

  // 11. Release/Homologação
  const rel = await post('/releases', { project_id: pid, name: 'Release 1.0', version: '1.0.0', status: 'Em Homologação' });
  await post(`/releases/${rel.id}/requirements`, { requirement_id: req1.id });
  await post(`/releases/${rel.id}/requirements`, { requirement_id: req2.id });
  const relDetail = await get(`/releases/${rel.id}`);
  console.log('Release:', relDetail.name, 'requisitos:', relDetail.requirements.length, 'stats:', relDetail.stats);

  // 12. Dashboard
  const dash = await get('/dashboard?projectId=' + pid);
  console.log('Dashboard:', JSON.stringify({ totalCases: dash.totalCases, passRate: dash.passRate, openBugs: dash.openBugs, coveredRequirements: dash.coveredRequirements, lowCoverage: dash.lowCoverage.length }));

  // 13. Integração requisito -> casos (exibir requisito com regras e casos)
  const reqDetail = await get('/requirements/' + req1.id);
  console.log('Req1 rules:', reqDetail.business_rules.length, 'cases:', reqDetail.test_cases.length);

  console.log('\nTODOS OS TESTES DE INTEGRAÇÃO PASSARAM ✔');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
