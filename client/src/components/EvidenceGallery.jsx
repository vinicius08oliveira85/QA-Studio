import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { executionEvidenceUrl } from '../api.js';
import { IconChevronLeft, IconChevronRight, IconX } from './Icon.jsx';

/**
 * Galeria lightbox das evidências do Resultado Obtido (step-N.png servidas pelo
 * endpoint /api/executions/:id/evidence/:filename). Fecha com Esc/clique no
 * fundo; navega com setas ←/→ ou botões ‹ ›.
 */
export default function EvidenceGallery({ executionId, files, onClose }) {
  const [index, setIndex] = useState(0);
  const total = files.length;
  // Devolve o foco ao gatilho (chip) ao fechar. O prevFocus é capturado ANTES de
  // focar o botão fechar — autoFocus do React move o foco no commit e roubaria o chip.
  const closeRef = useRef(null);
  const prevFocus = useRef(null);
  useLayoutEffect(() => {
    prevFocus.current = document.activeElement;
    if (closeRef.current) closeRef.current.focus();
    return () => {
      if (prevFocus.current && typeof prevFocus.current.focus === 'function') prevFocus.current.focus();
    };
  }, []);

  const go = useCallback((delta) => {
    setIndex((i) => (i + delta + total) % total);
  }, [total]);

  // Captura ANTES do Modal (que também escuta Escape na janela): com a galeria
  // aberta, Esc/setas fecham/navegam SÓ a galeria, sem derrubar o modal de trás.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.stopImmediatePropagation();
      }
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onClose]);

  if (!total) return null;
  const file = files[index];

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Evidência ${index + 1} de ${total}: ${file}`}
      onClick={onClose}
    >
      <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-top">
          <span className="lightbox-count">
            <span className="lightbox-file mono">{file}</span>
            <span className="lightbox-pos">{index + 1} / {total}</span>
          </span>
          <button type="button" ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Fechar galeria" title="Fechar (Esc)"><IconX size={16} /></button>
        </div>
        <img className="lightbox-img" src={executionEvidenceUrl(executionId, file)} alt={`Evidência ${index + 1}: ${file}`} />
        {total > 1 && (
          <>
            <button
              type="button"
              className="lightbox-nav prev"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label="Evidência anterior"
              title="Anterior (←)"
            ><IconChevronLeft size={20} /></button>
            <button
              type="button"
              className="lightbox-nav next"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label="Próxima evidência"
              title="Próxima (→)"
            ><IconChevronRight size={20} /></button>
          </>
        )}
      </div>
    </div>
  );
}
