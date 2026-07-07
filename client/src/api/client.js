const BASE = "/api";

async function request(url, options = {}) {
  const res = await fetch(BASE + url, { headers: { "Content-Type": "application/json", ...options.headers }, ...options });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "请求失败");
  return json;
}

export const api = {
  // 项目管理
  projects: {
    list: (params) => request(`/projects?${new URLSearchParams(params)}`),
    create: (data) => request("/projects", { method: "POST", body: JSON.stringify(data) }),
    get: (id) => request(`/projects/${id}`),
    update: (id, data) => request(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    archive: (id) => request(`/projects/${id}`, { method: "DELETE" }),
  },
  templates: {
    list: () => request("/templates"),
  },
  phases: {
    list: (projectId) => request(`/projects/${projectId}/phases`),
    update: (projectId, phaseId, data) => request(`/projects/${projectId}/phases/${phaseId}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  // 待办任务
  tasks: {
    list: (params) => request(`/tasks?${new URLSearchParams(params)}`),
    create: (data) => request("/tasks", { method: "POST", body: JSON.stringify(data) }),
    get: (id) => request(`/tasks/${id}`),
    update: (id, data) => request(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/tasks/${id}`, { method: "DELETE" }),
    batch: (data) => request("/tasks/batch", { method: "PUT", body: JSON.stringify(data) }),
    overdue: () => request("/tasks/overdue"),
  },
  kanban: {
    columns: () => request("/kanban-columns"),
    updateColumns: (data) => request("/kanban-columns", { method: "PUT", body: JSON.stringify(data) }),
  },
  // 故障管理
  issues: {
    list: (params) => request(`/issues?${new URLSearchParams(params)}`),
    create: (data) => request("/issues", { method: "POST", body: JSON.stringify(data) }),
    get: (id) => request(`/issues/${id}`),
    update: (id, data) => request(`/issues/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    diSummary: (projectId) => request(`/issues/di-summary?project_id=${projectId}`),
  },
  // 物料管理
  materials: {
    list: (params) => request(`/materials?${new URLSearchParams(params)}`),
    create: (data) => request("/materials", { method: "POST", body: JSON.stringify(data) }),
    get: (id) => request(`/materials/${id}`),
    update: (id, data) => request(`/materials/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/materials/${id}`, { method: "DELETE" }),
    batch: (data) => request("/materials/batch", { method: "POST", body: JSON.stringify(data) }),
    overdue: () => request("/materials/overdue"),
    stats: () => request("/materials/stats"),
  },
  // 会议纪要
  meetings: {
    list: (params) => request(`/meetings?${new URLSearchParams(params)}`),
    create: (data) => request("/meetings", { method: "POST", body: JSON.stringify(data) }),
    get: (id) => request(`/meetings/${id}`),
    update: (id, data) => request(`/meetings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    addActionItem: (id, data) => request(`/meetings/${id}/action-items`, { method: "POST", body: JSON.stringify(data) }),
    updateActionItem: (id, aid, data) => request(`/meetings/${id}/action-items/${aid}`, { method: "PUT", body: JSON.stringify(data) }),
    convertToTask: (id, aid) => request(`/meetings/${id}/action-items/${aid}/convert`, { method: "POST" }),
  },
  // 周报
  weeklyReports: {
    generate: (data) => request("/weekly-reports/generate", { method: "POST", body: JSON.stringify(data) }),
    list: (params) => request(`/weekly-reports?${new URLSearchParams(params)}`),
    get: (id) => request(`/weekly-reports/${id}`),
    update: (id, data) => request(`/weekly-reports/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
};

export default api;
