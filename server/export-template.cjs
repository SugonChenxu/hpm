/**
 * 从 DB 中导出用户保存的版本为模板 JSON
 * 将 DB ID 映射为数组索引，保留所有关系和前置任务
 */
const db = require("better-sqlite3")("./hpm.db");
const fs = require("fs");
const path = require("path");

// 找到最新版本
const versions = db.prepare(
  "SELECT * FROM schedule_versions ORDER BY created_at DESC LIMIT 10"
).all();

console.log("Recent versions:");
versions.forEach(v => console.log(`  ID=${v.id}  ${v.version_name}  created=${v.created_at}`));

// 使用用户指定的 Version6
const targetVersion = versions.find(v => v.version_name === "2026-07-07_Version6");
if (!targetVersion) {
  console.log("\nVersion6 not found in recent 10. Searching all...");
  const all = db.prepare("SELECT * FROM schedule_versions WHERE version_name = ?").all("2026-07-07_Version6");
  if (all.length === 0) {
    console.error("Version6 not found!");
    db.close();
    process.exit(1);
  }
}

const version = targetVersion || db.prepare("SELECT * FROM schedule_versions WHERE version_name = ?").get("2026-07-07_Version6");
if (!version) {
  console.error("Version6 still not found!");
  db.close();
  process.exit(1);
}

console.log(`\nUsing version: ${version.version_name} (ID=${version.id})`);

const tasks = JSON.parse(version.tasks_snapshot);

// Build ID → array index mapping (order as in snapshot)
const idToIndex = new Map();
tasks.forEach((t, i) => {
  idToIndex.set(t.id, i);
});

// Build template tasks
const templateTasks = tasks.map((t, i) => {
  const tmpl = {
    name: t.name || "",
    task_type: t.task_type || "普通任务",
    duration_days: t.duration_days || 1,
  };

  // parent_ref: the array index of the parent task
  if (t.parent_id != null && t.parent_id !== undefined) {
    const parentIdx = idToIndex.get(t.parent_id);
    if (parentIdx !== undefined) {
      tmpl.parent_ref = parentIdx;
    }
  }

  // predecessor_refs: the array indices of predecessor tasks
  let predIds = [];
  try {
    predIds = JSON.parse(t.predecessor_ids || "[]");
  } catch {
    predIds = [];
  }
  if (predIds.length > 0) {
    const predRefs = predIds
      .map(pid => idToIndex.get(pid))
      .filter(idx => idx !== undefined);
    if (predRefs.length > 0) {
      tmpl.predecessor_refs = predRefs;
    }
  }

  return tmpl;
});

const template = {
  name: "自定义硬件研发流程",
  description: "从用户保存的版本导出",
  tasks: templateTasks,
};

// Write template file
const templatesDir = path.join(__dirname, "src", "templates");
const outputPath = path.join(templatesDir, "custom-hardware.json");
fs.writeFileSync(outputPath, JSON.stringify(template, null, 2), "utf-8");

console.log(`\nTemplate written to: ${outputPath}`);
console.log(`Total tasks: ${templateTasks.length}`);

// Summary
const phaseCount = templateTasks.filter(t => t.task_type === "阶段任务").length;
const nodeCount = templateTasks.filter(t => t.task_type === "节点任务").length;
const normalCount = templateTasks.filter(t => t.task_type === "普通任务").length;
const withParent = templateTasks.filter(t => t.parent_ref !== undefined).length;
const withPreds = templateTasks.filter(t => t.predecessor_refs && t.predecessor_refs.length > 0).length;

console.log(`\nTemplate summary:`);
console.log(`  阶段任务: ${phaseCount}`);
console.log(`  节点任务: ${nodeCount}`);
console.log(`  普通任务: ${normalCount}`);
console.log(`  有父级关系: ${withParent}`);
console.log(`  有前置任务: ${withPreds}`);

// Print first few tasks to verify
console.log("\nFirst 5 tasks:");
templateTasks.slice(0, 5).forEach((t, i) => {
  console.log(`  [${i}] "${t.name}" type=${t.task_type} parent=${t.parent_ref ?? "null"} preds=${JSON.stringify(t.predecessor_refs || [])}`);
});

// Show tasks with predecessors
console.log("\nTasks with predecessors:");
templateTasks.forEach((t, i) => {
  if (t.predecessor_refs && t.predecessor_refs.length > 0) {
    const predNames = t.predecessor_refs.map(idx => templateTasks[idx]?.name || `#${idx}`);
    console.log(`  [${i}] "${t.name}" ← ${predNames.join(", ")}`);
  }
});

db.close();
