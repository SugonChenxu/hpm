/**
 * RichTextEditor — 快速笔记富文本编辑器
 *
 * 基于 contentEditable + document.execCommand，提供：
 *   字号、文字颜色、背景高亮、加粗、斜体、下划线、删除线、
 *   左/中/右/两端对齐、缩进/减少缩进、无序/有序/任务列表、
 *   插入图片（上传/粘贴）、插入表格、撤销/重做、清除格式。
 * 图片以 base64 DataURL 内嵌存储。
 *
 * 注：为兼容 Vite 8 / rolldown，不使用第三方富文本库，且工具栏按钮用 Unicode 文本。
 * 工具栏按钮统一用 ToolBtn（方形 IconButton + Tooltip），点击前阻止默认 mousedown 以保留选区。
 *
 * 性能要点：编辑器内容由内容区 DOM 自身持有，不进 React state。
 * onChange 仅把最新 html 交给父级（用于自动保存），父级不应把 html 回灌进 state 触发重渲染，
 * 否则长文每次按键都会重渲染整条工具栏。工具栏用 React.memo + 稳定回调，按键时零重渲染。
 */

import { useRef, useEffect, useCallback, memo } from "react";
import { Box, Tooltip, IconButton, Divider, Select, MenuItem } from "@mui/material";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const TEXT_COLORS = [
  "#000000", "#C0392B", "#E67E22", "#F1C40F", "#27AE60",
  "#2980B9", "#8E44AD", "#7F8C8D", "#FFFFFF", "#2C3E50",
];
const HIGHLIGHTS = [
  "#FFFF00", "#FFD966", "#FF9999", "#C6EFCE", "#9DC3E6",
  "#CCCCCC", "#E4DFEC", "#FCE4D6", "transparent",
];

const SELECT_SX = {
  height: 32,
  borderRadius: 1,
  fontSize: "0.8rem",
  "& fieldset": { border: "none" },
  bgcolor: "background.paper",
};

const MENU_PROPS = {
  PaperProps: { sx: { zIndex: 2000, maxHeight: 320 } },
};

