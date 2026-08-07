import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import Dashboard from './Dashboard.jsx';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import {
  renderWithRouter,
  apiRouter,
  fixtureProject,
  fixtureCurrentTask,
  fixtureDashboard,
  fixtureDashboardProject
} from '../test/fixtures.jsx';

vi.mock('../context.jsx', () => ({ useApp: vi.fn() }));
vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }, fileToBase64: vi.fn() };
});

const renderDash = (scope) => renderWithRouter(<Dashboard scope={scope} />);

beforeEach(() => {
  localStorage.clear();
  useApp.mockReset();
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  api.del.mockReset();
});

describe('Dashboard — escopo de tarefa', () => {
  beforeEach(() => {
    useApp.mockReturnValue({ current: fixtureProject, currentTask: fixtureCurrentTask, taskId: 3 });
    api.get.mockImplementation(apiRouter([
      ['/dashboard?taskId=3', fixtureDashboard]
    ]));
  });

  it('renderiza os KPIs com os números do dashboard', async () => {
    renderDash('task');
    expect(await screen.findByText('Requisitos')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // Requisitos
    expect(screen.getByText('10')).toBeInTheDocument(); // Requisitos com casos
    expect(screen.getByText('69')).toBeInTheDocument(); // Casos
    expect(screen.getByText('45%')).toBeInTheDocument(); // Aprovação
    expect(screen.getByText('38')).toBeInTheDocument(); // Regressão
    expect(screen.getAllByText('3').length).toBeGreaterThan(0); // Automatizados
  });

  it('renderiza execuções recentes, cards de estatística e bugs', async () => {
    renderDash('task');
    expect(await screen.findByText('Execuções recentes')).toBeInTheDocument();
    expect(screen.getAllByText('TC-008')).toHaveLength(2);
    expect(screen.getByText('Bugs por severidade')).toBeInTheDocument();
    expect(screen.getByText('Casos por tipo')).toBeInTheDocument();
    expect(screen.getByText('Funcional: 61')).toBeInTheDocument();
    expect(screen.getByText('Casos por modo')).toBeInTheDocument();
    expect(screen.getByText('Bugs recentes')).toBeInTheDocument();
    expect(screen.getByText(/BUG-1/)).toBeInTheDocument();
  });

  it('mostra o painel de requisitos sem casos e o botão IA', async () => {
    renderDash('task');
    expect(await screen.findByText('Requisitos sem casos')).toBeInTheDocument();
    expect(screen.getByText('REQ-2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'IA (completo)' })).toBeInTheDocument();
  });

  it('exibe erro quando a API falha', async () => {
    api.get.mockRejectedValue(new Error('servidor fora do ar'));
    renderDash('task');
    expect(await screen.findByText(/Não foi possível carregar o dashboard/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('servidor fora do ar');
  });
});

describe('Dashboard — escopo de projeto', () => {
  beforeEach(() => {
    useApp.mockReturnValue({ current: fixtureProject, currentTask: null, taskId: 0 });
    api.get.mockImplementation(apiRouter([
      ['/dashboard?projectId=1', fixtureDashboardProject]
    ]));
  });

  it('mostra Tarefas, Releases, Regressões e sem botão IA', async () => {
    renderDash('project');
    expect(await screen.findByText('Tarefas')).toBeInTheDocument();
    expect(screen.getByText('Releases')).toBeInTheDocument();
    expect(screen.getByText('Release 1.0')).toBeInTheDocument();
    expect(screen.getByText('Regressões')).toBeInTheDocument();
    expect(screen.getByText('Regressão final')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'IA (completo)' })).not.toBeInTheDocument();
  });
});
