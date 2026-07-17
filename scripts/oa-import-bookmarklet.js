// ===== Forge OA 物料导入提取脚本 =====
// 用法：在 OA 采购申请页面打开 DevTools(F12) → Console → 粘贴全部 → 回车
// 自动提取表格中的物料数据，复制 JSON 到剪贴板
(function () {
  // 字段映射：OA列名 → 系统字段
  const COLUMN_MAP = [
    { keys: ["物料编号", "物料号", "料号", "编号", "partnumber", "part_no"], field: "part_number" },
    { keys: ["厂家", "供应商", "品牌", "manufacturer", "厂商"], field: "manufacturer" },
    { keys: ["型号配置", "型号", "规格", "物料型号", "物料描述", "model", "配置"], field: "model" },
    { keys: ["数量", "quantity", "qty", "总数量", "采购数量"], field: "quantity" },
    { keys: ["申请日期", "采购日期", "日期", "purchasedate", "申请时间"], field: "purchase_date" },
    { keys: ["单价", "unitprice", "price"], field: "_price" },
    { keys: ["金额", "amount", "总价", "total"], field: "_amount" },
    { keys: ["备注", "说明", "notes", "remark", "用途"], field: "notes" },
    { keys: ["交期", "预计交期", "期望交期", "delivery"], field: "expected_delivery" },
  ];

  function norm(s) { return String(s ?? "").trim().toLowerCase().replace(/[\s\n]/g, ""); }

  // 找页面中所有表格
  const tables = document.querySelectorAll("table");
  let bestResult = null;

  for (const table of tables) {
    const rows = table.querySelectorAll("tr");
    if (rows.length < 2) continue;

    // 取前两行判断表头
    const headerRow = rows[0];
    const cells = headerRow.querySelectorAll("th, td");
    if (cells.length < 2) continue;

    const headers = Array.from(cells).map((c) => c.textContent.trim());
    
    // 构建列映射
    const colMap = {}; // colIndex → { field, index }
    const matched = [];
    headers.forEach((h, i) => {
      const hn = norm(h);
      if (!hn) return;
      for (const cm of COLUMN_MAP) {
        if (cm.keys.map(norm).includes(hn)) {
          colMap[i] = cm.field;
          matched.push(h);
          break;
        }
      }
    });

    // 至少匹配到3列才算有效
    if (matched.length < 3) continue;

    // 提取数据行
    const items = [];
    for (let r = 1; r < rows.length; r++) {
      const rowCells = rows[r].querySelectorAll("th, td");
      if (rowCells.length === 0) continue;
      const item = {};
      let hasData = false;
      rowCells.forEach((cell, i) => {
        const field = colMap[i];
        if (!field) return;
        const val = cell.textContent.trim();
        if (val) {
          hasData = true;
          if (field === "quantity" || field === "_price" || field === "_amount") {
            item[field] = parseFloat(val.replace(/[,，¥￥]/g, "")) || 0;
          } else if (field === "purchase_date" || field === "expected_delivery") {
            // 截取年月日，剔除时分秒
            const m = val.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
            item[field] = m ? m[1].replace(/[./]/g, "-") : val.slice(0, 10);
          } else {
            item[field] = val;
          }
        }
      });
      if (hasData) {
        // 如果有单价和数量，生成备注信息
        if (item._price && item.quantity) {
          item.notes = (item.notes ? item.notes + " | " : "") + "单价:" + item._price + ",金额:" + (item._amount || item._price * item.quantity);
        }
        delete item._price;
        delete item._amount;
        items.push(item);
      }
    }

    if (items.length > 0 && (!bestResult || items.length > bestResult.items.length)) {
      bestResult = { items, matched, total: rows.length - 1 };
    }
  }

  if (!bestResult || bestResult.items.length === 0) {
    // 兜底：尝试找 input/span 中带特定 class 的数据行
    const allText = document.body.innerText;
    alert("未找到表格数据。\n页面文本前500字:\n" + allText.slice(0, 500));
    return;
  }

  // 结果预览 + 复制
  const json = JSON.stringify({ items: bestResult.items, source: "OA采购申请" }, null, 2);
  console.log("===== 提取到 " + bestResult.items.length + " 条物料 =====");
  console.log("匹配列:", bestResult.matched.join(", "));
  console.log(json);

  // 复制到剪贴板
  navigator.clipboard.writeText(json).then(() => {
    alert("已提取 " + bestResult.items.length + " 条物料并复制到剪贴板！\n\n请切换到 Forge → 物料管理 → 点击 URL 栏粘贴数据导入。");
  }).catch(() => {
    // fallback: 创建临时 textarea
    const ta = document.createElement("textarea");
    ta.value = json;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("已提取 " + bestResult.items.length + " 条物料并复制到剪贴板！");
  });

  console.log("匹配列:", bestResult.matched);
  console.log("数据已复制到剪贴板，切换回 Forge 使用。");
})();
