/**
 * useDedupRequest — 通用请求去重 Hook
 *
 * 同一 key 的并发请求合并为单次调用，防止重复请求。
 * 适用于同一项目/接口的并发调用场景（如多个组件同时请求同一数据）。
 *
 * @returns {(key: string, fn: () => Promise) => Promise} dedup 函数
 *
 * @example
 *   const dedup = useDedupRequest();
 *   const data = await dedup("issues_project_1", () => api.issues.list({ project_id: 1 }));
 */

import { useRef, useCallback } from "react";

export default function useDedupRequest() {
  const pending = useRef(new Map());

  const dedup = useCallback((key, fn) => {
    if (pending.current.has(key)) {
      return pending.current.get(key);
    }
    const promise = Promise.resolve(fn()).finally(() => {
      pending.current.delete(key);
    });
    pending.current.set(key, promise);
    return promise;
  }, []);

  return dedup;
}
