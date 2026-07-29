import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Box, Typography, TextField, Button, IconButton, Tooltip, Stack, CircularProgress,
  Divider, Chip, alpha,
} from "@mui/material";
import api from "../api/client";
import PageHeader from "../components/common/PageHeader";
import RichTextEditor from "../components/notes/RichTextEditor";

export default function QuickNotesPage() {
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const latestRef = useRef({ title, content, pinned });
  latestRef.current = { title, content, pinned };
  const timerRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const r = await api.quickNotes.list();
      const list = r.data || [];
      setNotes(list);
      if (!selectedId && list.length) {
        loadDetail(list[0].id);
      } else if (selectedId && !list.find((n) => n.id === selectedId)) {
        if (list.length) loadDetail(list[0].id);
        else { setSelectedId(null); setTitle(""); setContent(""); }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id) => {
    try {
      const r = await api.quickNotes.get(id);
      const n = r.data;
      setSelectedId(n.id);
      setTitle(n.title);
      setContent(n.content_html || "");
      setPinned(!!n.pinned);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadList();
  }, []);

  const saveNow = useCallback(async () => {
    if (!selectedId) return;
    const { title, content, pinned } = latestRef.current;
    setStatus("保存中…");
    try {
      await api.quickNotes.update(selectedId, {
        title,
        content_html: content,
        pinned,
      });
      const preview = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, title, pinned, preview } : n))
      );
      setStatus("已保存 " + new Date().toLocaleTimeString("zh-CN"));
    } catch {
      setStatus("保存失败");
    }
  }, [selectedId]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveNow, 800);
  }, [saveNow]);

  useEffect(() => {
    scheduleSave();
  }, [title, content, pinned, scheduleSave]);

  const handleSelect = async (id) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (selectedId && selectedId !== id) await saveNow();
    loadDetail(id);
  };

  const handleNew = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (selectedId) await saveNow();
    const r = await api.quickNotes.create({ title: "无标题笔记" });
    const note = r.data;
    setNotes((prev) => [{ id: note.id, title: note.title, pinned: false, preview: "", updated_at: note.updated_at }, ...prev]);
    loadDetail(note.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("确定删除该笔记？此操作不可恢复。")) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    await api.quickNotes.remove(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) {
      const next = notes.find((n) => n.id !== id);
      if (next) loadDetail(next.id);
      else { setSelectedId(null); setTitle(""); setContent(""); }
    }
  };

  const togglePin = () => setPinned((p) => !p);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? notes.filter(
          (n) =>
            (n.title || "").toLowerCase().includes(q) ||
            (n.preview || "").toLowerCase().includes(q)
        )
      : notes;
    return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [notes, search]);

  return (
    <Box sx={{ p: 3, height: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <PageHeader title="快速笔记" subtitle="随手记录灵感与待办，支持图文表格混排" />
        <Button variant="contained" size="small" onClick={handleNew}>＋ 新建笔记</Button>
      </Box>

      <Box sx={{ flex: 1, display: "flex", gap: 2, minHeight: 0 }}>
        {/* 左侧列表 */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.paper",
          }}
        >
          <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
            <TextField
              size="small"
              fullWidth
              placeholder="搜索笔记…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>
            {loading ? (
              <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={24} /></Box>
            ) : filtered.length === 0 ? (
              <Typography variant="body2" sx={{ p: 2, color: "text.secondary", textAlign: "center" }}>
                暂无笔记，点右上角新建
              </Typography>
            ) : (
              filtered.map((n) => (
                <Box
                  key={n.id}
                  onClick={() => handleSelect(n.id)}
                  sx={{
                    p: 1.25,
                    mb: 0.75,
                    borderRadius: 1.5,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: n.id === selectedId ? "primary.main" : "transparent",
                    bgcolor: n.id === selectedId ? alpha("#7C3AED", 0.08) : "transparent",
                    "&:hover": { bgcolor: n.id === selectedId ? alpha("#7C3AED", 0.12) : "#F3F4F6" },
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={0.5}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {n.pinned && <span style={{ marginRight: 4 }}>📌</span>}
                      {n.title || "无标题笔记"}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.25 }}>
                      <Tooltip title={n.pinned ? "取消置顶" : "置顶"}>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(n.id); togglePin(); }}
                          sx={{ p: 0.25, fontSize: "0.75rem" }}
                        >📌</IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                          sx={{ p: 0.25, fontSize: "0.8rem" }}
                        >✕</IconButton>
                      </Tooltip>
                    </Box>
                  </Stack>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", display: "block", mt: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {n.preview || "（空白）"}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        </Box>

        {/* 右侧编辑区 */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selectedId ? (
            <>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <TextField
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="笔记标题"
                  variant="standard"
                  sx={{ flex: 1, "& input": { fontSize: "1.2rem", fontWeight: 600 } }}
                />
                <Tooltip title={pinned ? "取消置顶" : "置顶"}>
                  <IconButton onClick={togglePin} color={pinned ? "warning" : "default"}>📌</IconButton>
                </Tooltip>
                <Chip size="small" label={status || "就绪"} variant="outlined" />
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                <RichTextEditor
                  key={selectedId}
                  noteId={selectedId}
                  initialHtml={content}
                  onChange={setContent}
                />
              </Box>
            </>
          ) : (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: 2,
                color: "text.secondary",
              }}
            >
              选择或新建一条笔记开始记录
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
