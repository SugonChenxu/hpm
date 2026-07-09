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

/** 优先级 → 颜色 + 中文 */
const PRIORITY_CONFIG = {
  urgent: { color: "#D32F2F", label: "紧急" },
  high: { color: "#ED6C02", label: "高" },
  medium: { color: "#2196F3", label: "中" },
  low: { color: "#9E9E9E", label: "低" },
};

function priorityColor(p) {
  return PRIORITY_CONFIG[p]?.color || "#9E9E9E";
}

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
 *   tasks   — 该项目的任务数组
 *   onEdit  — (project) => void  编辑回调
 */
export default function ProjectCard({ project, tasks = [], onEdit }) {
  const [contextMenu, setContextMenu] = useState(null);
  const themeColor = project.theme_color || "#1565C0";
  const activeTasks = tasks.filter(
    (t) => !t.completed_at && !t.deleted_at
  );

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
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          border: "1px solid",
          borderColor: "grey.200",
          overflow: "hidden",
          cursor: "context-menu",
          transition: "box-shadow 0.2s",
          "&:hover": {
            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
          },
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
          {/* 标题行：[代号] + 名称 */}
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{
              mb: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.95rem",
            }}
          >
            <Box component="span" sx={{ color: themeColor, fontWeight: 800 }}>
              [{project.code}]
            </Box>{" "}
            {project.name}
          </Typography>

          {/* 信息聚合区 */}
          <Box sx={{ mb: 1 }}>
            <InfoRow label="订单号" value={project.order_number} />
            <InfoRow label="库位" value={project.storage_location} />
            <InfoRow label="例会时间" value={project.meeting_time} />
            <InfoRow
              label="当前阶段"
              value={project.current_phase || "-"}
            />
          </Box>

          {/* 待办列表（全部显示 + 优先级状态灯） */}
          {activeTasks.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
                {activeTasks.map((t) => (
                  <Typography
                    key={t.id}
                    variant="body2"
                    sx={{
                      fontSize: "0.78rem",
                      color: "text.secondary",
                      lineHeight: 1.7,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: priorityColor(t.priority),
                        mr: 0.75,
                        verticalAlign: "middle",
                      }}
                    />
                    {t.title}
                  </Typography>
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
                sx={{ fontSize: "0.78rem", color: "grey.400", fontStyle: "italic" }}
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
    </>
  );
}
