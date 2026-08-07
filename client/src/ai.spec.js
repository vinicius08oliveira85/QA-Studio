import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractJson, buildPrompt, clearTaskScope, applyResult } from './ai.js';
import { api } from './api.js';

vi.mock('./api.js', async () => {
  const actual = await vi.importActual('./api.js');
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }
  };
});

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  api.del.mockReset();
});

describe('extractJson', () => {
  it('retorna null para entradas vazias', () => {
    expect(extractJson(null)).toBeNull();
    expect(extractJson(undefined)).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson('   ')).toBeNull();
  });

  it('parseia JSON puro', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parseia JSON dentro de fence ```json', () => {
    const text = '```json\n{ "ok": true }\n```';
    expect(extractJson(text)).toEqual({ ok: true });
  });

  it('parseia JSON dentro de fence sem lang', () => {
    expect(extractJson('```\n{"x":[1,2]}\n```')).toEqual({ x: [1, 2] });
  });

  it('extrai objeto embutido em prosa', () => {
    const text = 'Aqui vai o resultado:\n{ "code": "TC-001", "title": "X" }\nFim.';
    expect(extractJson(text)).toEqual({ code: 'TC-001', title: 'X' });
  });

  it('retorna null para lixo', () => {
    expect(extractJson('nenhum json aqui')).toBeNull();
    expect(extractJson('{ inválido')).toBeNull();
  });
});

describe('buildPrompt', () => {
  const base = { project: { name: 'Leve', system: 'CPM' }, title: 'Prontuário', description: 'Descrição livre', scope: 'requisitos' };

  it('inclui contexto do projeto e escopo requisitos', () => {
    const p = buildPrompt(base);
    expect(p).toContain('- Projeto: Leve');
    expect(p).toContain('- Sistema: CPM');
    expect(p).toContain('Prontuário');
    expect(p).toContain('Gere SOMENTE requisitos e regras de negócio.');
  });

  it('não duplica códigos existentes e usa a sequência', () => {
    const p = buildPrompt({ ...base, existing: { reqCodes: 'REQ-001, REQ-002', scCodes: '(nenhum)', tcCodes: 'TC-001' } });
    expect(p).toContain('REQ-001, REQ-002');
    expect(p).toContain('NÃO duplique');
  });

  it('escopo casos inclui requisitos selecionados e cenários existentes', () => {
    const existing = {
      reqList: [
        { id: 1, code: 'REQ-001', title: 'Acesso', priority: 'Alta', business_rules: [{ category: 'RN', rule: 'Se logado então abre' }] }
      ],
      scnList: [{ id: 2, title: 'Cenário feliz', requirement_id: 1 }],
      reqCodes: 'REQ-001',
      scCodes: '0: Cenário feliz',
      tcCodes: '(nenhum)'
    };
    const p = buildPrompt({ project: { name: 'P' }, scope: 'casos', existing, selectedReqIds: [1] });
    expect(p).toContain('REQ-001 - Acesso');
    expect(p).toContain('Cenários existentes');
    expect(p).toContain('0: Cenário feliz');
    expect(p).toContain('Gere SOMENTE casos de teste e massa de teste');
  });

  it('escopo completo gera todas as seções', () => {
    const p = buildPrompt({ ...base, scope: 'completo' });
    expect(p).toContain('REQUISITOS');
    expect(p).toContain('ESTRATÉGIAS');
    expect(p).toContain('CENÁRIOS');
    expect(p).toContain('CASOS DE TESTE');
    expect(p).toContain('MASSA DE TESTE');
  });

  it('ignora requisições fora dos selectedReqIds', () => {
    const existing = {
      reqList: [
        { id: 1, code: 'REQ-001', title: 'A', business_rules: [] },
        { id: 2, code: 'REQ-002', title: 'B', business_rules: [] }
      ]
    };
    const p = buildPrompt({ project: { name: 'P' }, scope: 'estrategias', existing, selectedReqIds: [2] });
    expect(p).toContain('REQ-002 - B');
    expect(p).not.toContain('REQ-001 - A');
  });
});

describe('clearTaskScope', () => {
  it('não faz nada sem taskId', async () => {
    await clearTaskScope(null, 'casos');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('remove casos do escopo casos', async () => {
    api.get.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    await clearTaskScope(7, 'casos');
    expect(api.get).toHaveBeenCalledWith('/test-cases?taskId=7');
    expect(api.del).toHaveBeenCalledWith('/test-cases/10');
    expect(api.del).toHaveBeenCalledWith('/test-cases/11');
  });

  it('escopo completo limpa as quatro seções', async () => {
    api.get.mockResolvedValue([{ id: 1 }]);
    await clearTaskScope(7, 'completo');
    for (const path of ['/test-cases', '/scenarios', '/strategies', '/requirements']) {
      expect(api.get).toHaveBeenCalledWith(`${path}?taskId=7`);
      expect(api.del).toHaveBeenCalledWith(`${path}/1`);
    }
  });
});

describe('applyResult', () => {
  it('aplica requisitos e regras no escopo requisitos', async () => {
    api.get.mockResolvedValue([]); // clearTaskScope
    api.post.mockResolvedValue({ id: 1 });

    const summary = await applyResult({
      requirements: [
        {
          title: 'R1',
          code: 'REQ-001',
          description: 'desc',
          priority: 'Alta',
          business_rules: [
            { rule: 'Se x então y', category: 'RN' },
            { rule: '', category: '' }
          ]
        }
      ]
    }, { projectId: 9, taskId: 7, scope: 'requisitos', mode: 'replace' });

    expect(api.post).toHaveBeenCalledWith('/requirements', expect.objectContaining({
      project_id: 9, task_id: 7, title: 'R1', priority: 'Alta', status: 'Ativo'
    }));
    expect(api.post).toHaveBeenCalledWith('/requirements/1/business-rules', expect.objectContaining({ rule: 'Se x então y' }));
    expect(summary).toEqual(expect.objectContaining({ requirements: 1, rules: 1 }));
  });

  it('sanitiza prioridade/tipo inválidos com default', async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({ id: 1 });

    await applyResult({
      test_cases: [
        { title: 'TC', code: 'TC-001', priority: 'Crítica', type: 'XYZ', execution_mode: 'Robô', steps: [{ action: 'a' }] }
      ]
    }, { projectId: 9, taskId: 7, scope: 'casos', mode: 'replace', existing: { reqList: [], scnList: [] } });

    const payload = api.post.mock.calls.find(([p]) => p === '/test-cases')[1];
    expect(payload.priority).toBe('Média');
    expect(payload.type).toBe('Funcional');
    expect(payload.execution_mode).toBe('Manual');
  });

  it('escopo casos resolve cenário/requisito e aplica massa', async () => {
    api.get.mockResolvedValue([]);
    const ids = [{ id: 30 }];
    api.post.mockImplementation((path) => {
      if (path === '/test-cases') return Promise.resolve(ids[0]);
      return Promise.resolve({ id: 40 });
    });

    const existing = {
      reqList: [{ id: 10, code: 'REQ-001', title: 'R' }],
      scnList: [{ id: 20, title: 'S', requirement_id: 10 }],
      stratList: [{ id: 50, requirement_id: 10 }]
    };
    const summary = await applyResult({
      test_cases: [
        { scenario_id: 0, requirement_id: 0, title: 'TC', code: 'TC-001', priority: 'Baixa', steps: [{ action: 'a' }, { action: 'b', order: 2 }, { expected: 'só expected' }] }
      ],
      test_mass: [{ test_case_id: 0, name: 'M1', data: 'd', purpose: 'p' }]
    }, { projectId: 9, taskId: 7, scope: 'casos', mode: 'replace', existing });

    const payload = api.post.mock.calls.find(([p]) => p === '/test-cases')[1];
    expect(payload.scenario_id).toBe(20);
    expect(payload.requirement_id).toBe(10);
    expect(payload.strategy_id).toBe(50);
    expect(payload.steps).toHaveLength(2);
    expect(api.post).toHaveBeenCalledWith('/test-cases/30/test-mass', expect.objectContaining({ name: 'M1' }));
    expect(summary).toEqual(expect.objectContaining({ cases: 1, steps: 2, mass: 1 }));
  });

  it('escopo completar atualiza requisitos e substitui regras', async () => {
    // em 'completar' não há clearTaskScope; o primeiro GET é o detail do requisito.
    api.get.mockResolvedValue({ business_rules: [{ id: 1 }] });
    api.put.mockResolvedValue({});
    api.post.mockResolvedValue({ id: 2 });

    const existing = { reqList: [{ id: 10, code: 'REQ-001', title: 'R', priority: 'Média', status: 'Ativo' }] };
    const summary = await applyResult({
      requirements: [{ code: 'REQ-001', priority: 'Alta', status: 'Ativo', description: 'nova', business_rules: [{ rule: 'r1' }] }]
    }, { projectId: 9, taskId: 7, scope: 'completar', existing });

    expect(api.put).toHaveBeenCalledWith('/requirements/10', expect.objectContaining({ priority: 'Alta', description: 'nova' }));
    expect(api.del).toHaveBeenCalledWith('/requirements/business-rules/1');
    expect(api.post).toHaveBeenCalledWith('/requirements/10/business-rules', expect.objectContaining({ rule: 'r1' }));
    expect(summary).toEqual(expect.objectContaining({ requirements: 1, rules: 1 }));
  });

  it('não aplica nada quando o título está ausente', async () => {
    api.get.mockResolvedValue([]);
    const summary = await applyResult({ requirements: [{ title: '' }] }, { projectId: 1, taskId: 2, scope: 'requisitos' });
    expect(api.post).not.toHaveBeenCalled();
    expect(summary.requirements).toBe(0);
  });
});
