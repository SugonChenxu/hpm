/**
 * 绑定存量数据到专属账号（多用户隔离迁移）
 *
 * 背景：启用多用户隔离前，所有业务数据的 owner_id 默认为 0（无主）。
 * 本脚本将这些「无主」数据绑定到指定账号（默认 chenxu），使其可见可用。
 *
 * 用法：
 *   node server/scripts/bind-legacy-data.js                 # 绑定到 chenxu
 *   node server/scripts/bind-legacy-data.js --user <用户名> # 绑定到指定账号
 *
 * 前置：目标账号须已存在（用 create-user.js 创建）。
 *
 * 安全：脚本为幂等操作；仅更新 owner_id = 0 的行，已绑定的数据不受影响。
 */
import db from "../src/db.js";

const args = process.argv.slice(2);
const userArgIdx = args.indexOf("--user");
const targetUser = userArgIdx >= 0 ? args[userArgIdx + 1] : "chenxu";

// 与 db.js 中 OWNER_TABLES 保持一致（含全局表 + 物料表）
const OWNER_TABLES = [
  "projects",
  "tasks",
  "issues",
  "meetings",
  "weekly_reports",
  "week_meetings",
  "meeting_outputs",
  "mantis_connection",
  "plm_connection",
  "material_import_snapshots",
  "sync_cache",
  "smart_minutes",
  "materials",
];

function main() {
  const user = db.prepare("SELECT id, username FROM users WHERE username = ?").get(targetUser);
  if (!user) {
    console.error(`❌ 目标账号 "${targetUser}" 不存在。请先运行 create-user.js 创建该账号。`);
    process.exit(1);
  }

  console.log(`🔗 将 owner_id = 0 的存量数据绑定到账号 "${user.username}" (id=${user.id})`);

  let total = 0;
  const report = [];
  for (const t of OWNER_TABLES) {
    // 校验表/列存在，避免 ALTER 尚未执行的边缘情况
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    if (!cols.includes("owner_id")) {
      console.warn(`⚠️  表 ${t} 尚无 owner_id 列，跳过`);
      continue;
    }
    const info = db
      .prepare(`UPDATE ${t} SET owner_id = ? WHERE owner_id = 0 OR owner_id IS NULL`)
      .run(user.id);
    if (info.changes > 0) {
      report.push(`   ${t}: ${info.changes} 行`);
      total += info.changes;
    }
  }

  if (report.length === 0) {
    console.log("✅ 没有需要绑定的无主数据（owner_id 均已分配）。");
  } else {
    console.log("✅ 绑定完成：");
    report.forEach((r) => console.log(r));
    console.log(`   合计 ${total} 行已归属 "${user.username}"`);
  }
}

main();
