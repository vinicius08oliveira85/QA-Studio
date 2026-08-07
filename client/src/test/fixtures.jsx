import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Fixtures e helpers compartilhados dos testes de página (Vitest + RTL).
 * Centraliza os dados de dashboard/relatório/execução e o setup de render
 * para os specs não duplicarem setup.
 */

/** Data N dias atrás no formato YYYY-MM-DD — filtros de período (hoje/Nd) ficam determinísticos. */
export function dayOffset(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Renderiza um componente dentro do MemoryRouter (mesmas flags usadas no app). */
export function renderWithRouter(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  );
}

/**
 * Cria a implementação do api.get mockado a partir de rotas.
 * Cada rota: [string | RegExp, valor | fn(path)]. A primeira que casa vence;
 * sem rota, resolve []. Ex.:
 *   api.get.mockImplementation(apiRouter([
 *     ['/executions?taskId=3', fixtureExecs],
 *     [/^\/executions\//, (p) => fixtureExecutionDetail(Number(p.split('/')[2]))]
 *   ]));
 */
export function apiRouter(routes) {
  return (path) => {
    for (const [pattern, value] of routes) {
      const hit = typeof pattern === 'string' ? path === pattern : pattern.test(path);
      if (hit) return Promise.resolve(typeof value === 'function' ? value(path) : value);
    }
    return Promise.resolve([]);
  };
}

/* ------------------------------------------------------------------ */
/* Dados base                                                          */
/* ------------------------------------------------------------------ */

export const fixtureProject = { id: 1, name: 'Leve' };
export const fixtureCurrentTask = {
  id: 3,
  code: 'GMPTL-141',
  title: 'Prontuário via IA',
  status: 'Em Andamento',
  priority: 'Alta',
  assignee: 'Vinícius'
};

export const fixtureCases = [
  { id: 27, code: 'TC-001', title: 'Acesso ao prontuário', requirement_id: 1, requirement_code: 'REQ-1', requirement_title: 'Acesso', execution_mode: 'Automatizado', status: 'Pronto', type: 'Funcional' },
  { id: 28, code: 'TC-002', title: 'Estruturar com IA', requirement_id: 1, requirement_code: 'REQ-1', requirement_title: 'Acesso', execution_mode: 'Manual', status: 'Executado', type: 'Funcional' }
];

export const fixtureExecs = [
  { id: 340, test_case_id: 27, test_case_code: 'TC-001', test_case_title: 'Acesso ao prontuário', environment: 'Homologação', result: 'Passou', execution_date: `${dayOffset(0)} 14:00:00`, actual_result: 'APROVADO. tudo certo', attachment_path: '', bugs_count: 0, tester: 'QA' },
  { id: 337, test_case_id: 27, test_case_code: 'TC-001', test_case_title: 'Acesso ao prontuário', environment: 'Homologação', result: 'Falhou', execution_date: `${dayOffset(1)} 13:00:00`, actual_result: 'REPROVADO. quebrou', attachment_path: '', bugs_count: 1, tester: 'QA' },
  { id: 336, test_case_id: 28, test_case_code: 'TC-002', test_case_title: 'Estruturar com IA', environment: 'Produção', result: 'Passou', execution_date: `${dayOffset(1)} 12:00:00`, actual_result: '', attachment_path: 'attachments/x.png', bugs_count: 0, tester: 'QA' }
];

/** Detalhe de execução (GET /executions/:id) com passos. */
export function fixtureExecutionDetail(id) {
  const base = fixtureExecs.find((e) => e.id === id) || {
    id,
    test_case_id: 27,
    test_case_code: 'TC-001',
    test_case_title: '',
    environment: 'Homologação',
    result: 'Passou',
    actual_result: '',
    attachment_path: '',
    tester: 'QA'
  };
  return {
    ...base,
    steps: [{ id: 1, step_order: 1, action: 'Abrir prontuário', expected: 'Aberto', actual: 'ok', result: 'Passou' }]
  };
}

/** Detalhe de caso (GET /test-cases/:id) com passos. */
export function fixtureCaseDetail(id) {
  const c = fixtureCases.find((x) => x.id === id);
  return { ...c, steps: [{ order: 1, action: 'Abrir prontuário', expected: 'Aberto' }] };
}

