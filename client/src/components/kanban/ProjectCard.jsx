import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Menu,
  MenuItem,
  Divider,
} from "@mui/material";
import { Edit } from "@mui/icons-material";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import PriorityChip from "./PriorityChip";

// 饼图配色（与故障仪表板 CategoryBarChart 保持一致）
const PIE_COLORS = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#F97316", "#84CC16", "#6366F1"];

// DI 阈值配色：≤10 绿，≤30 黄，其余 红
function diColor(di) {
  if (di <= 10) return "#10B981";
  if (di <= 30) return "#F59E0B";
  return "#EF4444";
}
function rateColor(rate) {
  if (rate >= 90) return "#10B981";
  if (rate >= 50) return "#F59E0B";
  return "#EF4444";
}

/** 项目阶段固定配置（6 个阶段，带固定配色） */
const PROJECT_PHASES = [
  { key: "pre_research",  label: "预研阶段", color: "#7C3AED" },
  { key: "detail_design", label: "详细设计", color: "#2563EB" },
  { key: "evt",           label: "EVT",      color: "#16A34A" },
  { key: "dvt",           label: "DVT",      color: "#CA8A04" },
  { key: "pilot",         label: "批量试制", color: "#EA580C" },
  { key: "yield_ramp",    label: "直通率爬坡", color: "#DC2626" },
];
const PHASE_MAP = Object.fromEntries(PROJECT_PHASES.map((p) => [p.key, p]));

/** InfoRow: 紧凑的 label : value 行 */
function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{
        fontSize: "0.8rem",
        lineHeight: 1.6,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        mb: 0.25,
      }}
    >
      <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
        {label}:
      </Box>{" "}
      {value}
    </Typography>
  );
}

/**
 * ProjectCard — 项目概览卡片
 *
 * Props:
 *   project — { id, code, name, theme_color, order_number, storage_location,
 *               meeting_time, current_phase, ... }
 *   tasks   — 该项目的任务数组（含 status / kanban_column 字段）
 *   onEdit  — (project) => void  编辑回调
 */
