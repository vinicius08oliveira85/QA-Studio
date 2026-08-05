import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, fmtDate, fmtDateShort } from './api.js';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('faz GET e retorna o json', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: 1 })
    });
    await expect(api.get('/projects')).resolves.toEqual({ ok: 1 });
    expect(global.fetch).toHaveBeenCalledWith('/api/projects', expect.any(Object));
  });

  it('adiciona x-app-token quando existe', async () => {
    localStorage.setItem('qa_app_token', 'tok123');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await api.get('/projects');
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['x-app-token']).toBe('tok123');
  });

  it('lança Error com a mensagem do servidor quando falha', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ error: 'campo obrigatório' })
    });
    await expect(api.post('/projects', {})).rejects.toThrow('campo obrigatório');
  });

  it('lança Error com statusText quando resposta não é json', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
      json: async () => { throw new Error('não é json'); }
    });
    await expect(api.get('/nada')).rejects.toThrow('Not Found');
  });

  it('usa método e body corretos em POST/PUT/DELETE', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await api.post('/x', { a: 1 });
    expect(global.fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ a: 1 });
    await api.put('/x/1', { b: 2 });
    expect(global.fetch.mock.calls[1][1].method).toBe('PUT');
    await api.del('/x/1');
    expect(global.fetch.mock.calls[2][1].method).toBe('DELETE');
    expect(global.fetch.mock.calls[2][1].body).toBeUndefined();
  });
});

describe('fmtDate', () => {
  it('formata datas ISO', () => {
    expect(fmtDate('2025-01-02T10:30:00')).toMatch(/02\/01\/2025/);
  });

  it('normaliza data sem T', () => {
    expect(fmtDate('2025-01-02 10:30:00')).toMatch(/02\/01\/2025/);
  });

  it('retorna vazio para valores nulos', () => {
    expect(fmtDate(null)).toBe('');
    expect(fmtDate(undefined)).toBe('');
    expect(fmtDate('')).toBe('');
  });

  it('retorna o próprio valor quando a data é inválida', () => {
    expect(fmtDate('não é uma data')).toBe('não é uma data');
  });
});

describe('fmtDateShort', () => {
  it('retorna só a data', () => {
    expect(fmtDateShort('2025-01-02T10:30:00')).toBe('02/01/2025');
  });
});
