import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportBugModal from './ReportBugModal.jsx';

const form = {
  title: 'Bug no plano',
  severity: 'Alta',
  priority: 'Média',
  environment: 'Homologação',
  description: 'Não abre',
  steps_to_reproduce: '1. clicar',
  expected_result: 'abre',
  actual_result: 'não abre'
};

function renderModal(props = {}) {
  const mocks = {
    onChange: vi.fn(),
    onCancel: vi.fn(),
    onSubmit: vi.fn()
  };
  const view = render(<ReportBugModal form={form} context="" {...mocks} {...props} />);
  return { ...mocks, ...view };
}

describe('ReportBugModal', () => {
  it('não renderiza nada sem form', () => {
    const { container } = render(<ReportBugModal form={null} onChange={vi.fn()} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza o modal com os campos e o contexto', () => {
    renderModal({ context: 'Erro no fluxo de finalização' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Erro no fluxo de finalização')).toBeInTheDocument();
    expect(screen.getByLabelText(/Título/)).toHaveValue('Bug no plano');
    expect(screen.getByLabelText('Severidade')).toHaveValue('Alta');
    expect(screen.getByLabelText('Prioridade')).toHaveValue('Média');
    expect(screen.getByLabelText('Ambiente')).toHaveValue('Homologação');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Não abre');
    expect(screen.getByLabelText('Passos para reproduzir')).toHaveValue('1. clicar');
  });

  it('notifica mudanças de campo com o patch parcial', () => {
    const { onChange } = renderModal();
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'novo título' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'novo título' });
  });

  it('renderiza o seletor de requisito quando requirements é informado', () => {
    renderModal({ requirements: [{ id: 3, code: 'REQ-001', title: 'Acesso' }] });
    expect(screen.getByLabelText('Requisito')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'REQ-001' })).toBeInTheDocument();
  });

  it('envia null no submit quando não há arquivo', () => {
    const { onSubmit } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar bug' }));
    expect(onSubmit).toHaveBeenCalledWith(null);
  });

  it('anexa arquivo e o entrega no submit', () => {
    const { onSubmit, container } = renderModal();
    const file = new File(['x'], 'erro.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [file] } });
    expect(screen.getByText(/erro\.png/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar bug' }));
    expect(onSubmit).toHaveBeenCalledWith(file);
  });

  it('remove o arquivo anexado', () => {
    const { container } = renderModal();
    fireEvent.change(container.querySelector('input[type=file]'), {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.getByText(/Anexar screenshot/)).toBeInTheDocument();
  });

  it('cancela via botão Cancelar', () => {
    const { onCancel, onSubmit } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('desabilita os botões e mostra "Registrando..." durante o submit', () => {
    renderModal({ busy: true });
    expect(screen.getByRole('button', { name: 'Registrando...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });
});
