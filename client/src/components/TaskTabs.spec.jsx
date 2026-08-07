import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskTabs from './TaskTabs.jsx';

const LABELS = [
  'Dashboard', 'Requisitos', 'Estratégia', 'Cenários', 'Casos', 'Massa',
  'Fumaça', 'Funcional', 'API', 'Bugs', 'Reteste', 'Relatório'
];

function renderTabs(taskId) {
  return render(
    <MemoryRouter>
      <TaskTabs taskId={taskId} />
    </MemoryRouter>
  );
}

describe('TaskTabs', () => {
  it('retorna null sem taskId', () => {
    const { container } = renderTabs(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza as 12 abas com os labels corretos', () => {
    renderTabs(7);
    for (const label of LABELS) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('monta as URLs a partir do taskId', () => {
    renderTabs(7);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/tarefas/7');
    expect(screen.getByRole('link', { name: 'Relatório' })).toHaveAttribute('href', '/tarefas/7/relatorio');
    expect(screen.getByRole('link', { name: 'Funcional' })).toHaveAttribute('href', '/tarefas/7/execucao/funcional');
    expect(screen.getByRole('link', { name: 'Bugs' })).toHaveAttribute('href', '/tarefas/7/bugs');
  });
});
