/**
 * 排期日期语义切换迁移脚本（不含首尾：完成时间 = 开始时间 + 工期）
 *
 * 背景：2026-08-19 按用户要求将项目计划日期语义切换为「不含首尾」
 * （工期 = 结束 - 开始；完成 = 开始 + 工期）。此前为「含首尾」
 * （完成 = 开始 + 工期 - 1），历史数据完成时间普遍少 1 天。
 *
 * 迁移规则（与系统联动规则一致）：
 *  - 普通任务：开始 = 前置最大结束 + 1（无前置保持原开始）；结束 = 开始 + 工期；
 *  - 阶段任务：重新聚合（开始 = MIN 子孙开始，结束 = MAX 子孙结束，工期 = 结束 - 开始）；
 *  - 节点任务 / 锁定任务：不动。
 *
 * 用法：
 *   node migrate-duration-semantics.mjs          # dry-run 只报告
 *   node migrate-duration-semantics.mjs --apply  # 执行迁移
 */

import db from "./src/db.js";

function addDays(s, n) {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function diffDays(s, e) {
  return Math.round((new Date(e + "T00:00:00") - new Date(s + "T00:00:00")) / 86400000);
}

function collectDescendantDates(taskId, childrenMap, visited) {
  if (visited.has(taskId)) return { minStart: null, maxEnd: null };
  visited.add(taskId);
  const children = childrenMap.get(taskId) || [];
  let minStart = null, maxEnd = null;
  for (const child of children) {
    if (child.planned_start && (!minStart || child.planned_start < minStart)) minStart = child.planned_start;
    if (child.planned_end && (!maxEnd || child.planned_end > maxEnd)) maxEnd = child.planned_end;
    const sub = collectDescendantDates(child.id, childrenMap, visited);
    if (sub.minStart && (!minStart || sub.minStart < minStart)) minStart = sub.minStart;
    if (sub.maxEnd && (!maxEnd || sub.maxEnd > maxEnd)) maxEnd = sub.maxEnd;
  }
  return { minStart, maxEnd };
}

const apply = process.argv.includes("--apply");
const projects = db.prepare("SELECT DISTINCT project_id FROM schedule_tasks").all();
let total = 0;

for (const { project_id } of projects) {
  const tasks = db.prepare("SELECT * FROM schedule_tasks WHERE project_id = ? ORDER BY task_order ASC").all(project_id);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // 第一遍：级联修正普通任务
  for (const t of tasks) {
    if (t.task_type !== "普通任务" || t.is_locked === 1 || !t.planned_start || !t.planned_end) continue;
    let preds = [];
    try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }
    let expectStart = t.planned_start;
    if (preds.length > 0) {
      const ends = preds.map((pid) => byId.get(pid)).filter(Boolean).map((p) => p.planned_end).filter(Boolean);
      if (ends.length > 0) expectStart = addDays(ends.sort().reverse()[0], 1);
    }
    const expectEnd = addDays(expectStart, Math.max(1, t.duration_days));
    if (t.planned_start !== expectStart || t.planned_end !== expectEnd) {
      total++;
      console.log(`${apply ? "[迁移]" : "[发现]"} #${t.id} ${t.name}: ${t.planned_start}~${t.planned_end} → ${expectStart}~${expectEnd}`);
      if (apply) {
        db.prepare("UPDATE schedule_tasks SET planned_start = ?, planned_end = ?, updated_at = datetime('now','localtime') WHERE id = ?")
          .run(expectStart, expectEnd, t.id);
        byId.get(t.id).planned_start = expectStart;
        byId.get(t.id).planned_end = expectEnd;
      }
    }
  }

  // 第二遍：阶段任务聚合（循环至收敛——嵌套阶段需多轮，且同步内存供下一轮）
  for (let round = 0; round < 5; round++) {
    const childrenMap = new Map();
    for (const t of byId.values()) {
      const pid = t.parent_id || 0;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(t);
    }
    let changed = false;
    for (const t of byId.values()) {
      if (t.task_type !== "阶段任务") continue;
      const agg = collectDescendantDates(t.id, childrenMap, new Set());
      if (agg.minStart && agg.maxEnd) {
        const newDur = Math.max(1, diffDays(agg.minStart, agg.maxEnd));
        if (t.planned_start !== agg.minStart || t.planned_end !== agg.maxEnd || t.duration_days !== newDur) {
          total++;
          console.log(`${apply ? "[迁移-阶段]" : "[发现-阶段]"} #${t.id} ${t.name}: ${t.planned_start}~${t.planned_end}工期${t.duration_days} → ${agg.minStart}~${agg.maxEnd}工期${newDur}`);
          if (apply) {
            db.prepare("UPDATE schedule_tasks SET planned_start = ?, planned_end = ?, duration_days = ?, updated_at = datetime('now','localtime') WHERE id = ?")
              .run(agg.minStart, agg.maxEnd, newDur, t.id);
            const cur = byId.get(t.id);
            cur.planned_start = agg.minStart;
            cur.planned_end = agg.maxEnd;
            cur.duration_days = newDur;
          }
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

console.log(apply ? `✅ 已迁移 ${total} 项` : `🔍 共 ${total} 项待迁移（加 --apply 执行）`);
