import { describe, it, expect } from "vitest";
import {
  computeVisibleTasks,
  calcCompletionStatus,
  toDayjs,
  addDays,
  daysBetween,
} from "../src/utils/schedule-date.js";
import { buildTree } from "./fixtures.js";

// ============ 修复③：折叠联动（与排期表共用 collapsedPhases 单一数据源）============
describe("computeVisibleTasks — 折叠联动（修复③ 数据机制）", () => {
  it("不折叠时返回全部任务，顺序不变", () => {
    const visible = computeVisibleTasks(buildTree, new Set());
    expect(visible.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("折叠阶段A：阶段自身保留，其所有子孙（含多级）被隐藏", () => {
    const visible = computeVisibleTasks(buildTree, new Set([1]));
    expect(visible.map((t) => t.id)).toEqual([1, 5, 6]);
  });

  it("折叠阶段B：仅隐藏其子任务", () => {
    const visible = computeVisibleTasks(buildTree, new Set([5]));
    expect(visible.map((t) => t.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("同时折叠阶段A与阶段B", () => {
    const visible = computeVisibleTasks(buildTree, new Set([1, 5]));
    expect(visible.map((t) => t.id)).toEqual([1, 5]);
  });

  it("collapsedPhases 为 null/undefined 时不隐藏任何任务", () => {
    expect(computeVisibleTasks(buildTree, null).map((t) => t.id)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(computeVisibleTasks(buildTree, undefined).map((t) => t.id)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("非阶段任务即使 id 在 collapsedPhases 中也不触发隐藏", () => {
    // 普通任务 id=2 不在折叠逻辑中充当根
    const visible = computeVisibleTasks(buildTree, new Set([2]));
    expect(visible.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("空数组 / 非数组输入安全返回空数组", () => {
    expect(computeVisibleTasks([], new Set())).toEqual([]);
    expect(computeVisibleTasks(null, new Set())).toEqual([]);
    expect(computeVisibleTasks(undefined, new Set())).toEqual([]);
  });
});

// ============ 修复②：状态色兜底（getBgColor 无祖先色时按状态取色）============
describe("calcCompletionStatus — 状态色兜底", () => {
  const TODAY = new Date("2026-07-15T00:00:00");

  it("结束日期早于今天 → 已完成", () => {
    expect(
      calcCompletionStatus(
        { planned_start: "2026-07-01", planned_end: "2026-07-10" },
        TODAY
      )
    ).toBe("已完成");
  });

  it("开始日期晚于今天 → 未开始", () => {
    expect(
      calcCompletionStatus(
        { planned_start: "2026-07-20", planned_end: "2026-07-30" },
        TODAY
      )
    ).toBe("未开始");
  });

  it("今天落在起止区间内 → 进行中", () => {
    expect(
      calcCompletionStatus(
        { planned_start: "2026-07-10", planned_end: "2026-07-20" },
        TODAY
      )
    ).toBe("进行中");
  });

  it("缺少起止日期 → 未开始", () => {
    expect(calcCompletionStatus({ name: "x" }, TODAY)).toBe("未开始");
  });
});

// ============ 日期工具轻量回归 ============
describe("schedule-date 工具函数", () => {
  it("toDayjs 取当天零点", () => {
    expect(toDayjs("2026-07-21").format("YYYY-MM-DD HH:mm:ss")).toBe(
      "2026-07-21 00:00:00"
    );
  });
  it("addDays 含首尾（开始+工期-1=结束）", () => {
    expect(addDays("2026-07-21", 5)).toBe("2026-07-25");
  });
  it("daysBetween 含首尾", () => {
    expect(daysBetween("2026-07-21", "2026-07-25")).toBe(5);
  });
});
