import dayjs from "dayjs";

/**
 * 排期日期工具函数
 * 所有日期计算基于 dayjs，输出 ISO 日期字符串 YYYY-MM-DD
 *
 * 日期约定：开始日期 + N 天工期 = 结束日期
 * 例：21 日开始，工期 5 天 → 结束 = 26 日
 *     addDays("2026-07-21", 5) → "2026-07-26"
 */

/** 格式化日期为 YYYY-MM-DD */
export function fmtDate(d) {
  return dayjs(d).format("YYYY-MM-DD");
}

/** 从日期字符串创建 dayjs 对象（取当天零点） */
export function toDayjs(dateStr) {
  return dayjs(dateStr).startOf("day");
}

/** 日期加 N 天 */
export function addDays(dateStr, days) {
  return dayjs(dateStr).add(days, "day").format("YYYY-MM-DD");
}

/** 两个日期之间的天数差（end - start），不含首日 */
export function daysBetween(startStr, endStr) {
  return dayjs(endStr).diff(dayjs(startStr), "day");
}

/**
 * 修改开始日期 → 结束日期 = 新开始 + 工期
 * 例：start=21, duration=5 → end=26
 */
export function updateStartDate(task, newStart) {
  const duration = task.duration_days || 1;
  return {
    ...task,
    planned_start: newStart,
    planned_end: addDays(newStart, duration),
  };
}

/**
 * 修改结束日期 → 工期 = 新结束 - 开始日期
 * 例：start=21, newEnd=26 → duration=5
 */
export function updateEndDate(task, newEnd) {
  const start = task.planned_start;
  const duration = Math.max(1, daysBetween(start, newEnd));
  return {
    ...task,
    planned_end: newEnd,
    duration_days: duration,
  };
}

/**
 * 修改工期 → 结束日期 = 开始日期 + 新工期
 * 例：start=21, newDuration=5 → end=26
 */
export function updateDuration(task, newDuration) {
  const dur = Math.max(1, Number(newDuration));
  return {
    ...task,
    duration_days: dur,
    planned_end: addDays(task.planned_start, dur),
  };
}

/**
 * 计算当前任务的开始日期——基于所有前置任务的最晚结束日期 + 1
 */
export function calcStartFromPredecessors(task, allTasks) {
  let preds = [];
  try {
    preds = JSON.parse(task.predecessor_ids || "[]");
  } catch {
    preds = [];
  }

  if (preds.length === 0) return task.planned_start;

  const predEnds = preds
    .map((pid) => allTasks.find((t) => t.id === pid))
    .filter(Boolean)
    .map((p) => p.planned_end)
    .filter(Boolean);

  if (predEnds.length === 0) return task.planned_start;

  const maxEnd = predEnds.sort().reverse()[0];
  return addDays(maxEnd, 1);
}

/**
 * 递归传播日期变更
 * 从 changedTaskId 开始，找到所有以它为前置的后置任务，
 * 重新计算它们的开始日期（基于所有前置的最大结束 + 1），
 * 并继续递归传播
 */
export function propagateChanges(tasks, changedTaskId) {
  const taskMap = new Map(tasks.map((t) => [t.id, { ...t }]));
  const affected = new Set();
  const queue = [changedTaskId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const [tid, t] of taskMap) {
      if (affected.has(tid)) continue;
      if (t.is_locked === 1 || t.task_type === "节点任务") continue;

      let preds = [];
      try {
        preds = JSON.parse(t.predecessor_ids || "[]");
      } catch {
        preds = [];
      }

      if (preds.includes(currentId)) {
        affected.add(tid);
        queue.push(tid);
      }
    }
  }

  // 对受影响的任务重新计算日期
  for (const tid of affected) {
    const t = taskMap.get(tid);
    if (!t || t.is_locked === 1 || t.task_type === "节点任务") continue;

    const newStart = calcStartFromPredecessors(t, [...taskMap.values()]);
    if (newStart !== t.planned_start) {
      t.planned_start = newStart;
      t.planned_end = addDays(newStart, t.duration_days || 1);
    }
  }

  // 重新计算阶段聚合
  recalcPhaseAggregation(taskMap);

  return [...taskMap.values()].sort((a, b) => a.task_order - b.task_order);
}