/** Muitas execuções do mesmo caso (para exercitar a paginação). */
export function manyExecs(count = 30) {
  return Array.from({ length: count }, (_, i) => ({
    id: 400 + i,
    test_case_id: 27,
    test_case_code: 'TC-001',
    test_case_title: 'Acesso ao prontuário',
    environment: 'Homologação',
    result: i % 2 ? 'Passou' : 'Falhou',
    execution_date: `${dayOffset(i % 14)} 12:00:00`,
    actual_result: '',
    attachment_path: '',
    bugs_count: 0,
    tester: 'QA'
  }));
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export const fixtureDashboard = {
  totalRequirements: 12,
  coveredRequirements: 10,
  totalCases: 69,
  passRate: 45,
  openBugs: 0,
  regressionCases: 38,
  automatedCases: 3,
  lowCoverage: [{ code: 'REQ-2', title: 'Requisito sem casos', priority: 'Alta' }],
  recentExecutions: [
    { id: 340, execution_date: `${dayOffset(0)} 16:01:00`, test_case_code: 'TC-008', test_case_title: 'Estruturar anamnese', result: 'Passou' },
    { id: 321, execution_date: `${dayOffset(0)} 15:00:00`, test_case_code: 'TC-008', test_case_title: 'Estruturar anamnese', result: 'Falhou' }
  ],
  bugsBySeverity: [{ severity: 'Alta', c: 2 }],
  bugsByStatus: [{ status: 'Aberto', c: 1 }],
  casesByType: [{ type: 'Funcional', c: 61 }, { type: 'API', c: 8 }],
  casesByMode: [{ execution_mode: 'Manual', c: 66 }, { execution_mode: 'Automatizado', c: 3 }],
  recentBugs: [{ id: 5, code: 'BUG-1', title: 'Bug tal', status: 'Aberto' }],
  releases: [],
  regressionRuns: []
};

/** Dashboard em escopo de projeto: adiciona Tarefas, Releases e Regressões. */
export const fixtureDashboardProject = {
  ...fixtureDashboard,
  totalTasks: 4,
  openAutomations: 2,
  releases: [{ id: 9, name: 'Release 1.0', status: 'Homologado' }],
  regressionRuns: [{ id: 2, name: 'Regressão final', status: 'Em Andamento' }]
};

/* ------------------------------------------------------------------ */
/* Relatório                                                           */
/* ------------------------------------------------------------------ */

export const fixtureReport = {
  task: { code: 'GMPTL-141', title: 'Prontuário via IA', status: 'Em Andamento', priority: 'Alta', assignee: 'Vinícius' },
  generated_at: `${dayOffset(0)} 16:00:00`,
  last_activity: `${dayOffset(0)} 15:00:00`,
  summary: {
    totalCases: 10,
    executedCases: 8,
    notExecutedCases: 2,
    passed: 6,
    failed: 2,
    blocked: 0,
    passRate: 75,
    requirements_covered: 4,
    requirements_total: 5,
    requirement_coverage: 80,
    open_bugs: 1,
    bugs_by_severity: [{ severity: 'Alta', c: 1 }]
  },
  verdict: { key: 'apto', label: 'APTO PARA LIBERAÇÃO', summary: '8 de 10 casos executados', tone: 'green' },
  attention_cases: [
    { code: 'TC-009', title: 'Bloqueio de justificativa', requirement_code: 'REQ-4', result: 'Falhou', environment: 'Homologação', actual_result: 'não bloqueou' }
  ],
  open_bugs_list: [
    { id: 5, code: 'BUG-1', title: 'Bug tal', severity: 'Alta', priority: 'Alta', test_case_code: 'TC-009', status: 'Aberto', attachment_path: '' }
  ],
  requirements: [
    { id: 1, code: 'REQ-1', title: 'Acesso ao prontuário', total_cases: 5, executed_cases: 4, passed: 3, failed: 1, blocked: 0 }
  ],
  cases: [
    { id: 27, code: 'TC-001', title: 'Acesso', requirement_code: 'REQ-1', type: 'Funcional', execution_mode: 'Manual', priority: 'Alta', bugs_count: 0, last_execution: { id: 340, result: 'Passou', execution_date: `${dayOffset(0)} 14:00:00` } }
  ],
  executions: [
    { id: 340, execution_date: `${dayOffset(0)} 14:00:00`, test_case_code: 'TC-001', test_case_title: 'Acesso', environment: 'Homologação', tester: 'QA', result: 'Passou', attachment_path: '' }
  ]
};
