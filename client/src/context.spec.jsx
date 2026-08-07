import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AppProvider, useApp } from './context.jsx';
import { api } from './api.js';

vi.mock('./api.js', async () => {
  const actual = await vi.importActual('./api.js');
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }
  };
});

function Probe({ actions }) {
  const ctx = useApp();
  return (
    <div>
      <div data-testid="state">
        {JSON.stringify({
          projectId: ctx.projectId,
          taskId: ctx.taskId,
          loading: ctx.loading,
          err: ctx.connectionError,
          projects: ctx.projects.length,
          tasks: ctx.tasks.length
        })}
      </div>
      {actions?.(ctx)}
    </div>
  );
}

function renderProvider(actions) {
  return render(<AppProvider><Probe actions={actions} /></AppProvider>);
}

function state() {
  return JSON.parse(screen.getByTestId('state').textContent);
}

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset();
});

describe('AppProvider', () => {
  it('carrega projetos e as tarefas do projeto resolvido', async () => {
    api.get.mockImplementation((p) => {
      if (p === '/projects') return Promise.resolve([{ id: 1, name: 'Leve' }]);
      if (p === '/tasks?projectId=1') return Promise.resolve([{ id: 5, code: 'GMPTL-141' }]);
      return Promise.resolve([]);
    });
    renderProvider();
    await waitFor(() => {
      const s = state();
      expect(s.projectId).toBe(1);
      expect(s.tasks).toBe(1);
      expect(s.loading).toBe(false);
    });
  });

  it('mantém a lista anterior e sinaliza erro quando a rede falha', async () => {
    api.get.mockImplementation((p) => {
      if (p === '/projects') return Promise.resolve([{ id: 1, name: 'Leve' }]);
      return Promise.resolve([]);
    });
    renderProvider((ctx) => <button onClick={() => ctx.refreshProjects()}>refresh</button>);
    await waitFor(() => expect(state().projects).toBe(1));

    api.get.mockImplementation(() => Promise.reject(new Error('Servidor fora')));
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(state().err).toBe('Servidor fora'));
    // A falha não zerou a lista (proteção contra perda de dados).
    expect(state().projects).toBe(1);
  });

  it('refreshTasks falho mantém as tarefas anteriores', async () => {
    api.get.mockImplementation((p) => {
      if (p === '/projects') return Promise.resolve([{ id: 1, name: 'A' }]);
      if (p === '/tasks?projectId=1') return Promise.resolve([{ id: 5, code: 'T' }]);
      return Promise.resolve([]);
    });
    // A app chama refreshTasks(pid) com o id resolvido (o efeito interno usa resolvedProjectId).
    renderProvider((ctx) => <button onClick={() => ctx.refreshTasks(1)}>refreshTasks</button>);
    await waitFor(() => expect(state().tasks).toBe(1));

    api.get.mockImplementation((p) => {
      if (p === '/projects') return Promise.resolve([{ id: 1, name: 'A' }]);
      return Promise.reject(new Error('Rede caiu'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'refreshTasks' }));

    await waitFor(() => expect(state().err).toBe('Rede caiu'));
    expect(state().tasks).toBe(1);
  });

  it('setProjectId persiste no localStorage e limpa a tarefa', async () => {
    api.get.mockImplementation((p) => {
      if (p === '/projects') return Promise.resolve([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
      return Promise.resolve([]);
    });
    renderProvider((ctx) => (
      <button onClick={() => ctx.setProjectId(2)}>trocar</button>
    ));
    await waitFor(() => expect(state().projectId).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: 'trocar' }));
    await waitFor(() => expect(state().projectId).toBe(2));
    expect(localStorage.getItem('qa_project')).toBe('2');
    expect(state().taskId).toBe(0);
    expect(api.get).toHaveBeenCalledWith('/tasks?projectId=2');
  });

  it('setTaskId persiste apenas quando o id é válido', async () => {
    api.get.mockResolvedValue([]);
    renderProvider((ctx) => (
      <div>
        <button onClick={() => ctx.setTaskId(9)}>set9</button>
        <button onClick={() => ctx.setTaskId(0)}>set0</button>
      </div>
    ));
    fireEvent.click(screen.getByRole('button', { name: 'set9' }));
    expect(localStorage.getItem('qa_task')).toBe('9');
    fireEvent.click(screen.getByRole('button', { name: 'set0' }));
    expect(localStorage.getItem('qa_task')).toBeNull();
  });

  it('restaura projeto e tarefa do localStorage no boot', async () => {
    localStorage.setItem('qa_project', '3');
    localStorage.setItem('qa_task', '4');
    api.get.mockImplementation((p) => {
      if (p === '/projects') return Promise.resolve([{ id: 3, name: 'P' }]);
      if (p === '/tasks?projectId=3') return Promise.resolve([{ id: 4, code: 'T' }]);
      return Promise.resolve([]);
    });
    renderProvider();
    await waitFor(() => expect(state().projectId).toBe(3));
    expect(state().taskId).toBe(4);
  });
});
