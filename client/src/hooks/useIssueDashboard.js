/**
 * useIssueDashboard — 故障仪表盘核心数据管理 Hook
 *
 * 输入 projectId，一次性加载 4 个聚合接口（summary / di-trend / category-stats / report），
 * 输出完整仪表盘所需数据 + 加载/错误/刷新控制。
 *
 * @param {number|string} projectId - 当前选中的 Mantis 项目 ID
 * @returns {{
 *   stats: {total:number, resolved:number, rate:number}|null,
 *   diTrend: Array<{date:string, di:number}>,
 *   categoryStats: Array<{category:string, count:number}>,
 *   reportText: string,
 *   loading: boolean,
 *   error: string|null,
 *   errorType: string|null,
 *   refresh: () => Promise<void>,
 *   lastUpdated: string|null,
 * }}
 */

import { useState, useEffect, useCallback } from "react";
import api from "../api/client";

export default function useIssueDashboard(projectId) {
  const [stats, setStats] = useState(null);
  const [diTrend, setDiTrend] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [reportText, setReportText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  /** 加载全部仪表盘数据（并行请求） */
  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setErrorType(null);
    try {
      const [summaryRes, diRes, catRes, reportRes] = await Promise.all([
        api.issues.summary(projectId),
        api.issues.diTrend(projectId),
        api.issues.categoryStats(projectId),
        api.issues.report(projectId),
      ]);
      setStats(summaryRes.data);
      setDiTrend(diRes.data || []);
      setCategoryStats(catRes.data || []);
      setReportText(reportRes.data || "");
      setLastUpdated(new Date().toLocaleString("zh-CN"));
    } catch (err) {
      const status = err?.response?.status || err?.status;
      if (status === 401) {
        setErrorType("auth_failed");
        setError("鉴权失败，请检查 Mantis API Token");
      } else if (status === 504 || status === 408) {
        setErrorType("timeout");
        setError("请求超时，请检查网络后重试");
      } else if (status === 502) {
        setErrorType("network");
        setError("网络异常，无法连接 Mantis 服务器");
      } else {
        setErrorType("unknown");
        setError(err.message || "加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  /** 强制刷新：清缓存 → 同步 → 重新加载 */
  const refresh = useCallback(async () => {
    await api.cache.invalidate(projectId);
    await api.mantis.sync(projectId);
    await load();
  }, [projectId, load]);

  useEffect(() => {
    if (projectId) load();
  }, [projectId, load]);

  return {
    stats,
    diTrend,
    categoryStats,
    reportText,
    loading,
    error,
    errorType,
    refresh,
    lastUpdated,
  };
}
