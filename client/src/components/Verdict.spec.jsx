import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Verdict, { VerdictStamp } from './Verdict.jsx';

describe('VerdictStamp', () => {
  it('mostra o veredito reconhecido com o ícone SVG', () => {
    render(<VerdictStamp text="APROVADO" />);
    const stamp = screen.getByLabelText('Veredito: APROVADO');
    expect(stamp).toHaveTextContent('APROVADO');
    expect(stamp.querySelector('.verdict-stamp-icon svg')).toBeInTheDocument();
  });

  it('mostra SEM VEREDITO para texto vazio', () => {
    render(<VerdictStamp text="" />);
    expect(screen.getByText('SEM VEREDITO')).toBeInTheDocument();
  });
});

describe('Verdict', () => {
  it('não renderiza nada sem texto', () => {
    const { container } = render(<Verdict text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza o formato completo [AMBIENTE data | URL] APROVADO', () => {
    render(<Verdict text="[HOMOL 07/08/2026 | https://cpm.hom.example/atendimento] APROVADO. 1. iniciou o atendimento Obs.: sem ressalvas Evidencia: step-1.png." />);
    expect(screen.getByText('HOMOL')).toBeInTheDocument();
    expect(screen.getByText('07/08/2026')).toBeInTheDocument();
    expect(screen.getByText('https://cpm.hom.example/atendimento')).toBeInTheDocument();
    expect(screen.getByText(/iniciou o atendimento/)).toBeInTheDocument();
    expect(screen.getByText('sem ressalvas')).toBeInTheDocument();
    expect(screen.getByText(/step-1\.png/)).toBeInTheDocument();
  });

  it('narrativa sem veredito aparece UMA única vez (sem duplicar)', () => {
    const { container } = render(<Verdict text="apenas uma nota de execução" />);
    expect(container.querySelectorAll('.verdict-log')).toHaveLength(1);
    expect(screen.getByText('apenas uma nota de execução')).toBeInTheDocument();
  });

  it('chips de evidência ficam desabilitados sem executionId', () => {
    render(<Verdict text="APROVADO. ok Evidencia: a.png, b.png." />);
    const chips = screen.getAllByRole('button', { name: /\.png/ });
    expect(chips).toHaveLength(2);
    expect(chips[0]).toBeDisabled();
  });

  it('com executionId, clicar no chip abre a galeria lightbox', () => {
    render(<Verdict text="APROVADO. ok Evidencia: a.png, b.png." executionId={7} />);
    fireEvent.click(screen.getByRole('button', { name: /a\.png/ }));
    expect(screen.getByRole('dialog', { name: /Evidência 1 de 2/ })).toBeInTheDocument();
    expect(screen.getByAltText('Evidência 1: a.png')).toHaveAttribute(
      'src', '/api/executions/7/evidence/a.png'
    );
  });

  it('Evidencia sem arquivo parseável vira texto simples (fallback)', () => {
    const { container } = render(<Verdict text="APROVADO. ok Evidencia: sem prints na pasta." />);
    expect(container.querySelector('.verdict-note-ev')).toHaveTextContent('sem prints na pasta.');
    expect(container.querySelector('.evidence-chip')).not.toBeInTheDocument();
  });

  it('modo compact limita a narrativa (classe compact)', () => {
    const { container } = render(<Verdict text="APROVADO. texto longo" compact />);
    expect(container.querySelector('.exec-log')).toHaveClass('compact');
  });
});
