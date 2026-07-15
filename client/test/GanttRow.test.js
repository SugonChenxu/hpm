import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import dayjs from "dayjs";
import GanttRow from "../src/components/schedule/GanttRow.jsx";

// 构造一份 GanttRowModel（来源：GanttChart.buildGanttModel 的行模型）
const makeModel = (over = {}) => ({
  id: 100,
  name: "阶段X",
  depth: 0,
  taskType: "阶段任务",
  status: "进行中",
  startDate: dayjs("2026-07-01"),
  endDate: dayjs("2026-07-10"),
  durationDays: 10,
  rowIndex: 0,
  x: 0,
  width: 100,
  color: "#8B5CF6",
  bgColor: null,
  ...over,
});

const baseProps = (
  model,
  collapsedPhases = new Set(),
  onToggleCollapse = vi.fn()
) => ({
  model,
  rowHeight: 36,
  barHeight: 22,
  nameColWidth: 220,
  chartWidth: 400,
  collapsedPhases,
  onToggleCollapse,
});

// ============ 修复③：甘特图名称列阶段折叠箭头 ============
describe("GanttRow — 修复③ 阶段折叠箭头", () => {
  it("阶段任务渲染折叠箭头按钮（role=button, aria-label=折叠）", () => {
    const onToggle = vi.fn();
    render(
      React.createElement(GanttRow, baseProps(makeModel(), new Set(), onToggle))
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-label")).toBe("折叠");
  });

  it("collapsedPhases 含该阶段时，aria-label 变为“展开”（联动状态）", () => {
    render(
      React.createElement(GanttRow, baseProps(makeModel(), new Set([100])))
    );
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("展开");
  });

  it("点击箭头调用 onToggleCollapse(阶段id)", () => {
    const onToggle = vi.fn();
    render(
      React.createElement(GanttRow, baseProps(makeModel(), new Set(), onToggle))
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith(100);
  });

  it("普通任务（非阶段）不渲染折叠箭头", () => {
    render(
      React.createElement(
        GanttRow,
        baseProps(makeModel({ taskType: "普通任务", name: "子任务" }))
      )
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("节点任务不渲染折叠箭头", () => {
    render(
      React.createElement(
        GanttRow,
        baseProps(makeModel({ taskType: "节点任务", name: "里程碑" }))
      )
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
