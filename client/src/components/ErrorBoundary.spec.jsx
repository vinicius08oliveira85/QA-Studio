import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary.jsx';

let consoleSpy;
afterEach(() => consoleSpy?.mockRestore());

function Bomb({ message = 'explodiu' }) {
  throw new Error(message);
}

function Good() {
  return <p>conteúdo ok</p>;
}

describe('ErrorBoundary', () => {
  it('renderiza os children quando não há erro', () => {
    render(<ErrorBoundary><Good /></ErrorBoundary>);
    expect(screen.getByText('conteúdo ok')).toBeInTheDocument();
    expect(screen.queryByText('Algo quebrou na interface')).not.toBeInTheDocument();
  });

  it('captura o erro e exibe a mensagem', () => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByRole('heading', { name: 'Algo quebrou na interface' })).toBeInTheDocument();
    expect(screen.getByText('explodiu')).toBeInTheDocument();
  });

  it('oferece o botão de recarregar', () => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    const btn = screen.getByRole('button', { name: 'Recarregar' });
    expect(btn).toBeInTheDocument();
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});
