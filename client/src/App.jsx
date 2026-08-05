import React, { useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { AppProvider, useApp } from './context.jsx';
import { Field, Input, Btn, Modal } from './components/ui.jsx';
import { api } from './api.js';

import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Requirements from './pages/Requirements.jsx';
import Strategies from './pages/Strategies.jsx';
import Scenarios from './pages/Scenarios.jsx';
import TestCases from './pages/TestCases.jsx';
import TestMass from './pages/TestMass.jsx';
import Execution from './pages/Execution.jsx';
import Bugs from './pages/Bugs.jsx';
import Retests from './pages/Retests.jsx';
import Regression from './pages/Regression.jsx';
import RegressionDetail from './pages/RegressionDetail.jsx';
import Automations from './pages/Automations.jsx';
import Releases from './pages/Releases.jsx';
import ReleaseDetail from './pages/ReleaseDetail.jsx';

const MENU = [
  {
    section: '1. Análise de Requisitos e Planejamento',
    items: [
      { to: '/requisitos', label: 'Requisitos e Regras de Negócio' },
      { to: '/estrategia', label: 'Estratégia de Teste' }
    ]
  },
  {
    section: '2. Criação de Casos de Teste (Design)',
    items: [
      { to: '/cenarios', label: 'Cenários de Teste' },
      { to: '/casos', label: 'Casos de Teste' },
      { to: '/massa', label: 'Massa de Teste' }
    ]
  },
  {
    section: '3. Execução e Validação',
    items: [
      { to: '/execucao/fumaca', label: 'Teste de Fumaça' },
      { to: '/execucao/funcional', label: 'Funcional (Manual/Automatizado)' },
      { to: '/execucao/api', label: 'Teste de API' }
    ]
  },
  {
    section: '4. Reporte e Acompanhamento de Bugs',
    items: [
      { to: '/bugs', label: 'Documentar Bug' },
      { to: '/reteste', label: 'Reteste' }
    ]
  },
  {
    section: '5. Teste de Regressão e Fechamento',
    items: [
      { to: '/regressao', label: 'Rodar Regressão' },
      { to: '/automacao', label: 'Automatizar Processos Repetitivos' },
      { to: '/homologacao', label: 'Homologação / Liberação' }
    ]
  }
];

function Sidebar() {
  const { projects, current, projectId, setProjectId, refreshProjects } = useApp();
  const [newProject, setNewProject] = useState(false);
  const [name, setName] = useState('');

  const createProject = async () => {
    if (!name.trim()) return;
    const r = await api.post('/projects', { name: name.trim() });
    await refreshProjects();
    setProjectId(r.id);
    setNewProject(false);
    setName('');
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">QA</span>
        <div>
          <strong>QA Studio</strong>
          <small>Gestão de Testes</small>
        </div>
      </div>

      <div className="project-box">
        <label className="project-label">Projeto</label>
        {projects.length > 0 ? (
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span className="muted">Nenhum projeto</span>
        )}
        <button className="btn ghost small full" onClick={() => setNewProject(true)}>+ Novo projeto</button>
      </div>

      <nav className="menu">
        {MENU.map((group) => (
          <div className="menu-group" key={group.section}>
            <div className="menu-section">{group.section}</div>
            {group.items.map((it) => (
              <NavLink key={it.to} to={it.to} className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}>
                {it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <span className="muted">Uso pessoal - dados locais</span>
      </div>

      <Modal open={newProject} onClose={() => setNewProject(false)} title="Novo projeto" width={420}>
        <Field label="Nome do projeto" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Portal Web" onKeyDown={(e) => e.key === 'Enter' && createProject()} />
        </Field>
        <div className="modal-foot-inline">
          <Btn onClick={createProject}>Criar projeto</Btn>
        </div>
      </Modal>
    </aside>
  );
}

function Shell() {
  const { current, projects, loading } = useApp();
  if (loading) return <div className="boot">Carregando...</div>;

  return (
    <div className="layout">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projetos" element={<Projects />} />
          <Route path="/requisitos" element={<Requirements />} />
          <Route path="/estrategia" element={<Strategies />} />
          <Route path="/cenarios" element={<Scenarios />} />
          <Route path="/casos" element={<TestCases />} />
          <Route path="/massa" element={<TestMass />} />
          <Route path="/execucao/fumaca" element={<Execution type="Fumaça" />} />
          <Route path="/execucao/funcional" element={<Execution type="Funcional" />} />
          <Route path="/execucao/api" element={<Execution type="API" />} />
          <Route path="/bugs" element={<Bugs />} />
          <Route path="/reteste" element={<Retests />} />
          <Route path="/regressao" element={<Regression />} />
          <Route path="/regressao/:id" element={<RegressionDetail />} />
          <Route path="/automacao" element={<Automations />} />
          <Route path="/homologacao" element={<Releases />} />
          <Route path="/homologacao/:id" element={<ReleaseDetail />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
