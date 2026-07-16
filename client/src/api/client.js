const BASE = "/api";

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
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
    reorder: (orderedIds) => request("/projects/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) }),
    kanbanStats: (projectId) => request(`/projects/${projectId}/kanban-stats`),
  },
  templates: {
    list: () => request("/templates"),
  },
  phases: {
    list: (projectId) => request(`/projects/${projectId}/phases`),
    update: (projectId, phaseId, data) =>
      request(`/projects/${projectId}/phases/${phaseId}`, { method: "PUT", body: JSON.stringify(data) }),
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
    reorder: (id, data) => request(`/tasks/${id}/reorder`, { method: "PUT", body: JSON.stringify(data) }),
    toggleComplete: (id) => request(`/tasks/${id}/toggle-complete`, { method: "PUT" }),
    subtasks: {
      list: (taskId) => request(`/tasks/${taskId}/subtasks`),
      create: (taskId, data) =>
        request(`/tasks/${taskId}/subtasks`, { method: "POST", body: JSON.stringify(data) }),
      update: (id, data) => request(`/subtasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      remove: (id) => request(`/subtasks/${id}`, { method: "DELETE" }),
    },
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
    diTrend: (projectId) => request(`/issues/di-trend?project_id=${projectId}`),
    categoryStats: (projectId, type) => request(`/issues/category-stats?project_id=${projectId}${type ? "&type=" + type : ""}`),
    summary: (projectId) => request(`/issues/summary?project_id=${projectId}`),
    report: (projectId) => request(`/issues/report?project_id=${projectId}`),
  },
  // 物料管理
  materials: {
    list: (params) => request(`/materials?${new URLSearchParams(params)}`),
    create: (data) => request("/materials", { method: "POST", body: JSON.stringify(data) }),
    get: (id) => request(`/materials/${id}`),
    update: (id, data) => request(`/materials/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/materials/${id}`, { method: "DELETE" }),
    batchImport: (data) => request("/materials/batch", { method: "POST", body: JSON.stringify(data) }),
    batchRemove: (data) => request("/materials/batch", { method: "DELETE", body: JSON.stringify(data) }),
    batchUpdateStatus: (data) =>
      request("/materials/batch-status", { method: "PUT", body: JSON.stringify(data) }),
    importSnapshot: (projectId) =>
      request(`/materials/import-snapshot?project_id=${projectId}`),
    importUndo: (projectId) =>
      request("/materials/import-undo", { method: "POST", body: JSON.stringify({ project_id: projectId }) }),
  },
  // 会议纪要
  meetings: {
    list: (params) => request(`/meetings?${new URLSearchParams(params)}`),
    fetch: () => request("/meetings/fetch", { method: "POST" }),
    getMinutes: (id) => request(`/meetings/${id}/minutes`),
    create: (data) => request("/meetings", { method: "POST", body: JSON.stringify(data) }),
    get: (id) => request(`/meetings/${id}`),
    update: (id, data) => request(`/meetings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    addActionItem: (id, data) =>
      request(`/meetings/${id}/action-items`, { method: "POST", body: JSON.stringify(data) }),
    updateActionItem: (id, aid, data) =>
      request(`/meetings/${id}/action-items/${aid}`, { method: "PUT", body: JSON.stringify(data) }),
    convertToTask: (id, aid) => request(`/meetings/${id}/action-items/${aid}/convert`, { method: "POST" }),
  },
  // 周报
  weeklyReports: {
    generate: (data) => request("/weekly-reports/generate", { method: "POST", body: JSON.stringify(data) }),
    list: (params) => request(`/weekly-reports?${new URLSearchParams(params)}`),
    get: (id) => request(`/weekly-reports/${id}`),
    update: (id, data) => request(`/weekly-reports/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  // 排期计划
  schedule: {
    list: (projectId) => request(`/projects/${projectId}/schedule`),
    generate: (projectId, templateName) =>
      request(`/projects/${projectId}/schedule/generate`, {
        method: "POST",
        body: JSON.stringify({ template_name: templateName }),
      }),
    update: (id, data) =>
      request(`/schedule-tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/schedule-tasks/${id}`, { method: "DELETE" }),
    insert: (projectId, data) =>
      request(`/projects/${projectId}/schedule/insert`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    indent: (projectId, taskId) =>
      request(`/projects/${projectId}/schedule/${taskId}/indent`, { method: "PUT" }),
    outdent: (projectId, taskId) =>
      request(`/projects/${projectId}/schedule/${taskId}/outdent`, { method: "PUT" }),
    updatePredecessors: (id, predecessorIds) =>
      request(`/schedule-tasks/${id}/predecessors`, {
        method: "PUT",
        body: JSON.stringify({ predecessor_ids: predecessorIds }),
      }),
    templates: () => request("/templates/schedule"),
    versions: (projectId) => request(`/projects/${projectId}/schedule/versions`),
    saveVersion: (projectId) =>
      request(`/projects/${projectId}/schedule/save`, { method: "POST" }),
    getVersion: (projectId, vid) =>
      request(`/projects/${projectId}/schedule/versions/${vid}`),
    restoreVersion: (projectId, vid) =>
      request(`/projects/${projectId}/schedule/versions/${vid}/restore`, { method: "POST" }),
    exportUrl: (projectId) => `${BASE}/projects/${projectId}/schedule/export`,
  },
  // Mantis 集成
  mantis: {
    projects: () => request("/mantis/projects"),
    sync: (projectId) =>
      request("/mantis/sync", { method: "POST", body: JSON.stringify({ project_id: projectId }) }),
    connection: () => request("/mantis/connection"),
    updateConnection: (data) =>
      request("/mantis/connection", { method: "PUT", body: JSON.stringify(data) }),
  },
  // PLM 连接与只读探针（P0）
  plm: {
    getConnection: () => request("/plm/connection"),
    saveConnection: (data) =>
      request("/plm/connection", { method: "PUT", body: JSON.stringify(data) }),
    probe: (url) =>
      request("/plm/probe", { method: "POST", body: JSON.stringify({ url }) }),
  },
  // 会议计划
  weekMeetings: {
    list: (week) => request(`/week-meetings?week=${week}`),
    create: (data) => request("/week-meetings", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/week-meetings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/week-meetings/${id}`, { method: "DELETE" }),
    meetingOutputs: {
      add: (data) => request("/week-meetings/outputs", { method: "POST", body: JSON.stringify(data) }),
      update: (id, data) => request(`/week-meetings/outputs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      remove: (id) => request(`/week-meetings/outputs/${id}`, { method: "DELETE" }),
    },
  },
  // 缓存管理
  cache: {
    invalidate: (projectId) =>
      request("/cache/invalidate", { method: "POST", body: JSON.stringify({ project_id: projectId }) }),
  },
};

export default api;
