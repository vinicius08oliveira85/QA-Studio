import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectIdState] = useState(() => Number(localStorage.getItem('qa_project')) || 0);
  const [loading, setLoading] = useState(true);

  const refreshProjects = () => api.get('/projects').then(setProjects).catch(() => {});

  useEffect(() => {
    refreshProjects().finally(() => setLoading(false));
  }, []);

  const current = projects.find((p) => p.id === projectId) || projects[0] || null;

  const setProjectId = (id) => {
    setProjectIdState(Number(id));
    localStorage.setItem('qa_project', String(id));
  };

  const value = {
    projects,
    current,
    projectId: current ? current.id : 0,
    setProjectId,
    refreshProjects,
    loading
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
