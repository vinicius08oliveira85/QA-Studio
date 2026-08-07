import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EvidenceGallery from './EvidenceGallery.jsx';
import { Modal } from './ui.jsx';

const files = ['step-1.png', 'step-2.png'];

describe('EvidenceGallery', () => {
  it('não renderiza nada sem arquivos', () => {
    const { container } = render(<EvidenceGallery executionId={1} files={[]} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('abre na primeira evidência com contador e imagem correta', () => {
    render(<EvidenceGallery executionId={5} files={files} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Evidência 1 de 2: step-1.png' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByAltText('Evidência 1: step-1.png')).toHaveAttribute(
      'src', '/api/executions/5/evidence/step-1.png'
    );
  });

  it('arquivo único não mostra botões de navegação', () => {
    render(<EvidenceGallery executionId={5} files={['so.png']} onClose={() => {}} />);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Próxima evidência' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Evidência anterior' })).not.toBeInTheDocument();
  });

  it('navega com os botões ‹ › e faz wrap-around', () => {
    render(<EvidenceGallery executionId={5} files={files} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima evidência' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByAltText('Evidência 2: step-2.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima evidência' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument(); // volta ao início
    fireEvent.click(screen.getByRole('button', { name: 'Evidência anterior' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument(); // wrap para trás
  });

  it('setas do teclado navegam e Esc fecha', () => {
    const onClose = vi.fn();
    render(<EvidenceGallery executionId={5} files={files} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clique no fundo (overlay) fecha; clique no corpo não', () => {
    const onClose = vi.fn();
    const { container } = render(<EvidenceGallery executionId={5} files={files} onClose={onClose} />);
    fireEvent.click(container.querySelector('.lightbox-body'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.lightbox'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc fecha SÓ a galeria, sem derrubar o Modal de trás', () => {
    const onModalClose = vi.fn();
    const onGalClose = vi.fn();
    render(
      <Modal open onClose={onModalClose} title="Execução">
        <EvidenceGallery executionId={5} files={files} onClose={onGalClose} />
      </Modal>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onGalClose).toHaveBeenCalledTimes(1);
    expect(onModalClose).not.toHaveBeenCalled();
  });
});
