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
import PriorityChip from "./PriorityChip";

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
export default function ProjectCard({ project, tasks = [], onEdit, onPhaseChange }) {
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
