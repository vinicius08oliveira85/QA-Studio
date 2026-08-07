import React, { useEffect, useRef, useState } from 'react';
import { Btn, Field, Input, Modal, Select, Textarea } from './ui.jsx';
import { IconPaperclip } from './Icon.jsx';

/**
 * Modal compartilhado de "Reportar bug".
 * Props:
 *  - form, onChange(patch), onCancel, onSubmit(file), context (texto do destaque)
 *  - busy?: desabilita botões durante o submit
 *  - requirements?: [{ id, code, title }] — opcional, renderiza seletor de requisito
 * O arquivo de evidência selecionado é entregue no onSubmit(file) — o pai cria o
 * bug e faz o upload (o bug ainda não existe quando o arquivo é escolhido).
 */
export default function ReportBugModal({ form, onChange, onCancel, onSubmit, context, requirements, busy }) {
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);
  const wasOpen = useRef(false);

  // Reseta o arquivo pendente apenas na transição fechado → aberto (o form muda
  // de referência a cada tecla digitada e não pode disparar o reset).
  useEffect(() => {
    const open = !!form;
    if (open && !wasOpen.current) setFile(null);
    wasOpen.current = open;
  }, [form]);

  if (!form) return null;
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  return (
    <Modal open onClose={onCancel} title="Reportar bug" width={720}>
      <div className="highlight">{context}</div>
      <Field label="Título" required><Input value={form.title} onChange={set('title')} /></Field>
      <div className="grid2">
        <Field label="Severidade">
          <Select value={form.severity} onChange={set('severity')}>
            <option>Blocker</option><option>Alta</option><option>Média</option><option>Baixa</option>
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select value={form.priority} onChange={set('priority')}>
            <option>Alta</option><option>Média</option><option>Baixa</option>
          </Select>
        </Field>
      </div>
      <div className="grid2">
        <Field label="Ambiente"><Input value={form.environment} onChange={set('environment')} /></Field>
        {requirements?.length > 0 && (
          <Field label="Requisito">
            <Select value={form.requirement_id || ''} onChange={set('requirement_id')}>
              <option value="">Nenhum</option>
              {requirements.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Descrição"><Textarea value={form.description} onChange={set('description')} /></Field>
      <Field label="Passos para reproduzir"><Textarea className="mono" rows={4} value={form.steps_to_reproduce} onChange={set('steps_to_reproduce')} /></Field>
      <div className="grid2">
        <Field label="Resultado esperado"><Textarea value={form.expected_result} onChange={set('expected_result')} /></Field>
        <Field label="Resultado obtido"><Textarea value={form.actual_result} onChange={set('actual_result')} /></Field>
      </div>
      {file ? (
        <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="small"><IconPaperclip size={12} /> {file.name}</span>
          <Btn className="gray small" onClick={() => setFile(null)}>Remover</Btn>
        </div>
      ) : (
        <div className="evidence-drop" style={{ padding: 10 }} role="button" tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}>
          <span className="small">Anexar screenshot do problema (opcional)</span>
          <input ref={fileRef} type="file" hidden
            accept="image/*,.pdf,.txt,.log,.json,.csv,.html,.xml,.zip"
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      )}
      <div className="modal-foot-inline">
        <Btn className="gray" disabled={busy} onClick={onCancel}>Cancelar</Btn>
        <Btn className="danger" disabled={busy} onClick={() => onSubmit(file)}>{busy ? 'Registrando...' : 'Registrar bug'}</Btn>
      </div>
    </Modal>
  );
}
