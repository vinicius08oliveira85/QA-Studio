import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projectId, setProjectIdState] = useState(() => Number(localStorage.getItem('qa_project')) || 0);
  const [taskId, setTaskIdState] = useState(() => Number(localStorage.getItem('qa_task')) || 0);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');

  // Uma falha de rede não pode zerar a lista: isso derruba projeto e tarefa de
  // uma vez e parece perda de dados. Mantém o último estado bom e sinaliza o erro.
  const refreshProjects = useCallback(() => api.get('/projects').then((list) => {
    setProjects(list || []);
    setConnectionError('');
    return list || [];
  }).catch((e) => {
    setConnectionError(e?.message || 'Não foi possível falar com o servidor.');
    return [];
  }), []);

  const refreshTasks = useCallback((pid) => {
    const id = pid || projectId;
    if (!id) {
      setTasks([]);
      return Promise.resolve([]);
    }
    return api.get('/tasks?projectId=' + id).then((list) => {
      setTasks(list || []);
      setConnectionError('');
      return list || [];
    }).catch((e) => {
      setConnectionError(e?.message || 'Não foi possível falar com o servidor.');
      return [];
    });
  }, [projectId]);

  useEffect(() => {
    refreshProjects().finally(() => setLoading(false));
  }, [refreshProjects]);

  const current = projects.find((p) => p.id === projectId) || projects[0] || null;
  const resolvedProjectId = current ? current.id : 0;

  useEffect(() => {
    if (!resolvedProjectId) {
      setTasks([]);
      return;
    }
    refreshTasks(resolvedProjectId);
  }, [resolvedProjectId, refreshTasks]);

  const currentTask = tasks.find((t) => t.id === taskId) || null;

  const setProjectId = useCallback((id) => {
    const n = Number(id);
    setProjectIdState(n);
    localStorage.setItem('qa_project', String(n));
    setTaskIdState(0);
    localStorage.removeItem('qa_task');
  }, []);

  const setTaskId = useCallback((id) => {
    const n = Number(id) || 0;
    setTaskIdState(n);
    if (n) localStorage.setItem('qa_task', String(n));
    else localStorage.removeItem('qa_task');
  }, []);

  const value = {
    projects,
    current,
    projectId: resolvedProjectId,
    setProjectId,
    refreshProjects,
    tasks,
    currentTask,
    taskId,
    setTaskId,
    refreshTasks,
    loading,
    connectionError
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
