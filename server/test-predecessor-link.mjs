// 验证前置任务联动逻辑 linkPredecessorsToStart（事务回滚隔离，不落库）
import db from "./src/db.js";
import { linkPredecessorsToStart } from "./src/routes/schedule.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  ok ? pass++ : fail++;
};
const q = (sql, ...args) => db.prepare(sql).get(...args);

db.exec("BEGIN");
try {
  // 临时项目
  const proj = db.prepare("INSERT INTO projects (name, code, owner_id) VALUES (?,?,?)").run("联动测试项目", "TEST-LINK", 1);
  const pid = Number(proj.lastInsertRowid);
  const ins = db.prepare(
    "INSERT INTO schedule_tasks (project_id, name, task_order, task_type, planned_start, planned_end, duration_days, predecessor_ids, parent_id, is_locked) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  const mk = (name, type, s, e, dur, preds, locked = 0, parent = null) =>
    Number(ins.run(pid, name, 0, type, s, e, dur, JSON.stringify(preds), parent, locked).lastInsertRowid);

  // ===== 场景1：A 有单前置 B，B.end 晚于 A 新开始 → B.end = A.start-1，B.start 不变，工期重算 =====
  {
    const B = mk("B1", "普通任务", "2026-08-01", "2026-08-20", 20, []);
    const A = mk("A1", "普通任务", "2026-08-25", "2026-09-05", 12, [B]);
    const linked = linkPredecessorsToStart(pid, A, "2026-08-15"); // A 提前到 8-15
    const b = q("SELECT * FROM schedule_tasks WHERE id=?", B);
    check("场景1 触发联动", linked.length === 1 && linked[0] === B);
    check("场景1 B.end = A.start-1", b.planned_end === "2026-08-14", b.planned_end);
    check("场景1 B.start 不变", b.planned_start === "2026-08-01");
    check("场景1 B.工期重算=14", b.duration_days === 14, String(b.duration_days));
  }

  // ===== 场景2：B.end 早于 A 新开始 → B 不变化 =====
  {
    const B = mk("B2", "普通任务", "2026-07-01", "2026-07-10", 10, []);
    const A = mk("A2", "普通任务", "2026-08-01", "2026-08-10", 10, [B]);
    const linked = linkPredecessorsToStart(pid, A, "2026-08-01"); // A 不变（或推迟）
    const b = q("SELECT * FROM schedule_tasks WHERE id=?", B);
    check("场景2 不触发联动", linked.length === 0);
    check("场景2 B 原样", b.planned_end === "2026-07-10" && b.duration_days === 10);
  }

  // ===== 场景3：多前置 B/C/D，B.end>=A.start、C.end<A.start、D.end>=A.start → B/D 联动，C 不动 =====
  {
    const B = mk("B3", "普通任务", "2026-08-01", "2026-08-30", 30, []);
    const C = mk("C3", "普通任务", "2026-07-01", "2026-07-05", 5, []);
    const D = mk("D3", "普通任务", "2026-08-10", "2026-08-28", 19, []);
    const A = mk("A3", "普通任务", "2026-09-01", "2026-09-10", 10, [B, C, D]);
    const linked = linkPredecessorsToStart(pid, A, "2026-08-20"); // A 提前到 8-20
    const b = q("SELECT * FROM schedule_tasks WHERE id=?", B);
    const c = q("SELECT * FROM schedule_tasks WHERE id=?", C);
    const d = q("SELECT * FROM schedule_tasks WHERE id=?", D);
    check("场景3 联动 B 和 D", linked.length === 2 && linked.includes(B) && linked.includes(D) && !linked.includes(C));
    check("场景3 B.end=8-19 工期=19", b.planned_end === "2026-08-19" && b.duration_days === 19, `${b.planned_end}/${b.duration_days}`);
    check("场景3 C 不动", c.planned_end === "2026-07-05" && c.duration_days === 5);
    check("场景3 D.end=8-19 工期=10", d.planned_end === "2026-08-19" && d.duration_days === 10, `${d.planned_end}/${d.duration_days}`);
  }

  // ===== 场景4：前置是阶段任务 → 跳过 =====
  {
    const PH = mk("阶段P4", "阶段任务", null, null, null, []);
    const A = mk("A4", "普通任务", "2026-08-10", "2026-08-20", 11, [PH]);
    const linked = linkPredecessorsToStart(pid, A, "2026-08-05");
    const ph = q("SELECT * FROM schedule_tasks WHERE id=?", PH);
    check("场景4 阶段任务前置跳过", linked.length === 0 && ph.planned_end === null);
  }

  // ===== 场景5：前置是节点任务 → 跳过 =====
  {
    const N = mk("N5", "节点任务", "2026-08-10", "2026-08-10", 1, []);
    const A = mk("A5", "普通任务", "2026-08-20", "2026-08-30", 11, [N]);
    const linked = linkPredecessorsToStart(pid, A, "2026-08-15");
    const n = q("SELECT * FROM schedule_tasks WHERE id=?", N);
    check("场景5 节点任务前置跳过", linked.length === 0 && n.planned_end === "2026-08-10");
  }

  // ===== 场景6：前置锁定任务 → 跳过 =====
  {
    const L = mk("L6", "普通任务", "2026-08-01", "2026-08-20", 20, [], 1);
    const A = mk("A6", "普通任务", "2026-08-25", "2026-09-05", 12, [L]);
    const linked = linkPredecessorsToStart(pid, A, "2026-08-10");
    const l = q("SELECT * FROM schedule_tasks WHERE id=?", L);
    check("场景6 锁定前置跳过", linked.length === 0 && l.planned_end === "2026-08-20");
  }

  // ===== 场景7：压缩后 结束<开始 的防御（B 整体晚于 A 的新开始，脏数据场景）=====
  {
    const B = mk("B7", "普通任务", "2026-08-25", "2026-09-05", 12, []);
    const A = mk("A7", "普通任务", "2026-08-10", "2026-08-20", 11, [B]); // B 竟然晚于 A 开始（脏数据）
    const linked = linkPredecessorsToStart(pid, A, "2026-08-15"); // 压缩 B.end=8-14 < B.start=8-25 → 跳过
    const b = q("SELECT * FROM schedule_tasks WHERE id=?", B);
    check("场景7 防御跳过", linked.length === 0 && b.planned_end === "2026-09-05");
  }

  // ===== 场景8：A 无前置 → 无联动 =====
  {
    const A = mk("A8", "普通任务", "2026-08-01", "2026-08-10", 10, []);
    const linked = linkPredecessorsToStart(pid, A, "2026-08-05");
    check("场景8 无前置不触发", linked.length === 0);
  }

  console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
} finally {
  db.exec("ROLLBACK");
}
process.exit(fail ? 1 : 0);
