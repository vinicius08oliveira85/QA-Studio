import React from 'react';
import { Btn, Field, Input, Modal, Select, Textarea } from './ui.jsx';

/**
 * Modal compartilhado de "Reportar bug".
 * Props:
 *  - form, onChange(patch), onCancel, onSubmit, context (texto do destaque)
 *  - busy?: desabilita botões durante o submit
 *  - requirements?: [{ id, code, title }] — opcional, renderiza seletor de requisito
 */
export default function ReportBugModal({ form, onChange, onCancel, onSubmit, context, requirements, busy }) {
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
      <div className="modal-foot-inline">
        <Btn className="gray" disabled={busy} onClick={onCancel}>Cancelar</Btn>
        <Btn className="danger" disabled={busy} onClick={onSubmit}>{busy ? 'Registrando...' : 'Registrar bug'}</Btn>
      </div>
    </Modal>
  );
}
