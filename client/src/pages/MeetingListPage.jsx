import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Card,
} from "@mui/material";
import { Refresh } from "@mui/icons-material";
import api from "../api/client";
import MeetingDrawer from "../components/meeting/MeetingDrawer";

/**
 * MeetingListPage — 会议纪要列表页
 *
 * 功能：
 *  1. 从数据库加载会议列表（支持标题搜索）
 *  2. 「拉取腾讯会议」按钮调用 tmeet CLI 同步数据
 *  3. 点击行打开右侧 Drawer 查看 AI 智能纪要
 */
export default function MeetingListPage() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  // ===== 加载会议列表 =====
  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      const res = await api.meetings.list(params);
      setMeetings(res.data);
    } catch (e) {
      setSnackbar({
        open: true,
        message: `加载会议失败: ${e.message}`,
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // ===== 拉取腾讯会议 =====
  const handleFetch = async () => {
    setFetching(true);
    try {
      const res = await api.meetings.fetch();
      setSnackbar({
        open: true,
        message: res.data.message || `拉取完成：新增 ${res.data.new_count} 场，共 ${res.data.total} 场`,
        severity: "success",
      });
      await loadMeetings();
    } catch (e) {
      setSnackbar({
        open: true,
        message: `拉取失败: ${e.message}`,
        severity: "error",
      });
    } finally {
      setFetching(false);
    }
  };

  // ===== 点击行 → 打开 Drawer =====
  const handleRowClick = (meeting) => {
    setSelectedMeeting(meeting);
    setDrawerOpen(true);
  };

  // ===== 格式化工具 =====
  const formatTime = (iso) => {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return iso;
    }
  };

  const formatDuration = (mins) => {
    if (!mins && mins !== 0) return "-";
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m}min` : `${h}h`;
  };

  // ===== 渲染 =====
  return (
    <Box>
      {/* ---- 头部：标题 + 拉取按钮 ---- */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          会议纪要
        </Typography>
        <Button
          variant="contained"
          startIcon={
            fetching ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <Refresh />
            )
          }
          onClick={handleFetch}
          disabled={fetching}
        >
          {fetching ? "拉取中..." : "🔄 拉取腾讯会议"}
        </Button>
      </Box>

      {/* ---- 搜索框 ---- */}
      <TextField
        placeholder="搜索会议标题..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ mb: 2, width: { xs: "100%", sm: 320 } }}
      />

      {/* ---- 会议表格 ---- */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : meetings.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 6 }}>
          <Typography color="text.secondary" variant="body1">
            暂无会议记录
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            点击右上角「🔄 拉取腾讯会议」同步最新数据
          </Typography>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>会议标题</TableCell>
                <TableCell sx={{ width: 140 }}>开始时间</TableCell>
                <TableCell sx={{ width: 80 }}>时长</TableCell>
                <TableCell sx={{ width: 80 }}>参会人数</TableCell>
                <TableCell sx={{ width: 130 }}>会议号</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {meetings.map((m) => (
                <TableRow
                  key={m.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => handleRowClick(m)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {m.title}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatTime(m.start_time)}</TableCell>
                  <TableCell>{formatDuration(m.duration_minutes)}</TableCell>
                  <TableCell>{m.attendee_count || "-"}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {m.meeting_code || "-"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ---- 右侧纪要面板 ---- */}
      <MeetingDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        meeting={selectedMeeting}
      />

      {/* ---- 全局消息条 ---- */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
