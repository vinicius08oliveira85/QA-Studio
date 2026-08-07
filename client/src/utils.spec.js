import { describe, it, expect } from 'vitest';
import { toneFor, CASE_STATUS, BUG_STATUS, RELEASE_STATUS, PRIORITIES, BADGE_TONES, parseEvidenceList, parseResultado, diffTokens } from './utils.js';

describe('toneFor', () => {
  it('mapeia status conhecidos para tons', () => {
    expect(toneFor('Passou')).toBe('green');
    expect(toneFor('Falhou')).toBe('red');
    expect(toneFor('Média')).toBe('amber');
    expect(toneFor('Automatizado')).toBe('blue');
  });

  it('retorna gray para status desconhecido', () => {
    expect(toneFor('Status Inexistente')).toBe('gray');
    expect(toneFor(undefined)).toBe('gray');
    expect(toneFor('')).toBe('gray');
  });
});

describe('listas constantes', () => {
  it('contêm valores esperados', () => {
    expect(CASE_STATUS).toEqual(['Rascunho', 'Pronto', 'Executado']);
    expect(BUG_STATUS).toContain('Fechado');
    expect(RELEASE_STATUS).toContain('Liberado');
    expect(PRIORITIES).toEqual(['Alta', 'Média', 'Baixa']);
  });

  it('BADGE_TONES tem entrada para todo status conhecido', () => {
    for (const status of [...CASE_STATUS, ...BUG_STATUS, ...RELEASE_STATUS, ...PRIORITIES]) {
      expect(typeof BADGE_TONES[status], status).toBe('string');
    }
  });
});

describe('parseResultado', () => {
  it('parseia o formato completo do runner', () => {
    const r = parseResultado('[HOMOL 07/08/2026 | https://cpm.hom.levesaude.com.br/atendimento/ambulatorial] APROVADO. 1. selecionou a clínica Clinica medica 2. iniciou o atendimento Obs.: erros de console (2): x Evidencia: step-12-1.png, step-12-2.png.');
    expect(r.env).toBe('HOMOL');
    expect(r.data).toBe('07/08/2026');
    expect(r.url).toContain('cpm.hom.levesaude.com.br');
    expect(r.veredito).toBe('APROVADO');
    expect(r.narrativa).toContain('1. selecionou a clínica');
    expect(r.obs).toContain('erros de console');
    expect(r.evidencia).toContain('step-12-1.png');
  });

  it('não lança e devolve vazios para texto sem formato', () => {
    expect(parseResultado('')).toEqual({ env: '', data: '', url: '', veredito: '', narrativa: '', obs: '', evidencia: '' });
    expect(parseResultado(null)).toEqual({ env: '', data: '', url: '', veredito: '', narrativa: '', obs: '', evidencia: '' });
    const r = parseResultado('apenas uma nota');
    expect(r.narrativa).toBe('apenas uma nota');
    expect(r.veredito).toBe('');
  });

  it('aceita REPROVADO e BLOQUEADO como veredito', () => {
    expect(parseResultado('[DEV 01/01/2026 | x] REPROVADO. passo falhou').veredito).toBe('REPROVADO');
    expect(parseResultado('BLOQUEADO. infra').veredito).toBe('BLOQUEADO');
  });
});

describe('parseEvidenceList', () => {
  it('divide a seção Evidencia em arquivos, removendo pontuação final', () => {
    expect(parseEvidenceList('step-28-1.png, step-28-2.png, step-28-3.png.')).toEqual([
      'step-28-1.png', 'step-28-2.png', 'step-28-3.png'
    ]);
  });

  it('tolera ponto-e-vírgula e quebras de linha como separadores', () => {
    expect(parseEvidenceList('a.png; b.png\nc.png')).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('ignora texto sem extensão de arquivo', () => {
    expect(parseEvidenceList('sem prints, step-12-1.png')).toEqual(['step-12-1.png']);
    expect(parseEvidenceList('')).toEqual([]);
    expect(parseEvidenceList('   ')).toEqual([]);
    expect(parseEvidenceList(null)).toEqual([]);
  });
});

describe('diffTokens', () => {
  it('textos idênticos viram só tokens same', () => {
    const out = diffTokens('a b c', 'a b c');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((t) => t.kind === 'same')).toBe(true);
    expect(out.map((t) => t.t).join('')).toBe('a b c');
  });

  it('marca remoções (só em a) e adições (só em b)', () => {
    const out = diffTokens('fluiu com sucesso', 'falhou com sucesso');
    expect(out.find((t) => t.kind === 'del').t).toBe('fluiu');
    expect(out.find((t) => t.kind === 'add').t).toBe('falhou');
    // o restante permanece igual
    expect(out.filter((t) => t.kind === 'same').map((t) => t.t).join('')).toBe(' com sucesso');
  });

  it('intercala remoções preservando a ordem do texto original (LCS)', () => {
    const out = diffTokens('a b c', 'a c');
    expect(out.map((t) => t.kind)).toEqual(['same', 'same', 'del', 'del', 'same']);
    expect(out[2].t).toBe('b');
  });

  it('trata textos vazios sem lançar', () => {
    expect(diffTokens('', '')).toEqual([]);
    expect(diffTokens(null, undefined)).toEqual([]);
    expect(diffTokens('x', '')).toEqual([{ t: 'x', kind: 'del' }]);
    expect(diffTokens('', 'x')).toEqual([{ t: 'x', kind: 'add' }]);
  });

  it('um texto prefixo do outro: remove só o excedente', () => {
    const out = diffTokens('a b c', 'a b');
    expect(out.filter((t) => t.kind === 'same').map((t) => t.t).join('')).toBe('a b');
    expect(out.filter((t) => t.kind === 'del').map((t) => t.t).join('')).toBe(' c');
    expect(out.some((t) => t.kind === 'add')).toBe(false);
  });

  it('lida com palavras repetidas sem travar (LCS válido)', () => {
    const out = diffTokens('x x y', 'x y');
    // "x" sobrevive (same), um "x" e o espaço em excesso são removidos
    expect(out.filter((t) => t.kind === 'same').map((t) => t.t).join('')).toBe('x y');
    expect(out.some((t) => t.kind === 'del')).toBe(true);
    expect(out.some((t) => t.kind === 'add')).toBe(false);
  });

  it('é sensível a acentos/caixa (trata como mudança real)', () => {
    const out = diffTokens('coração', 'coracao');
    expect(out.find((t) => t.kind === 'del').t).toBe('coração');
    expect(out.find((t) => t.kind === 'add').t).toBe('coracao');
    const out2 = diffTokens('APROVADO', 'aprovado');
    expect(out2.find((t) => t.kind === 'del').t).toBe('APROVADO');
    expect(out2.find((t) => t.kind === 'add').t).toBe('aprovado');
  });
});
