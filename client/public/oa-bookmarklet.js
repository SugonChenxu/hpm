// ===== Forge OA 一键导入书签 JS =====
// 由 http://localhost:3000/oa-bookmarklet.js 提供
(async function () {
  if (document.getElementById("forge-oa-panel")) return; // 已打开

  // ===== 1. 提取申请日期 =====
  function extractFormDate() {
    const all = document.body.innerText;
    const m = all.match(/申请日期[：:\s]*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
    return m ? m[1].replace(/[./]/g, "-") : null;
  }

  // ===== 2. 列头模糊匹配 =====
  function norm(s) { return (s || "").trim().toLowerCase().replace(/[\s　]/g, ""); }
  function matchField(h) {
    const t = norm(h);
    if (!t) return null;
    if (t.includes("物料") || t.includes("料号") || t === "编号") return "part_number";
    if (t.includes("厂家") || t.includes("供应商") || t.includes("品牌") || t.includes("厂商")) return "manufacturer";
    if (t.includes("型号") || t.includes("规格")) return "model";
    if (t.includes("数量")) return "quantity";
    if (t.includes("备注") || t.includes("说明")) return "notes";
    return null;
  }

  // ===== 3. 从所有表格提取 =====
  const tables = document.querySelectorAll("table");
  let items = [];
  const formDate = extractFormDate();

  for (const table of tables) {
    const rows = table.querySelectorAll("tr");
    if (rows.length < 2) continue;

    // 取表头（前3行）
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

    // 提取数据行（跳过前3行表头）
    for (let r = 3; r < rows.length; r++) {
      const cells = rows[r].querySelectorAll("th, td");
      if (cells.length === 0) continue;
      const item = {};
      Array.from(cells).forEach((c, i) => {
        const field = colMap[i];
        if (!field) return;
        const val = (c.textContent || "").trim().replace(/\s+/g, " ");
        if (!val || /^(序号|合计)$/.test(val)) return;
        if (field === "quantity") item[field] = parseFloat(val.replace(/[,，\s]/g, "")) || 0;
        else item[field] = val;
      });
      if (item.part_number) {
        item.purchase_date = formDate;
        items.push(item);
      }
    }
  }

  // ===== 4. 构建浮窗 =====
  const p = document.createElement("div");
  p.id = "forge-oa-panel";
  Object.assign(p.style, {
    position: "fixed", top: "20px", right: "20px", zIndex: "99999",
    width: "520px", maxHeight: "80vh", overflow: "auto",
    background: "#fff", boxShadow: "0 8px 32px rgba(0,0,0,.25)", borderRadius: "8px",
    fontFamily: "Microsoft YaHei, sans-serif", fontSize: "13px", padding: "16px",
  });

  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<b style="font-size:16px">Forge OA 导入</b>';
  html += '<span style="color:#999;cursor:pointer" onclick="document.getElementById(\'forge-oa-panel\').remove()">✕</span>';
  html += '</div>';

  if (!items.length) {
    html += '<p style="color:#d32f2f">未提取到物料数据。</p>';
    html += '<p style="color:#666">请确保页面已显示采购明细表格。</p>';
    html += '<p style="color:#666">提取到申请日期: ' + (formDate || "❌ 未找到") + '</p>';
  } else {
    html += '<p>已识别 <b>' + items.length + '</b> 条物料';
    html += ' &nbsp; 申请日期: <b>' + (formDate || "❌") + '</b></p>';

    // 预览表
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;margin:8px 0">';
    html += '<tr style="background:#f5f5f5">';
    ["物料号","厂家","型号","数量"].forEach(h => html += '<th style="padding:4px 6px;text-align:left;border-bottom:1px solid #ddd">'+h+'</th>');
    html += '</tr>';
    items.slice(0, 20).forEach(it => {
      html += '<tr>';
      [it.part_number, it.manufacturer, it.model, it.quantity].forEach(v =>
        html += '<td style="padding:3px 6px;border-bottom:1px solid #eee;max-width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">'+(v||"-")+'</td>'
      );
      html += '</tr>';
    });
    if (items.length > 20) html += '<tr><td colspan="4" style="padding:4px;color:#999">… 还有 '+(items.length-20)+' 条</td></tr>';
    html += '</table>';

    // 发送按钮 + 项目选择
    html += '<div style="margin-top:10px;display:flex;gap:8px;align-items:center">';
    html += '<button id="forge-oa-send" style="padding:8px 20px;background:#1976d2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px">发送到 Forge</button>';
    html += '<span style="color:#999;font-size:11px" id="forge-oa-status"></span>';
    html += '</div>';
    html += '<p style="color:#999;font-size:10px;margin-top:6px">Forge 需在 http://localhost:3000 运行。发送数据会导入到当前选中的项目。</p>';
  }

  p.innerHTML = html;
  document.body.appendChild(p);

  // ===== 5. 发送按钮逻辑 =====
  if (items.length) {
    document.getElementById("forge-oa-send").onclick = async function () {
      const btn = this;
      const st = document.getElementById("forge-oa-status");
      btn.disabled = true;
      btn.textContent = "发送中…";
      st.textContent = "";

      try {
        const resp = await fetch("http://localhost:3000/api/materials/oa-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: 20, // 默认项目，可改
            items: items.map(it => ({
              part_number: it.part_number || "",
              manufacturer: it.manufacturer || "",
              model: it.model || "",
              quantity: it.quantity || 0,
              purchase_date: it.purchase_date || formDate,
              notes: it.notes || "",
            })),
          }),
        });
        const json = await resp.json();
        if (json.ok) {
          st.textContent = "✅ 已导入 " + json.data.count + " 条物料！";
          st.style.color = "#2e7d32";
        } else {
          throw new Error(json.error);
        }
      } catch (e) {
        st.textContent = "❌ " + (e.message || "连接 Forge 失败");
        st.style.color = "#d32f2f";
        console.error("Forge OA import error:", e);
      }
      btn.disabled = false;
      btn.textContent = "重试";
    };
  }
})();
