import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiModal from './AiModal.jsx';
import { useApp } from '../context.jsx';
import { api } from '../api.js';

vi.mock('../context.jsx', () => ({ useApp: vi.fn() }));

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }
  };
});

function renderModal(props = {}) {
  return render(
    <MemoryRouter>
      <AiModal open onClose={() => {}} initialScope="completo" {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useApp.mockReset();
  api.get.mockReset();
  api.get.mockResolvedValue([]);
});

describe('AiModal', () => {
  it('renderiza o modal com título, escopos e ações', async () => {
    useApp.mockReturnValue({
      current: { id: 1, name: 'Leve' },
      currentTask: { code: 'GMPTL-141', title: 'Validação' },
      taskId: 1
    });
    renderModal();

    expect(await screen.findByText('Gerar conteúdo com IA')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole('button', { name: 'Copiar prompt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configurar chave' })).toBeInTheDocument();
  });

  it('desabilita Gerar com IA sem título/descrição e habilita ao preencher', async () => {
    // Sem currentTask o pré-preenchimento fica vazio → botão desabilitado.
    useApp.mockReturnValue({
      current: { id: 1, name: 'Leve' },
      currentTask: null,
      taskId: 1
    });
    renderModal();

    const generate = await screen.findByRole('button', { name: 'Gerar com IA' });
    expect(generate).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Texto livre/), { target: { value: 'Cadastro de usuário com validações' } });
    expect(generate).toBeEnabled();
  });

  it('mostra erro quando não há tarefa aberta', async () => {
    useApp.mockReturnValue({
      current: { id: 1, name: 'Leve' },
      currentTask: null,
      taskId: 0
    });
    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/Abra uma tarefa primeiro para gerar conteúdo com IA/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Gerar com IA' })).toBeDisabled();
  });

  it('pré-preenche título com código da tarefa', async () => {
    useApp.mockReturnValue({
      current: { id: 1, name: 'Leve' },
      currentTask: { code: 'GMPTL-141', title: 'Validação de Prontuário' },
      taskId: 1
    });
    renderModal();

    const titleInput = await screen.findByLabelText(/Título da funcionalidade/);
    expect(titleInput).toHaveValue('GMPTL-141 — Validação de Prontuário');
  });
});
