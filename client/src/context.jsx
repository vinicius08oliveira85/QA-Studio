import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projectId, setProjectIdState] = useState(() => Number(localStorage.getItem('qa_project')) || 0);
  const [taskId, setTaskIdState] = useState(() => Number(localStorage.getItem('qa_task')) || 0);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(() => api.get('/projects').then(setProjects).catch(() => setProjects([])), []);

  const refreshTasks = useCallback((pid) => {
    const id = pid || projectId;
    if (!id) {
      setTasks([]);
      return Promise.resolve([]);
    }
    return api.get('/tasks?projectId=' + id).then((list) => {
      setTasks(list);
      return list;
    }).catch(() => {
      setTasks([]);
      return [];
    });
  }, [projectId]);

  useEffect(() => {
    refreshProjects().finally(() => setLoading(false));
  }, [refreshProjects]);

  // Adota um projeto válido quando o id salvo (localStorage) não existe mais
  // (ex.: banco substituído/restaurado ou projeto excluído). Evita o fallback
  // instável para projects[0] com o estado desatualizado.
  useEffect(() => {
    if (!projects.length) return;
    if (projects.some((p) => p.id === projectId)) return;
    const adopted = projects[0].id;
    setProjectIdState(adopted);
    localStorage.setItem('qa_project', String(adopted));
  }, [projects, projectId]);

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
    loading
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
