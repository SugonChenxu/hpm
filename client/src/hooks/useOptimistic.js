import { useState, useCallback, useRef } from "react";

/**
 * 乐观更新通用 hook
 *
 * 核心模式：先改本地状态（即时反馈）→ 发 API → 失败时回滚
 *
 * @param {*} initialData - 初始数据
 * @returns {{ data, setOptimistic, error, isPending, setData }}
 *
 * 用法：
 *   const { data, setOptimistic, isPending } = useOptimistic(tasks);
 *   await setOptimistic(
 *     (prev) => prev.filter(t => t.id !== deletedId),
 *     () => api.tasks.remove(deletedId)
 *   );
 */
export default function useOptimistic(initialData) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const snapshotRef = useRef(null);

  /**
   * 执行乐观更新
   * @param {Function} optimisticUpdater - (prevData) => newData，同步更新本地状态
   * @param {Function} apiCall - () => Promise，异步 API 调用
   * @returns {Promise} API 调用结果
   */
  const setOptimistic = useCallback(async (optimisticUpdater, apiCall) => {
    // 1. 保存快照
    setData((prev) => {
      snapshotRef.current = prev;
      return prev;
    });

    // 2. 乐观更新
    setData((prev) => optimisticUpdater(prev));

    setIsPending(true);
    setError(null);

    try {
      // 3. API 调用
      const result = await apiCall();
      setIsPending(false);
      // 用服务端返回的真实数据更新（如果 API 返回了新数据）
      if (result && result.data) {
        // 对于列表操作，保留乐观更新的顺序
        // 对于单项操作，可以信任服务端数据
      }
      return result;
    } catch (err) {
      // 4. 回滚
      setIsPending(false);
      setError(err);
      if (snapshotRef.current !== null) {
        setData(snapshotRef.current);
      }
      throw err;
    }
  }, []);

  return { data, setData, setOptimistic, error, isPending };
}
