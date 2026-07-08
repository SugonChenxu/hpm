import { useState } from "react";
import {
  Box,
  Typography,
  Card,
  IconButton,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import {
  Undo,
  DeleteOutline,
  CheckCircleOutline,
} from "@mui/icons-material";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import PriorityChip from "./PriorityChip";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

/**
 * 格式化"多久之前"
 * @param {string} dateStr - ISO 日期字符串
 * @returns {string}
 */
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const now = dayjs();
  const then = dayjs(dateStr);
  const mins = now.diff(then, "minute");
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = now.diff(then, "hour");
  if (hours < 24) return `${hours} 小时前`;
  const days = now.diff(then, "day");
  if (days < 30) return `${days} 天前`;
  return then.format("MM-DD");
}

/**
 * 已完成栏 — completed_at 倒序，悬浮操作（撤销/删除）
 *
 * @param {Object} props
 * @param {Array} props.tasks - 已完成任务列表（按 completed_at DESC 排序）
 * @param {Function} props.onUndo - (task) => Promise，撤销完成
 * @param {Function} props.onDelete - (taskId) => Promise，删除任务
 */
export default function DoneColumn({ tasks, onUndo, onDelete }) {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  const handleUndo = async (task) => {
    setLoadingId(task.id);
    try {
      await onUndo(task);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setLoadingId(deleteTarget.id);
    try {
      await onDelete(deleteTarget.id);
    } finally {
      setLoadingId(null);
      setDeleteTarget(null);
    }
  };

  // 按 completed_at 倒序
  const sorted = [...tasks].sort((a, b) => {
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return new Date(b.completed_at) - new Date(a.completed_at);
  });

  return (
    <>
      <Box
        sx={{
          flex: 1,
          minWidth: 280,
          display: "flex",
          flexDirection: "column",
          bgcolor: "#f5f5f5",
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          opacity: 0.85,
        }}
      >
        {/* 标题 */}
        <Box sx={{ p: 1.5, pb: 1 }}>
          <Typography
            variant="subtitle2"
            fontWeight={600}
            color="text.secondary"
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <CheckCircleOutline sx={{ fontSize: 18, color: "success.main" }} />
            已完成
          </Typography>
        </Box>

        {/* 已完成列表 */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 1.5, pb: 1 }}>
          {sorted.length === 0 ? (
            <Typography
              variant="body2"
              color="text.disabled"
              sx={{ textAlign: "center", py: 4 }}
            >
              暂无已完成任务
            </Typography>
          ) : (
            sorted.map((task) => (
              <Card
                key={task.id}
                sx={{
                  mb: 0.5,
                  p: 1,
                  bgcolor: "background.paper",
                  border: "1px solid",
                  borderColor: "divider",
                  "&:hover .done-actions": { opacity: 1 },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        textDecoration: "line-through",
                        color: "text.disabled",
                        fontSize: "0.8rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.title}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
                      <PriorityChip priority={task.priority} />
                      <Typography variant="caption" color="text.disabled">
                        {timeAgo(task.completed_at)}
                      </Typography>
                    </Box>
                  </Box>

                  {/* 悬浮操作按钮 */}
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
                      <IconButton
                        size="small"
                        onClick={() => handleUndo(task)}
                        disabled={loadingId === task.id}
                        sx={{ p: 0.25 }}
                      >
                        <Undo sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        onClick={() => setDeleteTarget(task)}
                        disabled={loadingId === task.id}
                        sx={{ p: 0.25 }}
                      >
                        <DeleteOutline sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Card>
            ))
          )}
        </Box>

        {/* 底部计数 */}
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Chip
            label={`${sorted.length} 项已完成`}
            size="small"
            variant="outlined"
            color="success"
            sx={{ fontSize: "0.7rem", height: 22 }}
          />
        </Box>
      </Box>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除任务「{deleteTarget?.title}」吗？此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            autoFocus
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
