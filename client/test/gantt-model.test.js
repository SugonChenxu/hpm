import { describe, it, expect } from "vitest";
import { buildGanttModel } from "../src/components/schedule/GanttChart.jsx";
import { colorTree } from "./fixtures.js";

const colorById = (model, id) => model.rowModels.find((m) => m.id === id)?.color;

// ============ 修复②：同阶段子任务继承父阶段颜色（对齐 getBgColor 语义）============
describe("buildGanttModel — 修复② 颜色继承", () => {
  const model = buildGanttModel(colorTree, "day");

  it("父阶段自身使用自身 bg_color", () => {
    expect(colorById(model, 1)).toBe("#PARENT");
  });

  it("一层子任务（无 bg）继承父阶段颜色", () => {
    expect(colorById(model, 2)).toBe("#PARENT");
  });

  it("多级孙任务（父无 bg）继承最近祖先（祖父阶段）颜色", () => {
    expect(colorById(model, 3)).toBe("#PARENT");
  });

  it("自身有 bg_color 的子任务不继承父级颜色", () => {
    expect(colorById(model, 6)).toBe("#CHILD");
  });

  it("无 bg 且无祖先色 → 按状态色（已完成=#22c55e）", () => {
    expect(colorById(model, 5)).toBe("#22c55e");
  });

  it("对齐 getBgColor 语义：取【最近】祖先 bg_color（非更远）", () => {
    // 子任务2 的最近有 bg 的祖先是阶段1 → 必然是 #PARENT
    expect(colorById(model, 2)).toBe("#PARENT");
  });
});

// ============ 状态色映射（修复② 的兜底分支一致性）============
describe("buildGanttModel — 状态色映射", () => {
  const tasks = [
    {
      id: 1,
      task_type: "普通任务",
      name: "完成",
      planned_start: "2026-06-01",
      planned_end: "2026-06-10",
      duration_days: 10,
      bg_color: null,
      completion_status: "已完成",
    },
    {
      id: 2,
      task_type: "普通任务",
      name: "进行",
      planned_start: "2026-07-10",
      planned_end: "2026-07-20",
      duration_days: 11,
      bg_color: null,
      completion_status: "进行中",
    },
    {
      id: 3,
      task_type: "普通任务",
      name: "未开始",
      planned_start: "2026-08-01",
      planned_end: "2026-08-10",
      duration_days: 10,
      bg_color: null,
      completion_status: "未开始",
    },
  ];
  const m = buildGanttModel(tasks, "day");

  it("已完成→#22c55e / 进行中→#f59e0b / 未开始→#93c5fd", () => {
    expect(colorById(m, 1)).toBe("#22c55e");
    expect(colorById(m, 2)).toBe("#f59e0b");
    expect(colorById(m, 3)).toBe("#93c5fd");
  });
});

// ============ 修复①：时间轴单位切换（日/周/月/季度）不回归 ============
describe("buildGanttModel — 修复① 时间轴单位切换", () => {
  const tasks = [
    {
      id: 1,
      task_type: "普通任务",
      name: "T",
      planned_start: "2026-07-01",
      planned_end: "2026-07-31",
      duration_days: 31,
      bg_color: null,
      completion_status: "进行中",
    },
  ];
  const day = buildGanttModel(tasks, "day");
  const week = buildGanttModel(tasks, "week");
  const month = buildGanttModel(tasks, "month");
  const quarter = buildGanttModel(tasks, "quarter");

  it("不同单位图表宽度按 day > week > month > quarter 缩放", () => {
    expect(day.chartWidth).toBeGreaterThan(week.chartWidth);
    expect(week.chartWidth).toBeGreaterThan(month.chartWidth);
    expect(month.chartWidth).toBeGreaterThan(quarter.chartWidth);
  });

  it("未知单位回退到 day（宽度一致）", () => {
    const unknown = buildGanttModel(tasks, "year");
    expect(unknown.chartWidth).toBe(day.chartWidth);
  });

  it("day 单位：每个 minor 刻度宽 = 1 天 × 24px", () => {
    for (const s of day.minorSegments) {
      expect(s.width).toBe(24);
    }
  });

  it("quarter 单位：minor 标签含 Q（季度粒度）", () => {
    expect(quarter.minorSegments.length).toBeGreaterThan(0);
    expect(quarter.minorSegments[0].label).toContain("Q");
  });

  it("month 单位：minor 标签含 年/月（月度粒度）", () => {
    expect(month.minorSegments[0].label).toContain("年");
  });
});

// ============ 防御性：无效输入不抛错 ============
describe("buildGanttModel — 防御性", () => {
  it("空数组 → empty 模型", () => {
    const m = buildGanttModel([], "day");
    expect(m.empty).toBe(true);
    expect(m.rowModels).toHaveLength(0);
  });

  it("null/undefined 输入不抛错", () => {
    expect(() => buildGanttModel(null)).not.toThrow();
    expect(buildGanttModel(null).empty).toBe(true);
    expect(() => buildGanttModel(undefined)).not.toThrow();
  });

  it("缺少日期的任务被过滤出 rowModels", () => {
    const m = buildGanttModel(
      [{ id: 1, task_type: "普通任务", bg_color: null }],
      "day"
    );
    expect(m.empty).toBe(true);
  });
});

// ============ 依赖连线（FS，lag=0）============
describe("buildGanttModel — 依赖连线", () => {
  const tasks = [
    {
      id: 1,
      task_type: "普通任务",
      planned_start: "2026-07-01",
      planned_end: "2026-07-05",
      duration_days: 5,
      bg_color: null,
      completion_status: "进行中",
    },
    {
      id: 2,
      task_type: "普通任务",
      planned_start: "2026-07-06",
      planned_end: "2026-07-10",
      duration_days: 5,
      bg_color: null,
      completion_status: "进行中",
      predecessor_ids: "[1]",
    },
    {
      id: 3,
      task_type: "普通任务",
      planned_start: "2026-07-11",
      planned_end: "2026-07-12",
      duration_days: 2,
      bg_color: null,
      completion_status: "进行中",
      predecessor_ids: "[3]", // 自依赖
    },
  ];
  const m = buildGanttModel(tasks, "day");

  it("构建合法 FS 连线，跳过自依赖", () => {
    const toIds = m.links.map((l) => l.toId);
    expect(toIds).toContain(2);
    expect(toIds).not.toContain(3);
  });
});
