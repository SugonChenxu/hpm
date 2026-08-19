/**
 * 前置联动历史数据修正脚本（可选）
 *
 * 背景：2026-08-19 修复了 schedule.js 的 addDays 语义（含首尾，与前端一致）。
 * 修复前反向联动「B 结束 = A 开始 - 1」被算成「B 结束 = A 开始」、正向级联
 * 「A 开始 = B 结束 + 1」被算成「+2」，导致历史数据中后置任务开始时间普遍
 * 比「前置结束 + 1」晚 1 天（层层累积）。
 *
 * 本脚本按 task_order 级联修正：后置任务开始 = 前置最大结束 + 1（含首尾语义）。
 *
 * 用法：
 *   node fix-predecessor-dates.mjs          # 只扫描报告，不改数据
 *   node fix-predecessor-dates.mjs --apply  # 确认后执行修正
 *
 * ⚠️ 注意：会覆盖「有意留间隔」的手动排期（开始 > 前置结束+1 的任务会被收紧到 +1）。
 * 执行前请确认：如需保留手动空档，请勿对相关任务执行 --apply。
 */

import db from "./src/db.js";

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days - 1); // 含首尾语义
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const apply = process.argv.includes("--apply");
const projects = db
  .prepare("SELECT DISTINCT project_id FROM schedule_tasks WHERE predecessor_ids IS NOT NULL AND predecessor_ids != '[]'")
  .all();

let total = 0;
for (const { project_id } of projects) {
  const tasks = db
    .prepare("SELECT * FROM schedule_tasks WHERE project_id = ? ORDER BY task_order ASC")
    .all(project_id);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const t of tasks) {
    if (t.is_locked === 1 || t.task_type !== "普通任务" || !t.planned_start) continue;
    let preds = [];
    try { preds = JSON.parse(t.predecessor_ids || "[]"); } catch { preds = []; }
    if (preds.length === 0) continue;

    const ends = preds
      .map((pid) => byId.get(pid))
      .filter(Boolean)
      .map((p) => p.planned_end)
      .filter(Boolean);
    if (ends.length === 0) continue;

    const maxEnd = ends.sort().reverse()[0];
    const expectStart = addDays(maxEnd, 2); // 前置结束 + 1

    if (t.planned_start !== expectStart) {
      total++;
      const predNames = preds.map((pid) => byId.get(pid)?.name || `#${pid}`).join(",");
      console.log(
        `${apply ? "[修复]" : "[发现]"} #${t.id} ${t.name}: 开始 ${t.planned_start} → ${expectStart}（前置「${predNames}」结束 ${maxEnd} +1）`
      );
      if (apply) {
        const expectEnd = addDays(expectStart, Math.max(1, t.duration_days));
        db.prepare(
          "UPDATE schedule_tasks SET planned_start = ?, planned_end = ?, updated_at = datetime('now','localtime') WHERE id = ?"
        ).run(expectStart, expectEnd, t.id);
        byId.get(t.id).planned_start = expectStart; // 供后续级联使用
        byId.get(t.id).planned_end = expectEnd;
      }
    }
  }
}

console.log(apply ? `✅ 已修正 ${total} 个任务` : `🔍 扫描完成，共 ${total} 个任务开始时间 ≠ 前置结束+1（加 --apply 执行修正）`);
