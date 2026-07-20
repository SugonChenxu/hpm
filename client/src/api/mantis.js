/**
 * Mantis API 命名导出封装层
 *
 * 委托到 client.js 的 api.mantis / api.cache，
 * 方便按需导入和单测 mock。
 */

import api from "./client";

export const fetchProjects = () => api.mantis.projects();

export const watchedProjects = () => api.mantis.watchedProjects();

export const syncIssues = (projectId) => api.mantis.sync(projectId);

export const getConnection = () => api.mantis.connection();

export const updateConnection = (data) => api.mantis.updateConnection(data);

export const invalidateCache = (projectId) => api.cache.invalidate(projectId);
