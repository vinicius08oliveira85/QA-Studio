export const BADGE_TONES = {
  // verdes (sucesso)
  Passou: 'green', Fechado: 'green', Concluído: 'green', Concluída: 'green', Homologado: 'green', Liberado: 'green',
  Ativo: 'green', Pronto: 'green', Implementado: 'green', Executado: 'green', Corrigido: 'green',
  'Não Reproduzido': 'gray',
  // âmbar (atenção / em andamento)
  'Média': 'amber', 'Em Andamento': 'amber', 'Em Correção': 'amber', 'Em Homologação': 'amber',
  Pendente: 'amber', Aberto: 'amber', Aberta: 'amber', Sugerido: 'amber', 'Em Desenvolvimento': 'amber',
  'Em Análise': 'amber', Executando: 'amber',
  // vermelho
  Blocker: 'red', Falhou: 'red', Bloqueado: 'red', 'Alta': 'red', 'Cancelado': 'gray',
  // azul
  'Automatizado': 'blue',
  // cinza
  Baixa: 'gray', Rascunho: 'gray', Rejeitado: 'gray', 'Não Executado': 'gray', Cancelada: 'gray',
  Arquivo: 'gray', 'Manual': 'gray', Pulado: 'gray'
};

export const TASK_STATUS = ['Aberta', 'Em Andamento', 'Em Homologação', 'Concluída', 'Cancelada'];

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

/**
 * Parseia o Resultado Obtido gravado pelo runner no formato:
 *   [HOMOL 07/08/2026 | https://...] APROVADO. 1. narrativa 2. narrativa Obs.: ... Evidencia: a.png, b.png
 * Retorna { env, data, url, veredito, narrativa, obs, evidencia } (todos strings, vazios se ausentes).
 * Nunca lança: texto sem o formato vira narrativa pura.
 */
export function parseResultado(text) {
  const s = String(text || '').trim();
  if (!s) return { env: '', data: '', url: '', veredito: '', narrativa: '', obs: '', evidencia: '' };
  let rest = s;
  let env = '', data = '', url = '';
  // Cabeçalho: [HOMOL 07/08/2026 | https://...]
  const head = rest.match(/^\[([A-Z]{2,6})\s+(\d{2}\/\d{2}\/\d{4})\s*\|\s*([^\]]+)\]\s*/i);
  if (head) {
    env = head[1].toUpperCase();
    data = head[2];
    url = head[3].trim();
    rest = rest.slice(head[0].length);
  }
  // Veredito: APROVADO / REPROVADO / BLOQUEADO (primeira palavra)
  const ver = rest.match(/^(APROVADO|REPROVADO|BLOQUEADO|PENDENTE)\b[.\s]*/i);
  let veredito = '';
  if (ver) {
    veredito = ver[1].toUpperCase();
    rest = rest.slice(ver[0].length);
  }
  // Seções finais: Obs.: ... e Evidencia: ...
  let obs = '', evidencia = '';
  const ev = rest.match(/\s*Evidencia:\s*([^\n]+)$/i);
  if (ev) {
    evidencia = ev[1].trim();
    rest = rest.slice(0, ev.index);
  }
  const ob = rest.match(/\s*Obs\.?:\s*([^\n]+)$/i);
  if (ob) {
    obs = ob[1].trim();
    rest = rest.slice(0, ob.index);
  }
  return { env, data, url, veredito, narrativa: rest.trim(), obs, evidencia };
}

/**
 * Tokeniza em palavras/separadores preservando o texto original ao juntar.
 */
function tokenize(s) {
  return String(s || '').match(/\S+|\s+/g) || [];
}

/**
 * Diff de palavras entre dois textos (LCS). Retorna a sequência intercalada de
 * tokens, cada um com kind: 'same' (nos dois) | 'del' (só em a) | 'add' (só em b).
 * Textos curtos (narrativas de execução) — DP O(n·m) é suficiente.
 */
export function diffTokens(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length && !tb.length) return [];
  const n = ta.length;
  const m = tb.length;
  // dp[i][j] = tamanho do LCS de ta[i..] e tb[j..]
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      out.push({ t: ta[i], kind: 'same' });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: ta[i], kind: 'del' });
      i++;
    } else {
      out.push({ t: tb[j], kind: 'add' });
      j++;
    }
  }
  while (i < n) out.push({ t: ta[i++], kind: 'del' });
  while (j < m) out.push({ t: tb[j++], kind: 'add' });
  return out;
}

/**
 * Divide o texto da seção "Evidencia:" numa lista de nomes de arquivo
 * (ex.: "step-28-1.png, step-28-2.png." → ["step-28-1.png", "step-28-2.png"]).
 * Tolera separadores por vírgula/ponto-e-vírgula/linha e pontuação final.
 */
export function parseEvidenceList(evidencia) {
  const s = String(evidencia || '').trim();
  if (!s) return [];
  return s
    .split(/[,;\n]/)
    .map((f) => String(f).trim().replace(/[.,;:)\]]+$/, '').trim())
    .filter((f) => /\.(png|jpe?g|gif|webp|bmp|pdf|txt|log|json|csv|html|xml|zip)$/i.test(f));
}
