import dayjs from "dayjs";

/**
 * 排期日期工具函数
 * 所有日期计算基于 dayjs，输出 ISO 日期字符串 YYYY-MM-DD
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

/** 两个日期之间的天数差（end - start） */
export function daysBetween(startStr, endStr) {
  return dayjs(endStr).diff(dayjs(startStr), "day");
}

/**
 * 修改开始日期 → 结束日期 = 新开始 + 工期 - 1
 */
export function updateStartDate(task, newStart) {
  const duration = task.duration_days || 1;
  return {
    ...task,
    planned_start: newStart,
    planned_end: addDays(newStart, duration - 1),
  };
}

/**
 * 修改结束日期 → 工期 = 新结束 - 开始日期 + 1
 */
export function updateEndDate(task, newEnd) {
  const start = task.planned_start;
  const duration = Math.max(1, daysBetween(start, newEnd) + 1);
  return {
    ...task,
    planned_end: newEnd,
    duration_days: duration,
  };
}

/**
 * 修改工期 → 结束日期 = 开始日期 + 新工期 - 1
 */
export function updateDuration(task, newDuration) {
  const dur = Math.max(1, Number(newDuration));
  return {
    ...task,
    duration_days: dur,
    planned_end: addDays(task.planned_start, dur - 1),
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
      t.planned_end = addDays(newStart, (t.duration_days || 1) - 1);
    }
  }

  // 重新计算阶段聚合
  recalcPhaseAggregation(taskMap);

  return [...taskMap.values()].sort((a, b) => a.task_order - b.task_order);
}

/**
 * 重新计算所有阶段任务的聚合日期
 */
export function recalcPhaseAggregation(taskMap) {
  const tasks = [...taskMap.values()].sort(
    (a, b) => a.task_order - b.task_order
  );

  // 找到所有阶段任务索引
  const phaseIndices = [];
  tasks.forEach((t, i) => {
    if (t.task_type === "阶段任务") {
      phaseIndices.push(i);
    }
  });

  if (phaseIndices.length === 0) return;

  for (let pi = 0; pi < phaseIndices.length; pi++) {
    const phaseIdx = phaseIndices[pi];
    const phaseTask = tasks[phaseIdx];

    const startIdx = phaseIdx + 1;
    const endIdx =
      pi + 1 < phaseIndices.length ? phaseIndices[pi + 1] : tasks.length;

    const childTasks = tasks
      .slice(startIdx, endIdx)
      .filter((t) => t.task_type !== "阶段任务" && t.planned_start);

    if (childTasks.length > 0) {
      const starts = childTasks.map((t) => t.planned_start).sort();
      const ends = childTasks.map((t) => t.planned_end).sort().reverse();

      phaseTask.planned_start = starts[0];
      phaseTask.planned_end = ends[0];
      phaseTask.duration_days = Math.max(
        1,
        daysBetween(phaseTask.planned_start, phaseTask.planned_end) + 1
      );
    }
  }
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