export default function ProjectCard({ project, tasks = [], faults, onEdit, onPhaseChange }) {
  const [contextMenu, setContextMenu] = useState(null);
  const [phaseAnchor, setPhaseAnchor] = useState(null);
  const themeColor = project.theme_color || "#7C3AED";
  const activeTasks = tasks.filter(
    (t) => !t.completed_at && !t.deleted_at
  );

  /** 当前阶段（从 project.current_phase 取得，缺省为预研阶段） */
  const phaseKey = project.current_phase || "pre_research";
  const phase = PHASE_MAP[phaseKey] || PROJECT_PHASES[0];

  /** 右键打开编辑菜单 */
  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu(
      contextMenu === null
        ? { mouseX: e.clientX - 2, mouseY: e.clientY - 4 }
        : null
    );
  };

  /** 关闭菜单 */
  const handleCloseMenu = () => {
    setContextMenu(null);
  };

  /** 编辑项目 */
  const handleEdit = () => {
    handleCloseMenu();
    if (onEdit) onEdit(project);
  };

  return (
    <>
      <Card
        onContextMenu={handleContextMenu}
        sx={{
          position: "relative",
          borderRadius: 2,
          overflow: "hidden",
          cursor: "context-menu",
        }}
      >
        {/* 左侧 4px 彩色竖条 */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            bgcolor: themeColor,
          }}
        />

        <CardContent sx={{ pl: 2.5, pr: 2, py: 2, "&:last-child": { pb: 2 } }}>
          {/* 标题区域：代号 + 阶段毛玻璃框（同一行） + 名称（下一行） */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: "1.25rem",
                fontWeight: 800,
                color: themeColor,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              [{project.code}]
            </Typography>
            <Box
              onClick={(e) => setPhaseAnchor(e.currentTarget)}
              sx={{
                display: "inline-flex", alignItems: "center",
                px: 1.1, py: 0.25, borderRadius: 1.5,
                fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.02em",
                color: phase.color,
                bgcolor: `${phase.color}1A`,            // ~10% 透明度
                border: `1px solid ${phase.color}55`,   // ~33% 透明度
                backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                cursor: "pointer", userSelect: "none", flexShrink: 0,
                transition: "background-color 0.15s",
                "&:hover": { bgcolor: `${phase.color}2E` },
              }}
            >
              {phase.label}
            </Box>
          </Box>
          <Typography
            sx={{
              fontSize: "0.95rem",
              fontWeight: 700,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              mb: 1.25,
            }}
          >
            {project.name}
          </Typography>

          {/* 信息聚合区 */}
          <Box sx={{ mb: 1 }}>
            <InfoRow label="内部立项号" value={project.order_number} />
            <InfoRow label="库位" value={project.storage_location} />
            <InfoRow label="例会时间" value={project.meeting_time} />
          </Box>

          {/* 待办列表（全部显示 + 优先级状态灯） */}
          {activeTasks.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
                {activeTasks.map((t) => (
                  <Box
                    key={t.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      py: 0.25,
                    }}
                  >
                    <PriorityChip priority={t.priority} />
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.78rem",
                        color: "text.secondary",
                        lineHeight: 1.7,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {t.title}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}

          {/* 无待办时显示提示 */}
          {activeTasks.length === 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography
                variant="body2"
                sx={{ fontSize: "0.78rem", color: "text.disabled", fontStyle: "italic" }}
              >
                暂无待办任务
              </Typography>
            </>
          )}

          {/* 故障概览（统一读本地 issues 表，与 M3 故障管理同源） */}
          {faults?.summary && (() => {
            const s = faults.summary || {};
            const di = Number(s.di) || 0;
            const total = Number(s.total) || 0;
            const rate = Number(s.rate) || 0;
            const trendData = (faults.diTrend || [])
              .filter((d) => d.di > 0)
              .map((d) => ({ date: d.date, di: Math.round((d.di || 0) * 100) / 100 }));
            const pieData = (faults.unresolvedCategoryStats || [])
              .filter((d) => d.count > 0)
              .sort((a, b) => b.count - a.count)
              .map((d) => ({ name: d.category, value: d.count }));
            const topModules = pieData.slice(0, 5);
            return (
              <>
                <Divider sx={{ my: 1 }} />
                <Box>
                  {/* 标题 */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5, mt: 0.5 }}>
                    <Typography
                      sx={{ fontSize: "0.8rem", fontWeight: 700, color: "text.primary", letterSpacing: "0.02em" }}
                    >
                      故障概览
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <Typography variant="caption" color="text.disabled">Mantis</Typography>
                  </Box>

                  {/* 指标行 */}
                  <Box sx={{ display: "flex", gap: 4, mb: 0.75 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>DI</Typography>
                      <Typography sx={{ fontSize: "1.05rem", fontWeight: 800, color: diColor(di), lineHeight: 1.1 }}>{di}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>故障</Typography>
                      <Typography sx={{ fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}>{total}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>解决率</Typography>
                      <Typography sx={{ fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1, color: rateColor(rate) }}>{rate}%</Typography>
                    </Box>
                  </Box>

                  {/* 图表行：DI 趋势 sparkline + 缺陷分布饼图 */}
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <Box sx={{ flex: 1, minWidth: 0, height: 52 }}>
                      {trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={52}>
                          <AreaChart data={trendData} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                            <defs>
                              <linearGradient id={`diGrad-${project.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#EF4444" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="di" stroke="#EF4444" strokeWidth={1.5}
                              fill={`url(#diGrad-${project.id})`} dot={false} isAnimationActive={false} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const p = payload[0].payload;
                                return (
                                  <Box sx={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 1, px: 1, py: 0.5, fontSize: 12, lineHeight: 1.4 }}>
                                    <div style={{ color: "#6B7280" }}>{p.date}</div>
                                    <div style={{ fontWeight: 700 }}>DI {p.di}</div>
                                  </Box>
                                );
                              }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <Box sx={{ height: 52, display: "flex", alignItems: "center" }}>
                          <Typography variant="caption" color="text.disabled">暂无 DI 趋势</Typography>
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ width: 104, height: 104, flexShrink: 0 }}>
                      {pieData.length > 0 ? (
                        <PieChart width={104} height={104}>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                            innerRadius={22} outerRadius={48} paddingAngle={1} stroke="none" isAnimationActive={false}>
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12 }}
                            formatter={(v, n) => [`${v} 条`, n]}
                          />
                        </PieChart>
                      ) : (
                        <Box sx={{ height: 104, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Typography variant="caption" color="text.disabled">暂无分布</Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* 模块分布图例（Top 5） */}
                  {topModules.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                      {topModules.map((m, i) => (
                        <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                          <Typography
                            variant="caption"
                            title={`${m.name} ${m.value}`}
                            sx={{ fontSize: "0.66rem", color: "text.secondary", maxWidth: 92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {m.name} {m.value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </>
            );
          })()}

          {/* 未关联 Mantis 时提示（本地缺陷仍展示，仅趋势图不可用） */}
          {faults?.summary && !faults?.linked && (
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
              · 未关联 Mantis（趋势图不可用，仅显示本地缺陷）
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* 右键菜单 */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        PaperProps={{ sx: { minWidth: 140 } }}
      >
        <MenuItem onClick={handleEdit} dense>
          <Edit sx={{ fontSize: 18, mr: 1 }} />
          编辑项目
        </MenuItem>
      </Menu>

      {/* 阶段选择菜单 */}
      <Menu
        open={phaseAnchor !== null}
        anchorEl={phaseAnchor}
        onClose={() => setPhaseAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {PROJECT_PHASES.map((p) => (
          <MenuItem
            key={p.key}
            selected={p.key === phaseKey}
            onClick={() => {
              setPhaseAnchor(null);
              if (p.key !== phaseKey && onPhaseChange) onPhaseChange(project.id, p.key);
            }}
            sx={{
              fontSize: "0.82rem",
              color: p.color,
              "&.Mui-selected": { bgcolor: `${p.color}1A` },
              "&:hover": { bgcolor: `${p.color}14` },
            }}
          >
            <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: p.color, mr: 1.25, display: "inline-block" }} />
            {p.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
