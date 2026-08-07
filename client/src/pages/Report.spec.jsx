import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Report from './Report.jsx';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { apiRouter, fixtureCurrentTask, fixtureReport, fixtureExecutionDetail } from '../test/fixtures.jsx';

vi.mock('../context.jsx', () => ({ useApp: vi.fn() }));
vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }, fileToBase64: vi.fn() };
});

const renderReport = () => render(<Report />);

beforeEach(() => {
  localStorage.clear();
  useApp.mockReturnValue({ taskId: 3, currentTask: fixtureCurrentTask });
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  api.del.mockReset();
  api.get.mockImplementation(apiRouter([
    ['/reports/task/3', fixtureReport],
    [/^\/executions\//, (p) => fixtureExecutionDetail(Number(p.split('/')[2]))]
  ]));
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

describe('Report', () => {
  it('renderiza o relatório completo com resumo, parecer e tabelas', async () => {
    renderReport();
    expect(await screen.findByText('Relatório')).toBeInTheDocument();
    // Subtítulo + cabeçalho de impressão (h1) contêm a identificação da tarefa
    expect(screen.getAllByText(/GMPTL-141 — Prontuário via IA/).length).toBeGreaterThan(0);
    // Banner de parecer
    expect(screen.getByText('APTO PARA LIBERAÇÃO')).toBeInTheDocument();
    expect(screen.getByText('8 de 10 casos executados')).toBeInTheDocument();
    // Cards do resumo
    expect(screen.getByText('Casos totais')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    // Seções com dados
    expect(screen.getByText('Pontos de atenção (1)')).toBeInTheDocument();
    expect(screen.getByText('Bugs em aberto (1)')).toBeInTheDocument();
    expect(screen.getByText('Cobertura por requisito')).toBeInTheDocument();
    expect(screen.getByText('O que foi testado (1)')).toBeInTheDocument();
    expect(screen.getByText('Execuções recentes (1)')).toBeInTheDocument();
    expect(screen.getAllByText('REQ-1').length).toBeGreaterThan(0);
    expect(screen.getByText('BUG-1')).toBeInTheDocument();
  });

  it('abre o modal de detalhe da execução ao clicar em Detalhes', async () => {
    renderReport();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Detalhes' }))[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Execução de TC-001')).toBeInTheDocument();
    expect(screen.getByText('Abrir prontuário')).toBeInTheDocument();
  });

  it('exporta o relatório em markdown', async () => {
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar .md' }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('botão Atualizar recarrega os dados', async () => {
    renderReport();
    await screen.findByText('APTO PARA LIBERAÇÃO');
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => {
      const calls = api.get.mock.calls.filter(([p]) => p === '/reports/task/3');
      expect(calls.length).toBe(2);
    });
  });

  it('mostra estado vazio quando não há dados', async () => {
    api.get.mockResolvedValue(null);
    renderReport();
    expect(await screen.findByText('Nenhum dado para o relatório.')).toBeInTheDocument();
  });
});
