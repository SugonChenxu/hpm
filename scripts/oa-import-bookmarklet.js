// ===== Forge OA 物料导入提取脚本 v3 =====
// v3 关键改动：
//   1. 申请日期从表单头部标签-值对提取（不是物料表内），全量应用
//   2. 型号匹配更宽容：含「型号/描述/规格」任一即命中（处理"型号配置/物料描述"这类带斜杠的列名）
//   3. 调试打印每个找到的表头和日期来源
(function () {
  // ============ 工具函数 ============
  const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s\n\r\t　]/g, "");
  const findInText = (text, regex) => (text.match(regex) || [])[1] || null;

  // ============ 1. 从表单头部提取"申请日期"（全表单共享） ============
  function extractFormDate() {
    // 策略A: 找包含"申请日期"文字的标签元素，取其紧邻兄弟/父容器的文本
    // SOA 泛微/致远的常见结构: <span>申请日期</span><span>2026-06-26 17:35</span>
    //                    或: <td>申请日期</td><td>2026-06-26 17:35</td>
    //                    或: <div>申请日期</div><div>...</div>

    const allEls = document.querySelectorAll("td, th, span, div, dt, dd, label, p, li");
    for (const el of allEls) {
      // 仅文本（避免子元素干扰）
      const txt = el.textContent.trim();
      if (txt === "申请日期" || txt === "申请时间" || txt === "采购日期" || txt === "日期") {
        // 找下一个兄弟
        let next = el.nextElementSibling;
        if (next && next.textContent.trim()) {
          const m = next.textContent.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
          if (m) return m[1].replace(/[./]/g, "-");
        }
        // 找下一个同父元素节点
        let p = el.parentElement;
        if (p) {
          const sibs = Array.from(p.children);
          const idx = sibs.indexOf(el);
          if (idx >= 0 && idx + 1 < sibs.length) {
            const m = sibs[idx + 1].textContent.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
            if (m) return m[1].replace(/[./]/g, "-");
          }
        }
      }
    }

    // 策略B: 全文正则兜底
    const all = document.body.innerText;
    const m = all.match(/申请日期[：:\s]*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
    if (m) return m[1].replace(/[./]/g, "-");
    return null;
  }

  // ============ 2. 列头模糊匹配 ============
  function matchField(headerText) {
    const hn = norm(headerText);
    if (!hn) return null;
    if (hn.includes("物料") || hn.includes("料号") || hn === "编号" || hn.includes("partno")) return "part_number";
    if (hn.includes("厂家") || hn.includes("供应商") || hn.includes("品牌") || hn.includes("厂商")) return "manufacturer";
    if (hn.includes("型号") || hn.includes("规格")) return "model";
    if (hn.includes("数量")) return "quantity";
    if (hn === "单价" || hn.includes("unitprice")) return "_price";
    if (hn === "金额" || hn.includes("总价") || hn.includes("total")) return "_amount";
    if (hn.includes("备注") || hn.includes("说明") || hn.includes("用途") || hn.includes("remark")) return "notes";
    if (hn.includes("交期") || hn.includes("delivery")) return "expected_delivery";
    return null;
  }

  // ============ 3. 找物料表格（行数最多+列数最稳定） ============
  const tables = document.querySelectorAll("table");
  let bestResult = null;
  const debugHeaders = [];

  for (const table of tables) {
    const rows = table.querySelectorAll("tr");
    if (rows.length < 2) continue;
    // 收集表头：最多取前3行（合并单元格行表头）
    const headerTexts = [];
    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const cells = rows[r].querySelectorAll("th, td");
      Array.from(cells).forEach((c, i) => {
        const t = c.textContent.trim();
        if (t && !headerTexts[i]) headerTexts[i] = t;
      });
    }
    if (headerTexts.length < 3) continue;
    debugHeaders.push(`表格(${rows.length}行): ${headerTexts.join(" | ")}`);

    // 构建列映射
    const colMap = {};
    const matched = [];
    headerTexts.forEach((h, i) => {
      const f = matchField(h);
      if (f) { colMap[i] = f; matched.push(`${i}:${h}→${f}`); }
    });
    // 必须命中 part_number 或 model（标识为物料行）
    if (!colMap[0] && Object.keys(colMap).length < 2) continue;
    if (matched.length < 2) continue;

    // 提取数据行
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
        delete item._price; delete item._amount;
        items.push(item);
      }
    }

    if (items.length > 0 && (!bestResult || items.length > bestResult.items.length)) {
      bestResult = { items, matched, headers: headerTexts, total: rows.length };
    }
  }

  // ============ 4. 申请日期 = 表单头部提取 ============
  const formDate = extractFormDate();
  if (formDate && bestResult) {
    bestResult.items = bestResult.items.map((it) => ({
      ...it,
      purchase_date: it.purchase_date || formDate,
    }));
  }

  // ============ 调试输出 ============
  console.log("===== 扫描到的表格表头 =====");
  debugHeaders.forEach((h, i) => console.log("T" + (i + 1) + ":", h));
  if (bestResult) {
    console.log("===== 匹配列 =====");
    bestResult.matched.forEach((m) => console.log("  ", m));
    console.log("===== 申请日期(表单头部) =====", formDate || "(未找到)");
    console.log("===== 第1条预览 =====", JSON.stringify(bestResult.items[0], null, 2));
  }

  if (!bestResult || bestResult.items.length === 0) {
    alert("未找到物料表格。\n\n请截图 Console 中「扫描到的表格表头」发给我。");
    return;
  }

  // ============ 5. 复制到剪贴板 ============
  const json = JSON.stringify({ items: bestResult.items, source: "OA采购申请" }, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    const first = bestResult.items[0];
    alert(`提取 ${bestResult.items.length} 条\n` +
      `型号: ${first.model || "❌空"}\n` +
      `日期: ${first.purchase_date || "❌空"}（来源: ${formDate ? "表单头部" : "❌未找到"}）\n\n` +
      `已复制到剪贴板。`);
  }).catch(() => {
    const ta = document.createElement("textarea"); ta.value = json;
    document.body.appendChild(ta); ta.select(); document.execCommand("copy");
    document.body.removeChild(ta);
    alert(`已提取 ${bestResult.items.length} 条并复制。`);
  });
})();
