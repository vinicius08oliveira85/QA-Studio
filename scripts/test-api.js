// Smoke test de integração da API do QA Studio.
// Uso: node scripts/test-api.js   (requer o servidor rodando em http://localhost:3001)
// Idempotente: cria um projeto e o apaga ao final (cascade limpa todos os dados).

const BASE = process.env.QA_API_BASE || 'http://localhost:3001/api';

const headers = { 'Content-Type': 'application/json' };
if (process.env.APP_TOKEN) headers['x-app-token'] = process.env.APP_TOKEN;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers,
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

function assert(cond, label) {
  if (!cond) throw new Error(`ASSERT falhou: ${label}`);
  console.log('  ok:', label);
}

(async () => {
  console.log('1. Projeto + tarefa');
  const prj = await post('/projects', { name: 'Projeto Demo QA', system: 'Portal Web' });
  const pid = prj.id;
  assert(pid, 'projeto criado');
  const task = await post('/tasks', { project_id: pid, title: 'Ciclo de testes Release 1.0' });
  const tid = task.id;
  assert(tid, 'tarefa criada');

  console.log('2. Requisitos + regras');
  const req1 = await post('/requirements', { project_id: pid, task_id: tid, title: 'Login com credenciais válidas', priority: 'Alta' });
  const req2 = await post('/requirements', { project_id: pid, task_id: tid, title: 'Recuperação de senha', priority: 'Média' });
  assert(req1.id && req2.id, 'requisitos criados');
  await post(`/requirements/${req1.id}/business-rules`, { rule: 'Usuário com 5 tentativas erradas fica bloqueado por 30 minutos' });
  await post(`/requirements/${req1.id}/business-rules`, { rule: 'Senha deve ter no mínimo 8 caracteres' });

  console.log('3. Estratégia');
  const strat = await post('/strategies', { project_id: pid, task_id: tid, name: 'Estratégia Homologação v1', approach: 'Caixa preta com base em risco' });
  assert(strat.id, 'estratégia criada');

  console.log('4. Cenário');
  const scen = await post('/scenarios', { project_id: pid, task_id: tid, requirement_id: req1.id, title: 'Cenário de Login' });
  assert(scen.id, 'cenário criado');

  console.log('5. Casos de teste');
  const tc1 = await post('/test-cases', { project_id: pid, task_id: tid, scenario_id: scen.id, requirement_id: req1.id, strategy_id: strat.id, title: 'Login com sucesso', type: 'Funcional', priority: 'Alta', regression_relevant: 1, steps: [
    { order: 1, action: 'Acessar o portal', expected: 'Página de login abre' },
    { order: 2, action: 'Informar usuário/senha válidos e clicar em Entrar', expected: 'Login realizado, dashboard exibido' }
  ] });
  const tc2 = await post('/test-cases', { project_id: pid, task_id: tid, requirement_id: req2.id, title: 'Validação de e-mail em /api/forgot', type: 'API', execution_mode: 'Manual', steps: [
    { order: 1, action: 'POST /api/forgot com e-mail válido', expected: '200 OK, mensagem de sucesso' }
  ] });
  const tc3 = await post('/test-cases', { project_id: pid, task_id: tid, title: 'Smoke: home carrega', type: 'Fumaça', regression_relevant: 1, steps: [
    { order: 1, action: 'Abrir home', expected: 'Página carrega sem erro' }
  ] });
  const tc4 = await post('/test-cases', { project_id: pid, task_id: tid, title: 'Login com senha incorreta', type: 'Funcional', execution_mode: 'Automatizado', steps: [
    { order: 1, action: 'Login com senha errada', expected: 'Mensagem de erro exibida' }
  ] });
  assert(tc1.code && tc2.code && tc3.code && tc4.code, 'casos criados');

  console.log('6. Massa');
  await post(`/test-cases/${tc1.id}/test-mass`, { name: 'Usuários válidos', data: 'usuario: maria, senha: 12345678\ne-mail: maria@empresa.com', purpose: 'Login padrão' });
  await post(`/test-cases/${tc1.id}/test-mass`, { name: 'Usuários bloqueados', data: 'usuario: bloqueado01', purpose: 'Regra de bloqueio' });

  console.log('7. Execuções');
  const ex1 = await post('/executions', { project_id: pid, task_id: tid, test_case_id: tc1.id, environment: 'Homologação', result: 'Passou', step_results: [{ step_order: 1, result: 'Passou', actual: 'ok' }, { step_order: 2, result: 'Passou', actual: 'dashboard aberto' }] });
  const ex2 = await post('/executions', { project_id: pid, task_id: tid, test_case_id: tc4.id, environment: 'Homologação', result: 'Falhou', actual_result: 'Mensagem de erro genérica, sem lockout', notes: 'Falha ao exibir mensagem', step_results: [{ step_order: 1, result: 'Falhou', actual: 'Erro 500' }] });
  assert(ex1.id && ex2.id, 'execuções criadas');
  const exDetail = await get('/executions/' + ex1.id);
  assert(exDetail.steps && exDetail.steps.length === 2, 'execução com 2 steps');

  console.log('8. Bug + retestes');
  const bug = await post('/bugs', { project_id: pid, task_id: tid, execution_id: ex2.id, test_case_id: tc4.id, title: 'Erro 500 ao tentar login com senha incorreta', severity: 'Alta', steps_to_reproduce: '1. Acessar portal\n2. Informar senha errada', expected_result: 'Mensagem amigável', actual_result: 'Erro 500' });
  assert(bug.id && bug.code, 'bug criado');
  await post(`/bugs/${bug.id}/retests`, { result: 'Falhou', notes: 'Reproduzido ainda' });
  const bugCheck1 = await get(`/bugs/${bug.id}`);
  assert(bugCheck1.status === 'Em Correção', 'bug movido para Em Correção após reteste falho');
  await post(`/bugs/${bug.id}/retests`, { result: 'Passou', notes: 'Corrigido e validado' });
  const bugCheck = await get(`/bugs/${bug.id}`);
  assert(bugCheck.status === 'Fechado' && bugCheck.retests.length === 2, 'bug fechado após reteste com sucesso');

  console.log('9. Regressão');
  const run = await post('/regressions', { project_id: pid, name: 'Regressão Release 1.0', environment: 'Homologação' });
  await post(`/regressions/${run.id}/populate`);
  await post(`/regressions/${run.id}/cases`, { test_case_id: tc2.id });
  const runDetail = await get(`/regressions/${run.id}`);
  assert(runDetail.cases.length >= 1, 'regressão com casos');
  const rrc = runDetail.cases.find(c => c.test_case_id === tc1.id) || runDetail.cases[0];
  await put(`/regressions/cases/${rrc.id}`, { result: 'Passou' });

  console.log('10. Automação');
  const sugg = await get('/automations/suggestions?projectId=' + pid);
  assert(Array.isArray(sugg), 'sugestões de automação');
  await post('/automations', { project_id: pid, test_case_id: tc2.id, title: 'Automatizar teste de API de recuperação', tool: 'Playwright/API', frequency: 'A cada release' });

  console.log('11. Release');
  const rel = await post('/releases', { project_id: pid, name: 'Release 1.0', version: '1.0.0', status: 'Em Homologação' });
  await post(`/releases/${rel.id}/requirements`, { requirement_id: req1.id });
  await post(`/releases/${rel.id}/requirements`, { requirement_id: req2.id });
  const relDetail = await get(`/releases/${rel.id}`);
  assert(relDetail.requirements.length === 2, 'release com 2 requisitos');

  console.log('12. Dashboard');
  const dash = await get('/dashboard?projectId=' + pid);
  assert(dash.totalCases === 4, `dashboard totalCases=4 (got ${dash.totalCases})`);

  console.log('13. Detalhe do requisito');
  const reqDetail = await get('/requirements/' + req1.id);
  assert(reqDetail.business_rules.length === 2 && reqDetail.test_cases.length >= 1, 'requisito com regras e casos');

  console.log('14. Erros consistentes');
  let got404 = false;
  try { await get('/requirements/99999999'); } catch (e) { got404 = /404/.test(e.message); }
  assert(got404, 'GET inexistente retorna 404');

  console.log('15. Limpeza (apaga projeto e tudo que depende dele)');
  await del('/projects/' + pid);
  try {
    await get('/projects/' + pid);
    throw new Error('projeto ainda existe');
  } catch (e) {
    assert(/404/.test(e.message), 'projeto removido');
  }

  console.log('\nTODOS OS TESTES DE INTEGRAÇÃO PASSARAM');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
