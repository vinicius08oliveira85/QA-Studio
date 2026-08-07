import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import Execution from './Execution.jsx';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import {
  renderWithRouter,
  apiRouter,
  fixtureProject,
  fixtureCurrentTask,
  fixtureCases,
  fixtureExecs,
  fixtureExecutionDetail,
  fixtureCaseDetail,
  manyExecs
} from '../test/fixtures.jsx';

vi.mock('../context.jsx', () => ({ useApp: vi.fn() }));
vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }, fileToBase64: vi.fn() };
});

const renderExec = () => renderWithRouter(<Execution type="Funcional" />);

beforeEach(() => {
  localStorage.clear();
  useApp.mockReturnValue({ current: fixtureProject, currentTask: fixtureCurrentTask, taskId: 3 });
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  api.del.mockReset();
  api.get.mockImplementation(apiRouter([
    ['/test-cases?taskId=3&type=Funcional', fixtureCases],
    ['/executions?taskId=3', fixtureExecs],
    [/^\/test-cases\//, (p) => fixtureCaseDetail(Number(p.split('/')[2]))],
    [/^\/executions\//, (p) => fixtureExecutionDetail(Number(p.split('/')[2]))]
  ]));
});

describe('Execution — tabela de casos', () => {
  it('renderiza os casos com o último resultado', async () => {
    renderExec();
    expect((await screen.findAllByText('TC-001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Acesso ao prontuário').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TC-002').length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith('/test-cases?taskId=3&type=Funcional');
    expect(api.get).toHaveBeenCalledWith('/executions?taskId=3');
  });

  it('abre o modal de execução manual ao clicar em Executar', async () => {
    renderExec();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Executar' }))[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Executar TC-001/)).toBeInTheDocument();
  });

  it('registra a execução manual via API', async () => {
    api.post.mockResolvedValue({ id: 999 });
    renderExec();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Executar' }))[0]);
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Resultado Obtido'), { target: { value: 'APROVADO. fluxo completo ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar execução' }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/executions', expect.objectContaining({
        project_id: 1,
        task_id: 3,
        test_case_id: 27,
        result: 'Passou',
        actual_result: 'APROVADO. fluxo completo ok'
      }));
    });
  });
});

describe('Execution — histórico com filtros e paginação', () => {
  it('filtra por resultado e mostra o contador', async () => {
    renderExec();
    expect(await screen.findByText('Histórico de execução (3)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrar por resultado'), { target: { value: 'Falhou' } });
    expect(screen.getByText('Histórico de execução (1 de 3)')).toBeInTheDocument();
    expect(screen.getByText('quebrou')).toBeInTheDocument(); // narrativa do Resultado Obtido
    expect(screen.getByText('REPROVADO')).toBeInTheDocument(); // selo de veredito
    // Limpa os filtros
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Histórico de execução (3)')).toBeInTheDocument();
  });

  it('filtra por ambiente', async () => {
    renderExec();
    await screen.findByText('Histórico de execução (3)');
    fireEvent.change(screen.getByLabelText('Filtrar por ambiente'), { target: { value: 'Produção' } });
    expect(screen.getByText('Histórico de execução (1 de 3)')).toBeInTheDocument();
    expect(screen.queryByText('quebrou')).not.toBeInTheDocument();
  });

  it('filtra por período (hoje)', async () => {
    renderExec();
    await screen.findByText('Histórico de execução (3)');
    fireEvent.change(screen.getByLabelText('Filtrar por período'), { target: { value: 'hoje' } });
    expect(screen.getByText('Histórico de execução (1 de 3)')).toBeInTheDocument();
    expect(screen.getByText('tudo certo')).toBeInTheDocument();
    expect(screen.queryByText('quebrou')).not.toBeInTheDocument();
  });

  it('pagina 25 por página, navega e salta', async () => {
    api.get.mockImplementation(apiRouter([
      ['/test-cases?taskId=3&type=Funcional', fixtureCases],
      ['/executions?taskId=3', manyExecs(30)]
    ]));
    renderExec();
    expect(await screen.findByText('Histórico de execução (30)')).toBeInTheDocument();
    expect(screen.getByText(/1–25 de 30/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima ›' }));
    expect(screen.getByText(/26–30 de 30/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ir para a página'), { target: { value: '1' } });
    expect(screen.getByText(/1–25 de 30/)).toBeInTheDocument();
  });
});

describe('Execution — comparador', () => {
  it('seleciona duas execuções do mesmo caso e abre o diff', async () => {
    renderExec();
    await screen.findByLabelText('Selecionar execução 340 para comparar');
    fireEvent.click(screen.getByLabelText('Selecionar execução 340 para comparar'));
    fireEvent.click(screen.getByLabelText('Selecionar execução 337 para comparar'));
    fireEvent.click(screen.getByRole('button', { name: '⇄ Comparar execuções' }));
    expect(await screen.findByRole('heading', { name: /Comparar execuções — TC-001/ })).toBeInTheDocument();
    expect(screen.getByText('Execução A · #340')).toBeInTheDocument();
    expect(screen.getByText('Execução B · #337')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/executions/340');
    expect(api.get).toHaveBeenCalledWith('/executions/337');
  });

  it('selecionar execução de outro caso reinicia a seleção', async () => {
    renderExec();
    await screen.findByLabelText('Selecionar execução 340 para comparar');
    fireEvent.click(screen.getByLabelText('Selecionar execução 340 para comparar')); // TC-001
    fireEvent.click(screen.getByLabelText('Selecionar execução 336 para comparar')); // TC-002
    expect(screen.getByText('Selecione a 2ª execução do mesmo caso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⇄ Comparar execuções' })).toBeDisabled();
  });
});

describe('Execution — detalhe da execução', () => {
  it('abre o modal Ver com passos executados', async () => {
    renderExec();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Execução de TC-001')).toBeInTheDocument();
    expect(screen.getByText('Abrir prontuário')).toBeInTheDocument();
  });
});
