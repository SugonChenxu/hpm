/**
 * RichTextEditor — 快速笔记富文本编辑器
 *
 * 基于 contentEditable + document.execCommand，提供：
 *   字号、文字颜色、背景高亮、加粗、斜体、下划线、删除线、
 *   左/中/右/两端对齐、有序/无序列表、插入图片（上传/粘贴）、
 *   插入表格、撤销/重做、清除格式。
 * 图片以 base64 DataURL 内嵌存储。
 *
 * 注：为兼容 Vite 8 / rolldown，不使用第三方富文本库，且工具栏按钮用 Unicode 文本。
 */

import { useRef, useEffect, useCallback } from "react";
import { Box, IconButton, Tooltip, Divider, Select, MenuItem, Button } from "@mui/material";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const TEXT_COLORS = [
  "#000000", "#C0392B", "#E67E22", "#F1C40F", "#27AE60",
  "#2980B9", "#8E44AD", "#7F8C8D", "#FFFFFF", "#2C3E50",
];
const HIGHLIGHTS = [
  "#FFFF00", "#FFD966", "#FF9999", "#C6EFCE", "#9DC3E6",
  "#CCCCCC", "#E4DFEC", "#FCE4D6", "transparent",
];

/**
 * 应用任意 px 字号：用 fontSize=7 作为标记，再把生成的 <font size=7> 改为 <span style=font-size>
 * （execCommand 的 fontSize 仅支持 1-7，无法直接指定 px）
 */
function applyFontSize(editor, px) {
  editor.focus();
  document.execCommand("styleWithCSS", false, false);
  document.execCommand("fontSize", false, "7");
  const fonts = editor.querySelectorAll('font[size="7"]');
  fonts.forEach((f) => {
    const span = document.createElement("span");
    span.style.fontSize = px + "px";
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  });
}

function insertTable(editor, rows = 3, cols = 3) {
  editor.focus();
  let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;">';
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) {
      const head = r === 0 ? ' background:#f3f4f6;font-weight:600;' : "";
      html += `<td style="border:1px solid #d0d0d0;padding:6px 8px;min-width:60px;${head}"><br/></td>`;
    }
    html += "</tr>";
  }
  html += "</table>";
  document.execCommand("insertHTML", false, html);
}

