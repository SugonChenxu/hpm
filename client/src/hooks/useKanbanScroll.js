import { useCallback, useRef } from "react";

/**
 * 滚动位置保持 hook
 *
 * 核心模式：操作前 capture(containerRef) → 乐观更新 → restore(containerRef, saved)
 *
 * @returns {{ capture, restore }}
 *
 * 用法：
 *   const { capture, restore } = useKanbanScroll();
 *   const saved = capture(containerRef);
 *   await doOptimisticUpdate();
 *   restore(containerRef, saved);
 */
export default function useKanbanScroll() {
  const savedRef = useRef(null);

  /**
   * 记录当前容器的 scrollTop
   * @param {React.RefObject} containerRef
   * @returns {number|null}
   */
  const capture = useCallback((containerRef) => {
    if (containerRef && containerRef.current) {
      const top = containerRef.current.scrollTop;
      savedRef.current = top;
      return top;
    }
    return null;
  }, []);

  /**
   * 恢复滚动位置
   * @param {React.RefObject} containerRef
   * @param {number} [savedTop] - 可选，使用指定的值；不传则使用上次 capture 的值
   */
  const restore = useCallback((containerRef, savedTop) => {
    const top = savedTop !== undefined ? savedTop : savedRef.current;
    if (top != null && containerRef && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = top;
        }
      });
    }
  }, []);

  return { capture, restore };
}
