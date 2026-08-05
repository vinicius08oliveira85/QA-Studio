import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBanner, Modal, Btn, Field, Empty } from './ui.jsx';

describe('ErrorBanner', () => {
  it('renderiza a mensagem quando há erro', () => {
    render(<ErrorBanner>Ops, falhou</ErrorBanner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Ops, falhou');
  });

  it('não renderiza nada quando vazio', () => {
    const { container } = render(<ErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Btn', () => {
  it('aplica a classe btn e o className extra', () => {
    render(<Btn className="danger">Excluir</Btn>);
    expect(screen.getByRole('button', { name: 'Excluir' }).className).toContain('btn');
    expect(screen.getByRole('button', { name: 'Excluir' }).className).toContain('danger');
  });
});

describe('Field', () => {
  it('renderiza label e marca obrigatório', () => {
    render(<Field label="Nome" required><input /></Field>);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

describe('Empty', () => {
  it('renderiza o default message', () => {
    render(<Empty />);
    expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('não renderiza quando fechado', () => {
    const { container } = render(<Modal open={false} onClose={() => {}} title="T">x</Modal>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza título e children quando aberto', () => {
    render(<Modal open onClose={() => {}} title="Novo projeto"><p>conteúdo</p></Modal>);
    expect(screen.getByText('Novo projeto')).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('chama onClose no Escape', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">x</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('chama onClose no clique no overlay', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">x</Modal>);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalled();
  });
});
