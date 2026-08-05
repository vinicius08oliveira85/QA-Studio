import { describe, it, expect } from 'vitest';
import { toneFor, CASE_STATUS, BUG_STATUS, RELEASE_STATUS, PRIORITIES, BADGE_TONES } from './utils.js';

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