/**
 * 重新计算所有阶段任务的聚合日期
 * 使用树形结构：阶段任务的 start = MIN(所有子孙任务的 start)
 *              阶段任务的 end   = MAX(所有子孙任务的 end)
 */
export function recalcPhaseAggregation(taskMap) {
  const tasks = [...taskMap.values()].sort(
    (a, b) => a.task_order - b.task_order
  );

  // 构建 parent_id → children 映射
  const childrenMap = new Map();
  for (const t of tasks) {
    const pid = t.parent_id || 0;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(t);
  }

  for (const task of tasks) {
    if (task.task_type === "阶段任务") {
      const { minStart, maxEnd } = collectDescendantDates(
        task.id, childrenMap, new Set()
      );
      if (minStart) {
        task.planned_start = minStart;
      }
      if (maxEnd) {
        task.planned_end = maxEnd;
        task.duration_days = Math.max(1, daysBetween(task.planned_start, task.planned_end));
      }
    }
  }
}

/** 递归收集某任务的子孙日期极值 */
function collectDescendantDates(taskId, childrenMap, visited) {
  if (visited.has(taskId)) return { minStart: null, maxEnd: null };
  visited.add(taskId);

  const children = childrenMap.get(taskId) || [];
  let minStart = null;
  let maxEnd = null;

  for (const child of children) {
    if (child.planned_start && (!minStart || child.planned_start < minStart)) {
      minStart = child.planned_start;
    }
    if (child.planned_end && (!maxEnd || child.planned_end > maxEnd)) {
      maxEnd = child.planned_end;
    }
    const sub = collectDescendantDates(child.id, childrenMap, visited);
    if (sub.minStart && (!minStart || sub.minStart < minStart)) {
      minStart = sub.minStart;
    }
    if (sub.maxEnd && (!maxEnd || sub.maxEnd > maxEnd)) {
      maxEnd = sub.maxEnd;
    }
  }

  return { minStart, maxEnd };
}

/**
 * 检测添加前置依赖后是否产生循环依赖
 * @param {Array} allTasks — 所有任务
 * @param {number} taskId — 当前任务 ID
 * @param {number[]} candidateIds — 候选前置任务 ID
 * @returns {boolean} true = 存在环
 */
export function detectCycle(allTasks, taskId, candidateIds) {
  if (!candidateIds || candidateIds.length === 0) return false;

  // 构建邻接表：taskId → 其前置列表
  const graph = new Map();
  for (const t of allTasks) {
    let preds = [];
    try {
      preds = JSON.parse(t.predecessor_ids || "[]");
    } catch {
      preds = [];
    }
    graph.set(t.id, preds);
  }

  // 模拟设置新前置
  graph.set(taskId, [...candidateIds]);

  // 从每个候选出发看是否能回到 taskId
  for (const predId of candidateIds) {
    const visited = new Set();
    const stack = [predId];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === taskId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const parents = graph.get(cur) || [];
      for (const p of parents) {
        stack.push(p);
      }
    }
  }
  return false;
}

/**
 * 判定完成情况
 * @param {Object} task — { planned_start, planned_end }
 * @param {Date} today — 基准日期
 * @returns {'已完成' | '进行中' | '未开始'}
 */
export function calcCompletionStatus(task, today = new Date()) {
  if (!task.planned_start || !task.planned_end) return "未开始";

  const start = dayjs(task.planned_start).startOf("day");
  const end = dayjs(task.planned_end).startOf("day");
  const now = dayjs(today).startOf("day");

  if (end.isBefore(now)) return "已完成";
  if (start.isAfter(now)) return "未开始";
  return "进行中";
}
