import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Tasks from './Tasks.jsx';
import { useApp } from '../context.jsx';
import { api, fileToBase64 } from '../api.js';

vi.mock('../context.jsx', () => ({ useApp: vi.fn() }));
vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
    fileToBase64: vi.fn()
  };
});

const TASK = { id: 1, code: 'GMPTL-141', title: 'Prontuário via IA', description: '', status: 'Aberta', priority: 'Média', assignee: '' };

function renderTasks() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Tasks />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  useApp.mockReturnValue({
    current: { id: 1, name: 'Leve' },
    setTaskId: vi.fn(),
    refreshTasks: vi.fn(() => Promise.resolve()),
    tasks: [],
    taskId: 0
  });
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  api.del.mockReset();
  fileToBase64.mockReset();
  fileToBase64.mockResolvedValue('YmFzZTY0');
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

async function openEditModal() {
  api.get.mockImplementation((p) => {
    if (p === '/tasks?projectId=1') return Promise.resolve([TASK]);
    if (p === '/tasks/1/attachments') return Promise.resolve([{ id: 10, filename: 'spec.txt', mime: '' }]);
    return Promise.resolve([]);
  });
  renderTasks();
  await screen.findByRole('button', { name: 'Editar' });
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await screen.findByText('spec.txt');
}

describe('Tasks — anexos da tarefa', () => {
  it('carrega e mostra os anexos ao editar', async () => {
    await openEditModal();
    expect(screen.getByText('spec.txt')).toBeInTheDocument();
    expect(screen.getByText(/Clique para anexar/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/tasks/1/attachments');
  });

  it('colar imagem adiciona anexo pendente e faz o upload ao salvar', async () => {
    api.get.mockImplementation((p) => {
      if (p === '/tasks?projectId=1') return Promise.resolve([TASK]);
      if (p === '/tasks/1/attachments') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    api.post.mockResolvedValue({ id: 5 });

    renderTasks();
    await screen.findByRole('button', { name: '+ Nova tarefa' });
    fireEvent.click(screen.getByRole('button', { name: '+ Nova tarefa' }));
    await screen.findByRole('dialog');

    // Cola uma imagem no campo de descrição (Ctrl+V com item de imagem).
    const pasteFile = new File(['png'], 'colado.png', { type: 'image/png' });
    fireEvent.paste(screen.getByLabelText('Descrição'), {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => pasteFile }] }
    });
    expect(screen.getByText('colado.png')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'Nova tarefa com material' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/tasks', expect.objectContaining({ title: 'Nova tarefa com material' }));
    });
    expect(fileToBase64).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/tasks/5/attachments', expect.objectContaining({
      filename: 'colado.png', data: 'YmFzZTY0', mime: 'image/png'
    }));
  });

  it('remover anexo existente marca para remoção e aplica ao salvar', async () => {
    await openEditModal();

    fireEvent.click(screen.getByRole('button', { name: 'Remover spec.txt' }));
    expect(screen.queryByText('spec.txt')).not.toBeInTheDocument();
    expect(screen.getByText('A remoção é aplicada ao salvar.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.del).toHaveBeenCalledWith('/tasks/attachments/10');
    });
    expect(api.put).toHaveBeenCalledWith('/tasks/1', expect.anything());
  });
});
