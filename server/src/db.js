import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "..", "hpm.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS phase_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_preset INTEGER DEFAULT 0,
    phases_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT '新品',
    status TEXT DEFAULT '进行中',
    template_id INTEGER REFERENCES phase_templates(id),
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phase_order INTEGER NOT NULL,
    type TEXT DEFAULT 'PHASE',
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,
    status TEXT DEFAULT '未开始',
    di_threshold REAL
);

CREATE TABLE IF NOT EXISTS gates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    gate_type TEXT NOT NULL,
    di_threshold REAL,
    current_di REAL DEFAULT 0,
    is_passed INTEGER DEFAULT 0,
    passed_at TEXT
);

CREATE TABLE IF NOT EXISTS kanban_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    column_order INTEGER NOT NULL,
    color TEXT DEFAULT '#1565C0',
    is_default INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    phase_id INTEGER REFERENCES phases(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'P2',
    assignee TEXT,
    kanban_column TEXT DEFAULT '待开始',
    due_date TEXT,
    status TEXT DEFAULT '待开始',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id INTEGER REFERENCES phases(id) ON DELETE SET NULL,
    requirement_id INTEGER,
    code TEXT NOT NULL UNIQUE,
    mantis_id INTEGER,
    source TEXT DEFAULT 'local',
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT DEFAULT 'Minor',
    status TEXT DEFAULT '新建',
    assignee TEXT,
    di_weight REAL DEFAULT 1.0,
    mantis_updated_at TEXT,
    synced_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS mantis_connection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_url TEXT NOT NULL DEFAULT '',
    api_token TEXT NOT NULL DEFAULT '',
    project_mapping TEXT DEFAULT '[]',
    sync_interval_min INTEGER DEFAULT 30,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    part_no TEXT NOT NULL,
    name TEXT NOT NULL,
    spec TEXT,
    material_type TEXT DEFAULT '开发',
    quantity INTEGER DEFAULT 1,
    supplier TEXT,
    lead_time_days INTEGER,
    planned_delivery TEXT,
    actual_delivery TEXT,
    actual_quantity INTEGER,
    status TEXT DEFAULT '待下单',
    is_second_source INTEGER DEFAULT 0,
    parent_material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meeting_platform_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL UNIQUE,
    app_id TEXT DEFAULT '',
    secret TEXT DEFAULT '',
    enterprise_id TEXT DEFAULT '',
    is_active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    phase_id INTEGER REFERENCES phases(id) ON DELETE SET NULL,
    platform TEXT DEFAULT 'manual',
    external_id TEXT,
    meeting_code TEXT,
    title TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    attendee_count INTEGER,
    attendees_json TEXT,
    transcript_text TEXT,
    recording_url TEXT,
    minutes_text TEXT,
    minutes_status TEXT DEFAULT '待编写',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meeting_action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    assignee TEXT,
    due_date TEXT,
    status TEXT DEFAULT '待处理',
    linked_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS weekly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    title TEXT,
    content_json TEXT NOT NULL,
    status TEXT DEFAULT '草稿',
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    executed_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_completed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_phases_project ON phases(project_id, phase_order);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_mantis ON issues(mantis_id);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id, status);
CREATE INDEX IF NOT EXISTS idx_materials_delivery ON materials(planned_delivery);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_project ON weekly_reports(project_id, week_start);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, sort_order);
-- idx_tasks_sort 在下方迁移区块创建（sort_order 列通过 ALTER TABLE 新增后）

-- =====================================================
-- M1 增量：项目计划排期表
-- =====================================================

CREATE TABLE IF NOT EXISTS schedule_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    task_order INTEGER NOT NULL DEFAULT 0,
    task_type TEXT NOT NULL DEFAULT '普通任务',
    planned_start TEXT,
    planned_end TEXT,
    duration_days INTEGER DEFAULT 1,
    completion_status TEXT DEFAULT '未开始',
    predecessor_ids TEXT DEFAULT '[]',
    parent_id INTEGER REFERENCES schedule_tasks(id) ON DELETE SET NULL,
    is_locked INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    bg_color TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS schedule_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_name TEXT NOT NULL,
    tasks_snapshot TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_project ON schedule_tasks(project_id, task_order);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_parent ON schedule_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_schedule_versions_project ON schedule_versions(project_id);
`);

// =====================================================
// 数据库迁移
// =====================================================

// 迁移：parent_id 列
try {
  db.exec(`ALTER TABLE schedule_tasks ADD COLUMN parent_id INTEGER REFERENCES schedule_tasks(id) ON DELETE SET NULL`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration parent_id:", e.message);
  }
}

// 迁移：parent_id 索引
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_schedule_tasks_parent ON schedule_tasks(parent_id)`);
} catch (e) {
  console.warn("Migration idx_schedule_tasks_parent:", e.message);
}

// 迁移：notes 列
try {
  db.exec(`ALTER TABLE schedule_tasks ADD COLUMN notes TEXT DEFAULT ''`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration notes:", e.message);
  }
}

// 迁移：bg_color 列
try {
  db.exec(`ALTER TABLE schedule_tasks ADD COLUMN bg_color TEXT DEFAULT ''`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration bg_color:", e.message);
  }
}

// =====================================================
// 看板模块迁移：tasks 表新增字段
// =====================================================

// 迁移：tasks.sort_order
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0`);
  // 为已有数据按 id 设置默认 sort_order
  db.exec(`UPDATE tasks SET sort_order = id WHERE sort_order = 0 OR sort_order IS NULL`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration tasks.sort_order:", e.message);
  }
}

// 迁移：tasks.completed_at
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN completed_at TEXT`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration tasks.completed_at:", e.message);
  }
}

// 迁移：projects.theme_color
try {
  db.exec(`ALTER TABLE projects ADD COLUMN theme_color TEXT DEFAULT '#1565C0'`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration projects.theme_color:", e.message);
  }
}

// 迁移：索引
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(project_id, sort_order)`);
} catch (e) {
  console.warn("Migration idx_tasks_sort:", e.message);
}

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, sort_order)`);
} catch (e) {
  console.warn("Migration idx_subtasks_task:", e.message);
}

// =====================================================
// 优先级数据迁移（仅执行一次）
// =====================================================

const priorityMigrationDone = db.prepare(
  "SELECT id FROM _migrations WHERE name = ?"
).get("priority-v1");

if (!priorityMigrationDone) {
  console.log("Running priority migration: P0→urgent, P1→high, P2→medium");
  const migrate = db.transaction(() => {
    const countP0 = db.prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE priority = 'P0' AND deleted_at IS NULL"
    ).get();
    const countP1 = db.prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE priority = 'P1' AND deleted_at IS NULL"
    ).get();
    const countP2 = db.prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE priority = 'P2' AND deleted_at IS NULL"
    ).get();

    db.prepare("UPDATE tasks SET priority = 'urgent', updated_at = datetime('now','localtime') WHERE priority = 'P0'").run();
    db.prepare("UPDATE tasks SET priority = 'high', updated_at = datetime('now','localtime') WHERE priority = 'P1'").run();
    db.prepare("UPDATE tasks SET priority = 'medium', updated_at = datetime('now','localtime') WHERE priority = 'P2'").run();
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run("priority-v1");

    console.log(
      `Priority migration done: ${countP0.cnt} P0→urgent, ${countP1.cnt} P1→high, ${countP2.cnt} P2→medium`
    );
  });
  migrate();
} else {
  console.log("Priority migration already executed, skipping.");
}

export default db;
