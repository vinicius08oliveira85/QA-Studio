// Camada complementar de cenários NEGATIVOS / EXCEÇÃO para a GMPTL-141.
// O seed (scripts/seed-gmptl-141.js) cobre o fluxo feliz e parte dos negativos;
// este script adiciona profundidade em falhas, limites e validações.
// Uso: node scripts/gmptl-141-negativos.js  (com a API rodando em http://localhost:3001)
const BASE = process.env.QA_API_BASE || 'http://localhost:3001/api';
const PROJECT_ID = Number(process.env.SEED_PROJECT_ID || 1);
const TASK_ID = Number(process.env.SEED_TASK_ID || 3);

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const step = (action, expected) => ({ action, expected });
const results = { scenarios: 0, cases: 0, steps: 0, mass: 0 };

async function main() {
  const reqs = await get(`/requirements?taskId=${TASK_ID}`);
  if (reqs.length === 0) {
    console.error('[erro] Nenhum requisito na tarefa. Rode o seed antes deste script.');
    process.exit(1);
  }
  const reqCode = Object.fromEntries(reqs.map((r) => [r.code, r.id]));

  const strats = await get(`/strategies?taskId=${TASK_ID}`);
  const findStrat = (needle) =>
    strats.find((s) => s.name.toLowerCase().includes(needle))?.id;
  const STRAT = {
    fluxo: findStrat('fluxo de atendimento'),
    ia: findStrat('estruturação'),
    protocolos: findStrat('regras de negócio'),
    validacoes: findStrat('validações de interface'),
    integracao: findStrat('integração e finalização')
  };

  // ---------------------------------------------------------------
  // CENÁRIOS NEGATIVOS / EXCEÇÃO
  // ---------------------------------------------------------------
  const SCEN = [
    {
      key: 'NEG-01', req: 'REQ-001',
      title: 'Falhas de acesso e sessão (SSO)',
      description: 'Verificação do comportamento do sistema quando a sessão é inexistente, expirada ou a agenda não possui agendamentos.',
      preconditions: 'Ambiente de homologação acessível; usuário sem sessão ou com sessão expirada; médico sem agendamentos disponíveis.'
    },
    {
      key: 'NEG-02', req: 'REQ-002',
      title: 'Identidade do paciente com dados incompletos ou homônimos',
      description: 'Verificação da exibição do cabeçalho quando o cadastro do paciente não possui idade/sexo e da distinção correta entre pacientes com nomes iguais.',
      preconditions: 'Pacientes com dados incompletos e pacientes homônimos na listagem.'
    },
    {
      key: 'NEG-03', req: 'REQ-003',
      title: 'Falhas da estruturação por IA',
      description: 'Verificação do comportamento quando o texto está vazio, o serviço de IA está indisponível, o texto não possui dados clínicos ou é muito longo.',
      preconditions: 'Prontuário aberto com o campo de anamnese em texto livre.'
    },
    {
      key: 'NEG-04', req: 'REQ-006',
      title: 'Validações de campos obrigatórios das abas',
      description: 'Verificação do bloqueio de finalização sem hipótese principal e da validação de valores inválidos nos sinais vitais.',
      preconditions: 'Prontuário aberto; abas Objetivo e Avaliação acessíveis.'
    },
    {
      key: 'NEG-05', req: 'REQ-007',
      title: 'Exceções do motor de protocolos (sexo ausente, idade avançada, gatilho parcial)',
      description: 'Verificação da sugestão de plano para sexo não informado, idade muito avançada e da não-ativação por palavras parciais.',
      preconditions: 'Pacientes com sexo não informado, idade avançada (90+) e textos com palavras parciais.'
    },
    {
      key: 'NEG-06', req: 'REQ-009',
      title: 'Casos limite da justificativa (espaços e símbolos)',
      description: 'Verificação da validação de mínimo de 12 caracteres quando o texto contém apenas espaços ou caracteres especiais.',
      preconditions: 'Exame de check-up selecionado no plano; campo de justificativa visível.'
    },
    {
      key: 'NEG-07', req: 'REQ-010',
      title: 'Recarga da página e concorrência no mesmo prontuário',
      description: 'Verificação do comportamento ao recarregar a página com dados não salvos e ao editar o mesmo atendimento em duas abas.',
      preconditions: 'Prontuário com dados preenchidos ainda não salvos; navegador com suporte a múltiplas abas.'
    },
    {
      key: 'NEG-08', req: 'REQ-011',
      title: 'Exceções da finalização do atendimento',
      description: 'Verificação do cancelamento da finalização, da tentativa de finalizar sem plano aplicado e sem campos obrigatórios.',
      preconditions: 'Atendimento em andamento com ou sem plano clínico aplicado.'
    }
  ];

  const scenIds = {};
  for (const c of SCEN) {
    const created = await post('/scenarios', {
      project_id: PROJECT_ID, task_id: TASK_ID,
      requirement_id: reqCode[c.req],
      title: c.title, description: c.description, preconditions: c.preconditions,
      source: 'manual'
    });
    scenIds[c.key] = created.id;
    results.scenarios++;
  }

  // ---------------------------------------------------------------
  // CASOS DE TESTE
  // ---------------------------------------------------------------
  const CASES = [
    // ---- NEG-01 Falhas de acesso e sessão ----
    {
      scen: 'NEG-01', req: 'REQ-001', strat: 'fluxo',
      title: 'Acessar o CPM sem sessão válida redireciona para o SSO',
      priority: 'Alta', type: 'Fumaça', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Sessão SSO inexistente ou expirada.',
      steps: [
        step('Abrir o navegador (ou limpar cookies/sessão) e acessar https://cpm.hom.levesaude.com.br/', 'O sistema NÃO exibe a área logada'),
        step('Verificar o redirecionamento', 'O sistema redireciona para a tela de login SSO (Microsoft)'),
        step('Autenticar com credenciais válidas', 'O login é efetuado e o sistema retorna à área logada')
      ]
    },
    {
      scen: 'NEG-01', req: 'REQ-001', strat: 'fluxo',
      title: 'Sessão expira durante a navegação e o sistema avisa sem perder a tela',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Sessão ativa; navegação em andamento no atendimento.',
      steps: [
        step('Iniciar uma navegação no CPM com sessão ativa', 'A tela é exibida normalmente'),
        step('Deixar a sessão expirar (ou forçar a expiração) e realizar uma ação', 'O sistema detecta a sessão expirada'),
        step('Verificar a mensagem/redirecionamento', 'O sistema exibe aviso de sessão expirada e redireciona ao SSO, sem erro de tela quebrada')
      ]
    },
    {
      scen: 'NEG-01', req: 'REQ-001', strat: 'fluxo',
      title: 'Agenda do médico sem pacientes exibe estado vazio',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Médico/unidade/especialidade sem agendamentos no período.',
      steps: [
        step('Navegar até o médico sem agendamentos', 'A listagem é exibida'),
        step('Verificar o estado da listagem vazia', 'O sistema exibe mensagem amigável de ausência de agendamentos (sem erro)'),
        step('Verificar que não há botão \"Iniciar\" disponível', 'Nenhum botão \"Iniciar\" é exibido')
      ]
    },

    // ---- NEG-02 Identidade incompleta / homônimos ----
    {
      scen: 'NEG-02', req: 'REQ-002', strat: 'fluxo',
      title: 'Paciente sem idade/sexo no cadastro é exibido sem erro',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Paciente com cadastro sem idade e/ou sexo na listagem.',
      steps: [
        step('Abrir o prontuário do paciente com dados incompletos', 'O prontuário abre normalmente'),
        step('Verificar o cabeçalho do paciente', 'Os campos ausentes (idade/sexo) são tratados sem erro de tela'),
        step('Continuar o atendimento normalmente', 'O fluxo segue sem quebras pela ausência dos dados')
      ]
    },
    {
      scen: 'NEG-02', req: 'REQ-002', strat: 'fluxo',
      title: 'Pacientes homônimos abrem o prontuário correto de cada um',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 1,
      preconditions: 'Dois pacientes com o mesmo nome na listagem (homônimos).',
      steps: [
        step('Identificar os dois pacientes homônimos na listagem', 'Ambos aparecem com nomes idênticos'),
        step('Clicar em \"Iniciar\" no primeiro', 'O prontuário do primeiro é aberto'),
        step('Verificar dados que diferenciam (ex.: prontuário/ID, dados de nascimento)', 'O prontuário corresponde ao primeiro paciente'),
        step('Voltar e abrir o segundo homônimo', 'O prontuário do segundo é aberto'),
        step('Verificar a distinção', 'Não há troca de prontuário entre os pacientes homônimos')
      ]
    },

    // ---- NEG-03 Falhas da estruturação por IA ----
    {
      scen: 'NEG-03', req: 'REQ-003', strat: 'ia',
      title: 'Estruturar com campo de anamnese vazio não gera processamento',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Prontuário aberto; campo de anamnese vazio.',
      steps: [
        step('Verificar o botão \"Estruturar com a IA\" com o campo vazio', 'O botão está desabilitado OU o sistema exige texto antes de processar'),
        step('Tentar disparar a estruturação sem texto', 'Nenhum processamento é iniciado'),
        step('Verificar que não há erro de tela', 'A tela permanece estável, sem mensagens de erro inesperadas')
      ]
    },
    {
      scen: 'NEG-03', req: 'REQ-003', strat: 'ia',
      title: 'Serviço de IA indisponível exibe erro amigável e preserva o texto',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Serviço de IA offline/indisponível (simular falha).',
      steps: [
        step('Digitar a anamnese em texto livre', 'O texto é aceito'),
        step('Clicar em \"Estruturar com a IA\" com o serviço indisponível', 'O sistema apresenta erro de comunicação'),
        step('Verificar a mensagem exibida', 'A mensagem é amigável e indica falha temporária do serviço'),
        step('Verificar que o texto digitado foi preservado', 'O texto original permanece no campo, sem perda')
      ]
    },
    {
      scen: 'NEG-03', req: 'REQ-003', strat: 'ia',
      title: 'Texto sem dados clínicos é tratado sem erro',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Campo de anamnese com texto sem informações clínicas estruturadas.',
      steps: [
        step('Digitar um texto sem dados clínicos (ex.: \"paciente veio, nada a relatar\")', 'O texto é aceito'),
        step('Clicar em \"Estruturar com a IA\"', 'O sistema processa sem erro de tela'),
        step('Verificar o resultado', 'O sistema informa que nenhum dado relevante foi encontrado (ou retorna estrutura vazia), sem falha')
      ]
    },
    {
      scen: 'NEG-03', req: 'REQ-003', strat: 'ia',
      title: 'Anamnese muito longa é processada sem perda ou travamento',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Campo de anamnese com texto longo (limite próximo do máximo).',
      steps: [
        step('Digitar/colar uma anamnese longa (próxima do limite do campo)', 'O texto é aceito (ou o limite é informado)'),
        step('Clicar em \"Estruturar com a IA\"', 'O processamento termina sem travamento'),
        step('Verificar o resultado', 'O resultado reflete o texto informado sem truncamento não intencional')
      ]
    },
    {
      scen: 'NEG-03', req: 'REQ-003', strat: 'ia',
      title: 'Edição manual com acentos e caracteres especiais é preservada',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Texto estruturado pela IA aguardando revisão.',
      steps: [
        step('Editar um campo estruturado inserindo acentos e símbolos (ex.: \"Dipirona 1g — uso contínuo\")', 'A edição é aceita'),
        step('Confirmar a aplicação', 'As informações são aplicadas'),
        step('Verificar o campo no prontuário', 'Acentos e caracteres especiais foram preservados')
      ]
    },

    // ---- NEG-04 Obrigatórios e valores inválidos ----
    {
      scen: 'NEG-04', req: 'REQ-006', strat: 'fluxo',
      title: 'Finalizar sem hipótese principal é bloqueado',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Aba Avaliação sem hipótese principal preenchida.',
      steps: [
        step('Preencher as demais abas deixando a hipótese principal vazia', 'Campos preenchidos'),
        step('Tentar finalizar o atendimento', 'O sistema bloqueia a finalização'),
        step('Verificar a mensagem', 'A mensagem indica a obrigatoriedade da hipótese principal')
      ]
    },
    {
      scen: 'NEG-04', req: 'REQ-006', strat: 'fluxo',
      title: 'Sinais vitais com valores inválidos são rejeitados',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Aba Objetivo aberta.',
      steps: [
        step('Preencher PA com formato inválido (ex.: \"abc\")', 'O campo rejeita o valor OU exibe validação'),
        step('Preencher temperatura fora da faixa plausível (ex.: 500)', 'O campo rejeita o valor'),
        step('Verificar as mensagens de validação', 'O sistema informa o valor inválido sem quebrar a tela')
      ]
    },

    // ---- NEG-05 Exceções do motor de protocolos ----
    {
      scen: 'NEG-05', req: 'REQ-007', strat: 'protocolos',
      title: 'Sugestão de plano para paciente sem sexo informado',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Paciente com sexo não informado e anamnese com \"check-up\".',
      steps: [
        step('Abrir o atendimento do paciente sem sexo informado', 'O prontuário abre'),
        step('Acessar a aba Plano e clicar em \"Sugerir plano Clínico\"', 'O modal abre'),
        step('Verificar o comportamento', 'O sistema segue a regra padrão para sexo não informado OU avisa o usuário, sem erro de tela')
      ]
    },
    {
      scen: 'NEG-05', req: 'REQ-007', strat: 'protocolos',
      title: 'Paciente com idade avançada (90+) recebe exames da faixa máxima',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Paciente com 90+ anos e anamnese com \"check-up\".',
      steps: [
        step('Sugerir o plano clínico para o paciente idoso', 'O modal exibe os exames'),
        step('Verificar os exames sugeridos', 'Os exames correspondem à faixa etária máxima do protocolo'),
        step('Conferir contra a tabela de referência', 'A lista não extrapola o protocolo da faixa máxima')
      ]
    },
    {
      scen: 'NEG-05', req: 'REQ-007', strat: 'protocolos',
      title: 'Palavra parcial (\"check\") NÃO aciona o motor de protocolos',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 1,
      preconditions: 'Anamnese contendo apenas a palavra parcial \"check\".',
      steps: [
        step('Digitar anamnese contendo \"check\" sem \"check-up\" completo', 'Texto aceito'),
        step('Estruturar com a IA', 'O motor de protocolos NÃO é acionado'),
        step('Abrir a aba Plano', 'Nenhum exame de check-up é sugerido')
      ]
    },

    // ---- NEG-06 Justificativa: espaços e símbolos ----
    {
      scen: 'NEG-06', req: 'REQ-009', strat: 'validacoes',
      title: 'Justificativa com apenas espaços é bloqueada',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 1,
      preconditions: 'Exame de check-up selecionado no plano.',
      steps: [
        step('Preencher a justificativa apenas com espaços (12+ caracteres em branco)', 'O campo aceita a digitação'),
        step('Tentar salvar/confirmar', 'O salvamento é bloqueado'),
        step('Verificar a mensagem', 'O conteúdo efetivo é menor que 12 caracteres e a validação bloqueia')
      ]
    },
    {
      scen: 'NEG-06', req: 'REQ-009', strat: 'validacoes',
      title: 'Justificativa com caracteres especiais é avaliada pelo conteúdo efetivo',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Exame de check-up selecionado no plano.',
      steps: [
        step('Preencher a justificativa com símbolos e acentos', 'O campo aceita a digitação'),
        step('Contar o conteúdo efetivo e tentar salvar', 'A validação considera o conteúdo (≥12 efetivos aceita; <12 bloqueia)'),
        step('Verificar o comportamento', 'O sistema aplica a regra de mínimo de 12 caracteres de forma consistente')
      ]
    },

    // ---- NEG-07 Recarga e concorrência ----
    {
      scen: 'NEG-07', req: 'REQ-010', strat: 'validacoes',
      title: 'Recarregar a página com dados não salvos não corrompe o atendimento',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Prontuário com dados preenchidos ainda não salvos.',
      steps: [
        step('Preencher dados nas abas sem salvar', 'Dados preenchidos'),
        step('Recarregar a página', 'A página recarrega'),
        step('Verificar o estado', 'O sistema exibe o atendimento em um estado consistente (dados não salvos podem ser perdidos por design, mas sem corrupção/erro)'),
        step('Continuar o atendimento', 'O fluxo segue sem travamento')
      ]
    },
    {
      scen: 'NEG-07', req: 'REQ-010', strat: 'validacoes',
      title: 'Editar o mesmo atendimento em duas abas do navegador',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Navegador com o mesmo prontuário aberto em duas abas.',
      steps: [
        step('Abrir o mesmo atendimento em duas abas do navegador', 'Ambas exibem o prontuário'),
        step('Editar dados na aba A e salvar', 'Salvamento com sucesso'),
        step('Editar dados na aba B e salvar', 'Salvamento com sucesso'),
        step('Verificar a consistência final', 'O registro final é consistente (último salvamento prevalece sem corrupção)')
      ]
    },

    // ---- NEG-08 Exceções da finalização ----
    {
      scen: 'NEG-08', req: 'REQ-011', strat: 'integracao',
      title: 'Cancelar a finalização mantém o atendimento em andamento',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Atendimento pronto para finalizar.',
      steps: [
        step('Iniciar a finalização do atendimento', 'A tela de finalização é exibida'),
        step('Cancelar a finalização', 'A ação é cancelada'),
        step('Verificar o status do paciente na listagem', 'O status permanece \"Em Atendimento\" (ou equivalente)'),
        step('Verificar os dados preenchidos', 'Os dados do atendimento continuam preservados')
      ]
    },
    {
      scen: 'NEG-08', req: 'REQ-011', strat: 'integracao',
      title: 'Finalizar sem plano clínico aplicado é tratado de forma controlada',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Atendimento sem plano clínico aplicado.',
      steps: [
        step('Tentar finalizar o atendimento sem plano aplicado', 'O sistema avalia o fluxo'),
        step('Verificar o comportamento', 'O sistema bloqueia com mensagem OU permite com aviso, conforme regra de negócio, sem erro de tela'),
        step('Registrar o comportamento observado', 'Comportamento documentado e comparado com a regra esperada')
      ]
    },
    {
      scen: 'NEG-08', req: 'REQ-012', strat: 'integracao',
      title: 'Conferir via API que um atendimento cancelado não é persistido',
      priority: 'Média', type: 'API', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Acesso à API; atendimento cancelado antes da finalização.',
      steps: [
        step('Cancelar a finalização do atendimento', 'Ação cancelada'),
        step('Consultar o registro via API', 'O registro não consta como finalizado (ou mantém o status de em andamento)'),
        step('Verificar a integridade', 'Nenhum dado parcial é persistido como atendimento concluído')
      ]
    }
  ];

  const caseIds = {};
  for (const c of CASES) {
    const steps = c.steps.map((s, i) => ({ order: i + 1, action: s.action, expected: s.expected }));
    const created = await post('/test-cases', {
      project_id: PROJECT_ID, task_id: TASK_ID,
      scenario_id: scenIds[c.scen], requirement_id: reqCode[c.req], strategy_id: STRAT[c.strat],
      title: c.title, priority: c.priority, type: c.type, execution_mode: c.mode,
      status: 'Pronto', preconditions: c.preconditions, steps,
      regression_relevant: c.regression, automated: c.automated,
      automation_tool: c.automated ? 'Playwright' : '',
      source: 'manual'
    });
    caseIds[c.title] = created.id;
    results.cases++;
    results.steps += steps.length;
  }

  // ---------------------------------------------------------------
  // MASSA DE TESTE
  // ---------------------------------------------------------------
  const MASS = [
    {
      case: 'Acessar o CPM sem sessão válida redireciona para o SSO', mass: [
        { name: 'Cenário de sessão', purpose: 'Validação do redirecionamento ao SSO',
          data: 'Ação: acessar https://cpm.hom.levesaude.com.br/ sem sessão (cookies limpos); Esperado: redirecionar para login Microsoft e retornar logado após autenticação.' }
      ]
    },
    {
      case: 'Agenda do médico sem pacientes exibe estado vazio', mass: [
        { name: 'Agenda vazia', purpose: 'Validação do estado vazio da listagem',
          data: 'Médico: Dr. Physician - Clinica medica; Unidade: LEVE CLINICA TIJUCA; Período: sem agendamentos; Esperado: mensagem amigável de lista vazia.' }
      ]
    },
    {
      case: 'Pacientes homônimos abrem o prontuário correto de cada um', mass: [
        { name: 'Homônimos', purpose: 'Validação da distinção de prontuários com nomes iguais',
          data: 'Paciente A: João Carlos Santos (ID 1001); Paciente B: João Carlos Santos (ID 1002); Diferenciação por número de prontuário.' }
      ]
    },
    {
      case: 'Serviço de IA indisponível exibe erro amigável e preserva o texto', mass: [
        { name: 'Texto de anamnese para falha de IA', purpose: 'Conferir preservação do texto após falha do serviço',
          data: "Texto_Livre: 'Paciente comparece para check-up de rotina. Relata leve dor lombar esporádica. Nega alergias. Faz uso contínuo de losartana 50mg.'" }
      ]
    },
    {
      case: 'Texto sem dados clínicos é tratado sem erro', mass: [
        { name: 'Texto sem conteúdo clínico', purpose: 'Validação de processamento sem dados clínicos',
          data: "Texto_Livre: 'Paciente veio, nada a relatar. Compareceu sozinho.'; Esperado: nenhum dado estruturado ou aviso, sem erro." }
      ]
    },
    {
      case: 'Sinais vitais com valores inválidos são rejeitados', mass: [
        { name: 'Valores inválidos', purpose: 'Validação de entrada de sinais vitais',
          data: 'PA: abc; Temperatura: 500°C; FC: -5 bpm; Esperado: rejeição com mensagem de validação.' }
      ]
    },
    {
      case: 'Paciente com idade avançada (90+) recebe exames da faixa máxima', mass: [
        { name: 'Idade avançada', purpose: 'Protocolo para faixa máxima',
          data: 'Paciente_Idade: 92 | Sexo: M | Esperado: exames da faixa 60+ (Perfil lipídico, Glicemia, TSH, PSA, Colonoscopia, Densitometria).' }
      ]
    },
    {
      case: 'Palavra parcial ("check") NÃO aciona o motor de protocolos', mass: [
        { name: 'Gatilho parcial', purpose: 'Não-ativação por palavra incompleta',
          data: "Texto: 'Paciente veio para o check do laboratório' (sem 'check-up' completo); Esperado: sem acionamento do protocolo." }
      ]
    },
    {
      case: 'Justificativa com apenas espaços é bloqueada', mass: [
        { name: 'Justificativa em branco', purpose: 'Validação de conteúdo efetivo da justificativa',
          data: 'Justificativa: \"            \" (12+ espaços); Esperado: bloqueio por conteúdo efetivo < 12 caracteres.' }
      ]
    },
    {
      case: 'Cancelar a finalização mantém o atendimento em andamento', mass: [
        { name: 'Cancelamento de finalização', purpose: 'Status após cancelar a finalização',
          data: 'Status_Esperado: Em Atendimento; Verificar listagem após cancelamento.' }
      ]
    }
  ];

  for (const m of MASS) {
    const caseId = caseIds[m.case];
    if (!caseId) {
      console.warn('[aviso] Caso não encontrado para massa:', m.case);
      continue;
    }
    for (const item of m.mass) {
      await post(`/test-cases/${caseId}/test-mass`, {
        name: item.name, data: item.data, purpose: item.purpose, source: 'manual'
      });
      results.mass++;
    }
  }

  console.log('\\n=== Camada negativa GMPTL-141 concluída ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Falha:', err.message);
  process.exit(1);
});
