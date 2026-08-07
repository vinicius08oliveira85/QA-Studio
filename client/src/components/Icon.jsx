import React from 'react';

/**
 * Conjunto de ícones SVG estruturais do QA Studio (estilo Lucide).
 * Padrão único: viewBox 24, stroke 1.5px, currentColor, sem fill.
 * Sempre aria-hidden — o rótulo acessível vem do texto/aria-label do elemento pai.
 */
function Svg({ size = 16, className = '', children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Arquivo/documento (anexos, evidências não-imagem). */
export const IconFile = (p) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </Svg>
);

/** Clipe de papel (evidência anexada). */
export const IconPaperclip = (p) => (
  <Svg {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Svg>
);

/** Imagem/foto (evidência de screenshot). */
export const IconImage = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </Svg>
);

export const IconChevronRight = (p) => (
  <Svg {...p}>
    <polyline points="9 18 15 12 9 6" />
  </Svg>
);

export const IconChevronLeft = (p) => (
  <Svg {...p}>
    <polyline points="15 18 9 12 15 6" />
  </Svg>
);

/** Fechar (X). */
export const IconX = (p) => (
  <Svg {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

/** Check (veredito aprovado). */
export const IconCheck = (p) => (
  <Svg {...p}>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
);

/** Pausa (veredito bloqueado). */
export const IconPause = (p) => (
  <Svg {...p}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Svg>
);

/** Traço (sem veredito / não executado). */
export const IconMinus = (p) => (
  <Svg {...p}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
);

/** Alerta (!) — parecer não-classificado. */
export const IconAlert = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Svg>
);
