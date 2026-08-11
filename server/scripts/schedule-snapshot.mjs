// 输出指定项目的排期快照（JSON），供 WorkBuddy 同步到腾讯文档时使用。
// 用法: node server/scripts/schedule-snapshot.mjs <projectId>
// 输出: { project: {id,name,code}, link: tencent_docs_link 或 null, tasks: 树序扁平列表(含 depth) }
import db from "../src/db.js";

const projectId = Number(process.argv[2] || 0);
if (!projectId) {
  console.error("usage: node server/scripts/schedule-snapshot.mjs <projectId>");
  process.exit(1);
}

const proj = db.prepare("SELECT id, name, code FROM projects WHERE id = ?").get(projectId);
if (!proj) {
  console.error(`project ${projectId} not found`);
  process.exit(1);
}

const link = db.prepare("SELECT * FROM tencent_docs_link WHERE project_id = ?").get(projectId) || null;
if (!link || !link.file_url) {
  console.error(`project ${projectId} 未配置腾讯文档关联（tencent_docs_link 为空）`);
  process.exit(1);
}

const all = db.prepare("SELECT * FROM schedule_tasks WHERE project_id = ?").all(projectId);

// 树序排序（与后端 getProjectTasksTree 一致：父 → 子 → 兄弟，附加 depth）
const childrenMap = new Map();
for (const t of all) {
  const pid = t.parent_id || 0;
  if (!childrenMap.has(pid)) childrenMap.set(pid, []);
  childrenMap.get(pid).push(t);
}
for (const [, ch] of childrenMap) ch.sort((a, b) => a.task_order - b.task_order);

const tasks = [];
(function traverse(pid, depth) {
  for (const c of childrenMap.get(pid) || []) {
    tasks.push({ ...c, depth });
    traverse(c.id, depth + 1);
  }
})(0, 0);

console.log(JSON.stringify({ project: proj, link, tasks }));
