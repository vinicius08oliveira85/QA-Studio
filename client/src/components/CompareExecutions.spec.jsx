import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompareExecutions from './CompareExecutions.jsx';

const base = {
  id: 340,
  test_case_id: 27,
  test_case_code: 'TC-003',
  test_case_title: 'Estruturação de anamnese',
  environment: 'Homologação',
  tester: 'QA',
  execution_date: '2026-08-07 14:00:00',
  actual_result: '[HOMOL 07/08/2026 | https://cpm.hom.example] APROVADO. 1. abriu o prontuário 2. aplicou o plano.',
  steps: [
    { id: 1, step_order: 1, action: 'Abrir prontuário', expected: 'Prontuário aberto', actual: 'Prontuário aberto', result: 'Passou' },
    { id: 2, step_order: 2, action: 'Estruturar com IA', expected: 'Dados estruturados', actual: 'IA respondeu', result: 'Passou' }
  ]
};

const execA = base;

const execB = {
  ...base,
  id: 337,
  execution_date: '2026-08-07 13:26:00',
  result: 'Falhou',
  actual_result: '[HOMOL 07/08/2026 | https://cpm.hom.example] REPROVADO. 1. abriu o prontuário 2. IA não respondeu.',
  steps: base.steps.map((s) => (s.step_order === 2
    ? { ...s, actual: 'IA não respondeu', result: 'Falhou' }
    : s))
};

describe('CompareExecutions', () => {
  it('não renderiza sem execuções', () => {
    const { container } = render(<CompareExecutions a={null} b={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra os dois painéis com metadados, resultados e vereditos', () => {
    render(<CompareExecutions a={execA} b={execB} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /TC-003/ })).toBeInTheDocument();
    expect(screen.getByText('Execução A · #340')).toBeInTheDocument();
    expect(screen.getByText('Execução B · #337')).toBeInTheDocument();
    expect(screen.getAllByText('Homologação')).toHaveLength(2);
    expect(screen.getAllByText('Passou').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Falhou').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Veredito: APROVADO')).toBeInTheDocument();
    expect(screen.getByLabelText('Veredito: REPROVADO')).toBeInTheDocument();
  });

  it('mostra o diff do Resultado Obtido com tokens de remoção e adição', () => {
    const { container } = render(<CompareExecutions a={execA} b={execB} onClose={() => {}} />);
    expect(screen.getByText('Narrativa')).toBeInTheDocument();
    const dels = [...container.querySelectorAll('.diff-box .diff-tok.del')].map((t) => t.textContent);
    const adds = [...container.querySelectorAll('.diff-box .diff-tok.add')].map((t) => t.textContent);
    expect(dels).toContain('aplicou');
    expect(adds).toContain('não');
    expect(adds.some((t) => t.includes('respondeu'))).toBe(true); // token 'respondeu.'
  });

  it('marca passos divergentes e alinha A/B com os textos respectivos', () => {
    const { container } = render(<CompareExecutions a={execA} b={execB} onClose={() => {}} />);
    expect(screen.getByText('1 passo(s) divergente(s)')).toBeInTheDocument();
    expect(screen.getAllByText('divergente')).toHaveLength(1); // flag do passo
    // Células A/B do passo divergente: cada lado mostra só o próprio texto
    const divStep = container.querySelector('.compare-step.diverged');
    const cells = [...divStep.querySelectorAll('.compare-step-cell')];
    expect(cells[0].querySelector('.diff-side').textContent.trim()).toBe('IA respondeu');
    expect(cells[1].querySelector('.diff-side').textContent.trim()).toBe('IA não respondeu');
  });

  it('sem divergência nos passos, não mostra flag', () => {
    const identicalB = { ...base, id: 337, result: 'Passou', actual_result: base.actual_result };
    render(<CompareExecutions a={execA} b={identicalB} onClose={() => {}} />);
    expect(screen.queryByText(/divergente/)).not.toBeInTheDocument();
  });

  it('sem formato estruturado, o texto cru cai na Narrativa e é difado', () => {
    const { container } = render(
      <CompareExecutions
        a={{ ...base, id: 340, actual_result: 'apenas uma nota' }}
        b={{ ...base, id: 337, actual_result: 'apenas outra nota' }}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Narrativa')).toBeInTheDocument();
    const dels = [...container.querySelectorAll('.diff-box .diff-tok.del')].map((t) => t.textContent);
    const adds = [...container.querySelectorAll('.diff-box .diff-tok.add')].map((t) => t.textContent);
    expect(dels).toContain('uma');
    expect(adds).toContain('outra');
  });

  it('mostra placeholders quando falta Resultado Obtido ou passos sem registro', () => {
    const emptyA = { ...base, id: 340, actual_result: '', steps: [{ id: 1, step_order: 1, action: 'Passo', expected: 'E', actual: '', result: 'Passou' }] };
    const emptyB = { ...base, id: 337, actual_result: '', steps: [{ id: 1, step_order: 1, action: 'Passo', expected: 'E', actual: '', result: 'Passou' }] };
    render(<CompareExecutions a={emptyA} b={emptyB} onClose={() => {}} />);
    expect(screen.getAllByText('Sem Resultado Obtido.')).toHaveLength(2);
    expect(screen.getAllByText('Sem registro.')).toHaveLength(2);
  });

  it('Esc fecha o modal (onClose)', () => {
    const onClose = vi.fn();
    render(<CompareExecutions a={execA} b={execB} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
