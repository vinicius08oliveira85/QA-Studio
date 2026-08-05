import React, { useState } from 'react';
import { useApp } from '../context.jsx';
import { api } from '../api.js';
import { Btn, Empty, Field, Header, Input, Modal, Textarea, useList } from '../components/ui.jsx';

export default function Projects() {
  const { projects, current, setProjectId, refreshProjects } = useApp();
  const { items, refresh } = useList(api.get.bind(api, '/projects'));

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', system: '' });

  const openCreate = () => { setForm({ name: '', description: '', system: '' }); setCreating(true); };
  const openEdit = (p) => { setForm({ name: p.name, description: p.description, system: p.system }); setEditing(p); };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editing) await api.put('/projects/' + editing.id, { ...form, status: editing.status });
    else await api.post('/projects', form);
    await refreshProjects();
    refresh();
    setCreating(false); setEditing(null);
  };

  const remove = async (p) => {
    if (!window.confirm(`Excluir o projeto "${p.name}" e todos os dados vinculados?`)) return;
    await api.del('/projects/' + p.id);
    await refreshProjects();
    refresh();
  };

  return (
    <div>
      <Header
        title="Projetos"
        subtitle="Cada projeto reúne requisitos, casos de teste, execuções, bugs e releases."
        actions={<Btn onClick={openCreate}>Novo projeto</Btn>}
      />

      {items.length === 0 && (
        <Empty>
          Bem-vindo ao QA Studio! Crie seu primeiro projeto para começar a mapear requisitos,
          desenhar casos de teste e acompanhar a qualidade do produto.
        </Empty>
      )}

      <div className="cards">
        {items.map((p) => (
          <div className="card" key={p.id}>
            <div className="kv"><span className="k">Nome</span><span className="v">{p.name}</span></div>
            <div className="kv"><span className="k">Sistema</span><span className="v">{p.system || '-'}</span></div>
            <div className="kv"><span className="k">Descrição</span><span className="v">{p.description || '-'}</span></div>
            <div className="row-actions mt">
              <Btn className="ghost small" onClick={() => setProjectId(p.id)}>{current?.id === p.id ? 'Projeto atual' : 'Usar projeto'}</Btn>
              <Btn className="ghost small" onClick={() => openEdit(p)}>Editar</Btn>
              <Btn className="danger small" onClick={() => remove(p)}>Excluir</Btn>
            </div>
          </div>
        ))}
      </div>

      <Modal open={creating || editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Editar projeto' : 'Novo projeto'}>
        <Field label="Nome do projeto" required>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Portal Web" />
        </Field>
        <Field label="Sistema / Aplicação">
          <Input value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} placeholder="Ex.: Portal, API, Mobile" />
        </Field>
        <Field label="Descrição">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="modal-foot-inline">
          <Btn onClick={save}>{editing ? 'Salvar' : 'Criar'}</Btn>
        </div>
      </Modal>
    </div>
  );
}
