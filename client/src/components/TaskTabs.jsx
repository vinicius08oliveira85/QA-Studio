import React from 'react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'requisitos', label: 'Requisitos' },
  { to: 'estrategia', label: 'Estratégia' },
  { to: 'cenarios', label: 'Cenários' },
  { to: 'casos', label: 'Casos' },
  { to: 'massa', label: 'Massa' },
  { to: 'execucao/fumaca', label: 'Fumaça' },
  { to: 'execucao/funcional', label: 'Funcional' },
  { to: 'execucao/api', label: 'API' },
  { to: 'bugs', label: 'Bugs' },
  { to: 'reteste', label: 'Reteste' },
  { to: 'relatorio', label: 'Relatório' }
];

export default function TaskTabs({ taskId }) {
  if (!taskId) return null;
  const base = `/tarefas/${taskId}`;

  return (
    <nav className="task-tabs" aria-label="Seções da tarefa">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to || 'dashboard'}
          to={tab.to ? `${base}/${tab.to}` : base}
          end={tab.end}
          className={({ isActive }) => `task-tab ${isActive ? 'active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
