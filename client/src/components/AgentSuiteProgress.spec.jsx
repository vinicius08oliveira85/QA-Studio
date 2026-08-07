import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentSuiteProgress from './AgentSuiteProgress.jsx';

describe('AgentSuiteProgress', () => {
  it('retorna null quando não há itens', () => {
    const { container } = render(<AgentSuiteProgress items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o resumo do summary quando informado', () => {
    render(<AgentSuiteProgress items={[{ caseId: 1, status: 'Passou', position: 1 }]} summary={{ passed: 3, total: 5 }} />);
    expect(screen.getByText(/3\/5 passou/)).toBeInTheDocument();
  });

  it('calcula concluído/passou a partir dos itens', () => {
    const items = [
      { caseId: 1, code: 'TC-001', status: 'Passou', position: 1 },
      { caseId: 2, code: 'TC-002', status: 'Falhou', position: 2 },
      { caseId: 3, code: 'TC-003', status: 'Executando', position: 3 }
    ];
    render(<AgentSuiteProgress items={items} />);
    expect(screen.getByText(/2\/3 concluído · 1 passou/)).toBeInTheDocument();
  });

  it('ordena os itens por position', () => {
    const items = [
      { caseId: 1, code: 'TC-B', status: 'Passou', position: 2 },
      { caseId: 2, code: 'TC-A', status: 'Passou', position: 1 }
    ];
    render(<AgentSuiteProgress items={items} />);
    const codes = screen.getAllByText(/TC-/).map((el) => el.textContent);
    expect(codes).toEqual(['TC-A', 'TC-B']);
  });

  it('trata skippedByUser como Pulado', () => {
    render(<AgentSuiteProgress items={[{ caseId: 1, status: 'Não Executado', reportStatus: 'skippedByUser' }]} />);
    expect(screen.getByText('Pulado')).toBeInTheDocument();
  });

  it('exibe erro do caso quando presente', () => {
    render(<AgentSuiteProgress items={[{ caseId: 1, code: 'TC-001', status: 'Bloqueado', error: 'SUT_ERROR: tela indisponível' }]} />);
    expect(screen.getByText('SUT_ERROR: tela indisponível')).toBeInTheDocument();
  });

  it('usa fallback "Caso N" quando não há código', () => {
    render(<AgentSuiteProgress items={[{ caseId: 42, status: 'Passou' }]} />);
    expect(screen.getByText('Caso 42')).toBeInTheDocument();
  });
});
