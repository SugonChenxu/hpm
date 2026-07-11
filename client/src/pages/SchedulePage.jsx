import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItemButton,
  ListItemText,
  Card,
} from "@mui/material";
import {
  Save,
  FileDownload,
  AutoAwesome,
  History,
  Hub,
} from "@mui/icons-material";
import api from "../api/client";
import { useProjectContext } from "../context/ProjectContext";
import ProjectSelector from "../components/common/ProjectSelector";
import PageHeader from "../components/common/PageHeader";
import PageLoading from "../components/common/PageLoading";
import ScheduleTable from "../components/schedule/ScheduleTable";
import GanttChart from "../components/schedule/GanttChart";
import ContextMenu from "../components/schedule/ContextMenu";
import VersionHistoryDialog from "../components/schedule/VersionHistoryDialog";
import PlmConnectionDialog from "../components/plm/PlmConnectionDialog";
import { calcCompletionStatus } from "../utils/schedule-date";

export default function SchedulePage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || null;
  const { projects } = useProjectContext();

  // Project info (for title display)
  const [project, setProject] = useState(null);

  // Schedule tasks
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState(null);

  // Version history
  const [versionOpen, setVersionOpen] = useState(false);

  // Template selection
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [generateConfirm, setGenerateConfirm] = useState(false);

  // Predecessor trigger
  const [predTriggerTaskId, setPredTriggerTaskId] = useState(null);

  // PLM 连接/探针对话框
  const [plmDialogOpen, setPlmDialogOpen] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // Load project detail and schedule data
  const loadSchedule = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [projRes, schedRes] = await Promise.all([
        api.projects.get(Number(projectId)),
        api.schedule.list(Number(projectId)),
      ]);
      setProject(projRes.data);
      const data = (schedRes.data || []).map((t) => ({
        ...t,
        completion_status: calcCompletionStatus(t),
      }));
      setTasks(data);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "加载失败",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Context menu handlers
  const handleContextMenu = (event, task) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      task,
    });
  };

  const handleCloseContextMenu = () => setContextMenu(null);

  // Task update
  const handleTaskUpdate = async (taskId, data) => {
    try {
      await api.schedule.update(taskId, data);
      await loadSchedule();
      setSnackbar({ open: true, message: "已保存", severity: "success" });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "保存失败",
        severity: "error",
      });
      throw err;
    }
  };

  // Indent (demote)
  const handleIndent = async (taskId) => {
    try {
      const res = await api.schedule.indent(Number(projectId), taskId);
      setTasks(res.data || []);
      setSnackbar({
        open: true,
        message: "已降级（增加缩进）",
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "降级失败",
        severity: "error",
      });
    }
  };

  // Outdent (promote)
  const handleOutdent = async (taskId) => {
    try {
      const res = await api.schedule.outdent(Number(projectId), taskId);
      setTasks(res.data || []);
      setSnackbar({
        open: true,
        message: "已升级（减少缩进）",
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "升级失败",
        severity: "error",
      });
    }
  };

  // Insert task
  const handleInsert = async (position, refTask) => {
    try {
      await api.schedule.insert(Number(projectId), {
        position,
        reference_id: refTask.id,
      });
      await loadSchedule();
      setSnackbar({
        open: true,
        message: "已插入新任务",
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "插入失败",
        severity: "error",
      });
    }
  };

  // Delete task
  const handleDelete = async (taskId) => {
    try {
      await api.schedule.remove(taskId);
      await loadSchedule();
      setSnackbar({ open: true, message: "已删除", severity: "success" });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "删除失败",
        severity: "error",
      });
    }
  };

  // Change task type
  const handleChangeType = async (taskId, newType) => {
    try {
      await api.schedule.update(taskId, { task_type: newType });
      await loadSchedule();
      setSnackbar({
        open: true,
        message: `已改为${newType}`,
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "修改失败",
        severity: "error",
      });
    }
  };

  // Predecessor save
  const handlePredecessorSave = async (taskId, predecessorIds) => {
    try {
      await api.schedule.updatePredecessors(taskId, predecessorIds);
      await loadSchedule();
      setSnackbar({
        open: true,
        message: "前置任务已更新",
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "更新失败",
        severity: "error",
      });
      throw err;
    }
  };

  // Background color save
  const handleBgColorSave = async (taskId, color) => {
    try {
      await api.schedule.update(taskId, { bg_color: color });
      await loadSchedule();
      setSnackbar({
        open: true,
        message: "背景色已更新",
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "更新失败",
        severity: "error",
      });
      throw err;
    }
  };

  // Generate from template
  const handleGenerateClick = async () => {
    try {
      const res = await api.schedule.templates();
      setTemplates(res.data || []);
      if ((res.data || []).length === 0) {
        setSnackbar({ open: true, message: "无可用模板", severity: "warning" });
        return;
      }
      if (tasks.length > 0) {
        setGenerateConfirm(true);
      }
      setTemplateOpen(true);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "加载模板失败",
        severity: "error",
      });
    }
  };

  const handleTemplateSelect = async (templateName) => {
    setTemplateOpen(false);
    try {
      const res = await api.schedule.generate(
        Number(projectId),
        templateName
      );
      setTasks(res.data || []);
      setSnackbar({
        open: true,
        message: `已从模板生成排期，共 ${(res.data || []).length} 个节点`,
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "生成失败",
        severity: "error",
      });
    }
  };

  // Export
  const handleExport = () => {
    const url = api.schedule.exportUrl(Number(projectId));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${project?.code || "项目"}_排期表.xlsx`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    setSnackbar({ open: true, message: "正在导出...", severity: "info" });
  };

  // Save version
  const handleSaveVersion = async () => {
    setSaving(true);
    try {
      const res = await api.schedule.saveVersion(Number(projectId));
      setSnackbar({
        open: true,
        message: `已保存：${res.data.version_name}`,
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "保存失败",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  // Restore version
  const handleRestore = async (vid) => {
    try {
      const res = await api.schedule.restoreVersion(Number(projectId), vid);
      setTasks(res.data || []);
      setSnackbar({
        open: true,
        message: "版本已恢复",
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.message || "恢复失败",
        severity: "error",
      });
    }
  };

  // --- Render: no project selected ---
  if (!projectId) {
    return (
      <Box>
        <PageHeader title="项目计划" subtitle="阶段排期与里程碑管理" />
        <Box sx={{ mb: 2 }}>
          <ProjectSelector />
        </Box>
        <Card sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">
            请从上方选择项目以查看排期计划
          </Typography>
        </Card>
      </Box>
    );
  }

  // --- Render: loading ---
  if (loading) {
    return (
      <Box>
        <PageHeader title="项目计划" subtitle="阶段排期与里程碑管理" />
        <Box sx={{ mb: 2 }}>
          <ProjectSelector />
        </Box>
        <PageLoading />
      </Box>
    );
  }

  // --- Render: schedule table ---
  return (
    <Box>
      {/* Project selector */}
      <Box sx={{ mb: 2 }}>
        <ProjectSelector />
      </Box>

      <PageHeader title="项目计划" subtitle="阶段排期与里程碑管理">
        <Button
          size="small"
          variant="contained"
          startIcon={<AutoAwesome />}
          onClick={handleGenerateClick}
        >
          从模板生成
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Save />}
          onClick={handleSaveVersion}
          disabled={saving || tasks.length === 0}
        >
          {saving ? "保存中..." : "保存版本"}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<History />}
          onClick={() => setVersionOpen(true)}
        >
          版本历史
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownload />}
          onClick={handleExport}
          disabled={tasks.length === 0}
        >
          导出 Excel
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Hub />}
          onClick={() => setPlmDialogOpen(true)}
        >
          PLM 连接/探针
        </Button>
      </PageHeader>

      {/* Schedule table */}
      <ScheduleTable
        tasks={tasks}
        projectId={Number(projectId)}
        onContextMenu={handleContextMenu}
        onTaskUpdate={handleTaskUpdate}
        onPredecessorSave={handlePredecessorSave}
        onBgColorSave={handleBgColorSave}
        predTriggerTaskId={predTriggerTaskId}
        onPredTriggerHandled={() => setPredTriggerTaskId(null)}
      />

      {/* Gantt chart (read-only) */}
      <Box sx={{ overflowX: "auto", mt: 2 }}>
        <GanttChart tasks={tasks} />
      </Box>

      {/* Context menu */}
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
        onPredecessors={(task) => {
          setPredTriggerTaskId(task.id);
        }}
        onInsert={handleInsert}
        onDelete={handleDelete}
        onBgColor={handleBgColorSave}
      />

      {/* Version history dialog */}
      <VersionHistoryDialog
        open={versionOpen}
        projectId={Number(projectId)}
        onClose={() => setVersionOpen(false)}
        onRestore={handleRestore}
      />

      {/* Template selection dialog */}
      <Dialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>选择排期模板</DialogTitle>
        <DialogContent>
          {generateConfirm && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              当前排期数据将被清空并重新生成，是否继续？
            </Alert>
          )}
          <List>
            {templates.map((t) => (
              <ListItemButton
                key={t.file}
                onClick={() =>
                  handleTemplateSelect(t.file.replace(".json", ""))
                }
              >
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

      {/* PLM 连接/探针对话框 */}
      <PlmConnectionDialog
        open={plmDialogOpen}
        onClose={() => setPlmDialogOpen(false)}
      />

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
