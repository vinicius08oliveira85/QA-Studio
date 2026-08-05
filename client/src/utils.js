export const BADGE_TONES = {
  // verdes (sucesso)
  Passou: 'green', Fechado: 'green', Concluído: 'green', Homologado: 'green', Liberado: 'green',
  Ativo: 'green', Pronto: 'green', Implementado: 'green', Executado: 'green', Corrigido: 'green',
  'Não Reproduzido': 'gray',
  // âmbar (atenção / em andamento)
  'Média': 'amber', 'Em Andamento': 'amber', 'Em Correção': 'amber', 'Em Homologação': 'amber',
  Pendente: 'amber', Aberto: 'amber', Sugerido: 'amber', 'Em Desenvolvimento': 'amber',
  'Em Análise': 'amber',
  // vermelho
  Blocker: 'red', Falhou: 'red', Bloqueado: 'red', 'Alta': 'red', 'Cancelado': 'gray',
  // azul
  'Automatizado': 'blue',
  // cinza
  Baixa: 'gray', Rascunho: 'gray', Rejeitado: 'gray', 'Não Executado': 'gray', Cancelada: 'gray',
  Arquivo: 'gray', 'Manual': 'gray'
};

export const toneFor = (status) => BADGE_TONES[status] || 'gray';

export const PRIORITIES = ['Alta', 'Média', 'Baixa'];
export const REQUIREMENT_STATUS = ['Ativo', 'Em Análise', 'Homologado', 'Cancelado'];
export const CASE_TYPES = ['Funcional', 'API', 'Fumaça', 'Regressão'];
export const EXECUTION_MODES = ['Manual', 'Automatizado'];
export const CASE_STATUS = ['Rascunho', 'Pronto', 'Executado'];
export const EXEC_RESULTS = ['Passou', 'Falhou', 'Bloqueado', 'Não Executado', 'Pendente'];
export const BUG_STATUS = ['Aberto', 'Em Correção', 'Corrigido', 'Rejeitado', 'Fechado'];
export const SEVERITIES = ['Blocker', 'Alta', 'Média', 'Baixa'];
export const RELEASE_STATUS = ['Em Homologação', 'Homologado', 'Liberado', 'Bloqueado'];
export const RUN_STATUS = ['Em Andamento', 'Concluída', 'Cancelada'];
export const AUTOMATION_STATUS = ['Sugerido', 'Em Desenvolvimento', 'Implementado', 'Cancelado'];

export const TYPE_LABELS = {
  'Funcional': 'Funcional',
  'API': 'API',
  'Fumaça': 'Fumaça',
  'Regressão': 'Regressão'
};
