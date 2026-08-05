import React, { useEffect, useRef } from 'react';

export function Field({ label, required, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}{required && <em>*</em>}</span>}
      {children}
    </label>
  );
}

export function Input(props) {
  return <input {...props} className={`input ${props.className || ''}`} />;
}

export function Textarea(props) {
  return <textarea {...props} className={`input ${props.className || ''}`} />;
}

export function Select({ children, ...props }) {
  return <select {...props} className={`input ${props.className || ''}`}>{children}</select>;
}

export function Btn({ variant = '', ...props }) {
  return <button {...props} className={`btn ${variant} ${props.className || ''}`} />;
}

export function Badge({ children, tone }) {
  return <span className={`badge ${tone || 'gray'}`}>{children}</span>;
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div className="highlight error-banner" role="alert">
      <strong>Erro:</strong> {children}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 620 }) {
  const ref = useRef(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const f = ref.current?.querySelector('input, select, textarea, button');
      if (f) f.focus();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-labelledby={titleId.current} ref={ref}>
        <div className="modal-head">
          <h3 id={titleId.current}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">&times;</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ children = 'Nenhum registro encontrado.' }) {
  return <div className="empty">{children}</div>;
}

export function Header({ title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Confirm({ onConfirm, message = 'Excluir este registro?' }) {
  if (window.confirm(message)) onConfirm();
}

export function useList(load) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [reload, setReload] = React.useState(0);
  const refresh = React.useCallback(() => setReload((n) => n + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    load().then((data) => { if (!cancelled) setItems(data); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Falha ao carregar dados.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load, reload]);

  return { items, setItems, loading, error, refresh, reload };
}

/** Executa uma mutação async com estado de erro. Retorna [error, run]. */
export function useAction() {
  const [error, setError] = React.useState('');
  const run = React.useCallback(async (fn) => {
    try {
      setError('');
      await fn();
      return true;
    } catch (e) {
      setError(e?.message || 'Falha na operação.');
      return false;
    }
  }, []);
  return [error, run, setError];
}

export function Loading() {
  return <div className="empty">Carregando...</div>;
}

export function Collapse({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={`collapse ${open ? 'open' : ''}`}>
      <button type="button" className="collapse-head" onClick={() => setOpen(!open)}>
        <span className="collapse-title">{title}</span>
        {summary && <span className="collapse-summary">{summary}</span>}
        <span className="collapse-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}
