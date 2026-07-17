// ===== Forge OA 物料导入提取脚本 v2 =====
// 用法：在 OA 采购申请页面打开 DevTools(F12) → Console → 粘贴全部 → 回车
// v2: 模糊匹配列头 + 调试输出帮助定位问题
(function () {
  // 字段映射：每个 key 数组的第一项为主匹配词，后面为备选
  const FIELD_RULES = [
    { keys: ["物料编号", "物料号", "料号", "编号"], field: "part_number" },
    { keys: ["厂家", "供应商", "品牌", "厂商"], field: "manufacturer" },
    { keys: ["型号配置", "物料描述", "型号", "规格", "物料型号", "描述"], field: "model" },
    { keys: ["数量", "采购数量", "总数量"], field: "quantity" },
    { keys: ["申请日期", "采购日期", "申请时间", "日期"], field: "purchase_date" },
    { keys: ["单价"], field: "_price" },
    { keys: ["金额", "总价"], field: "_amount" },
    { keys: ["备注", "说明", "用途"], field: "notes" },
    { keys: ["交期", "预计交期", "期望交期"], field: "expected_delivery" },
  ];

  function norm(s) { return String(s ?? "").trim().toLowerCase().replace(/[\s\n\r\t]/g, ""); }

  // 匹配：只要 header 中包含任意 key 即命中
  function matchField(headerText) {
    const hn = norm(headerText);
    for (const rule of FIELD_RULES) {
      for (const key of rule.keys) {
        if (hn.includes(norm(key))) return rule.field;
      }
    }
    return null;
  }

  // 找页面中所有表格
  const tables = document.querySelectorAll("table");
  let bestResult = null;
  let allHeadersDebug = [];

  for (const table of tables) {
    const rows = table.querySelectorAll("tr");
    if (rows.length < 2) continue;

    // 取前3行找表头（兜底合并行表头）
    const headerTexts = [];
    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const cells = rows[r].querySelectorAll("th, td");
      Array.from(cells).forEach((c, i) => {
        const t = c.textContent.trim();
        if (t && !headerTexts[i]) headerTexts[i] = t;
      });
    }
    if (headerTexts.length < 2) continue;
    allHeadersDebug.push("[" + headerTexts.length + "列] " + headerTexts.join(" | "));

    // 构建列映射
    const colMap = {};
    const matched = [];
    headerTexts.forEach((h, i) => {
      if (!h) return;
      const field = matchField(h);
      if (field) {
        colMap[i] = field;
        matched.push(h);
      }
    });

    // 至少匹配到2列
    if (matched.length < 2) continue;

    // 提取数据行（从第3行开始，跳过2行表头）
    const items = [];
    const startRow = rows.length > 3 ? 3 : 1;
    for (let r = startRow; r < rows.length; r++) {
      const rowCells = rows[r].querySelectorAll("th, td");
      if (rowCells.length === 0) continue;
      const item = {};
      let hasData = false;
      rowCells.forEach((cell, i) => {
        const field = colMap[i];
        if (!field) return;
        let val = cell.textContent.trim().replace(/\s+/g, " ");
        if (!val) return;
        hasData = true;
        if (field === "quantity" || field === "_price" || field === "_amount") {
          item[field] = parseFloat(val.replace(/[,，¥￥\s]/g, "")) || 0;
        } else if (field === "purchase_date" || field === "expected_delivery") {
          const m = val.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
          item[field] = m ? m[1].replace(/[./]/g, "-") : val.slice(0, 10);
        } else {
          item[field] = val;
        }
      });
      if (hasData) {
        if (item._price && item.quantity) {
          item.notes = (item.notes ? item.notes + " | " : "") + "单价:" + item._price + ",金额:" + (item._amount || item._price * item.quantity);
        }
        delete item._price;
        delete item._amount;
        items.push(item);
      }
    }

    if (items.length > 0 && (!bestResult || items.length > bestResult.items.length)) {
      bestResult = { items, matched, total: rows.length };
    }
  }

  // 调试：输出所有找到的表头
  console.log("===== 页面表头扫描结果 =====");
  allHeadersDebug.forEach((h, i) => console.log("表格" + (i + 1) + ":", h));

  if (!bestResult || bestResult.items.length === 0) {
    alert("未找到可识别的物料表格。\n\n请将 Console 中的「页面表头扫描结果」截图发给我。");
    return;
  }

  const json = JSON.stringify({ items: bestResult.items, source: "OA采购申请" }, null, 2);
  console.log("===== 提取到 " + bestResult.items.length + " 条物料 =====");
  console.log("匹配列:", bestResult.matched.join(", "));
  console.log("第1条预览:", JSON.stringify(bestResult.items[0]));
  console.log(json);

  navigator.clipboard.writeText(json).then(() => {
    alert("已提取 " + bestResult.items.length + " 条物料并复制到剪贴板！\n\n型号(" + (bestResult.items[0]?.model || "无") + ") | 日期(" + (bestResult.items[0]?.purchase_date || "无") + ")\n\n如果型号/日期仍为空，请把 Console 输出截图发我。");
  }).catch(() => {
    const ta = document.createElement("textarea"); ta.value = json;
    document.body.appendChild(ta); ta.select(); document.execCommand("copy");
    document.body.removeChild(ta);
    alert("已提取 " + bestResult.items.length + " 条物料并复制到剪贴板！");
  });
})();
