import { useState, useEffect, useCallback, useRef } from "react";
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
  ToggleButtonGroup,
  ToggleButton,
  SvgIcon,
} from "@mui/material";
import {
  Save,
  FileDownload,
  AutoAwesome,
  History,
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
import { parseScheduleExcel } from "../utils/scheduleExcel";
import { calcCompletionStatus } from "../utils/schedule-date";

const ImportIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M5 20h14v-2H5v2zM12 2L5 9h4v6h6V9h4l-7-7z" />
  </SvgIcon>
);
const TrashIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </SvgIcon>
);
// 模板导入（Forge 导出 Excel 反灌）：双箭头循环图标
const SyncIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
  </SvgIcon>
);

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

  // 导入 / 清空
  const fileInputRef = useRef(null);
  const templateInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false);
  const [pendingTemplateTasks, setPendingTemplateTasks] = useState(null);

  // 甘特图时间轴单位
  const [ganttUnit, setGanttUnit] = useState("day");

  // 阶段折叠状态（排期表与甘特图共享）
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());

  const toggleCollapse = useCallback((taskId) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

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

  // ===== 导入 / 腾讯文档 / 清空 =====
  const handleFileImportClick = () => fileInputRef.current?.click();

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const { tasks, warnings } = await parseScheduleExcel(file);
      const res = await api.schedule.importTasks(Number(projectId), tasks);
      const n = res.data?.imported ?? tasks.length;
      setSnackbar({
        open: true,
        message: `已导入 ${n} 条计划${warnings?.length ? `（${warnings.length} 条提示）` : ""}`,
        severity: "success",
      });
      await loadSchedule();
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "导入失败", severity: "error" });
    } finally {
      setImporting(false);
    }
  };

  // ===== 模板导入（Forge 导出 Excel 反灌） =====
  const handleTemplateImportClick = () => templateInputRef.current?.click();

  const handleTemplateImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      // 第二参 "forge-template"：仅识别 Forge 导出的带公式 Excel
      const { tasks, warnings } = await parseScheduleExcel(file, "forge-template");
      setPendingTemplateTasks(tasks);
      setTemplateConfirmOpen(true);
      if (warnings?.length) {
        setSnackbar({ open: true, message: `模板解析提示：${warnings.length} 条`, severity: "info" });
      }
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "模板解析失败", severity: "error" });
    } finally {
      setImporting(false);
    }
  };

  const confirmTemplateImport = async () => {
    if (!pendingTemplateTasks) return;
    setTemplateConfirmOpen(false);
    setImporting(true);
    try {
      const res = await api.schedule.importTemplate(Number(projectId), pendingTemplateTasks);
      const n = res.data?.imported ?? pendingTemplateTasks.length;
      setPendingTemplateTasks(null);
      setSnackbar({
        open: true,
        message: `已通过模板反灌 ${n} 条计划（覆盖原排期）`,
        severity: "success",
      });
      await loadSchedule();
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "模板导入失败", severity: "error" });
    } finally {
      setImporting(false);
    }
  };


  const handleClearAll = async () => {
    setClearConfirmOpen(false);
    try {
      const res = await api.schedule.clearAll(Number(projectId));
      setSnackbar({ open: true, message: `已清空 ${res.data?.deleted ?? 0} 条计划`, severity: "success" });
      await loadSchedule();
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "清空失败", severity: "error" });
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
    setSnackbar({ open: true, message: "已导出 Excel（开始/完成时间已写入联动公式）", severity: "info" });
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
          startIcon={<ImportIcon />}
          onClick={handleFileImportClick}
          disabled={importing}
        >
          {importing ? "导入中…" : "导入 Excel"}
        </Button>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<SyncIcon />}
          onClick={handleTemplateImportClick}
          disabled={importing}
          title="识别 Forge 导出的 Excel（含公式），回灌并覆盖当前排期"
        >
          模板导入
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<TrashIcon />}
          onClick={() => setClearConfirmOpen(true)}
          disabled={tasks.length === 0 || importing}
        >
          清空计划
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
        collapsedPhases={collapsedPhases}
        onToggleCollapse={toggleCollapse}
      />

      {/* 甘特图时间轴单位切换 */}
      <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
        <Typography variant="subtitle2" sx={{ color: "#1E1B2E" }}>
          时间轴单位：
        </Typography>
        <ToggleButtonGroup
          value={ganttUnit}
          exclusive
          onChange={(_, val) => val && setGanttUnit(val)}
          size="small"
        >
          <ToggleButton value="day">日</ToggleButton>
          <ToggleButton value="week">周</ToggleButton>
          <ToggleButton value="month">月</ToggleButton>
          <ToggleButton value="quarter">季度</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Gantt chart (read-only) */}
      <Box sx={{ overflowX: "auto", mt: 2 }}>
        <GanttChart
          tasks={tasks}
          unit={ganttUnit}
          collapsedPhases={collapsedPhases}
          onToggleCollapse={toggleCollapse}
        />
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

      {/* 隐藏文件选择（本地导入） */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={handleFileImport}
      />
      {/* 隐藏文件选择（模板导入 / Forge 导出 Excel 反灌） */}
      <input
        ref={templateInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={handleTemplateImport}
      />

      {/* 清空确认 */}
      <Dialog open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)} maxWidth="xs">
        <DialogTitle>确认清空计划</DialogTitle>
        <DialogContent>
          <Typography>
            将删除当前项目的全部 {tasks.length} 条计划，此操作不可恢复。是否继续？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
          <Button onClick={handleClearAll} color="error" variant="contained">
            清空
          </Button>
        </DialogActions>
      </Dialog>

      {/* 模板导入确认（反灌将覆盖当前排期） */}
      <Dialog open={templateConfirmOpen} onClose={() => setTemplateConfirmOpen(false)} maxWidth="xs">
        <DialogTitle>确认模板反灌</DialogTitle>
        <DialogContent>
          <Typography>
            将用该 Forge 模板覆盖当前项目的全部排期（共 {pendingTemplateTasks?.length ?? 0} 条）。原排期数据将被替换，此操作不可恢复。是否继续？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateConfirmOpen(false)}>取消</Button>
          <Button onClick={confirmTemplateImport} color="secondary" variant="contained">
            覆盖导入
          </Button>
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
