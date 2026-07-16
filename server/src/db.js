import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "..", "hpm.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// === 物料表迁移：旧骨架结构(part_no/name...) → 新规范结构 ===
// 旧表无真实 seed 数据，直接重建以匹配新字段。
try {
  const matInfo = db.prepare("PRAGMA table_info(materials)").all().map((c) => c.name);
  if (matInfo.length && !matInfo.includes("part_number")) {
    db.exec("DROP TABLE IF EXISTS materials;");
    console.log("[DB] materials 表已迁移至新规范结构");
  }
} catch (e) {
  // 表不存在时 PRAGMA 会报错，忽略
}

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
    department TEXT DEFAULT '',
    order_number TEXT DEFAULT '',
    storage_location TEXT DEFAULT '',
    meeting_time TEXT DEFAULT '',
    theme_color TEXT DEFAULT '#1565C0',
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
    seq INTEGER NOT NULL DEFAULT 0,
    part_number TEXT DEFAULT '',
    manufacturer TEXT DEFAULT '',
    model TEXT DEFAULT '',
    material_status TEXT DEFAULT '默认',
    quantity REAL DEFAULT 0,
    quantity_per_set REAL DEFAULT 0,
    set_count INTEGER DEFAULT 0,
    purchase_date TEXT,
    lead_time INTEGER,
    expected_delivery TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS material_import_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    ids_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
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
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id, material_status);
CREATE INDEX IF NOT EXISTS idx_materials_delivery ON materials(expected_delivery);
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

