import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import { api } from './api.js';

vi.mock('./api.js', async () => {
  const actual = await vi.importActual('./api.js');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn()
    }
  };
});

function renderAt(path) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>
  );
}

describe('Rotas sem projeto', () => {
  beforeEach(() => {
    localStorage.clear();
    api.get.mockImplementation((path) => {
      if (path === '/projects') return Promise.resolve([]);
      if (path === '/settings') {
        return Promise.resolve({ geminiConfigured: false, geminiModel: 'gemini-2.0-flash' });
      }
      return Promise.resolve([]);
    });
  });

  it('abre Configurações sem projeto criado', async () => {
    renderAt('/configuracoes');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    });
    expect(screen.getByText('Nenhum projeto')).toBeInTheDocument();
  });

  it('redireciona rota protegida para /projetos quando não há projeto', async () => {
    renderAt('/tarefas');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Crie seu primeiro projeto/i)).toBeInTheDocument();
  });
});
