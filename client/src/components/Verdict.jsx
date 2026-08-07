import React, { useState } from 'react';
import { parseEvidenceList, parseResultado } from '../utils.js';
import EvidenceGallery from './EvidenceGallery.jsx';
import { IconCheck, IconX, IconPause, IconMinus, IconImage } from './Icon.jsx';

const VERDICT_ICON = {
  APROVADO: IconCheck,
  REPROVADO: IconX,
  BLOQUEADO: IconPause,
  PENDENTE: IconMinus
};

const VERDICT_CLASS = {
  APROVADO: 'ok',
  REPROVADO: 'fail',
  BLOQUEADO: 'block',
  PENDENTE: 'pend'
};

/**
 * Selo de veredito do Resultado Obtido (APROVADO/REPROVADO/BLOQUEADO).
 * Sem veredito reconhecido, renderiza apenas a etiqueta neutra.
 */
export function VerdictStamp({ text, size = 'md' }) {
  const cls = VERDICT_CLASS[text] || 'none';
  const VIcon = VERDICT_ICON[text];
  return (
    <span className={`verdict-stamp ${cls} ${size}`} aria-label={`Veredito: ${text || 'sem veredito'}`}>
      <span className="verdict-stamp-icon" aria-hidden="true">{VIcon ? <VIcon size={11} /> : '·'}</span>
      {text || 'SEM VEREDITO'}
    </span>
  );
}

/**
 * Resultado Obtido como LOG de execução: cabeçalho [AMBIENTE data | URL],
 * selo de veredito, narrativa em fonte mono, e seções Obs./Evidencia.
 * Passando executionId, os arquivos da seção Evidencia viram chips clicáveis
 * que abrem a galeria lightbox (EvidenceGallery).
 */
export default function Verdict({ text, compact = false, executionId }) {
  const r = parseResultado(text);
  const [gallery, setGallery] = useState(null);
  if (!text) return null;
  const files = parseEvidenceList(r.evidencia);
  return (
    <div className={`exec-log ${compact ? 'compact' : 'full'}`} data-veredito={r.veredito || 'none'}>
      {r.env && (
        <div className="verdict-head">
          <span className="verdict-head-env">{r.env}</span>
          {r.data && <span className="verdict-head-data">{r.data}</span>}
          {r.url && <span className="verdict-head-url" title={r.url}>{r.url}</span>}
        </div>
      )}
      {r.veredito && <VerdictStamp text={r.veredito} />}
      {r.narrativa && <div className="verdict-log">{r.narrativa}</div>}
      {r.obs && (
        <div className="verdict-note verdict-note-obs">
          <strong>Obs.:</strong> {r.obs}
        </div>
      )}
      {files.length > 0 ? (
        <div className="verdict-note verdict-note-ev">
          <strong>Evidencia:</strong>
          <div className="evidence-chips">
            {files.map((f, i) => (
              <button
                key={f}
                type="button"
                className="evidence-chip clickable"
                title={`Abrir ${f}`}
                disabled={!executionId}
                onClick={() => setGallery(i)}
              >
                <IconImage size={12} /> {f}
              </button>
            ))}
          </div>
        </div>
      ) : (
        r.evidencia && (
          <div className="verdict-note verdict-note-ev">
            <strong>Evidencia:</strong> {r.evidencia}
          </div>
        )
      )}
      {gallery !== null && executionId && files.length > 0 && (
        <EvidenceGallery executionId={executionId} files={files} onClose={() => setGallery(null)} />
      )}
    </div>
  );
}