// 迁移：meetings.minutes_url（全时会议分享链接）
try {
  db.exec(`ALTER TABLE meetings ADD COLUMN minutes_url TEXT`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration meetings.minutes_url:", e.message);
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

// 迁移：为现有默认色项目分配随机主题色（仅首次）
const COLORS = ['#1565C0', '#E65100', '#2E7D32', '#6A1B9A', '#C62828', '#00838F', '#4E342E', '#37474F'];
try {
  const rows = db.prepare("SELECT id FROM projects WHERE theme_color = '#1565C0' ORDER BY id").all();
  rows.forEach((r, i) => {
    db.prepare("UPDATE projects SET theme_color = ? WHERE id = ?").run(COLORS[i % COLORS.length], r.id);
  });
  if (rows.length > 0) console.log(`Migrated theme colors for ${rows.length} projects`);
} catch (e) {
  console.warn("Migration theme_color assign:", e.message);
}

// =====================================================
// HPM 项目看板大改版：projects 表新增字段
// =====================================================

// 迁移：projects.department
try {
  db.exec(`ALTER TABLE projects ADD COLUMN department TEXT DEFAULT ''`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration projects.department:", e.message);
  }
}

// 迁移：projects.order_number
try {
  db.exec(`ALTER TABLE projects ADD COLUMN order_number TEXT DEFAULT ''`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration projects.order_number:", e.message);
  }
}

// 迁移：projects.storage_location
try {
  db.exec(`ALTER TABLE projects ADD COLUMN storage_location TEXT DEFAULT ''`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration projects.storage_location:", e.message);
  }
}

// 迁移：projects.meeting_time
try {
  db.exec(`ALTER TABLE projects ADD COLUMN meeting_time TEXT DEFAULT ''`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration projects.meeting_time:", e.message);
  }
}

// 迁移：projects.current_phase（项目当前阶段）
try {
  db.exec(`ALTER TABLE projects ADD COLUMN current_phase TEXT DEFAULT 'pre_research'`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration projects.current_phase:", e.message);
  }
}
// 为历史项目回填默认值
try {
  db.prepare("UPDATE projects SET current_phase = 'pre_research' WHERE current_phase IS NULL OR current_phase = ''").run();
} catch (e) {
  console.warn("Migration projects.current_phase backfill:", e.message);
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

// 迁移：projects.sort_order（拖拽排序持久化）
try {
  db.exec(`ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT 0`);
  db.exec(`UPDATE projects SET sort_order = id WHERE sort_order = 0 OR sort_order IS NULL`);
  console.log("Migration projects.sort_order: done");
} catch (e) {
  if (!e.message.includes("duplicate column")) console.warn("Migration projects.sort_order:", e.message);
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

// =====================================================
// M3 增量：Mantis 同步缓存 + issues/mantis_connection 扩展
// =====================================================

// 新增 sync_cache 表
db.exec(`
CREATE TABLE IF NOT EXISTS sync_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    cache_key TEXT,
    cache_data TEXT,
    cached_at TEXT DEFAULT (datetime('now','localtime')),
    ttl_seconds INTEGER DEFAULT 300
);
`);

// issues 表新增 category 列
try {
  db.exec(`ALTER TABLE issues ADD COLUMN category TEXT`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration issues.category:", e.message);
  }
}

// issues 表新增 resolution 列
try {
  db.exec(`ALTER TABLE issues ADD COLUMN resolution TEXT`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration issues.resolution:", e.message);
  }
}

// mantis_connection 表新增 last_sync_at 列
try {
  db.exec(`ALTER TABLE mantis_connection ADD COLUMN last_sync_at TEXT`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration mantis_connection.last_sync_at:", e.message);
  }
}

// mantis_connection 表新增 last_sync_status 列
try {
  db.exec(`ALTER TABLE mantis_connection ADD COLUMN last_sync_status TEXT`);
} catch (e) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Migration mantis_connection.last_sync_status:", e.message);
  }
}

// sync_cache 索引
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_cache_project_key ON sync_cache(project_id, cache_key)`);
} catch (e) {
  console.warn("Migration idx_sync_cache_project_key:", e.message);
}

// =====================================================
// M5 增量：AI 智能纪要缓存表
// =====================================================

db.exec(`
CREATE TABLE IF NOT EXISTS smart_minutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
    record_file_id TEXT,
    content TEXT,
    summary TEXT,
    action_items_json TEXT,
    fetched_at TEXT DEFAULT (datetime('now','localtime')),
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_smart_minutes_meeting ON smart_minutes(meeting_id)`);
} catch (e) {
  console.warn("Migration idx_smart_minutes_meeting:", e.message);
}

// =====================================================
// 本周会议模块
// =====================================================
db.exec(`
CREATE TABLE IF NOT EXISTS week_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key TEXT NOT NULL,
    weekday TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_week_meetings_key ON week_meetings(week_key);
CREATE TABLE IF NOT EXISTS week_meeting_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key TEXT NOT NULL,
    weekday TEXT NOT NULL,
    content TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(week_key, weekday)
);
`);
console.log("Migration week_meetings + week_meeting_outputs: done");

// 迁移：week_meeting_outputs（单 blob）→ meeting_outputs（逐条 item + 完成态）
try {
  db.exec(`CREATE TABLE IF NOT EXISTS meeting_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key TEXT NOT NULL,
    weekday TEXT NOT NULL,
    title TEXT NOT NULL,
    is_done INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  const oldTbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='week_meeting_outputs'").get();
  if (oldTbl) {
    const rows = db.prepare("SELECT week_key, weekday, content FROM week_meeting_outputs WHERE content IS NOT NULL AND content != ''").all();
    const ins = db.prepare("INSERT INTO meeting_outputs (week_key, weekday, title, is_done, sort_order) VALUES (?, ?, ?, 0, 0)");
    const tx = db.transaction(() => { rows.forEach((r) => ins.run(r.week_key, r.weekday, r.content)); });
    tx();
    db.exec("DROP TABLE week_meeting_outputs");
  }
} catch (e) {
  console.warn("Migration meeting_outputs:", e.message);
}

// =====================================================
// P0 增量：PLM 连接与只读探针（曙光 PLM / 经典 ENOVIA v6）
// 本次只建表 + 连接配置，不实现实际排程同步（P1 负责）
// =====================================================

// PLM 适配器：连接配置（单用户，取第一条）
db.exec(`CREATE TABLE IF NOT EXISTS plm_connection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_url TEXT NOT NULL,
  api_token TEXT,
  collab_space TEXT DEFAULT 'GLOBAL',
  tls_reject_unauthorized INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// PLM 任务映射（预留给 P1/P2 增量同步，本次仅建表）
db.exec(`CREATE TABLE IF NOT EXISTS plm_task_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hpm_project_id INTEGER,
  hpm_task_id TEXT,
  plm_object_id TEXT,
  plm_object_type TEXT,
  sync_state TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
)`);

console.log("Migration plm_connection + plm_task_map: done");

export default db;
