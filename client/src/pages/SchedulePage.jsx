import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Select, MenuItem, FormControl, Snackbar, Alert,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItemButton, ListItemText,
} from "@mui/material";
import {
  Add, Save, FileDownload, AutoAwesome, History,
} from "@mui/icons-material";
import api from "../api/client";
import ScheduleTable from "../components/schedule/ScheduleTable";
import ContextMenu from "../components/schedule/ContextMenu";
import PredecessorDialog from "../components/schedule/PredecessorDialog";
import VersionHistoryDialog from "../components/schedule/VersionHistoryDialog";
import { calcCompletionStatus } from "../utils/schedule-date";

export default function SchedulePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // 状态
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 右键菜单
  const [contextMenu, setContextMenu] = useState(null);

  // 前置任务对话框
  const [predecessorOpen, setPredecessorOpen] = useState(false);
  const [predecessorTask, setPredecessorTask] = useState(null);

  // 版本历史
  const [versionOpen, setVersionOpen] = useState(false);

  // 模板选择
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [generateConfirm, setGenerateConfirm] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // 加载项目列表
  useEffect(() => {
    api.projects.list({}).then((r) => setProjects(r.data || [])).catch(() => {});
  }, []);

  // 加载项目详情和排期数据
  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, schedRes] = await Promise.all([
        api.projects.get(id),
        api.schedule.list(id),
      ]);
      setProject(projRes.data);
      const data = (schedRes.data || []).map((t) => ({
        ...t,
        completion_status: calcCompletionStatus(t),
      }));
      setTasks(data);
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "加载失败", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // 项目切换
  const handleProjectChange = (newId) => {
    navigate(`/projects/${newId}/schedule`);
  };

  // 右键菜单
  const handleContextMenu = (event, task) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      task,
    });
  };

  const handleCloseContextMenu = () => setContextMenu(null);

  // 编辑保存
  const handleTaskUpdate = async (taskId, data) => {
    try {
      const res = await api.schedule.update(taskId, data);
      // 重新加载以获取级联结果
      await loadSchedule();
      setSnackbar({ open: true, message: "已保存", severity: "success" });
      return res;
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "保存失败", severity: "error" });
      throw err;
    }
  };

  // 降级 (Indent) — 将当前任务变成紧邻上方兄弟任务的子任务
  const handleIndent = async (taskId) => {
    try {
      const res = await api.schedule.indent(id, taskId);
      setTasks(res.data || []);
      setSnackbar({ open: true, message: "已降级（增加缩进）", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "降级失败", severity: "error" });
    }
  };

  // 升级 (Outdent) — 将子任务提升到与父任务平级
  const handleOutdent = async (taskId) => {
    try {
      const res = await api.schedule.outdent(id, taskId);
      setTasks(res.data || []);
      setSnackbar({ open: true, message: "已升级（减少缩进）", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "升级失败", severity: "error" });
    }
  };

  // 插入任务
  const handleInsert = async (position, refTask) => {
    try {
      await api.schedule.insert(id, { position, reference_id: refTask.id });
      await loadSchedule();
      setSnackbar({ open: true, message: "已插入新任务", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "插入失败", severity: "error" });
    }
  };

  // 删除任务
  const handleDelete = async (taskId) => {
    try {
      await api.schedule.remove(taskId);
      await loadSchedule();
      setSnackbar({ open: true, message: "已删除", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "删除失败", severity: "error" });
    }
  };

  // 修改任务类型
  const handleChangeType = async (taskId, newType) => {
    try {
      await api.schedule.update(taskId, { task_type: newType });
      await loadSchedule();
      setSnackbar({ open: true, message: `已改为${newType}`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "修改失败", severity: "error" });
    }
  };

  // 前置任务对话框
  const handlePredecessorOpen = (task) => {
    setPredecessorTask(task);
    setPredecessorOpen(true);
  };

  const handlePredecessorSave = async (taskId, predecessorIds) => {
    try {
      await api.schedule.updatePredecessors(taskId, predecessorIds);
      await loadSchedule();
      setSnackbar({ open: true, message: "前置任务已更新", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "更新失败", severity: "error" });
    }
  };

  // 一键生成
  const handleGenerateClick = async () => {
    // 加载模板列表
    try {
      const res = await api.schedule.templates();
      setTemplates(res.data || []);
      if ((res.data || []).length === 0) {
        setSnackbar({ open: true, message: "无可用模板", severity: "warning" });
        return;
      }
      // 如果已有数据，先确认
      if (tasks.length > 0) {
        setGenerateConfirm(true);
      }
      setTemplateOpen(true);
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "加载模板失败", severity: "error" });
    }
  };

  const handleTemplateSelect = async (templateName) => {
    setTemplateOpen(false);
    try {
      const res = await api.schedule.generate(id, templateName);
      setTasks(res.data || []);
      setSnackbar({ open: true, message: `已从模板生成排期，共 ${(res.data || []).length} 个节点`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "生成失败", severity: "error" });
    }
  };

  // 导出
  const handleExport = () => {
    const url = api.schedule.exportUrl(id);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${project?.code || "项目"}_排期表.xlsx`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    setSnackbar({ open: true, message: "正在导出...", severity: "info" });
  };

  // 保存版本
  const handleSaveVersion = async () => {
    setSaving(true);
    try {
      const res = await api.schedule.saveVersion(id);
      setSnackbar({ open: true, message: `已保存：${res.data.version_name}`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "保存失败", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  // 版本恢复
  const handleRestore = async (vid) => {
    try {
      const res = await api.schedule.restoreVersion(id, vid);
      setTasks(res.data || []);
      setSnackbar({ open: true, message: "版本已恢复", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "恢复失败", severity: "error" });
    }
  };

  if (loading) {
    return <CircularProgress sx={{ display: "block", mx: "auto", mt: 8 }} />;
  }

  return (
    <Box>
      {/* 顶部工具栏 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        {/* 项目选择器 */}
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <Select
            value={id || ""}
            onChange={(e) => handleProjectChange(e.target.value)}
            displayEmpty
          >
            {projects.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                [{p.code}] {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 新建项目 */}
        <Button
          size="small"
          variant="outlined"
          onClick={() => navigate("/projects/new")}
        >
          新建项目
        </Button>

        {/* 从模板生成 */}
        <Button
          size="small"
          variant="contained"
          startIcon={<AutoAwesome />}
          onClick={handleGenerateClick}
        >
          从模板生成
        </Button>

        {/* 保存版本 */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<Save />}
          onClick={handleSaveVersion}
          disabled={saving || tasks.length === 0}
        >
          {saving ? "保存中..." : "保存版本"}
        </Button>

        {/* 版本历史 */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<History />}
          onClick={() => setVersionOpen(true)}
        >
          版本历史
        </Button>

        {/* 导出 */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownload />}
          onClick={handleExport}
          disabled={tasks.length === 0}
        >
          导出 Excel
        </Button>

        {project && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
            [{project.code}] {project.name}
          </Typography>
        )}
      </Box>

      {/* 排期表格 */}
      <ScheduleTable
        tasks={tasks}
        projectId={id}
        onContextMenu={handleContextMenu}
        onTaskUpdate={handleTaskUpdate}
      />

      {/* 右键菜单 */}
      <ContextMenu
        open={contextMenu !== null}
        anchorPosition={
          contextMenu
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        task={contextMenu?.task}
        tasks={tasks}
        onClose={handleCloseContextMenu}
        onChangeType={handleChangeType}
        onIndent={handleIndent}
        onOutdent={handleOutdent}
        onPredecessors={handlePredecessorOpen}
        onInsert={handleInsert}
        onDelete={handleDelete}
      />

      {/* 前置任务选择器 */}
      <PredecessorDialog
        open={predecessorOpen}
        task={predecessorTask}
        tasks={tasks}
        onClose={() => setPredecessorOpen(false)}
        onSave={handlePredecessorSave}
      />

      {/* 版本历史 */}
      <VersionHistoryDialog
        open={versionOpen}
        projectId={id}
        onClose={() => setVersionOpen(false)}
        onRestore={handleRestore}
      />

      {/* 模板选择对话框 */}
      <Dialog open={templateOpen} onClose={() => setTemplateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>选择排期模板</DialogTitle>
        <DialogContent>
          {generateConfirm && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              当前排期数据将被清空并重新生成，是否继续？
            </Alert>
          )}
          <List>
            {templates.map((t) => (
              <ListItemButton key={t.file} onClick={() => handleTemplateSelect(t.file.replace(".json", ""))}>
                <ListItemText
                  primary={t.name}
                  secondary={`${t.description}（${t.task_count} 个节点）`}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateOpen(false)}>取消</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