/** 统一风格的工具栏按钮：方形 30px，阻止 mousedown 默认行为以保留编辑器选区 */
function ToolBtn({ title, onClick, children }) {
  return (
    <Tooltip title={title} arrow>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        sx={{
          width: 30,
          height: 30,
          borderRadius: 1,
          p: 0,
          fontSize: "0.95rem",
          lineHeight: 1,
          color: "text.primary",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

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

/** 插入一条任务清单项（复选框 + 可编辑文本），点击复选框即可勾选/取消 */
function insertTaskItem(editor) {
  editor.focus();
  const html =
    '<div class="qn-task"><input type="checkbox" contenteditable="false"> ' +
    '<span>新任务</span></div>';
  document.execCommand("insertHTML", false, html);
}

/** 工具栏：仅在传入的回调引用变化时重渲染（按键不重渲染） */
const EditorToolbar = memo(function EditorToolbar({
  exec,
  handleFontSize,
  handleTextColor,
  handleHighlight,
  handleInsertTable,
  handleTaskList,
  onImageClick,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        rowGap: 0.4,
        columnGap: 0.3,
        p: 0.6,
        flexShrink: 0,
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
        MenuProps={MENU_PROPS}
        sx={{ ...SELECT_SX, minWidth: 70, mr: 0.4 }}
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
        MenuProps={MENU_PROPS}
        sx={{ ...SELECT_SX, minWidth: 32, mr: 0.4 }}
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
        MenuProps={MENU_PROPS}
        sx={{ ...SELECT_SX, minWidth: 32, mr: 0.4 }}
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

      <Divider orientation="vertical" sx={{ mx: 0.3, height: 22, alignSelf: "center" }} />

      <ToolBtn title="加粗" onClick={() => exec("bold")}><b>B</b></ToolBtn>
      <ToolBtn title="斜体" onClick={() => exec("italic")}><i>I</i></ToolBtn>
      <ToolBtn title="下划线" onClick={() => exec("underline")}><span style={{ textDecoration: "underline" }}>U</span></ToolBtn>
      <ToolBtn title="删除线" onClick={() => exec("strikeThrough")}><span style={{ textDecoration: "line-through" }}>S</span></ToolBtn>

      <Divider orientation="vertical" sx={{ mx: 0.3, height: 22, alignSelf: "center" }} />

      <ToolBtn title="左对齐" onClick={() => exec("justifyLeft")}>⯇</ToolBtn>
      <ToolBtn title="居中" onClick={() => exec("justifyCenter")}>≡</ToolBtn>
      <ToolBtn title="右对齐" onClick={() => exec("justifyRight")}>⯈</ToolBtn>
      <ToolBtn title="两端对齐" onClick={() => exec("justifyFull")}>▤</ToolBtn>

      <Divider orientation="vertical" sx={{ mx: 0.3, height: 22, alignSelf: "center" }} />

      <ToolBtn title="无序列表" onClick={() => exec("insertUnorderedList")}>•≣</ToolBtn>
      <ToolBtn title="有序列表" onClick={() => exec("insertOrderedList")}>1.≣</ToolBtn>
      <ToolBtn title="任务列表（可勾选）" onClick={handleTaskList}>☑≣</ToolBtn>

      <Divider orientation="vertical" sx={{ mx: 0.3, height: 22, alignSelf: "center" }} />

      <ToolBtn title="增加缩进" onClick={() => exec("indent")}>⇥</ToolBtn>
      <ToolBtn title="减少缩进" onClick={() => exec("outdent")}>⇤</ToolBtn>

      <Divider orientation="vertical" sx={{ mx: 0.3, height: 22, alignSelf: "center" }} />

      <ToolBtn title="撤销" onClick={() => exec("undo")}>↶</ToolBtn>
      <ToolBtn title="重做" onClick={() => exec("redo")}>↷</ToolBtn>
      <ToolBtn title="清除格式" onClick={() => exec("removeFormat")}>⌫</ToolBtn>

      <Divider orientation="vertical" sx={{ mx: 0.3, height: 22, alignSelf: "center" }} />

      <ToolBtn title="插入图片（上传）" onClick={onImageClick}>🖼</ToolBtn>
      <ToolBtn title="插入表格" onClick={handleInsertTable}>▦</ToolBtn>
    </Box>
  );
});

export default function RichTextEditor({ noteId, initialHtml = "", onChange }) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const savedRangeRef = useRef(null);

  // 切换笔记时重置内容（仅在 noteId 变化时）
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
    }
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 记录当前选区（点击颜色/字号等 Select 会抢走焦点，需还原）
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  }, []);

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

  const handleFontSize = useCallback(
    (e) => {
      const px = e.target.value;
      e.target.value = "";
      if (!px) return;
      restoreSelection();
      applyFontSize(editorRef.current, Number(px));
      emit();
    },
    [restoreSelection, emit]
  );

  const handleTextColor = useCallback(
    (e) => {
      const c = e.target.value;
      e.target.value = "";
      if (!c) return;
      restoreSelection();
      editorRef.current.focus();
      document.execCommand("styleWithCSS", false, true);
      document.execCommand("foreColor", false, c);
      emit();
    },
    [restoreSelection, emit]
  );

  const handleHighlight = useCallback(
    (e) => {
      const c = e.target.value;
      e.target.value = "";
      if (!c) return;
      restoreSelection();
      editorRef.current.focus();
      document.execCommand("styleWithCSS", false, true);
      // Chrome 下 hiliteColor 配合 styleWithCSS 生效
      try {
        document.execCommand("hiliteColor", false, c);
      } catch {
        document.execCommand("backColor", false, c);
      }
      emit();
    },
    [restoreSelection, emit]
  );

  const onImageClick = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleImageFile = useCallback(
    (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        exec("insertImage", reader.result);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [exec]
  );

  const handlePaste = useCallback(
    (e) => {
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
    },
    [exec]
  );

  const handleInsertTable = useCallback(() => {
    const dims = window.prompt("输入表格行数,列数（例如 3,3）", "3,3");
    if (!dims) return;
    const [r, c] = dims.split(",").map((n) => Math.max(1, Math.min(20, parseInt(n, 10) || 3)));
    insertTable(editorRef.current, r, c);
    emit();
  }, [emit]);

  const handleTaskList = useCallback(() => {
    insertTaskItem(editorRef.current);
    emit();
  }, [emit]);

  return (
    <Box>
      <EditorToolbar
        exec={exec}
        handleFontSize={handleFontSize}
        handleTextColor={handleTextColor}
        handleHighlight={handleHighlight}
        handleInsertTable={handleInsertTable}
        handleTaskList={handleTaskList}
        onImageClick={onImageClick}
      />

      {/* 编辑区 */}
      <Box
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
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
          "& .qn-task": { display: "flex", alignItems: "center", gap: "6px", margin: "3px 0" },
          "& .qn-task input": { width: "15px", height: "15px", flexShrink: 0, cursor: "pointer", accentColor: "primary.main" },
          "& .qn-task input:checked + span": { textDecoration: "line-through", color: "#9ca3af" },
        }}
        placeholder="开始记录你的笔记…"
      />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
    </Box>
  );
}
