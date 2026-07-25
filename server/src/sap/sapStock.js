// SAP 库存抓取客户端
// 同时支持两种通道，由 SAP_STOCK_ADAPTER 切换：
//   - 'rfc'    : 通过 node-rfc 调用 RFC_READ_TABLE 读 MARD（最通用，不依赖 OData 服务是否激活）
//   - 'odata'  : 通过 axios 调 SAP Gateway OData（免 NWRFC SDK，但需 basis 激活库存服务）
//
// 仓库在 SAP 中 = 库存地点 = 工厂(WERKS) + 仓储地点(LGORT)。库存数据在表 MARD。

import axios from "axios";
import { getProfile } from "./sapProfiles.js";

const ADAPTER = (process.env.SAP_STOCK_ADAPTER || "rfc").toLowerCase();
const ODATA_SERVICE = process.env.SAP_ODATA_SERVICE || "API_MATERIAL_STOCK_SRV";

function passFor(profile) {
  const v = process.env[profile.passEnv];
  if (!v) {
    throw new Error(
      `缺少环境变量 ${profile.passEnv}（请设置为「${profile.label}」的登录密码，不要写死在代码里）`
    );
  }
  return v;
}

// ---------------------------------------------------------------------------
// 适配器 1: RFC (RFC_READ_TABLE -> MARD)
// ---------------------------------------------------------------------------
async function getStockRfc(profile, { werks, lgort, matnr }) {
  let rfc;
  try {
    rfc = await import("node-rfc");
  } catch (e) {
    throw new Error(
      "未安装 node-rfc。请先执行: npm i node-rfc，并把 64 位 SAP NWRFC SDK 的 lib 目录加入 PATH（详见 SAP_STOCK_SETUP.md）"
    );
  }

  const connParams = {
    user: profile.user,
    passwd: passFor(profile),
    client: profile.client,
    lang: "ZH",
  };
  if (profile.ashOst) {
    Object.assign(connParams, { ashost: profile.ashOst, sysnr: profile.sysnr, sysid: profile.sysid });
  } else if (profile.mshost) {
    Object.assign(connParams, {
      mshost: profile.mshost,
      msserv: profile.msserv,
      group: profile.group,
      sysid: profile.sysid,
    });
  }

  const conn = new rfc.Connection(connParams);
  await conn.open();
  try {
    const fields = ["MATNR", "WERKS", "LGORT", "LABST", "INSME", "SPEME", "UMLME"];
    const where = [];
    if (werks) where.push(`WERKS = '${werks}'`);
    if (lgort) where.push(`LGORT = '${lgort}'`);
    if (matnr) where.push(`MATNR = '${matnr}'`);

    const result = await conn.call("RFC_READ_TABLE", {
      QUERY_TABLE: "MARD",
      DELIMITER: "`", // 用极少见字符做分隔，避免固定宽度解析
      FIELDS: fields.map((f) => ({ FIELDNAME: f })),
      OPTIONS: where.length ? [where.join(" AND ")] : [],
      ROWCOUNT: 500,
    });

    const rows = (result.DATA || []).map((d) => d.WA.split("`"));
    const stock = rows.map((c) => ({
      matnr: (c[0] || "").trim(),
      werks: (c[1] || "").trim(),
      lgort: (c[2] || "").trim(),
      labst: Number(c[3]) || 0, // 非限制库存(可用)
      insme: Number(c[4]) || 0, // 质检中
      speme: Number(c[5]) || 0, // 冻结
      umlme: Number(c[6]) || 0, // 在途
    }));

    // 可选: 拉物料描述(MAKT)
    if (matnr || stock.length) {
      try {
        const desc = await fetchMaktRfc(conn, stock.map((s) => s.matnr));
        const map = new Map(desc.map((d) => [d.matnr, d.maktx]));
        stock.forEach((s) => (s.maktx = map.get(s.matnr) || ""));
      } catch (e) {
        stock.forEach((s) => (s.maktx = ""));
      }
    }
    return stock;
  } finally {
    await conn.close();
  }
}