export default function RichTextEditor({ noteId, initialHtml = "", onChange }) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);

  // 切换笔记时重置内容（仅在 noteId 变化时）
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
    }
  }, [noteId]);

  const emit = useCallback(() => {
    if (editorRef.current && onChange) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const exec = useCallback(
    (cmd, val = null) => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      document.execCommand(cmd, false, val);
      emit();
    },
    [emit]
  );

  const handleFontSize = (e) => {
    const px = e.target.value;
    if (px) applyFontSize(editorRef.current, Number(px));
    e.target.value = "";
    emit();
  };

  const handleTextColor = (e) => {
    const c = e.target.value;
    if (c) {
      document.execCommand("styleWithCSS", false, true);
      exec("foreColor", c);
    }
    e.target.value = "";
  };

  const handleHighlight = (e) => {
    const c = e.target.value;
    if (c) {
      document.execCommand("styleWithCSS", false, true);
      // Chrome 下 hiliteColor 配合 styleWithCSS 生效
      try {
        exec("hiliteColor", c);
      } catch {
        exec("backColor", c);
      }
    }
    e.target.value = "";
  };

  const handleImageFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      exec("insertImage", reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handlePaste = (e) => {
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.indexOf("image") === 0) {
        e.preventDefault();
        const blob = it.getAsFile();
        const reader = new FileReader();
        reader.onload = () => exec("insertImage", reader.result);
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  const handleInsertTable = () => {
    const dims = window.prompt("输入表格行数,列数（例如 3,3）", "3,3");
    if (!dims) return;
    const [r, c] = dims.split(",").map((n) => Math.max(1, Math.min(20, parseInt(n, 10) || 3)));
    insertTable(editorRef.current, r, c);
    emit();
  };

  const Btn = ({ title, onClick, children }) => (
    <Tooltip title={title}>
      <IconButton size="small" onClick={onClick} sx={{ fontSize: "0.85rem", minWidth: 32, height: 32 }}>
        {children}
      </IconButton>
    </Tooltip>
  );

  return (
    <Box>
      {/* 工具栏 */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.3,
          p: 0.75,
          border: "1px solid",
          borderColor: "divider",
          borderBottom: "none",
          borderRadius: "8px 8px 0 0",
          bgcolor: "#fafafa",
        }}
      >
        {/* 字号 */}
        <Select
          size="small"
          displayEmpty
          defaultValue=""
          onChange={handleFontSize}
          sx={{ minWidth: 70, height: 30, mr: 0.5, fontSize: "0.8rem" }}
          renderValue={() => "字号"}
        >
          {FONT_SIZES.map((s) => (
            <MenuItem key={s} value={s}>{s} px</MenuItem>
          ))}
        </Select>

        {/* 文字颜色 */}
        <Select
          size="small"
          displayEmpty
          defaultValue=""
          onChange={handleTextColor}
          sx={{ minWidth: 36, height: 30, mr: 0.5 }}
          renderValue={() => (
            <Box sx={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #ccc", background: "linear-gradient(45deg,#f00,#00f)" }} />
          )}
        >
          {TEXT_COLORS.map((c) => (
            <MenuItem key={c} value={c}>
              <Box sx={{ width: 16, height: 16, mr: 1, borderRadius: 2, border: "1px solid #ccc", bgcolor: c }} />
              {c}
            </MenuItem>
          ))}
        </Select>

        {/* 高亮 */}
        <Select
          size="small"
          displayEmpty
          defaultValue=""
          onChange={handleHighlight}
          sx={{ minWidth: 36, height: 30, mr: 0.5 }}
          renderValue={() => (
            <Box sx={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #ccc", background: "linear-gradient(45deg,#ff0,#0f0)" }} />
          )}
        >
          {HIGHLIGHTS.map((c) => (
            <MenuItem key={c} value={c}>
              <Box sx={{ width: 16, height: 16, mr: 1, borderRadius: 2, border: "1px solid #ccc", bgcolor: c }} />
              {c === "transparent" ? "清除" : c}
            </MenuItem>
          ))}
        </Select>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />

        <Btn title="加粗" onClick={() => exec("bold")}><b>B</b></Btn>
        <Btn title="斜体" onClick={() => exec("italic")}><i>I</i></Btn>
        <Btn title="下划线" onClick={() => exec("underline")}><span style={{ textDecoration: "underline" }}>U</span></Btn>
        <Btn title="删除线" onClick={() => exec("strikeThrough")}><span style={{ textDecoration: "line-through" }}>S</span></Btn>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />

        <Btn title="左对齐" onClick={() => exec("justifyLeft")}>⯇</Btn>
        <Btn title="居中" onClick={() => exec("justifyCenter")}>≡</Btn>
        <Btn title="右对齐" onClick={() => exec("justifyRight")}>⯈</Btn>
        <Btn title="两端对齐" onClick={() => exec("justifyFull")}>▤</Btn>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />

        <Btn title="无序列表" onClick={() => exec("insertUnorderedList")}>•≣</Btn>
        <Btn title="有序列表" onClick={() => exec("insertOrderedList")}>1.≣</Btn>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />

        <Btn title="撤销" onClick={() => exec("undo")}>↶</Btn>
        <Btn title="重做" onClick={() => exec("redo")}>↷</Btn>
        <Btn title="清除格式" onClick={() => exec("removeFormat")}>⌫</Btn>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />

        <Btn title="插入图片（上传）" onClick={() => fileRef.current?.click()}>🖼</Btn>
        <Button size="small" onClick={handleInsertTable} sx={{ minWidth: 32, height: 32, fontSize: "0.8rem" }}>
          ▦ 表格
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
      </Box>

      {/* 编辑区 */}
      <Box
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onPaste={handlePaste}
        sx={{
          minHeight: "55vh",
          maxHeight: "70vh",
          overflowY: "auto",
          p: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "0 0 8px 8px",
          outline: "none",
          fontSize: "0.95rem",
          lineHeight: 1.7,
          "&:focus": { borderColor: "primary.main" },
          "& img": { maxWidth: "100%", borderRadius: 1 },
          "& table": { borderCollapse: "collapse" },
          "& td, & th": { border: "1px solid #d0d0d0", padding: "6px 8px" },
        }}
        placeholder="开始记录你的笔记…"
      />
    </Box>
  );
}
