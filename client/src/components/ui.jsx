import React, { useEffect } from 'react';

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

export function Modal({ open, onClose, title, children, footer, width = 620 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-head">
          <h3>{title}</h3>
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
  const [reload, setReload] = React.useState(0);
  const refresh = React.useCallback(() => setReload((n) => n + 1), []);

  React.useEffect(() => {
    setLoading(true);
    load().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [load, reload]);

  return { items, setItems, loading, refresh, reload };
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
