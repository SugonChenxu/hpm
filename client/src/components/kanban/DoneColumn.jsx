import { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import { Undo, DeleteOutline } from "@mui/icons-material";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import PriorityChip from "./PriorityChip";

/** 格式化完成日期为 ✓ M/D */
function fmtDone(dateStr) {
  if (!dateStr) return "";
  return "✓ " + dayjs(dateStr).format("M/D");
}

/**
 * 已完成栏 — 对标原型：无边框盒子、灰化+删除线、✓ M/D
 */
export default function DoneColumn({ tasks, onUndo, onDelete }) {
  const [deleteTarget, setDeleteTarget] = useState(null);

  const sorted = [...tasks].sort((a, b) => {
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return new Date(b.completed_at) - new Date(a.completed_at);
  });

  return (
    <>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* 列头 */}
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={500}
          sx={{ fontSize: 12, mb: 0.75 }}
        >
          已完成 ({sorted.length})
        </Typography>

        {/* 已完成列表 */}
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          {sorted.length === 0 ? (
            <Typography
              variant="body2"
              color="text.disabled"
              sx={{ textAlign: "center", py: 2, fontSize: 12 }}
            >
              暂无已完成任务
            </Typography>
          ) : (
            sorted.map((task) => (
              <Box
                key={task.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  py: 0.5,
                  px: 0.5,
                  borderRadius: 1,
                  opacity: 0.6,
                  "&:hover": { bgcolor: "action.hover", opacity: 0.75 },
                  "&:hover .done-actions": { opacity: 1 },
                }}
              >
                {/* 优先级灯 — 淡化，与文本垂直居中 */}
                <Box
                  sx={{
                    opacity: 0.35,
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <PriorityChip priority={task.priority} />
                </Box>

                {/* 标题（单行，超长截断） */}
                <Typography
                  variant="body2"
                  sx={{
                    textDecoration: "line-through",
                    color: "text.secondary",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {task.title}
                </Typography>

                {/* 完成时间 */}
                <Typography
                  variant="caption"
                  sx={{ color: "success.main", fontSize: 10, flexShrink: 0, lineHeight: 1 }}
                >
                  {fmtDone(task.completed_at)}
                </Typography>

                {/* 子任务计数 */}
                {task.subtask_count > 0 && (
                  <Tooltip title={`已完成 ${task.subtask_count} 项`}>
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, cursor: "default", flexShrink: 0 }}>
                      📋
                    </Typography>
                  </Tooltip>
                )}

                {/* 操作键：撤销完成 / 删除（悬浮显出） */}
                <Box
                  className="done-actions"
                  sx={{
                    display: "flex",
                    opacity: 0,
                    transition: "opacity 0.15s",
                    flexShrink: 0,
                  }}
                >
                  <Tooltip title="撤销完成">
                    <IconButton size="small" onClick={() => onUndo(task)} sx={{ p: 0.25 }}>
                      <Undo sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton size="small" onClick={() => setDeleteTarget(task)} sx={{ p: 0.25 }}>
                      <DeleteOutline sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除任务「{deleteTarget?.title}」吗？
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button
            onClick={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }}
            color="error"
            variant="contained"
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