async function fetchMaktRfc(conn, matnrs) {
  if (!matnrs.length) return [];
  const uniq = [...new Set(matnrs)];
  // RFC_READ_TABLE OPTIONS 单行上限 ~72 字符, 分批
  const chunks = [];
  let buf = [];
  let len = 0;
  for (const m of uniq) {
    const clause = `MATNR = '${m}'`;
    if (len + clause.length + 5 > 70 && buf.length) {
      chunks.push(buf);
      buf = [];
      len = 0;
    }
    buf.push(clause);
    len += clause.length + 5;
  }
  if (buf.length) chunks.push(buf);

  const out = [];
  for (const chunk of chunks) {
    const r = await conn.call("RFC_READ_TABLE", {
      QUERY_TABLE: "MAKT",
      DELIMITER: "`",
      FIELDS: [{ FIELDNAME: "MATNR" }, { FIELDNAME: "MAKTX" }],
      OPTIONS: [chunk.join(" OR ")],
      ROWCOUNT: 1000,
    });
    (r.DATA || []).forEach((d) => {
      const c = d.WA.split("`");
      out.push({ matnr: (c[0] || "").trim(), maktx: (c[1] || "").trim() });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 适配器 2: OData (SAP Gateway)
// ---------------------------------------------------------------------------
async function getStockOData(profile, { werks, lgort, matnr }) {
  const base = `http://${profile.httpHost}:${profile.httpPort}/sap/opu/odata/sap/${ODATA_SERVICE}/`;
  const filters = [];
  if (werks) filters.push(`Plant eq '${werks}'`);
  if (lgort) filters.push(`StorageLocation eq '${lgort}'`);
  if (matnr) filters.push(`Material eq '${matnr}'`);

  const url =
    base +
    `A_MaterialStock?$filter=${filters.join(" and ")}&$top=500&$format=json&sap-client=${profile.client}`;

  let resp;
  try {
    resp = await axios.get(url, {
      auth: { username: profile.user, password: passFor(profile) },
      headers: { Accept: "application/json" },
      timeout: 20000,
    });
  } catch (e) {
    if (e.response && e.response.status === 404) {
      throw new Error(
        `OData 服务 ${ODATA_SERVICE} 在该系统未激活(404)。请让 basis 在 /IWFND/MAINT_SERVICE 激活此服务，或改用 adapter=rfc。`
      );
    }
    throw new Error(`OData 请求失败: ${e.message}`);
  }

  const results = resp.data?.d?.results || [];
  return results.map((r) => ({
    matnr: r.Material,
    werks: r.Plant,
    lgort: r.StorageLocation,
    labst: Number(r.MatlWrhsStkQtyInBaseUnit || 0),
    insme: 0,
    speme: 0,
    umlme: 0,
    maktx: r.MaterialText || "",
  }));
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------
export async function getStock(profileKey, params = {}) {
  const profile = getProfile(profileKey);
  const adapter = (params.adapter || ADAPTER).toLowerCase();

  const rows =
    adapter === "odata"
      ? await getStockOData(profile, params)
      : await getStockRfc(profile, params);

  return rows;
}

// 连接自检（用于 /api/sap/stock/health）
export async function pingProfile(profileKey, adapter) {
  const profile = getProfile(profileKey);
  const use = (adapter || ADAPTER).toLowerCase();
  if (use === "odata") {
    const url = `http://${profile.httpHost}:${profile.httpPort}/sap/opu/odata/sap/${ODATA_SERVICE}/`;
    try {
      const r = await axios.get(url, {
        auth: { username: profile.user, password: passFor(profile) },
        timeout: 8000,
      });
      return { adapter: "odata", ok: r.status < 400, status: r.status };
    } catch (e) {
      return { adapter: "odata", ok: false, error: e.message };
    }
  }
  // rfc ping: 仅尝试建立连接
  let rfc;
  try {
    rfc = await import("node-rfc");
  } catch (e) {
    return { adapter: "rfc", ok: false, error: "node-rfc 未安装" };
  }
  const connParams = { user: profile.user, passwd: passFor(profile), client: profile.client, lang: "ZH" };
  if (profile.ashOst) Object.assign(connParams, { ashost: profile.ashOst, sysnr: profile.sysnr, sysid: profile.sysid });
  else if (profile.mshost) Object.assign(connParams, { mshost: profile.mshost, msserv: profile.msserv, group: profile.group, sysid: profile.sysid });
  try {
    const conn = new rfc.Connection(connParams);
    await conn.open();
    await conn.close();
    return { adapter: "rfc", ok: true };
  } catch (e) {
    return { adapter: "rfc", ok: false, error: e.message };
  }
}
