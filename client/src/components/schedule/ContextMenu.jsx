import { useState } from "react";
import {
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
  Box, Typography,
} from "@mui/material";
import {
  SwapHoriz, FormatIndentDecrease, FormatIndentIncrease,
  AccountTree, Add, Delete, Palette,
} from "@mui/icons-material";

/**
 * 右键菜单组件
 * 8 项主菜单 + 1 个子菜单（修改任务类型）+ 背景色选项
 */
export default function ContextMenu({
  open,
  anchorPosition,
  task,
  tasks,
  onClose,
  onChangeType,
  onIndent,
  onOutdent,
  onPredecessors,
  onInsert,
  onDelete,
  onBgColor,
}) {
  const [typeAnchorEl, setTypeAnchorEl] = useState(null);
  const [colorAnchorEl, setColorAnchorEl] = useState(null);

  if (!task) return null;

  const taskParentKey = task.parent_id || null;
  const siblings = tasks.filter(
    (t) => (t.parent_id || null) === taskParentKey
  );
  const siblingIndex = siblings.findIndex((t) => t.id === task.id);
  const isFirstSibling = siblingIndex <= 0;
  const isTopLevel = task.parent_id === null || task.parent_id === undefined;

  const taskTypes = ["普通任务", "阶段任务", "节点任务"];

  const presetColors = [
    "#FFFFFF", "#FFF8E1", "#E8F0FE", "#E8F5E9",
    "#FCE4EC", "#F3E5F5", "#E0F7FA", "#FFF3E0",
    "#EFEBE9", "#ECEFF1",
  ];

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
      MenuListProps={{ dense: true }}
    >
      {/* 修改任务类型 — 嵌套子菜单 */}
      <MenuItem
        onClick={(e) => setTypeAnchorEl(e.currentTarget)}
        dense
      >
        <ListItemIcon><SwapHoriz fontSize="small" /></ListItemIcon>
        <ListItemText>修改任务类型</ListItemText>
      </MenuItem>

      <Menu
        open={Boolean(typeAnchorEl)}
        anchorEl={typeAnchorEl}
        onClose={() => setTypeAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {taskTypes.map((typeName) => (
          <MenuItem
            key={typeName}
            selected={task.task_type === typeName}
            onClick={() => {
              setTypeAnchorEl(null);
              onClose();
              if (typeName !== task.task_type) {
                onChangeType(task.id, typeName);
              }
            }}
            dense
          >
            {typeName}
          </MenuItem>
        ))}
      </Menu>

      <Divider />

      {/* 降级 */}
      <MenuItem
        onClick={() => { onClose(); onIndent(task.id); }}
        disabled={isFirstSibling}
        dense
      >
        <ListItemIcon><FormatIndentIncrease fontSize="small" /></ListItemIcon>
        <ListItemText>降级</ListItemText>
      </MenuItem>

      {/* 升级 */}
      <MenuItem
        onClick={() => { onClose(); onOutdent(task.id); }}
        disabled={isTopLevel}
        dense
      >
        <ListItemIcon><FormatIndentDecrease fontSize="small" /></ListItemIcon>
        <ListItemText>升级</ListItemText>
      </MenuItem>

      <Divider />

      {/* 前置任务设置 */}
      <MenuItem
        onClick={() => { onClose(); onPredecessors(task); }}
        dense
      >
        <ListItemIcon><AccountTree fontSize="small" /></ListItemIcon>
        <ListItemText>前置任务设置</ListItemText>
      </MenuItem>

      {/* 背景色 */}
      <MenuItem
        onClick={(e) => setColorAnchorEl(e.currentTarget)}
        dense
      >
        <ListItemIcon><Palette fontSize="small" /></ListItemIcon>
        <ListItemText>背景色</ListItemText>
      </MenuItem>

      <Menu
        open={Boolean(colorAnchorEl)}
        anchorEl={colorAnchorEl}
        onClose={() => setColorAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ px: 1.5, py: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            选择背景色（子任务自动继承）
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 1.5, pb: 1, maxWidth: 160 }}>
          {presetColors.map((color) => (
            <Box
              key={color}
              onClick={() => {
                setColorAnchorEl(null);
                onClose();
                onBgColor(task.id, color === "#FFFFFF" ? "" : color);
              }}
              sx={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: color,
                border: "2px solid",
                borderColor: task.bg_color === color || (!task.bg_color && color === "#FFFFFF")
                  ? "primary.main" : "divider",
                cursor: "pointer",
                "&:hover": { transform: "scale(1.2)" },
                transition: "transform 0.15s",
              }}
            />
          ))}
        </Box>
        <Box sx={{ px: 1.5, pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              component="input"
              type="color"
              defaultValue={task.bg_color || "#FFFFFF"}
              sx={{ width: 28, height: 28, border: "none", cursor: "pointer", p: 0 }}
              onChange={(e) => {
                // on change triggered on picker close
              }}
              onBlur={(e) => {
                const val = e.target.value;
                setColorAnchorEl(null);
                onClose();
                onBgColor(task.id, val === "#ffffff" ? "" : val);
              }}
            />
            <Typography variant="caption" color="text.secondary">
              自定义颜色
            </Typography>
          </Box>
        </Box>
        {(task.bg_color) && (
          <Box sx={{ px: 1.5, pb: 1 }}>
            <MenuItem
              dense
              onClick={() => {
                setColorAnchorEl(null);
                onClose();
                onBgColor(task.id, "");
              }}
              sx={{ color: "error.main", fontSize: "0.8rem" }}
            >
              清除背景色
            </MenuItem>
          </Box>
        )}
      </Menu>

      <Divider />

      {/* 在上方插入 */}
      <MenuItem
        onClick={() => { onClose(); onInsert("above", task); }}
        dense
      >
        <ListItemIcon><Add fontSize="small" /></ListItemIcon>
        <ListItemText>在上方插入</ListItemText>
      </MenuItem>

      {/* 在下方插入 */}
      <MenuItem
        onClick={() => { onClose(); onInsert("below", task); }}
        dense
      >
        <ListItemIcon><Add fontSize="small" /></ListItemIcon>
        <ListItemText>在下方插入</ListItemText>
      </MenuItem>

      <Divider />

      {/* 删除任务 */}
      <MenuItem
        onClick={() => { onClose(); onDelete(task.id); }}
        dense
      >
        <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
        <ListItemText sx={{ color: "error.main" }}>删除任务</ListItemText>
      </MenuItem>
    </Menu>
  );
}
