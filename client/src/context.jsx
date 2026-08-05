import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projectId, setProjectIdState] = useState(() => Number(localStorage.getItem('qa_project')) || 0);
  const [taskId, setTaskIdState] = useState(() => Number(localStorage.getItem('qa_task')) || 0);
  const [loading, setLoading] = useState(true);

  const refreshProjects = () => api.get('/projects').then(setProjects).catch(() => setProjects([]));

  const refreshTasks = (pid) => {
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
  };

  useEffect(() => {
    refreshProjects().finally(() => setLoading(false));
  }, []);

  const current = projects.find((p) => p.id === projectId) || projects[0] || null;
  const resolvedProjectId = current ? current.id : 0;

  useEffect(() => {
    if (!resolvedProjectId) {
      setTasks([]);
      return;
    }
    refreshTasks(resolvedProjectId);
  }, [resolvedProjectId]);

  const currentTask = tasks.find((t) => t.id === taskId) || null;

  const setProjectId = (id) => {
    const n = Number(id);
    setProjectIdState(n);
    localStorage.setItem('qa_project', String(n));
    setTaskIdState(0);
    localStorage.removeItem('qa_task');
  };

  const setTaskId = (id) => {
    const n = Number(id) || 0;
    setTaskIdState(n);
    if (n) localStorage.setItem('qa_task', String(n));
    else localStorage.removeItem('qa_task');
  };

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
