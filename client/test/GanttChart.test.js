import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GanttChart from "../src/components/schedule/GanttChart.jsx";
import { buildTree } from "./fixtures.js";

// ============ GanttChart 集成渲染（修复②/③ 在图中的体现）============
describe("GanttChart — 集成渲染", () => {
  it("渲染标题“项目甘特图”", () => {
    render(
      React.createElement(GanttChart, { tasks: buildTree, unit: "day" })
    );
    expect(screen.getByText("项目甘特图")).toBeTruthy();
  });

  it("空任务 → 显示空状态提示", () => {
    render(React.createElement(GanttChart, { tasks: [], unit: "day" }));
    expect(screen.getByText(/暂无排期/)).toBeTruthy();
  });

  it("阶段任务行在甘特图中显示折叠箭头（修复③ 联动，2 个阶段=2 个箭头）", () => {
    render(
      React.createElement(GanttChart, {
        tasks: buildTree,
        unit: "day",
        collapsedPhases: new Set(),
      })
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
  });

  it("折叠某阶段时，该阶段箭头 aria-label 变为“展开”，其余仍为“折叠”", () => {
    render(
      React.createElement(GanttChart, {
        tasks: buildTree,
        unit: "day",
        collapsedPhases: new Set([1]),
      })
    );
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(labels).toContain("展开");
    expect(labels).toContain("折叠");
  });

  it("子任务名称出现在左侧名称列", () => {
    render(
      React.createElement(GanttChart, { tasks: buildTree, unit: "day" })
    );
    expect(screen.getByText("子任务A1")).toBeTruthy();
  });
});
