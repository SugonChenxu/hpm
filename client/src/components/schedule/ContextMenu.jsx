import { useState } from "react";
import {
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from "@mui/material";
import {
  SwapHoriz, FormatIndentDecrease, FormatIndentIncrease, AccountTree, Add, Delete,
} from "@mui/icons-material";

/**
 * 右键菜单组件
 * 7 项主菜单 + 1 个子菜单（修改任务类型）
 *
 * 升级/降级使用树形缩进语义：
 * - 降级 (Indent)：将当前任务变成紧邻上方兄弟任务的子任务
 * - 升级 (Outdent)：将子任务提升到与父任务平级
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
}) {
  const [typeAnchorEl, setTypeAnchorEl] = useState(null);

  if (!task) return null;

  // 查找同父级的兄弟任务，判断是否为第一个兄弟（不能降级）
  const taskParentKey = task.parent_id || null;
  const siblings = tasks.filter(
    (t) => (t.parent_id || null) === taskParentKey
  );
  const siblingIndex = siblings.findIndex((t) => t.id === task.id);
  const isFirstSibling = siblingIndex <= 0;
  // 顶级任务不能升级
  const isTopLevel = task.parent_id === null || task.parent_id === undefined;

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

      {/* 降级 (Indent) — 成为上方兄弟任务的子任务 */}
      <MenuItem
        onClick={() => { onClose(); onIndent(task.id); }}
        disabled={isFirstSibling}
        dense
      >
        <ListItemIcon><FormatIndentIncrease fontSize="small" /></ListItemIcon>
        <ListItemText>降级</ListItemText>
      </MenuItem>

      {/* 升级 (Outdent) — 提升到父任务平级 */}
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
