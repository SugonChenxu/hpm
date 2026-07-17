// ===== Forge OA 物料导入提取脚本 v4 =====
// v4: 打印每个表格的表头行 + 匹配结果，方便定位型号列为何未匹配
(function () {
  const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s　\n\r\t]/g, "");

  function matchField(h) {
    const t = norm(h);
    if (!t) return null;
    // 物料编号要明确匹配"编号"或"料号"，避免"物料描述"误匹配
    if (t.includes("物料编号") || t.includes("料号") || t.includes("partno") || t === "编号") return "part_number";
    if (t.includes("厂家") || t.includes("供应商") || t.includes("品牌") || t.includes("厂商")) return "manufacturer";
    // 型号/规格/型号配置/物料描述(含"型号"则算)
    if (t.includes("型号") || t.includes("规格") || t === "型" || t === "号") return "model";
    if (t.includes("数量") || t === "qty") return "quantity";
    if (t === "单价" || t.includes("unitprice")) return "_price";
    if (t === "金额" || t.includes("总价") || t.includes("total")) return "_amount";
    if (t.includes("备注") || t.includes("说明") || t.includes("remark")) return "notes";
    if (t.includes("交期") || t.includes("delivery")) return "expected_delivery";
    return null;
  }

  // ===== 申请日期（多策略） =====
  let formDate = null;
  // 策略A: 找含"申请日期"的元素，取其父容器内所有文字匹配日期
  const allEls = document.querySelectorAll("td, th, span, div, dt, dd, label, p");
  for (const el of allEls) {
    if ((el.textContent || "").trim() === "申请日期") {
      const parent = el.closest("tr, div, dl, li");
      const txt = (parent || el.parentElement)?.textContent || "";
      const m = txt.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
      if (m) { formDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`; break; }
    }
  }
  // 策略B: 正则兜底
  if (!formDate) {
    const m = document.body.innerText.match(/申请日期[\s\S]*?(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    if (m) formDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  }

  // ===== 遍历表格 =====
  const tables = document.querySelectorAll("table");
  let bestResult = null;

  for (let ti = 0; ti < tables.length; ti++) {
    const table = tables[ti];
    const rows = table.querySelectorAll("tr");
    if (rows.length < 2) continue;

    // 收集表头（取前3行，兜底合并单元格）
    const headerTexts = [];
    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const cells = rows[r].querySelectorAll("th, td");
      Array.from(cells).forEach((c, i) => {
        const t = (c.textContent || "").trim();
        if (t && !headerTexts[i]) headerTexts[i] = t;
      });
    }
    if (headerTexts.length < 3) continue;

    // 列映射
    const colMap = {};
    const matched = [];
    headerTexts.forEach((h, i) => {
      const f = matchField(h);
      if (f) { colMap[i] = f; matched.push(i + ":" + h + "→" + f); }
    });

    // 打印调试
    console.log(`===== 表格${ti + 1} (${rows.length}行) =====`);
    console.log("表头:", headerTexts.join(" | "));
    console.log("匹配:", matched.join(", "));
    if (!matched.length) console.log("  → 无匹配列");

    if (Object.keys(colMap).length < 2) continue;

    // 提取数据行
    const items = [];
    // 第一行作为表头，从第二行开始取数据
    const startRow = 1;
    for (let r = startRow; r < rows.length; r++) {
      const cells = rows[r].querySelectorAll("th, td");
      if (cells.length === 0) continue;
      const item = {};
      let hasData = false;
      Array.from(cells).forEach((c, i) => {
        const field = colMap[i];
        if (!field) return;
        let val = (c.textContent || "").trim().replace(/\s+/g, " ");
        if (!val || /^(序号|合计|总计)$/.test(val)) return;
        hasData = true;
        if (field === "quantity" || field === "_price" || field === "_amount") {
          item[field] = parseFloat(val.replace(/[,，¥￥\s]/g, "")) || 0;
        } else {
          item[field] = val;
        }
      });
      if (hasData) {
        if (item._price && item.quantity) {
          item.notes = (item.notes ? item.notes + " | " : "") + "单价:" + item._price + ",金额:" + (item._amount || item._price * item.quantity);
        }
        delete item._price; delete item._amount;
        item.material_status = "已下单";
        item.purchase_date = formDate;
        items.push(item);
      }
    }

    if (items.length > 0 && (!bestResult || items.length > bestResult.items.length)) {
      bestResult = { items, matched, headerTexts, tableIndex: ti };
    }
  }

  // ===== 输出 =====
  if (bestResult) {
    // 提取内部立项号：宽搜索→打印完整上下文供诊断
    let orderNo = "";
    console.log("===== 扫描「内部立项号」 =====");
    const allEls2 = document.querySelectorAll("*");
    for (const el of allEls2) {
      const txt = (el.textContent || "").trim().replace(/\s+/g, "");
      if (txt === "内部立项号" && el.children.length === 0) {
        console.log("找到:", el.textContent.trim(), "| tag:", el.tagName, "| class:", el.className);
        // 打印父级上下文
        let p = el.parentElement;
        for (let depth = 0; depth < 4 && p; depth++, p = p.parentElement) {
          const snippet = (p.textContent || "").trim().replace(/\s+/g, "").slice(0, 200);
          console.log(`  父级${depth}: tag=${p.tagName}, class=${p.className}, text[:200]=${snippet}`);
        }
        // 取紧邻右侧的值 — 找到下一个含有有效数字/字母串的兄弟
        const walk = document.createTreeWalker(el.parentElement || document.body, NodeFilter.SHOW_TEXT);
        let foundLabel = false;
        while (walk.nextNode()) {
          const n = walk.currentNode;
          if (n === el || n.contains(el) || el.contains(n)) { foundLabel = true; continue; }
          if (!foundLabel) continue;
          const nt = n.textContent.trim();
          if (nt && nt.length > 0 && nt.length < 30) {
            orderNo = nt;
            console.log("  提取值:", orderNo);
            break;
          }
        }
        if (orderNo) break;
      }
    }
    console.log("内部立项号:", orderNo || "❌ 未找到");
    const json = JSON.stringify({ items: bestResult.items, source: "OA采购申请", order_number: orderNo || null }, null, 2);
    console.log("===== 最终结果 =====");
    console.log("选中表格:", bestResult.tableIndex, "| 列:", bestResult.matched.join(", "));
    console.log("申请日期:", formDate || "未找到");
    console.log("内部立项号:", orderNo || "❌ 未找到");
    console.log("第1条:", JSON.stringify(bestResult.items[0]));
    console.log("全部JSON:\n" + json);

    navigator.clipboard.writeText(json).then(() => {
      alert("提取 " + bestResult.items.length + " 条\n" +
        "型号: " + (bestResult.items[0]?.model || "❌") + " | 日期: " + (formDate || "❌") + "\n" +
        "立项号: " + (orderNo || "❌") + "\n\n已复制。");
    }).catch(() => {
      const ta = document.createElement("textarea"); ta.value = json;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      alert("提取 " + bestResult.items.length + " 条，已复制。");
    });
  } else {
    alert("未找到物料表格。");
    console.log("页面表格数:", tables.length);
    for (let ti = 0; ti < Math.min(tables.length, 3); ti++) {
      const rows = tables[ti].querySelectorAll("tr");
      const h = Array.from(rows[0]?.querySelectorAll("th,td") || []).map(c => (c.textContent || "").trim());
      console.log("表格" + (ti + 1) + "表头:", h.join(" | "));
    }
  }
})();
