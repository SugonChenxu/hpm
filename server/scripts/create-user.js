/**
 * 创建 / 重置 Forge 用户账号（多用户隔离版）
 *
 * 用法：
 *   node server/scripts/create-user.js <用户名> <密码>
 *   node server/scripts/create-user.js            # 交互式输入用户名与密码
 *   node server/scripts/create-user.js <用户名> <密码> --reset   # 已存在则重置密码
 *
 * 说明：
 *   - 账号不开放注册，由管理员手动创建（对应「同事不多、逐个添加」决策）。
 *   - 密码使用 bcrypt 哈希存储，明文绝不入库。
 */
import readline from "node:readline";
import bcrypt from "bcryptjs";
import db from "../src/db.js";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
// 位置参数：第一个非 -- 开头为用户名，第二个为密码
const positional = args.filter((a) => !a.startsWith("--"));
const username = positional[0];
const password = positional[1];

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  if (!username) username = (await ask("用户名: ")).trim();
  if (!password) password = await ask("密码: ");

  if (!username || !password) {
    console.error("❌ 用户名与密码均不能为空");
    process.exit(1);
  }
  if (String(password).length < 6) {
    console.error("❌ 密码长度至少 6 位");
    process.exit(1);
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  const hash = bcrypt.hashSync(String(password), 10);

  if (existing) {
    if (!reset) {
      console.error(`❌ 用户 "${username}" 已存在。如需重置密码，请加 --reset 参数。`);
      process.exit(1);
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, existing.id);
    console.log(`✅ 用户 "${username}" 密码已重置`);
  } else {
    const info = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, hash);
    console.log(`✅ 已创建用户 "${username}" (id=${info.lastInsertRowid})`);
  }
}

main();
