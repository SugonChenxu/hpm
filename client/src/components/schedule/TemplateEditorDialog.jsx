import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Popover,
  CircularProgress,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import api from "../../api/client";
import { PRESET_COLORS } from "./ContextMenu";

/**
 * 模板编辑/新建对话框
 * - 支持两种初始化：
 *   ① 克隆当前项目结构（sourceTasks，不拷日期，仅取 name/type/duration/parent/predecessor）
 *   ② 编辑已有模板（GET 单模板预填）
 * - 仅「阶段任务」可设置背景色，复用 ContextMenu 的 PRESET_COLORS 调色板 + 自定义取色器
 * - 保存时调用 api.schedule.saveTemplate（POST /api/templates/schedule）
 *
 * Props:
 *   open — 是否打开
 *   onClose — 关闭回调
 *   projectId — 当前项目 id（预留）
 *   sourceTasks — 当前项目排期任务（深度优先扁平，含 task_order/parent_id/predecessor_ids/bg_color）
 *   onSaved — 保存成功后的回调（用于刷新模板列表）
 */
export default function TemplateEditorDialog({
  open,
  onClose,
  projectId,
  sourceTasks = [],
  onSaved,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tasks, setTasks] = useState([]); // 可编辑模板任务列表
  const [templateFiles, setTemplateFiles] = useState([]); // 现有模板（用于选择编辑）
  const [selectedFile, setSelectedFile] = useState(""); // 选中的已有模板文件名
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [colorAnchor, setColorAnchor] = useState(null); // { idx, el }
  const [error, setError] = useState("");

  // 将当前项目任务转换为模板草稿（深度优先顺序即模板下标）
  const buildDraftFromTasks = useCallback((rawTasks) => {
    const ordered = [...(rawTasks || [])].sort(
      (a, b) => (a.task_order || 0) - (b.task_order || 0)
    );
    const idToIndex = new Map();
    ordered.forEach((t, i) => idToIndex.set(t.id, i));
    return ordered.map((t) => {
      let preds = [];
      try {
        preds = JSON.parse(t.predecessor_ids || "[]");
      } catch {
        preds = [];
      }
      const isPhase = t.task_type === "阶段任务";
      return {
        _key: `t-${t.id}`,
        name: t.name || "",
        task_type: t.task_type || "普通任务",
        duration_days: t.duration_days || 1,
        depth: Number(t.depth) || 0,
        parent_ref: t.parent_id != null ? idToIndex.get(t.parent_id) : undefined,
        predecessor_refs: preds
          .map((pid) => idToIndex.get(pid))
          .filter((idx) => idx != null),
        bg_color: isPhase ? t.bg_color || "" : "",
      };
    });
  }, []);

  // 基于 parent_ref 计算显示缩进深度
  const computeDepths = useCallback((list) => {
    const n = list.length;
    const depths = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let d = 0;
      let pr = list[i].parent_ref;
      const seen = new Set();
      while (pr != null && pr >= 0 && pr < n && !seen.has(pr)) {
        seen.add(pr);
        d += 1;
        pr = list[pr].parent_ref;
      }
      depths[i] = d;
    }
    return depths;
  }, []);

  // 打开时初始化：加载模板列表 + 默认从当前项目克隆
  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    setColorAnchor(null);
    api.schedule
      .templates()
      .then((res) => setTemplateFiles(res.data || []))
      .catch(() => setTemplateFiles([]));

    const draft = buildDraftFromTasks(sourceTasks);
    if (draft.length > 0) {
      setName("");
      setDescription("");
      setTasks(draft);
      setSelectedFile("");
    } else {
      setName("");
      setDescription("");
      setTasks([]);
    }
  }, [open, sourceTasks, buildDraftFromTasks]);

  // 选择编辑已有模板 → 拉取并预填
  const handlePickExisting = useCallback(
    async (file) => {
      setSelectedFile(file);
      setError("");
      if (!file) {
        const draft = buildDraftFromTasks(sourceTasks);
        setTasks(draft);
        setName("");
        setDescription("");
        return;
      }
      setLoading(true);
      try {
        const res = await api.schedule.getTemplate(file);
        const data = res.data || {};
        const raw = (data.tasks || []).map((t, i) => ({ ...t, _key: `e-${i}` }));
        const depths = computeDepths(raw);
        setTasks(raw.map((t, i) => ({ ...t, depth: depths[i] })));
        setName(data.name || "");
        setDescription(data.description || "");
      } catch (err) {
        setError(err.message || "加载模板失败");
        setTasks([]);
      } finally {
        setLoading(false);
      }
    },
    [sourceTasks, buildDraftFromTasks, computeDepths]
  );

  const handleColorPick = useCallback((idx, color) => {
    setTasks((prev) =>
      prev.map((t, i) =>
        i === idx ? { ...t, bg_color: color === "transparent" ? "" : color } : t
      )
    );
    setColorAnchor(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("请填写模板名称");
      return;
    }
    if (tasks.length === 0) {
      setError("模板无任务数据，请先生成或导入排期");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const cleanTasks = tasks.map((t) => {
        const item = {
          name: t.name,
          task_type: t.task_type,
          duration_days: t.duration_days,
        };
        if (t.parent_ref != null && t.parent_ref !== undefined) {
          item.parent_ref = t.parent_ref;
        }
        if (Array.isArray(t.predecessor_refs) && t.predecessor_refs.length > 0) {
          item.predecessor_refs = t.predecessor_refs;
        }
        // 仅阶段任务写入 bg_color；普通任务留空（运行时继承）
        if (t.task_type === "阶段任务") {
          item.bg_color = t.bg_color || "";
        }
        return item;
      });
      await api.schedule.saveTemplate({
        name: name.trim(),
        description: description.trim(),
        tasks: cleanTasks,
      });
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }, [name, description, tasks, onSaved, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <span>模板管理（阶段背景色）</span>
        <IconButton onClick={onClose} size="small">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* 名称 / 描述 */}
        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <TextField
            label="模板名称"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ minWidth: 220 }}
            error={Boolean(error) && !name.trim()}
          />
          <TextField
            label="描述"
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }}
          />
        </Box>

        {/* 数据来源 */}
        <Box
          sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography variant="body2" color="text.secondary">
            数据来源：
          </Typography>
          <Button
            size="small"
            variant={!selectedFile ? "contained" : "outlined"}
            onClick={() => handlePickExisting("")}
            disabled={sourceTasks.length === 0}
          >
            从当前项目克隆
          </Button>
          <Box sx={{ minWidth: 220 }}>
            <TextField
              select
              size="small"
              label="编辑已有模板"
              value={selectedFile}
              onChange={(e) => handlePickExisting(e.target.value)}
              SelectProps={{ native: true }}
              fullWidth
            >
              <option value="">— 请选择 —</option>
              {templateFiles.map((t) => (
                <option key={t.file} value={t.file}>
                  {t.name}
                </option>
              ))}
            </TextField>
          </Box>
        </Box>

        {/* 任务树（仅阶段任务可设色） */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {!loading && (
          <Box
            sx={{
              maxHeight: 360,
              overflow: "auto",
              border: "1px solid #E5E7EB",
              borderRadius: 1,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#F9FAFB", position: "sticky", top: 0 }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>任务名称</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>类型</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>背景色</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => {
                  const isPhase = t.task_type === "阶段任务";
                  return (
                    <tr key={t._key} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td
                        style={{
                          padding: "6px 8px",
                          paddingLeft: `${8 + (t.depth || 0) * 18}px`,
                        }}
                      >
                        {t.name || "（未命名）"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>{t.task_type}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {isPhase ? (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box
                              component="button"
                              onClick={(e) =>
                                setColorAnchor({ idx: i, el: e.currentTarget })
                              }
                              sx={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                border: "2px solid #D1D5DB",
                                backgroundColor: t.bg_color || "transparent",
                                cursor: "pointer",
                                p: 0,
                              }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {t.bg_color || "（无）"}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            — 普通任务继承 —
                          </Typography>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}

        {/* 取色器 Popover */}
        <Popover
          open={Boolean(colorAnchor)}
          anchorEl={colorAnchor?.el}
          onClose={() => setColorAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Box sx={{ p: 1.5 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, maxWidth: 180 }}>
              {PRESET_COLORS.map((color) => (
                <Box
                  key={color}
                  onClick={() => handleColorPick(colorAnchor.idx, color)}
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: color,
                    border: "2px solid",
                    borderColor:
                      (tasks[colorAnchor.idx]?.bg_color || "") === color
                        ? "primary.main"
                        : "divider",
                    cursor: "pointer",
                    "&:hover": { transform: "scale(1.15)" },
                    transition: "transform 0.15s",
                  }}
                />
              ))}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
              <Box
                component="input"
                type="color"
                defaultValue={tasks[colorAnchor?.idx]?.bg_color || "#7C3AED"}
                sx={{ width: 28, height: 28, border: "none", cursor: "pointer", p: 0 }}
                onChange={(e) =>
                  handleColorPick(
                    colorAnchor.idx,
                    e.target.value === "#ffffff" ? "" : e.target.value
                  )
                }
                onBlur={(e) =>
                  handleColorPick(
                    colorAnchor.idx,
                    e.target.value === "#ffffff" ? "" : e.target.value
                  )
                }
              />
              <Typography variant="caption" color="text.secondary">
                自定义颜色
              </Typography>
            </Box>
          </Box>
        </Popover>

        {error && (
          <Typography color="error" variant="caption" sx={{ display: "block", mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存模板"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
