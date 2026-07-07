import { useState } from "react";
import {
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from "@mui/material";
import {
  SwapHoriz, ArrowUpward, ArrowDownward, AccountTree, Add, Delete,
} from "@mui/icons-material";

/**
 * 右键菜单组件
 * 7 项主菜单 + 1 个子菜单（修改任务类型）
 */
export default function ContextMenu({
  open,
  anchorPosition,
  task,
  tasks,
  onClose,
  onChangeType,
  onMove,
  onPredecessors,
  onInsert,
  onDelete,
}) {
  const [typeAnchorEl, setTypeAnchorEl] = useState(null);

  if (!task) return null;

  const taskIndex = tasks.findIndex((t) => t.id === task.id);
  const isFirst = taskIndex === 0;
  const isLast = taskIndex === tasks.length - 1;

  const taskTypes = ["普通任务", "阶段任务", "节点任务"];

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

      {/* 子菜单 */}
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

      {/* 升级 */}
      <MenuItem
        onClick={() => { onClose(); onMove(task.id, "up"); }}
        disabled={isFirst}
        dense
      >
        <ListItemIcon><ArrowUpward fontSize="small" /></ListItemIcon>
        <ListItemText>升级</ListItemText>
      </MenuItem>

      {/* 降级 */}
      <MenuItem
        onClick={() => { onClose(); onMove(task.id, "down"); }}
        disabled={isLast}
        dense
      >
        <ListItemIcon><ArrowDownward fontSize="small" /></ListItemIcon>
        <ListItemText>降级</ListItemText>
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
