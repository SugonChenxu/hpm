// Forge 批量导入脚本 — 从腾讯文档数据创建 S2000 项目排期
const path = require("path");
const Database = require(path.join(__dirname, "..", "server/node_modules/better-sqlite3"));
const db = new Database(path.join(__dirname, "..", "server/hpm.db"));

// ============================================================
// 1. 创建项目
// ============================================================
const insertProject = db.prepare(`
  INSERT INTO projects (code, name, category, status, theme_color, department, order_number, storage_location, meeting_time, current_phase)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const projectResult = insertProject.run(
  "S2000",
  "S2000 板卡项目",
  "新品",
  "进行中",
  "#0D47A1",
  "",
  "",
  "",
  "",
  "detail_design"
);
const projectId = projectResult.lastInsertRowid;
console.log(`✅ 项目已创建: ID=${projectId}, name=S2000 板卡项目`);

// ============================================================
// 2. 批量插入排期任务
// ============================================================

function insertTask(order, parentId, name, taskType, start, end, duration, notes = "") {
  // Ensure duration >= 1
  const dur = Math.max(1, Number(duration) || 1);
  return db.prepare(`
    INSERT INTO schedule_tasks (project_id, name, task_order, task_type, planned_start, planned_end, duration_days, predecessor_ids, parent_id, is_locked, notes, bg_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, 0, ?, '')
  `).run(projectId, name, order, taskType, start, end, dur, parentId, notes);
}

// 阶段任务 (parent_id = null, task_type = "阶段任务")
function insertPhase(order, name, start, end, duration, notes = "") {
  return insertTask(order, null, name, "阶段任务", start, end, duration, notes);
}

// 子任务 (parent_id = phaseTaskId, task_type = "普通任务")
function insertChild(order, parentId, name, start, end, duration, notes = "") {
  return insertTask(order, parentId, name, "普通任务", start, end, duration, notes);
}

const transaction = db.transaction(() => {
  let order = 1;

  // --- Phase 1: L5开发计划 ---
  const p1 = insertPhase(order++, "L5开发计划", "2026-06-04", "2026-06-18", 7);

  // --- Phase 2: L6详细设计 ---
  const p2 = insertPhase(order++, "L6详细设计", "2026-06-19", "2026-10-21", 79, "A01版G/O：2026/8/20");
    const p2Id = p2.lastInsertRowid;
    insertChild(order++, p2Id, "扣卡95%原理图", "2026-06-12", "2026-07-15", 33);
    insertChild(order++, p2Id, "DMC卡-95%原理图", "2026-07-23", "2026-08-06", 14);
    insertChild(order++, p2Id, "UBB底板-95%原理图", "2026-06-22", "2026-07-20", 28);
    insertChild(order++, p2Id, "扣卡Gerber", "2026-07-16", "2026-08-27", 42);
    insertChild(order++, p2Id, "DMC卡Gerber", "2026-08-07", "2026-08-28", 21);
    insertChild(order++, p2Id, "UBB底板 Gerber", "2026-07-21", "2026-09-01", 42);
    insertChild(order++, p2Id, "基材备料", "2026-07-03", "2026-09-01", 60);
    insertChild(order++, p2Id, "UBB电子料备料", "2026-07-28", "2026-10-11", 75);
    insertChild(order++, p2Id, "扣卡投板生产", "2026-08-28", "2026-10-09", 42);
    insertChild(order++, p2Id, "DMC投板生产", "2026-08-29", "2026-09-26", 28);
    insertChild(order++, p2Id, "UBB互联底板回样", "2026-09-02", "2026-10-21", 49);
    insertChild(order++, p2Id, "结构件/散热件打样", "2026-09-16", "2026-10-28", 42);

  // --- Phase 3: L8 EVT ---
  const p3 = insertPhase(order++, "L8 EVT（无芯片验证）", "2026-10-22", "2026-12-26", 65, "B01G/O：2026/11/10；12月中提供HySW 2.0&Shaobo芯片样品");
    const p3Id = p3.lastInsertRowid;
    insertChild(order++, p3Id, "PO", "2026-09-26", "2026-10-28", 32, "包含国庆");
    insertChild(order++, p3Id, "EVT测试", "2026-10-29", "2027-01-05", 68);
    insertChild(order++, p3Id, "B01 Gerber（扣卡/DMC/UBB）", "2026-11-08", "2026-11-22", 14);

  // --- Phase 4: L9 DVT ---
  const p4 = insertPhase(order++, "L9 DVT（含机头适配&芯片调试）", "2027-01-04", "2027-03-25", 77, "1/30早期送样；芯片调试需于1/13完成；包含春节");
    const p4Id = p4.lastInsertRowid;
    insertChild(order++, p4Id, "机头适配调试", "2027-01-04", "2027-01-13", 10, "芯片调试工作");
    insertChild(order++, p4Id, "早期送样", "2027-01-14", "2027-01-30", 16, "1/30早期送样");
    insertChild(order++, p4Id, "DVT测试验证", "2027-01-31", "2027-03-25", 53);

  // --- Phase 5: 批量测试 ---
  insertPhase(order++, "批量测试", "2027-03-26", "2027-04-22", 28);

  // --- Phase 6: 质量抽测&质量评审 ---
  insertPhase(order++, "质量抽测&质量评审", "2027-04-23", "2027-04-30", 7);

  // --- Phase 7: 协助整机直通率爬坡 ---
  insertPhase(order++, "协助整机直通率爬坡", "2027-05-01", "2027-07-30", 95);

  // --- Phase 8: Gen6-软件适配 ---
  insertPhase(order++, "Gen6-软件适配", "2027-05-06", "2027-06-03", 28);

  // --- Phase 9: Gen6-批量测试 ---
  insertPhase(order++, "Gen6-批量测试", "2027-06-04", "2027-07-09", 35);

  // --- Phase 10: Gen6-质量抽测&质量评审 ---
  insertPhase(order++, "Gen6-质量抽测&质量评审", "2027-07-10", "2027-07-15", 5);

  console.log(`✅ 排期任务已创建: ${order - 1} 个节点`);
});

transaction();

console.log("\n🎉 S2000 项目导入完成！请刷新 Forge 页面查看。");
db.close();
