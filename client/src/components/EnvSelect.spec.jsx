import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EnvSelect, { ENVIRONMENTS } from './EnvSelect.jsx';

describe('EnvSelect', () => {
  it('renderiza os ambientes padrão', () => {
    render(<EnvSelect value="Homologação" />);
    for (const env of ENVIRONMENTS) {
      expect(screen.getByRole('option', { name: env })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('option')).toHaveLength(ENVIRONMENTS.length);
  });

  it('adiciona o valor atual quando não está na lista', () => {
    render(<EnvSelect value="Customizado" />);
    expect(screen.getByRole('option', { name: 'Customizado' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(ENVIRONMENTS.length + 1);
  });

  it('propaga value e onChange para o select', () => {
    const onChange = vi.fn();
    const { rerender } = render(<EnvSelect value="Produção" onChange={onChange} />);
    expect(screen.getByRole('combobox')).toHaveValue('Produção');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Local' } });
    expect(onChange).toHaveBeenCalledTimes(1);

    // Select controlado: o valor reflete quando o pai atualiza o prop.
    rerender(<EnvSelect value="Local" onChange={onChange} />);
    expect(screen.getByRole('combobox')).toHaveValue('Local');
  });
});
