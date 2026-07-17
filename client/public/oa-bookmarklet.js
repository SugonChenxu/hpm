// ===== Forge OA 一键导入书签 JS（同步 v4 提取逻辑） =====
(async function () {
  if (document.getElementById("forge-oa-panel")) return;

  // ===== 工具 =====
  const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s　\n\r\t]/g, "");

  // ===== 列映射 ====
  function matchField(h) {
    const t = norm(h);
    if (!t) return null;
    if (t.includes("物料编号") || t.includes("料号") || t.includes("partno") || t === "编号") return "part_number";
    if (t.includes("厂家") || t.includes("供应商") || t.includes("品牌") || t.includes("厂商")) return "manufacturer";
    if (t.includes("型号") || t.includes("规格") || t === "型" || t === "号") return "model";
    if (t.includes("数量") || t === "qty") return "quantity";
    if (t === "单价" || t.includes("unitprice")) return "_price";
    if (t === "金额" || t.includes("总价") || t.includes("total")) return "_amount";
    if (t.includes("备注") || t.includes("说明") || t.includes("remark")) return "notes";
    if (t.includes("交期") || t.includes("delivery")) return "expected_delivery";
    return null;
  }

  // ===== 申请日期 =====
  let formDate = null;
  const allEls = document.querySelectorAll("td, th, span, div, dt, dd, label, p");
  for (const el of allEls) {
    if ((el.textContent || "").trim() === "申请日期") {
      const parent = el.closest("tr, div, dl, li");
      const txt = (parent || el.parentElement)?.textContent || "";
      const m = txt.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
      if (m) { formDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`; break; }
    }
  }
  if (!formDate) {
    const m = document.body.innerText.match(/申请日期[\s\S]*?(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    if (m) formDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  }

  // ===== 提取表格 =====
  const tables = document.querySelectorAll("table");
  let bestResult = null;
  for (const table of tables) {
    const rows = table.querySelectorAll("tr");
    if (rows.length < 2) continue;

    const headerTexts = [];
    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const cells = rows[r].querySelectorAll("th, td");
      Array.from(cells).forEach((c, i) => {
        const t = (c.textContent || "").trim();
        if (t && !headerTexts[i]) headerTexts[i] = t;
      });
    }
    if (headerTexts.length < 3) continue;

    const colMap = {};
    headerTexts.forEach((h, i) => { const f = matchField(h); if (f) colMap[i] = f; });
    if (Object.keys(colMap).length < 2) continue;

    const items = [];
    for (let r = 1; r < rows.length; r++) {
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
        item.purchase_date = formDate;
        items.push(item);
      }
    }

    if (items.length > 0 && (!bestResult || items.length > bestResult.items.length)) {
      bestResult = { items, headerTexts };
    }
  }

  // ===== 浮窗 =====
  const p = document.createElement("div");
  p.id = "forge-oa-panel";
  Object.assign(p.style, {
    position: "fixed", top: "20px", right: "20px", zIndex: "99999",
    width: "540px", maxHeight: "80vh", overflow: "auto",
    background: "#fff", boxShadow: "0 8px 32px rgba(0,0,0,.25)", borderRadius: "8px",
    fontFamily: "Microsoft YaHei, sans-serif", fontSize: "13px", padding: "16px",
  });

  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<b style="font-size:16px">Forge OA 导入</b>';
  html += '<span style="color:#999;cursor:pointer" onclick="document.getElementById(\'forge-oa-panel\').remove()">✕</span>';
  html += '</div>';

  if (!bestResult || !bestResult.items.length) {
    html += '<p style="color:#d32f2f">未提取到物料数据。</p>';
    html += '<p style="color:#666">请确保页面已显示采购明细表格。</p>';
    html += '<p style="color:#666">申请日期: ' + (formDate || "❌ 未找到") + '</p>';
  } else {
    html += '<p>已识别 <b>' + bestResult.items.length + '</b> 条物料';
    html += ' &nbsp; 申请日期: <b>' + (formDate || "❌") + '</b></p>';

    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;margin:8px 0">';
    html += '<tr style="background:#f5f5f5">';
    ["物料号","厂家","型号","数量","日期"].forEach(h => html += '<th style="padding:4px 6px;text-align:left;border-bottom:1px solid #ddd">'+h+'</th>');
    html += '</tr>';
    bestResult.items.slice(0, 20).forEach(it => {
      html += '<tr>';
      [it.part_number, it.manufacturer, it.model, it.quantity, it.purchase_date].forEach(v =>
        html += '<td style="padding:3px 6px;border-bottom:1px solid #eee;max-width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">'+(v||"-")+'</td>'
      );
      html += '</tr>';
    });
    if (bestResult.items.length > 20) html += '<tr><td colspan="5" style="padding:4px;color:#999">… 还有 '+(bestResult.items.length-20)+' 条</td></tr>';
    html += '</table>';

    html += '<div style="margin-top:10px;display:flex;gap:8px;align-items:center">';
    html += '<button id="forge-oa-send" style="padding:8px 20px;background:#1976d2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px">发送到 Forge</button>';
    html += '<span style="color:#999;font-size:11px" id="forge-oa-status"></span>';
    html += '</div>';
  }

  p.innerHTML = html;
  document.body.appendChild(p);

  if (bestResult && bestResult.items.length) {
    document.getElementById("forge-oa-send").onclick = async function () {
      const btn = this, st = document.getElementById("forge-oa-status");
      btn.disabled = true; btn.textContent = "发送中…"; st.textContent = "";

      // 提取内部立项号，匹配项目
      let projectId = 20; // 默认: 液冷超节点
      try {
        let orderNo = "";
        const allEls = document.querySelectorAll("td, th, span, div, dt, dd, label, p");
        for (const el of allEls) {
          const txt = (el.textContent || "").trim();
          if (txt === "内部立项号" || txt === "订单号" || txt === "立项号") {
            const parent = el.closest("tr, div, dl, li");
            const ptx = (parent || el.parentElement)?.textContent || "";
            const om = ptx.match(/[A-Za-z0-9_-]{4,}/);
            if (om) { orderNo = om[0]; break; }
          }
        }
        if (orderNo) {
          const resp = await fetch("http://localhost:3000/api/projects");
          const j = await resp.json();
          const matched = (j.data || []).find(p => p.order_number && p.order_number.trim() === orderNo);
          if (matched) projectId = matched.id;
          else {
            const pm = (j.data || []).find(p => p.name && p.name.includes("项目管理部"));
            if (pm) projectId = pm.id;
          }
        }
      } catch {}

      try {
        const resp = await fetch("http://localhost:3000/api/materials/oa-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            items: bestResult.items.map(it => ({
              part_number: it.part_number || "",
              manufacturer: it.manufacturer || "",
              model: it.model || "",
              quantity: it.quantity || 0,
              purchase_date: it.purchase_date || formDate,
              notes: it.notes || "",
              material_status: "已下单",
            })),
          }),
        });
        const json = await resp.json();
        if (json.ok) { st.textContent = "✅ 已导入 " + json.data.count + " 条！"; st.style.color = "#2e7d32"; }
        else throw new Error(json.error);
      } catch (e) {
        st.textContent = "❌ " + (e.message || "连接失败");
        st.style.color = "#d32f2f";
      }
      btn.disabled = false; btn.textContent = "重试";
    };
  }
})();
