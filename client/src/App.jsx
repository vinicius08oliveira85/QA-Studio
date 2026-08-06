import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, Outlet, useParams, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context.jsx';
import { Field, Input, Btn, Modal, Badge, ErrorBanner } from './components/ui.jsx';
import TaskTabs from './components/TaskTabs.jsx';
import { api } from './api.js';
import { toneFor } from './utils.js';

import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Tasks from './pages/Tasks.jsx';
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
import Settings from './pages/Settings.jsx';

const PROJECT_MENU = [
  {
    section: 'Projeto',
    items: [
      { to: '/tarefas', label: 'Tarefas', end: true },
      { to: '/dashboard', label: 'Dashboard' }
    ]
  },
  {
    section: 'Fechamento',
    items: [
      { to: '/regressao', label: 'Regressão' },
      { to: '/automacao', label: 'Automação' },
      { to: '/homologacao', label: 'Homologação' }
    ]
  }
];

function TaskWorkspace() {
  const { taskId: paramId } = useParams();
  const { setTaskId, taskId, tasks, refreshTasks, projectId } = useApp();
  const navigate = useNavigate();
  const id = Number(paramId);
  const checkedRef = React.useRef(false);

  useEffect(() => {
    if (!id) return;
    if (taskId !== id) setTaskId(id);
  }, [id, taskId, setTaskId]);

  useEffect(() => {
    if (!id || !tasks.length) return;
    const found = tasks.find((t) => t.id === id);
    if (found) {
      checkedRef.current = false;
      return;
    }
    if (checkedRef.current) return;
    checkedRef.current = true;
    refreshTasks(projectId).then((list) => {
      if (!list.find((t) => t.id === id)) navigate('/tarefas', { replace: true });
    });
  }, [id, tasks, refreshTasks, projectId, navigate]);

  return (
    <div className="task-workspace">
      <TaskTabs taskId={id} />
      <div className="task-workspace-body">
        <Outlet />
      </div>
    </div>
  );
}

function Sidebar() {
  const {
    projects, current, projectId, setProjectId, refreshProjects,
    currentTask, taskId, setTaskId
  } = useApp();
  const [newProject, setNewProject] = useState(false);
  const [name, setName] = useState('');
  const [projectErr, setProjectErr] = useState('');
  const navigate = useNavigate();
  const inTask = Boolean(taskId);

  const createProject = async () => {
    if (!name.trim()) return;
    setProjectErr('');
    try {
      const r = await api.post('/projects', { name: name.trim() });
      await refreshProjects();
      setProjectId(r.id);
      setNewProject(false);
      setName('');
      navigate('/tarefas');
    } catch (e) {
      setProjectErr(e.message || 'Falha ao criar projeto.');
    }
  };

  const leaveTask = () => {
    setTaskId(0);
    navigate('/tarefas');
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
        <label className="project-label" htmlFor="project-select">Projeto</label>
        {projects.length > 0 ? (
          <select
            id="project-select"
            className="input"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              navigate('/tarefas');
            }}
          >
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span className="muted">Nenhum projeto</span>
        )}
        <button className="btn ghost small full" onClick={() => setNewProject(true)}>+ Projeto</button>
      </div>

      {inTask && (
        <div className="project-box">
          <label className="project-label">Tarefa</label>
          <div className="task-chip">
            <strong>{currentTask?.code || '…'}</strong>
            {currentTask?.status && <Badge tone={toneFor(currentTask.status)}>{currentTask.status}</Badge>}
          </div>
          <button className="btn ghost small full" onClick={leaveTask}>← Tarefas</button>
        </div>
      )}

      {!inTask && (
        <nav className="menu">
          {PROJECT_MENU.map((group) => (
            <div className="menu-group" key={group.section}>
              <div className="menu-section">{group.section}</div>
              {group.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
                >
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      )}

      <div className="sidebar-foot">
        <NavLink to="/configuracoes" className="menu-item foot-link">Configurações</NavLink>
        <span className="muted">Uso pessoal - dados locais</span>
      </div>

      <Modal open={newProject} onClose={() => setNewProject(false)} title="Novo projeto" width={420}>
        {projectErr && <ErrorBanner>{projectErr}</ErrorBanner>}
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

function ConnectionBanner() {
  const { connectionError } = useApp();
  if (!connectionError) return null;
  return (
    <ErrorBanner>
      {connectionError} Seus dados não foram perdidos — o servidor pode estar parado.
      Verifique o terminal do <code>npm start</code> e recarregue a página.
    </ErrorBanner>
  );
}

function Shell() {
  const { current, loading } = useApp();
  if (loading) return <div className="boot">Carregando...</div>;

  if (!current) {
    return (
      <div className="layout">
        <Sidebar />
        <main className="content">
          <ConnectionBanner />
          <Routes>
            <Route path="*" element={<Projects />} />
          </Routes>
        </main>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="content">
        <ConnectionBanner />
        <Routes>
          <Route path="/" element={<Navigate to="/tarefas" replace />} />
          <Route path="/tarefas" element={<Tasks />} />
          <Route path="/dashboard" element={<Dashboard scope="project" />} />
          <Route path="/projetos" element={<Projects />} />

          <Route path="/tarefas/:taskId" element={<TaskWorkspace />}>
            <Route index element={<Dashboard scope="task" />} />
            <Route path="requisitos" element={<Requirements />} />
            <Route path="estrategia" element={<Strategies />} />
            <Route path="cenarios" element={<Scenarios />} />
            <Route path="casos" element={<TestCases />} />
            <Route path="massa" element={<TestMass />} />
            <Route path="execucao/fumaca" element={<Execution type="Fumaça" />} />
            <Route path="execucao/funcional" element={<Execution type="Funcional" />} />
            <Route path="execucao/api" element={<Execution type="API" />} />
            <Route path="bugs" element={<Bugs />} />
            <Route path="reteste" element={<Retests />} />
          </Route>

          <Route path="/regressao" element={<Regression />} />
          <Route path="/regressao/:id" element={<RegressionDetail />} />
          <Route path="/automacao" element={<Automations />} />
          <Route path="/homologacao" element={<Releases />} />
          <Route path="/homologacao/:id" element={<ReleaseDetail />} />
          <Route path="/configuracoes" element={<Settings />} />

          <Route path="/requisitos" element={<Navigate to="/tarefas" replace />} />
          <Route path="/estrategia" element={<Navigate to="/tarefas" replace />} />
          <Route path="/cenarios" element={<Navigate to="/tarefas" replace />} />
          <Route path="/casos" element={<Navigate to="/tarefas" replace />} />
          <Route path="/massa" element={<Navigate to="/tarefas" replace />} />
          <Route path="/bugs" element={<Navigate to="/tarefas" replace />} />
          <Route path="/reteste" element={<Navigate to="/tarefas" replace />} />
          <Route path="/execucao/*" element={<Navigate to="/tarefas" replace />} />
          <Route path="*" element={<Navigate to="/tarefas" replace />} />
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
