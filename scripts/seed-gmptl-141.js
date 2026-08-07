// Seed QA completo para a tarefa GMPTL-141
// "Validação de Estruturação de Prontuário via IA e Sugestão de Check-up por Protocolo"
// Uso: node scripts/seed-gmptl-141.js  (com a API rodando em http://localhost:3001)
const BASE = process.env.QA_API_BASE || 'http://localhost:3001/api';
const PROJECT_ID = Number(process.env.SEED_PROJECT_ID || 1);
const TASK_ID = Number(process.env.SEED_TASK_ID || 1);

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

const results = { requirements: 0, rules: 0, strategies: 0, scenarios: 0, cases: 0, mass: 0 };
const ids = {};

async function main() {
  // ---------------------------------------------------------------
  // 0) GUARDA: aborta se a tarefa já tiver requisitos (evita duplicação)
  // ---------------------------------------------------------------
  const existing = await fetch(`${BASE}/requirements?taskId=${TASK_ID}`).then((r) => r.json()).catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`[aviso] A tarefa ${TASK_ID} já possui ${existing.length} requisito(s). Abortando para não duplicar.`);
    console.log('Dica: use SEED_TASK_ID para outra tarefa ou limpe os dados existentes.');
    process.exit(0);
  }

  // ---------------------------------------------------------------
  // 1) REQUISITOS
  // ---------------------------------------------------------------
  const REQS = [
    {
      code: 'REQ-001', priority: 'Alta', module: 'Acesso',
      title: 'Acesso ao atendimento ambulatorial',
      description:
        'O usuário (médico) deve conseguir acessar o ambiente de homologação ' +
        '(https://cpm.hom.levesaude.com.br/) e navegar até o atendimento ambulatorial da ' +
        'unidade LEVE CLINICA TIJUCA - Rio de Janeiro, especialidade Clínica Médica, médico ' +
        'Dr. Physician - Clinica medica, e visualizar a listagem de pacientes agendados com ' +
        'opção de iniciar o atendimento.',
      rules: [
        'A URL de acesso deve ser https://cpm.hom.levesaude.com.br/',
        'O caminho de navegação deve ser: Atendimento/Ambulatorial > LEVE CLINICA TIJUCA - Rio de Janeiro > Clinica medica > Dr. Physician - Clinica medica',
        'A listagem deve exibir os pacientes agendados com botão "Iniciar"',
        'Sem sessão válida, o sistema deve redirecionar para o login SSO'
      ]
    },
    {
      code: 'REQ-002', priority: 'Alta', module: 'Paciente',
      title: 'Validação de identidade do paciente',
      description:
        'Ao clicar em "Iniciar" na listagem, o prontuário aberto deve pertencer exatamente ao ' +
        'paciente selecionado. Nome, idade e sexo devem ser exibidos de forma consistente em ' +
        'todos os modais abertos durante o atendimento.',
      rules: [
        'O nome do paciente no cabeçalho do prontuário deve ser idêntico ao exibido na listagem',
        'Nome, idade e sexo devem ser mantidos e exibidos corretamente em todos os modais (IA, Plano Clínico, Exames)',
        'Não deve ser possível abrir prontuário de paciente divergente do selecionado na listagem'
      ]
    },
    {
      code: 'REQ-003', priority: 'Alta', module: 'IA',
      title: 'Estruturação de anamnese via IA',
      description:
        'Ao inserir o texto livre da anamnese e clicar em "Estruturar com a IA", o sistema deve ' +
        'processar o texto, estruturar as informações, permitir revisão humana (se necessária) e ' +
        'aplicar as informações aos campos do prontuário com sucesso, sem perder o contexto original.',
      rules: [
        'O texto gerado e estruturado pela IA não pode perder o contexto original digitado pelo médico',
        'O sistema deve permitir ao usuário editar manualmente o texto estruturado pela IA antes de aplicar',
        'A aplicação deve preencher os campos do prontuário com sucesso',
        'A ação deve ser disparada exclusivamente pelo botão "Estruturar com a IA"'
      ]
    },
    {
      code: 'REQ-004', priority: 'Alta', module: 'Prontuário',
      title: 'Preenchimento da aba Subjetivo',
      description:
        'A aba Subjetivo deve permitir o preenchimento manual e/ou via IA dos campos: início, ' +
        'intensidade e irradiação do sintoma; alergias; medicamentos em uso contínuo; antecedentes.',
      rules: [
        'Campos de início, intensidade e irradiação devem ser preenchíveis',
        'Alergias devem ser registráveis (descrição livre)',
        'Medicamentos em uso contínuo devem ser registráveis',
        'Antecedentes devem ser registráveis'
      ]
    },
    {
      code: 'REQ-005', priority: 'Média', module: 'Prontuário',
      title: 'Preenchimento da aba Objetivo',
      description:
        'A aba Objetivo deve permitir o registro dos sinais vitais do paciente, manualmente ou via IA.',
      rules: [
        'Os sinais vitais devem ser registráveis (ex.: PA, FC, FR, temperatura, saturação, peso, altura, IMC)',
        'Valores numéricos devem ser aceitos com unidades válidas',
        'O preenchimento pode ocorrer manualmente ou por aplicação da IA'
      ]
    },
    {
      code: 'REQ-006', priority: 'Alta', module: 'Prontuário',
      title: 'Preenchimento da aba Avaliação',
      description:
        'A aba Avaliação deve permitir o registro da hipótese principal, do CID-10 e dos ' +
        'diagnósticos secundários.',
      rules: [
        'Hipótese principal deve ser registrável',
        'CID-10 deve ser selecionável e pesquisável',
        'Diagnósticos secundários devem poder ser adicionados',
        'Hipótese principal deve ser obrigatória para finalizar o atendimento (regra de negócio)'
      ]
    },
    {
      code: 'REQ-007', priority: 'Alta', module: 'Protocolos',
      title: 'Gatilho do protocolo de check-up',
      description:
        'A presença da palavra-chave "check-up" na anamnese deve acionar o motor de protocolos, ' +
        'independentemente de maiúsculas, minúsculas ou variações comuns de digitação toleradas ' +
        'pelo sistema.',
      rules: [
        'A palavra "check-up" em minúsculas deve acionar o motor de protocolos',
        'Variações "Check-up", "CHECK-UP" e "check up" devem acionar o motor de protocolos',
        'A ausência da palavra-chave não deve acionar o motor de protocolos',
        'O gatilho deve ocorrer ao estruturar com IA e/ou ao sugerir o plano clínico'
      ]
    },
    {
      code: 'REQ-008', priority: 'Alta', module: 'Protocolos',
      title: 'Sugestão de plano clínico por faixa etária e sexo',
      description:
        'Ao clicar em "Sugerir plano Clínico", o modal da IA deve exibir os exames preventivos ' +
        'exatos correspondentes à faixa etária e ao sexo do paciente, conforme a tabela de protocolos.',
      rules: [
        'Exames sugeridos para paciente masculino devem corresponder estritamente à tabela do protocolo masculino da sua faixa etária (ex.: PSA para homens acima da idade definida)',
        'Exames sugeridos para paciente feminino devem corresponder estritamente à tabela do protocolo feminino da sua faixa etária (ex.: Mamografia e Preventivo)',
        'Exames do sexo oposto não devem ser sugeridos',
        'A faixa etária do paciente define o conjunto de exames sugeridos',
        'Idades nos limites exatos das faixas seguem a tabela de protocolos (teste de valor limite)'
      ]
    },
    {
      code: 'REQ-009', priority: 'Média', module: 'Validações',
      title: 'Justificativa de inclusão de exame de check-up',
      description:
        'A inclusão de um exame de check-up deve exigir justificativa com o mínimo de 12 caracteres, ' +
        'com validação em tempo real e mensagem de erro clara.',
      rules: [
        'Justificativa vazia (0 caracteres) deve bloquear o salvamento',
        'Justificativa com 11 caracteres deve exibir mensagem de erro de validação',
        'Justificativa com 12 ou mais caracteres deve ser aceita',
        'A mensagem de erro deve indicar o mínimo de caracteres exigido'
      ]
    },
    {
      code: 'REQ-010', priority: 'Alta', module: 'Persistência',
      title: 'Persistência de dados entre telas e modais',
      description:
        'Os dados preenchidos nas abas (Subjetivo, Objetivo, Avaliação) não podem ser perdidos ao ' +
        'navegar entre as diferentes telas e modais antes de salvar o atendimento.',
      rules: [
        'Navegar entre as abas Subjetivo, Objetivo e Avaliação não pode descartar dados preenchidos',
        'Abrir e fechar o modal da IA não pode descartar dados preenchidos',
        'Abrir e fechar o modal do Plano Clínico e de Exames não pode descartar dados preenchidos',
        'Dados aplicados pela IA devem persistir após navegação'
      ]
    },
    {
      code: 'REQ-011', priority: 'Alta', module: 'Finalização',
      title: 'Aplicação do plano e finalização do atendimento',
      description:
        'Deve ser possível confirmar, aplicar o plano clínico, salvar e finalizar o atendimento ' +
        'sem erros, refletindo o plano no resumo de finalização.',
      rules: [
        'O plano clínico sugerido deve poder ser confirmado e aplicado',
        'O atendimento deve poder ser salvo sem erros',
        'O atendimento deve poder ser finalizado sem erros',
        'O plano clínico aprovado deve ser refletido na tela de resumo/finalização do prontuário'
      ]
    },
    {
      code: 'REQ-012', priority: 'Alta', module: 'Integração',
      title: 'Persistência no banco e status do paciente',
      description:
        'Ao finalizar o atendimento, os dados devem ser salvos corretamente no banco de dados e o ' +
        'status do paciente na listagem deve mudar para "Atendido" (ou status correspondente finalizado).',
      rules: [
        'Os dados do atendimento devem ser salvos corretamente no banco de dados',
        'O status do paciente na listagem deve mudar para "Atendido" após a finalização',
        'O registro finalizado deve ser recuperável posteriormente'
      ]
    }
  ];

  for (const r of REQS) {
    const created = await post('/requirements', {
      project_id: PROJECT_ID, task_id: TASK_ID,
      code: r.code, title: r.title, description: r.description,
      priority: r.priority, status: 'Ativo', module: r.module, source: 'manual'
    });
    ids[r.code] = created.id;
    results.requirements++;
    for (const rule of r.rules) {
      await post(`/requirements/${created.id}/business-rules`, {
        rule, category: 'Regra de Negócio', source: 'manual'
      });
      results.rules++;
    }
  }

  // ---------------------------------------------------------------
  // 2) ESTRATÉGIAS
  // ---------------------------------------------------------------
  const STRATS = [
    {
      name: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      requirement_id: 'REQ-001',
      description:
        'Cobertura funcional ponta a ponta do fluxo de atendimento: acesso, navegação até o médico, ' +
        'seleção do paciente, anamnese livre, estruturação com IA, preenchimento das abas, sugestão ' +
        'de plano clínico, justificativa e finalização do atendimento.',
      approach:
        'Testes manuais roteirizados guiados pelos critérios de aceite, com fumaça no início de cada ' +
        'build e exploração de fluxos alternativos (cancelamentos, retorno de telas, reestruturação). ' +
        'Casos estáveis devem ser candidatos à automação com Playwright.',
      risk_scope:
        'Integração com o motor de IA; perda de dados entre telas e modais; divergência de identidade ' +
        'do paciente; regressões no fluxo de finalização do atendimento.',
      entry_criteria:
        'Ambiente de homologação acessível; usuário médico com sessão válida; paciente agendado na ' +
        'unidade/sala do Dr. Physician; massa de anamnese preparada; permissão de acesso ao CPM.',
      exit_criteria:
        '100% dos casos funcionais executados; bugs críticos e altos corrigidos e retestados; ' +
        'cobertura de regressão aprovada pelo time.'
    },
    {
      name: 'Estratégia de Teste da Estruturação por IA',
      requirement_id: 'REQ-003',
      description:
        'Validação da qualidade da estruturação de texto livre pela IA: fidelidade de contexto, ' +
        'preenchimento correto dos campos, editabilidade manual e aplicação sem erros.',
      approach:
        'Utilizar textos de anamnese realistas com variações de formatação (maiúsculas, pontuação, ' +
        'quebras de linha); comparar o texto estruturado com o original; verificar a possibilidade de ' +
        'edição manual antes da aplicação e a persistência do contexto após a estruturação.',
      risk_scope:
        'Perda de contexto ou alucinação da IA; campos preenchidos incorretamente; impossibilidade ' +
        'de revisão humana; dados aplicados de forma divergente do texto original.',
      entry_criteria:
        'Motor de IA disponível no ambiente de homologação; textos de anamnese de exemplo; casos de ' +
        'teste com dados parametrizados.',
      exit_criteria:
        'Amostra de textos estruturados validada pelo time de produto; divergências críticas de ' +
        'contexto registradas e corrigidas.'
    },
    {
      name: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      requirement_id: 'REQ-008',
      description:
        'Validação das regras de sugestão de exames preventivos por faixa etária e sexo, incluindo ' +
        'testes de valor limite nas fronteiras das faixas e exclusão de exames do sexo oposto.',
      approach:
        'Tabela de decisão com combinações idade x sexo; testes de valor limite (idade exata nas ' +
        'fronteiras, 1 ano abaixo/acima); verificação de que exames masculinos não aparecem para ' +
        'mulheres e vice-versa; conferência contra a tabela de protocolos de referência.',
      risk_scope:
        'Exames incorretos para a faixa etária; exames do sexo oposto sugeridos erroneamente; ' +
        'fronteiras de faixa mal definidas; falha no gatilho do protocolo de check-up.',
      entry_criteria:
        'Tabela de protocolos de referência disponível; pacientes de teste com idades nas fronteiras ' +
        'das faixas; acesso ao modal de sugestão de plano.',
      exit_criteria:
        'Matriz idade x sexo 100% validada contra a tabela de protocolos; divergências registradas ' +
        'como bug e corrigidas.'
    },
    {
      name: 'Estratégia de Teste de Validações de Interface (Frontend)',
      requirement_id: 'REQ-009',
      description:
        'Validação das regras de interface e campos do formulário: justificativa com mínimo de 12 ' +
        'caracteres, obrigatoriedade de hipótese principal e persistência de dados ao navegar entre ' +
        'telas e modais.',
      approach:
        'Testes negativos (0, 11, 12+ caracteres na justificativa); navegação entre abas e ' +
        'abertura/fechamento de modais com dados preenchidos; verificação de mensagens de erro ' +
        'exibidas e de bloqueio de salvamento.',
      risk_scope:
        'Validação de justificativa não aplicada; perda de dados ao navegar; mensagens de erro ' +
        'ausentes ou incorretas.',
      entry_criteria:
        'Tela de atendimento com abas e modais acessíveis; pacientes de teste cadastrados.',
      exit_criteria:
        'Todas as validações de campo verificadas; nenhuma perda de dados reproduzida nas ' +
        'navegações cobertas.'
    },
    {
      name: 'Estratégia de Teste de Integração e Finalização',
      requirement_id: 'REQ-011',
      description:
        'Validação da persistência dos dados no banco, do resumo do plano na finalização e da ' +
        'atualização do status do paciente na listagem.',
      approach:
        'Execução completa do fluxo com conferência do resumo de finalização; verificação do registro ' +
        'persistido via API/banco; conferência do status "Atendido" na listagem após finalizar.',
      risk_scope:
        'Dados não persistidos; status incorreto na listagem; divergência entre o resumo exibido e ' +
        'os dados salvos.',
      entry_criteria:
        'Fluxo funcional executável de ponta a ponta; acesso à API para conferência dos dados.',
      exit_criteria:
        'Atendimento finalizado com dados íntegros no banco; status do paciente atualizado na listagem.'
    }
  ];

  for (const s of STRATS) {
    const created = await post('/strategies', {
      project_id: PROJECT_ID, task_id: TASK_ID,
      requirement_id: ids[s.requirement_id],
      name: s.name, description: s.description, approach: s.approach,
      risk_scope: s.risk_scope, entry_criteria: s.entry_criteria,
      exit_criteria: s.exit_criteria, status: 'Ativo', source: 'manual'
    });
    ids[s.name] = created.id;
    results.strategies++;
  }

  // ---------------------------------------------------------------
  // 3) CENÁRIOS
  // ---------------------------------------------------------------
  const SCEN = [
    {
      key: 'CEN-001', req: 'REQ-001',
      title: 'Acesso e navegação ao atendimento ambulatorial',
      description:
        'Verificação do acesso ao ambiente de homologação, autenticação, navegação até a unidade, ' +
        'especialidade e médico corretos, e visualização da listagem de pacientes agendados.',
      preconditions: 'Usuário médico com acesso ao CPM de homologação; sessão SSO válida.'
    },
    {
      key: 'CEN-002', req: 'REQ-002',
      title: 'Seleção e validação de identidade do paciente',
      description:
        'Verificação de que o prontuário aberto pertence exatamente ao paciente selecionado e de que ' +
        'nome, idade e sexo são consistentes em todos os modais.',
      preconditions: 'Listagem de pacientes agendados visível com botão "Iniciar".'
    },
    {
      key: 'CEN-003', req: 'REQ-003',
      title: 'Estruturação de anamnese com IA',
      description:
        'Verificação do processamento do texto livre pela IA, preservação do contexto original, ' +
        'possibilidade de revisão e aplicação dos dados aos campos do prontuário.',
      preconditions: 'Anamnese em texto livre digitada; botão "Estruturar com a IA" disponível.'
    },
    {
      key: 'CEN-004', req: 'REQ-003',
      title: 'Revisão e edição manual do texto estruturado',
      description:
        'Verificação da possibilidade de editar manualmente o texto estruturado pela IA antes de ' +
        'aplicar, e do comportamento ao reestruturar após edição.',
      preconditions: 'Texto de anamnese já estruturado pela IA, aguardando revisão.'
    },
    {
      key: 'CEN-005', req: 'REQ-004',
      title: 'Preenchimento da aba Subjetivo',
      description:
        'Verificação do preenchimento manual e via IA dos campos: início, intensidade e irradiação; ' +
        'alergias; medicamentos em uso contínuo; antecedentes.',
      preconditions: 'Prontuário do paciente aberto na aba Subjetivo.'
    },
    {
      key: 'CEN-006', req: 'REQ-005',
      title: 'Preenchimento da aba Objetivo (sinais vitais)',
      description:
        'Verificação do registro dos sinais vitais manualmente e pela aplicação da IA.',
      preconditions: 'Prontuário do paciente aberto na aba Objetivo.'
    },
    {
      key: 'CEN-007', req: 'REQ-006',
      title: 'Preenchimento da aba Avaliação',
      description:
        'Verificação do registro de hipótese principal, CID-10 e diagnósticos secundários.',
      preconditions: 'Prontuário do paciente aberto na aba Avaliação.'
    },
    {
      key: 'CEN-008', req: 'REQ-007',
      title: 'Gatilho do protocolo de check-up',
      description:
        'Verificação de que a palavra-chave "check-up" na anamnese aciona o motor de protocolos, em ' +
        'qualquer variação de caixa/digitação, e que a ausência da palavra não aciona.',
      preconditions: 'Anamnese com e sem a palavra-chave "check-up".'
    },
    {
      key: 'CEN-009', req: 'REQ-008',
      title: 'Sugestão de plano clínico - protocolo masculino',
      description:
        'Verificação dos exames preventivos sugeridos para pacientes do sexo masculino conforme a ' +
        'tabela de protocolos da faixa etária (ex.: PSA), excluindo exames femininos.',
      preconditions: 'Paciente masculino cadastrado; anamnese com gatilho de check-up; aba Plano acessível.'
    },
    {
      key: 'CEN-010', req: 'REQ-008',
      title: 'Sugestão de plano clínico - protocolo feminino',
      description:
        'Verificação dos exames preventivos sugeridos para pacientes do sexo feminino conforme a ' +
        'tabela de protocolos da faixa etária (ex.: Mamografia e Preventivo), excluindo exames masculinos.',
      preconditions: 'Paciente feminino cadastrado; anamnese com gatilho de check-up; aba Plano acessível.'
    },
    {
      key: 'CEN-011', req: 'REQ-008',
      title: 'Limites de faixa etária (teste de valor limite)',
      description:
        'Verificação do comportamento do sistema para pacientes com idade exatamente nos limites das ' +
        'faixas etárias da tabela de protocolos, além de 1 ano abaixo e 1 ano acima do limite.',
      preconditions: 'Pacientes de teste com idades nas fronteiras das faixas (ex.: 40, 41, 49, 50, 59, 60).'
    },
    {
      key: 'CEN-012', req: 'REQ-009',
      title: 'Validação da justificativa de exames (12 caracteres)',
      description:
        'Verificação da regra de mínimo de 12 caracteres na justificativa: 0, 11, 12 e mais de 12 ' +
        'caracteres.',
      preconditions: 'Exame de check-up selecionado no plano; campo de justificativa visível.'
    },
    {
      key: 'CEN-013', req: 'REQ-010',
      title: 'Persistência de dados entre telas e modais',
      description:
        'Verificação de que os dados preenchidos nas abas não são perdidos ao navegar entre telas e ' +
        'ao abrir/fechar modais (IA, Plano Clínico, Exames).',
      preconditions: 'Dados preenchidos em ao menos duas abas; modais acessíveis.'
    },
    {
      key: 'CEN-014', req: 'REQ-011',
      title: 'Finalização do atendimento e status do paciente',
      description:
        'Verificação da aplicação do plano, salvamento, finalização, resumo exibido e atualização do ' +
        'status para "Atendido" na listagem, com dados íntegros no banco.',
      preconditions: 'Fluxo completo de atendimento executável; acesso à API para conferência.'
    }
  ];

  for (const c of SCEN) {
    const created = await post('/scenarios', {
      project_id: PROJECT_ID, task_id: TASK_ID,
      requirement_id: ids[c.req],
      title: c.title, description: c.description, preconditions: c.preconditions, source: 'manual'
    });
    ids[c.key] = created.id;
    results.scenarios++;
  }

  // ---------------------------------------------------------------
  // 4) CASOS DE TESTE
  // ---------------------------------------------------------------
  const step = (action, expected) => ({ action, expected });

  const CASES = [
    // ---- CEN-001 Acesso e navegação ----
    {
      scen: 'CEN-001', req: 'REQ-001', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Acessar o ambiente de homologação e autenticar via SSO',
      priority: 'Alta', type: 'Fumaça', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Ambiente de homologação disponível; credenciais de usuário médico.',
      steps: [
        step('Abrir o navegador e acessar https://cpm.hom.levesaude.com.br/', 'O sistema redireciona para a tela de login SSO'),
        step('Autenticar com usuário médico válido', 'O login é efetuado e o sistema redireciona para a área logada'),
        step('Verificar que a área logada carrega sem erros', 'A tela principal do CPM é exibida')
      ]
    },
    {
      scen: 'CEN-001', req: 'REQ-001', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Navegar até a unidade LEVE CLINICA TIJUCA',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Usuário logado no CPM de homologação.',
      steps: [
        step('Acessar o menu Atendimento/Ambulatorial', 'O menu exibe as unidades disponíveis'),
        step('Selecionar a unidade "LEVE CLINICA TIJUCA - Rio de Janeiro"', 'A unidade é selecionada e exibe as especialidades'),
        step('Verificar a unidade selecionada no cabeçalho/contexto', 'A unidade LEVE CLINICA TIJUCA - Rio de Janeiro é exibida corretamente')
      ]
    },
    {
      scen: 'CEN-001', req: 'REQ-001', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Selecionar especialidade e médico Dr. Physician',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Unidade LEVE CLINICA TIJUCA - Rio de Janeiro selecionada.',
      steps: [
        step('Selecionar a especialidade "Clinica medica"', 'A especialidade Clínica Médica é selecionada'),
        step('Selecionar o médico "Dr. Physician - Clinica medica"', 'O médico é selecionado'),
        step('Verificar a listagem de pacientes agendados', 'A listagem de agendamentos do médico é exibida')
      ]
    },
    {
      scen: 'CEN-001', req: 'REQ-001', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Verificar listagem de pacientes com opção "Iniciar"',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Médico Dr. Physician selecionado na unidade e especialidade corretas.',
      steps: [
        step('Verificar que a listagem contém pacientes agendados', 'A listagem exibe ao menos um paciente'),
        step('Verificar a presença do botão "Iniciar" para os pacientes', 'Cada paciente agendado possui o botão "Iniciar"'),
        step('Clicar em "Iniciar" para abrir o atendimento', 'O prontuário do paciente é aberto')
      ]
    },

    // ---- CEN-002 Identidade do paciente ----
    {
      scen: 'CEN-002', req: 'REQ-002', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Validar nome do paciente no prontuário idêntico ao da listagem',
      priority: 'Alta', type: 'Fumaça', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Listagem com pacientes agendados visível.',
      steps: [
        step('Identificar um paciente na listagem e anotar o nome exato', 'O nome do paciente é registrado'),
        step('Clicar em "Iniciar" para o paciente selecionado', 'O prontuário abre com o cabeçalho do paciente'),
        step('Comparar o nome no cabeçalho do prontuário com o nome anotado', 'Os nomes são idênticos (sem divergência)')
      ]
    },
    {
      scen: 'CEN-002', req: 'REQ-002', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Validar nome, idade e sexo consistentes em todos os modais',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Prontuário do paciente aberto.',
      steps: [
        step('Anotar nome, idade e sexo exibidos no cabeçalho do prontuário', 'Dados do paciente registrados'),
        step('Abrir o modal da IA (Estruturar com a IA)', 'O modal exibe os dados do paciente'),
        step('Comparar nome, idade e sexo no modal da IA com o cabeçalho', 'Os dados são idênticos'),
        step('Abrir o modal de Plano Clínico e de Exames', 'Os modais exibem os dados do paciente'),
        step('Comparar os dados em cada modal com o cabeçalho', 'Nome, idade e sexo são consistentes em todos os modais')
      ]
    },
    {
      scen: 'CEN-002', req: 'REQ-002', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Validar que o prontuário aberto pertence ao paciente selecionado',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Listagem com ao menos dois pacientes distintos.',
      steps: [
        step('Selecionar o primeiro paciente e clicar em "Iniciar"', 'Prontuário do primeiro paciente aberto'),
        step('Verificar o nome no cabeçalho', 'Nome corresponde ao primeiro paciente'),
        step('Voltar à listagem e selecionar o segundo paciente', 'Prontuário do segundo paciente aberto'),
        step('Verificar o nome no cabeçalho', 'Nome corresponde ao segundo paciente (não há troca de prontuário)')
      ]
    },

    // ---- CEN-003 Estruturação de anamnese com IA ----
    {
      scen: 'CEN-003', req: 'REQ-003', strat: 'Estratégia de Teste da Estruturação por IA',
      title: 'Estruturar anamnese em texto livre com a IA',
      priority: 'Alta', type: 'Fumaça', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Prontuário aberto; campo de anamnese em texto livre visível.',
      steps: [
        step('Digitar anamnese em texto livre (ex.: queixa, alergias, medicamentos)', 'O texto é aceito no campo'),
        step('Clicar no botão "Estruturar com a IA"', 'O sistema processa o texto e exibe o resultado estruturado'),
        step('Verificar que o resultado estruturado é exibido para revisão', 'O texto estruturado é apresentado antes de aplicar')
      ]
    },
    {
      scen: 'CEN-003', req: 'REQ-003', strat: 'Estratégia de Teste da Estruturação por IA',
      title: 'Validar que o texto estruturado preserva o contexto original',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Anamnese com informações variadas (sintomas, alergias, medicamentos, antecedentes).',
      steps: [
        step('Digitar anamnese contendo sintoma, alergia, medicamento e antecedente', 'Texto completo aceito'),
        step('Clicar em "Estruturar com a IA"', 'Resultado estruturado gerado'),
        step('Conferir que todas as informações do texto original estão presentes no estruturado', 'Nenhuma informação do texto original é perdida'),
        step('Conferir que os campos foram classificados corretamente (sintoma x alergia x medicamento)', 'Cada informação foi direcionada ao campo correspondente')
      ]
    },
    {
      scen: 'CEN-003', req: 'REQ-003', strat: 'Estratégia de Teste da Estruturação por IA',
      title: 'Aplicar as informações estruturadas aos campos do prontuário',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Texto estruturado pela IA disponível para aplicação.',
      steps: [
        step('Revisar o texto estruturado pela IA', 'O texto é revisado e considerado correto'),
        step('Confirmar a aplicação das informações', 'As informações são aplicadas aos campos do prontuário'),
        step('Verificar os campos preenchidos nas abas Subjetivo/Objetivo/Avaliação', 'Os campos foram preenchidos com sucesso')
      ]
    },
    {
      scen: 'CEN-003', req: 'REQ-003', strat: 'Estratégia de Teste da Estruturação por IA',
      title: 'Estruturar texto com formatação variada (maiúsculas, pontuação, quebras)',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Campo de anamnese aceita texto livre.',
      steps: [
        step('Digitar anamnese com mistura de maiúsculas e minúsculas', 'Texto aceito'),
        step('Clicar em "Estruturar com a IA"', 'Processamento executado sem erros'),
        step('Verificar que o contexto foi preservado apesar da formatação variada', 'Estruturação correta e completa')
      ]
    },

    // ---- CEN-004 Revisão e edição manual ----
    {
      scen: 'CEN-004', req: 'REQ-003', strat: 'Estratégia de Teste da Estruturação por IA',
      title: 'Editar manualmente o texto estruturado antes de aplicar',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Texto estruturado pela IA aguardando revisão.',
      steps: [
        step('Estruturar anamnese com a IA', 'Resultado estruturado exibido'),
        step('Editar manualmente um campo do resultado estruturado', 'A edição é aceita no campo'),
        step('Confirmar a aplicação', 'As informações editadas são aplicadas ao prontuário'),
        step('Verificar o campo editado no prontuário', 'O valor editado manualmente foi aplicado')
      ]
    },
    {
      scen: 'CEN-004', req: 'REQ-003', strat: 'Estratégia de Teste da Estruturação por IA',
      title: 'Reestruturar a anamnese após edição manual',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Anamnese previamente estruturada e editada.',
      steps: [
        step('Editar manualmente o texto estruturado', 'Edição aceita'),
        step('Clicar novamente em "Estruturar com a IA"', 'Nova estruturação gerada sem erros'),
        step('Verificar que o resultado considera o texto atual', 'A nova estruturação reflete o texto editado')
      ]
    },

    // ---- CEN-005 Aba Subjetivo ----
    {
      scen: 'CEN-005', req: 'REQ-004', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Preencher início, intensidade e irradiação do sintoma',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Prontuário aberto na aba Subjetivo.',
      steps: [
        step('Preencher o campo de início do sintoma', 'O campo aceita o valor informado'),
        step('Preencher o campo de intensidade', 'O campo aceita o valor informado'),
        step('Preencher o campo de irradiação', 'O campo aceita o valor informado'),
        step('Verificar que os valores permanecem preenchidos', 'Os campos exibem os valores preenchidos')
      ]
    },
    {
      scen: 'CEN-005', req: 'REQ-004', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Registrar alergias do paciente',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Aba Subjetivo aberta.',
      steps: [
        step('Inserir uma alergia (ex.: Dipirona)', 'A alergia é registrada'),
        step('Inserir uma segunda alergia', 'A segunda alergia é registrada'),
        step('Verificar a listagem de alergias', 'Todas as alergias inseridas são exibidas')
      ]
    },
    {
      scen: 'CEN-005', req: 'REQ-004', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Registrar medicamentos em uso contínuo',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Aba Subjetivo aberta.',
      steps: [
        step('Inserir um medicamento em uso contínuo (ex.: Losartana 50mg)', 'O medicamento é registrado'),
        step('Inserir outro medicamento em uso contínuo', 'O medicamento é registrado'),
        step('Verificar a listagem de medicamentos', 'Todos os medicamentos são exibidos')
      ]
    },
    {
      scen: 'CEN-005', req: 'REQ-004', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Registrar antecedentes do paciente',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Aba Subjetivo aberta.',
      steps: [
        step('Inserir antecedente pessoal (ex.: Hipertensão)', 'O antecedente é registrado'),
        step('Inserir antecedente familiar', 'O antecedente é registrado'),
        step('Verificar a listagem de antecedentes', 'Todos os antecedentes são exibidos')
      ]
    },

    // ---- CEN-006 Aba Objetivo ----
    {
      scen: 'CEN-006', req: 'REQ-005', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Preencher sinais vitais manualmente',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Prontuário aberto na aba Objetivo.',
      steps: [
        step('Preencher PA (ex.: 120x80 mmHg)', 'O valor é aceito'),
        step('Preencher FC, FR, temperatura e saturação', 'Os valores são aceitos'),
        step('Preencher peso e altura', 'Os valores são aceitos'),
        step('Verificar os valores exibidos', 'Os sinais vitais são exibidos corretamente')
      ]
    },
    {
      scen: 'CEN-006', req: 'REQ-005', strat: 'Estratégia de Teste da Estruturação por IA',
      title: 'Preencher sinais vitais via aplicação da IA',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Texto estruturado pela IA contendo sinais vitais.',
      steps: [
        step('Estruturar anamnese contendo sinais vitais', 'Estruturação reconhece os sinais vitais'),
        step('Aplicar as informações ao prontuário', 'Os sinais vitais são preenchidos na aba Objetivo'),
        step('Verificar os sinais vitais preenchidos', 'Os valores foram aplicados corretamente')
      ]
    },

    // ---- CEN-007 Aba Avaliação ----
    {
      scen: 'CEN-007', req: 'REQ-006', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Registrar hipótese principal',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Prontuário aberto na aba Avaliação.',
      steps: [
        step('Inserir hipótese principal (ex.: Hipertensão arterial sistêmica)', 'A hipótese é registrada'),
        step('Verificar o campo preenchido', 'A hipótese principal é exibida')
      ]
    },
    {
      scen: 'CEN-007', req: 'REQ-006', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Selecionar CID-10',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Aba Avaliação aberta.',
      steps: [
        step('Abrir o seletor/pesquisa de CID-10', 'A busca de CID é exibida'),
        step('Pesquisar e selecionar o CID-10 (ex.: I10)', 'O CID é selecionado'),
        step('Verificar o CID selecionado no campo', 'O CID-10 selecionado é exibido')
      ]
    },
    {
      scen: 'CEN-007', req: 'REQ-006', strat: 'Estratégia de Teste Funcional do Fluxo de Atendimento',
      title: 'Adicionar diagnósticos secundários',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Aba Avaliação aberta.',
      steps: [
        step('Adicionar um diagnóstico secundário', 'O diagnóstico é adicionado'),
        step('Adicionar um segundo diagnóstico secundário', 'O segundo diagnóstico é adicionado'),
        step('Verificar a lista de diagnósticos secundários', 'Todos os diagnósticos são exibidos')
      ]
    },

    // ---- CEN-008 Gatilho de check-up ----
    {
      scen: 'CEN-008', req: 'REQ-007', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Anamnese com "check-up" (minúsculas) aciona o protocolo',
      priority: 'Alta', type: 'Fumaça', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Paciente cadastrado; campo de anamnese em texto livre.',
      steps: [
        step('Digitar anamnese contendo "check-up" em minúsculas', 'Texto aceito'),
        step('Estruturar com a IA', 'O motor de protocolos é acionado'),
        step('Abrir a aba Plano', 'A opção de sugerir plano clínico está disponível'),
        step('Clicar em "Sugerir plano Clínico"', 'O modal da IA exibe os exames preventivos sugeridos')
      ]
    },
    {
      scen: 'CEN-008', req: 'REQ-007', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Variações de caixa e digitação de "check-up" acionam o protocolo',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Campo de anamnese em texto livre.',
      steps: [
        step('Digitar anamnese com "Check-up" (capitalizada)', 'Texto aceito'),
        step('Estruturar e verificar o acionamento do protocolo', 'O protocolo é acionado'),
        step('Repetir com "CHECK-UP" (maiúsculas)', 'O protocolo é acionado'),
        step('Repetir com "check up" (sem hífen)', 'O protocolo é acionado')
      ]
    },
    {
      scen: 'CEN-008', req: 'REQ-007', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Anamnese sem a palavra-chave NÃO aciona o protocolo',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Campo de anamnese em texto livre.',
      steps: [
        step('Digitar anamnese sem a palavra "check-up" (ex.: consulta de rotina)', 'Texto aceito'),
        step('Estruturar com a IA', 'O motor de protocolos NÃO é acionado'),
        step('Abrir a aba Plano', 'A opção de sugerir plano clínico não apresenta exames de check-up')
      ]
    },

    // ---- CEN-009 Protocolo masculino ----
    {
      scen: 'CEN-009', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Sugerir plano clínico para paciente masculino conforme protocolo',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Paciente masculino com idade na faixa de exames (ex.: 50 anos); anamnese com "check-up".',
      steps: [
        step('Abrir o atendimento do paciente masculino', 'Prontuário exibe sexo masculino e idade'),
        step('Acessar a aba Plano e clicar em "Sugerir plano Clínico"', 'O modal da IA abre'),
        step('Verificar os exames sugeridos', 'Os exames correspondem ao protocolo masculino da faixa etária (ex.: PSA)'),
        step('Comparar com a tabela de protocolos de referência', 'Os exames sugeridos estão exatamente conforme a tabela')
      ]
    },
    {
      scen: 'CEN-009', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Verificar que exames femininos NÃO são sugeridos para homens',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Paciente masculino na faixa de exames.',
      steps: [
        step('Sugerir o plano clínico para o paciente masculino', 'Modal da IA exibe os exames'),
        step('Verificar a ausência de exames femininos (ex.: Mamografia, Preventivo)', 'Nenhum exame feminino é sugerido'),
        step('Verificar a ausência de exames de protocolo feminino', 'A lista contém apenas exames masculinos da faixa')
      ]
    },
    {
      scen: 'CEN-009', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Verificar exames masculinos por faixa etária (PSA e demais)',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Pacientes masculinos com idades diferentes (ex.: 40, 50, 60 anos).',
      steps: [
        step('Sugerir o plano para paciente masculino de 40 anos', 'Exames conforme protocolo da faixa de 40 anos'),
        step('Sugerir o plano para paciente masculino de 50 anos', 'Exames conforme protocolo da faixa de 50 anos (inclui PSA se previsto)'),
        step('Comparar as listas com a tabela de protocolos', 'Cada faixa exibe exatamente os exames previstos')
      ]
    },

    // ---- CEN-010 Protocolo feminino ----
    {
      scen: 'CEN-010', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Sugerir plano clínico para paciente feminino conforme protocolo',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Paciente feminino com idade na faixa de exames (ex.: 45 anos); anamnese com "check-up".',
      steps: [
        step('Abrir o atendimento da paciente', 'Prontuário exibe sexo feminino e idade'),
        step('Acessar a aba Plano e clicar em "Sugerir plano Clínico"', 'O modal da IA abre'),
        step('Verificar os exames sugeridos', 'Os exames correspondem ao protocolo feminino da faixa (ex.: Mamografia, Preventivo)'),
        step('Comparar com a tabela de protocolos de referência', 'Os exames sugeridos estão exatamente conforme a tabela')
      ]
    },
    {
      scen: 'CEN-010', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Verificar que exames masculinos NÃO são sugeridos para mulheres',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Paciente feminino na faixa de exames.',
      steps: [
        step('Sugerir o plano clínico para a paciente', 'Modal da IA exibe os exames'),
        step('Verificar a ausência de exames masculinos (ex.: PSA)', 'Nenhum exame masculino é sugerido'),
        step('Verificar a ausência de exames de protocolo masculino', 'A lista contém apenas exames femininos da faixa')
      ]
    },
    {
      scen: 'CEN-010', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Verificar exames femininos por faixa etária (Mamografia e Preventivo)',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Pacientes femininas com idades diferentes (ex.: 25, 40, 50 anos).',
      steps: [
        step('Sugerir o plano para paciente feminina de 25 anos', 'Exames conforme protocolo da faixa de 25 anos'),
        step('Sugerir o plano para paciente feminina de 40 anos', 'Exames conforme protocolo da faixa de 40 anos (inclui Mamografia se previsto)'),
        step('Comparar as listas com a tabela de protocolos', 'Cada faixa exibe exatamente os exames previstos')
      ]
    },

    // ---- CEN-011 Limites de faixa etária ----
    {
      scen: 'CEN-011', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Paciente com idade no limite inferior da faixa de exames',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Paciente com idade exatamente no limite inferior da faixa (ex.: 40 anos).',
      steps: [
        step('Sugerir o plano clínico para o paciente com idade no limite', 'O modal exibe os exames'),
        step('Comparar os exames sugeridos com a tabela para a idade exata', 'Os exames correspondem à faixa conforme a tabela de protocolos')
      ]
    },
    {
      scen: 'CEN-011', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Paciente com idade 1 ano abaixo e 1 ano acima do limite',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Pacientes com idade no limite ±1 ano (ex.: 39, 40 e 41 anos).',
      steps: [
        step('Sugerir o plano para o paciente com 1 ano abaixo do limite', 'Exames da faixa anterior (sem exames da faixa nova, se assim previsto)'),
        step('Sugerir o plano para o paciente com 1 ano acima do limite', 'Exames da faixa nova conforme protocolo'),
        step('Comparar com a tabela de protocolos', 'As transições de faixa seguem a tabela de referência')
      ]
    },
    {
      scen: 'CEN-011', req: 'REQ-008', strat: 'Estratégia de Teste de Regras de Negócio (Protocolos de Idade e Sexo)',
      title: 'Paciente jovem adulto fora da faixa de exames preventivos',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Paciente jovem adulto (ex.: 20 anos) com anamnese de check-up.',
      steps: [
        step('Sugerir o plano clínico para o paciente jovem', 'O modal exibe os exames da faixa jovem ou nenhum exame preventivo, conforme a tabela'),
        step('Verificar que não há exames de faixas superiores', 'A lista respeita a faixa etária do paciente')
      ]
    },

    // ---- CEN-012 Justificativa ----
    {
      scen: 'CEN-012', req: 'REQ-009', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Justificativa vazia (0 caracteres) bloqueia o salvamento',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Exame de check-up selecionado no plano; campo de justificativa visível.',
      steps: [
        step('Selecionar um exame de check-up no plano', 'O exame é incluído'),
        step('Deixar o campo de justificativa vazio (0 caracteres)', 'O campo permanece vazio'),
        step('Tentar salvar/confirmar', 'O salvamento é bloqueado com mensagem de erro'),
        step('Verificar a mensagem de erro', 'A mensagem indica a necessidade de justificativa com mínimo de 12 caracteres')
      ]
    },
    {
      scen: 'CEN-012', req: 'REQ-009', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Justificativa com 11 caracteres exibe erro de validação',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Exame de check-up selecionado no plano.',
      steps: [
        step('Preencher a justificativa com 11 caracteres', 'O campo aceita a digitação'),
        step('Tentar salvar/confirmar', 'O salvamento é bloqueado'),
        step('Verificar a mensagem de erro', 'A mensagem indica o mínimo de 12 caracteres exigido')
      ]
    },
    {
      scen: 'CEN-012', req: 'REQ-009', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Justificativa com exatamente 12 caracteres é aceita',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Exame de check-up selecionado no plano.',
      steps: [
        step('Preencher a justificativa com exatamente 12 caracteres', 'O campo exibe os 12 caracteres'),
        step('Tentar salvar/confirmar', 'O salvamento é aceito sem erro de validação'),
        step('Verificar a justificativa salva', 'A justificativa é persistida com sucesso')
      ]
    },
    {
      scen: 'CEN-012', req: 'REQ-009', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Justificativa com mais de 12 caracteres é aceita',
      priority: 'Média', type: 'Funcional', mode: 'Manual', regression: 0, automated: 0,
      preconditions: 'Exame de check-up selecionado no plano.',
      steps: [
        step('Preencher a justificativa com texto maior que 12 caracteres', 'O campo aceita o texto'),
        step('Tentar salvar/confirmar', 'O salvamento é aceito'),
        step('Verificar a justificativa salva', 'A justificativa é persistida integralmente')
      ]
    },

    // ---- CEN-013 Persistência ----
    {
      scen: 'CEN-013', req: 'REQ-010', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Navegar entre abas sem perder dados preenchidos',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Dados preenchidos em ao menos duas abas do prontuário.',
      steps: [
        step('Preencher dados na aba Subjetivo', 'Dados preenchidos'),
        step('Navegar para a aba Objetivo e preencher sinais vitais', 'Dados preenchidos'),
        step('Navegar para a aba Avaliação e preencher hipótese/CID', 'Dados preenchidos'),
        step('Voltar para a aba Subjetivo', 'Os dados da aba Subjetivo permanecem preenchidos'),
        step('Verificar as abas Objetivo e Avaliação', 'Nenhum dado foi perdido na navegação')
      ]
    },
    {
      scen: 'CEN-013', req: 'REQ-010', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Abrir e fechar o modal da IA sem perder dados',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Dados preenchidos em ao menos uma aba.',
      steps: [
        step('Preencher dados na aba Subjetivo', 'Dados preenchidos'),
        step('Abrir o modal da IA (Estruturar com a IA)', 'O modal é exibido'),
        step('Fechar o modal sem aplicar', 'O modal fecha'),
        step('Verificar os dados da aba Subjetivo', 'Os dados preenchidos permanecem')
      ]
    },
    {
      scen: 'CEN-013', req: 'REQ-010', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Abrir e fechar o modal de Plano Clínico e de Exames sem perder dados',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Dados preenchidos em ao menos uma aba.',
      steps: [
        step('Preencher dados na aba Avaliação', 'Dados preenchidos'),
        step('Abrir a aba Plano e o modal de sugestão de plano', 'O modal de Plano Clínico é exibido'),
        step('Abrir o modal de Exames e fechá-lo', 'O modal de Exames abre e fecha'),
        step('Fechar o modal de Plano Clínico', 'O modal fecha'),
        step('Verificar os dados da aba Avaliação', 'Os dados preenchidos permanecem')
      ]
    },
    {
      scen: 'CEN-013', req: 'REQ-010', strat: 'Estratégia de Teste de Validações de Interface (Frontend)',
      title: 'Dados aplicados pela IA persistem após navegação',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Anamnese estruturada e aplicada pela IA.',
      steps: [
        step('Estruturar a anamnese com a IA e aplicar', 'Campos preenchidos pela IA'),
        step('Navegar entre as abas Subjetivo, Objetivo e Avaliação', 'Navegação executada'),
        step('Verificar os campos aplicados pela IA', 'Os dados aplicados persistem em todas as abas')
      ]
    },

    // ---- CEN-014 Finalização ----
    {
      scen: 'CEN-014', req: 'REQ-011', strat: 'Estratégia de Teste de Integração e Finalização',
      title: 'Confirmar e aplicar o plano clínico sugerido',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Plano clínico sugerido no modal da IA.',
      steps: [
        step('Revisar os exames sugeridos no modal', 'Exames exibidos conforme protocolo'),
        step('Preencher justificativas válidas quando exigidas', 'Justificativas aceitas'),
        step('Confirmar o plano', 'O plano é confirmado'),
        step('Aplicar o plano', 'O plano é aplicado sem erros')
      ]
    },
    {
      scen: 'CEN-014', req: 'REQ-011', strat: 'Estratégia de Teste de Integração e Finalização',
      title: 'Salvar o atendimento sem erros',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Abas e plano preenchidos.',
      steps: [
        step('Preencher todos os campos obrigatórios', 'Campos válidos'),
        step('Clicar em salvar o atendimento', 'O sistema salva sem erros'),
        step('Verificar a confirmação de salvamento', 'Mensagem de sucesso exibida')
      ]
    },
    {
      scen: 'CEN-014', req: 'REQ-011', strat: 'Estratégia de Teste de Integração e Finalização',
      title: 'Finalizar o atendimento e verificar o resumo',
      priority: 'Alta', type: 'Fumaça', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Atendimento salvo com plano aplicado.',
      steps: [
        step('Clicar em finalizar o atendimento', 'O atendimento é finalizado sem erros'),
        step('Verificar a tela de resumo/finalização', 'O resumo é exibido'),
        step('Conferir que o plano clínico aprovado está refletido no resumo', 'Os exames do plano aparecem no resumo')
      ]
    },
    {
      scen: 'CEN-014', req: 'REQ-011', strat: 'Estratégia de Teste de Integração e Finalização',
      title: 'Verificar status "Atendido" do paciente na listagem',
      priority: 'Alta', type: 'Funcional', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Atendimento finalizado com sucesso.',
      steps: [
        step('Voltar à listagem de pacientes do médico', 'A listagem é exibida'),
        step('Localizar o paciente cujo atendimento foi finalizado', 'O paciente é localizado'),
        step('Verificar o status exibido', 'O status mudou para "Atendido" (ou status finalizado correspondente)')
      ]
    },
    {
      scen: 'CEN-014', req: 'REQ-012', strat: 'Estratégia de Teste de Integração e Finalização',
      title: 'Conferir a persistência dos dados do atendimento no banco (API)',
      priority: 'Alta', type: 'API', mode: 'Manual', regression: 1, automated: 0,
      preconditions: 'Atendimento finalizado; acesso à API de conferência.',
      steps: [
        step('Consultar o registro do atendimento finalizado via API', 'O registro é retornado'),
        step('Verificar os dados das abas Subjetivo, Objetivo e Avaliação', 'Os dados salvos correspondem ao preenchido'),
        step('Verificar o plano clínico aplicado', 'Os exames do plano estão persistidos'),
        step('Verificar o status do agendamento', 'O status registrado corresponde ao finalizado ("Atendido")')
      ]
    }
  ];

  for (const c of CASES) {
    const steps = c.steps.map((s, i) => ({ order: i + 1, action: s.action, expected: s.expected }));
    const created = await post('/test-cases', {
      project_id: PROJECT_ID, task_id: TASK_ID,
      scenario_id: ids[c.scen], requirement_id: ids[c.req], strategy_id: ids[c.strat],
      title: c.title, priority: c.priority, type: c.type, execution_mode: c.mode,
      status: 'Pronto', preconditions: c.preconditions, steps,
      regression_relevant: c.regression, automated: c.automated,
      automation_tool: c.automated ? 'Playwright' : '', source: 'manual'
    });
    ids[c.title] = created.id;
    results.cases++;
  }

  // ---------------------------------------------------------------
  // 5) MASSA DE TESTE
  // ---------------------------------------------------------------
  const MASS = [
    // Pacientes (idade/sexo) — usados em vários casos
    { case: 'Estruturar anamnese em texto livre com a IA', mass: [
      { name: 'Paciente masculino 50 anos', purpose: 'Check-up masculino na faixa de PSA',
        data: JSON.stringify({ nome: 'João Carlos Mendes', idade: 50, sexo: 'Masculino', unidade: 'LEVE CLINICA TIJUCA - Rio de Janeiro', especialidade: 'Clínica Médica', medico: 'Dr. Physician', cid: 'I10' }) },
      { name: 'Paciente feminina 45 anos', purpose: 'Check-up feminino na faixa de mamografia/preventivo',
        data: JSON.stringify({ nome: 'Maria Aparecida Souza', idade: 45, sexo: 'Feminino', unidade: 'LEVE CLINICA TIJUCA - Rio de Janeiro', especialidade: 'Clínica Médica', medico: 'Dr. Physician' }) }
    ]},
    { case: 'Validar nome, idade e sexo consistentes em todos os modais', mass: [
      { name: 'Dados do paciente de referência', purpose: 'Conferência de identidade em todos os modais',
        data: JSON.stringify({ nome: 'João Carlos Mendes', idade: 50, sexo: 'Masculino' }) }
    ]},
    { case: 'Estruturar anamnese em texto livre com a IA', mass: [
      { name: 'Anamnese check-up masculina', purpose: 'Gatilho de check-up + estruturação',
        data: 'Paciente de 50 anos, masculino, procura para check-up anual. Refere cefaleia ocasional há 2 meses, intensidade 4/10, sem irradiação. Alergia a dipirona. Em uso contínuo de losartana 50mg 1x/dia. Antecedente de hipertensão arterial.' },
      { name: 'Anamnese sem gatilho', purpose: 'Verificar que não aciona protocolo',
        data: 'Paciente em consulta de rotina para renovação de receita. Sem queixas no momento. Nega alergias. Sem medicamentos de uso contínuo.' }
    ]},
    { case: 'Variações de caixa e digitação de "check-up" acionam o protocolo', mass: [
      { name: 'Variações da palavra-chave', purpose: 'Validação do gatilho em diferentes formatos',
        data: 'check-up | Check-up | CHECK-UP | check up | Check up' }
    ]},
    { case: 'Editar manualmente o texto estruturado antes de aplicar', mass: [
      { name: 'Texto estruturado editável', purpose: 'Validação da revisão humana',
        data: JSON.stringify({ subjetivo: { sintoma: 'Cefaleia', inicio: 'há 2 meses', intensidade: '4/10', irradiacao: 'sem irradiação' }, alergias: ['dipirona'], medicamentos: ['losartana 50mg'], antecedentes: ['hipertensão arterial'] }) }
    ]},
    { case: 'Registrar alergias do paciente', mass: [
      { name: 'Lista de alergias', purpose: 'Preenchimento de múltiplas alergias',
        data: 'Dipirona; Penicilina; Pólen' }
    ]},
    { case: 'Registrar medicamentos em uso contínuo', mass: [
      { name: 'Medicamentos contínuos', purpose: 'Preenchimento de medicação contínua',
        data: 'Losartana 50mg 1x/dia; Metformina 850mg 2x/dia; Sinvastatina 20mg 1x/dia' }
    ]},
    { case: 'Preencher sinais vitais manualmente', mass: [
      { name: 'Sinais vitais padrão', purpose: 'Registro de sinais vitais',
        data: 'PA 120x80 mmHg; FC 72 bpm; FR 16 rpm; Temp 36,5°C; SatO2 98%; Peso 78 kg; Altura 1,75 m; IMC 25,5' }
    ]},
    { case: 'Selecionar CID-10', mass: [
      { name: 'CIDs de referência', purpose: 'Seleção de CID-10 na avaliação',
        data: 'I10 - Hipertensão essencial (primária); E78.5 - Hiperlipidemia não especificada; E11.9 - Diabetes mellitus não-insulino-dependente sem complicações' }
    ]},
    { case: 'Sugerir plano clínico para paciente masculino conforme protocolo', mass: [
      { name: 'Tabela de protocolo masculino (referência)', purpose: 'Conferência dos exames sugeridos',
        data: JSON.stringify({ '40-49 anos': ['Perfil lipídico', 'Glicemia de jejum', 'TSH'], '50-59 anos': ['Perfil lipídico', 'Glicemia de jejum', 'TSH', 'PSA', 'Colonoscopia'], '60+ anos': ['Perfil lipídico', 'Glicemia de jejum', 'TSH', 'PSA', 'Colonoscopia', 'Densitometria óssea'] }) }
    ]},
    { case: 'Sugerir plano clínico para paciente feminino conforme protocolo', mass: [
      { name: 'Tabela de protocolo feminino (referência)', purpose: 'Conferência dos exames sugeridos',
        data: JSON.stringify({ '25-39 anos': ['Preventivo (Papanicolau)', 'Perfil lipídico'], '40-49 anos': ['Preventivo (Papanicolau)', 'Mamografia', 'Perfil lipídico', 'Glicemia de jejum'], '50+ anos': ['Preventivo (Papanicolau)', 'Mamografia', 'Densitometria óssea', 'Perfil lipídico', 'Glicemia de jejum'] }) }
    ]},
    { case: 'Paciente com idade no limite inferior da faixa de exames', mass: [
      { name: 'Idades de fronteira', purpose: 'Teste de valor limite nas faixas etárias',
        data: '39, 40, 41, 49, 50, 51, 59, 60 anos' }
    ]},
    { case: 'Justificativa vazia (0 caracteres) bloqueia o salvamento', mass: [
      { name: 'Justificativas de teste', purpose: 'Validação do mínimo de 12 caracteres',
        data: JSON.stringify({ vazia: '', onze: '12345678901', doze: '123456789012', valida: 'Paciente com indicação clínica para rastreamento anual' }) }
    ]},
    { case: 'Confirmar e aplicar o plano clínico sugerido', mass: [
      { name: 'Plano clínico aplicável', purpose: 'Aplicação do plano sugerido',
        data: JSON.stringify({ exames: ['Perfil lipídico', 'Glicemia de jejum', 'TSH', 'PSA'], justificativas: { PSA: 'Paciente masculino 50 anos com histórico familiar de câncer de próstata' } }) }
    ]},
    { case: 'Conferir a persistência dos dados do atendimento no banco (API)', mass: [
      { name: 'Consulta de conferência (API)', purpose: 'Validação da persistência no banco',
        data: 'GET /api/... registro do atendimento finalizado; conferir subjetivo, objetivo, avaliação, plano e status' }
    ]}
  ];

  for (const m of MASS) {
    const caseId = ids[m.case];
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

  // ---------------------------------------------------------------
  console.log('\n=== Seed GMPTL-141 concluído ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Falha no seed:', err.message);
  process.exit(1);
});
