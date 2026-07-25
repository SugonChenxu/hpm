// HPM 路由: /api/sap/stock —— 直接从 SAP 拉取目标仓库库存
// 依赖: ../sap/sapStock.js
import express from "express";
import { getStock, pingProfile } from "../sap/sapStock.js";
import { PROFILES } from "../sap/sapProfiles.js";

const router = express.Router();

// 列出可用 profile（对应 KK-cp101 / SUGON-cp_pm）
router.get("/sap/profiles", (req, res) => {
  res.json({
    ok: true,
    adapter: (process.env.SAP_STOCK_ADAPTER || "rfc").toLowerCase(),
    profiles: Object.entries(PROFILES).map(([k, v]) => ({ key: k, label: v.label })),
  });
});

// 连接自检
router.get("/sap/stock/health", async (req, res) => {
  try {
    const { profile = "KK-cp101", adapter } = req.query;
    const r = await pingProfile(profile, adapter);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// 拉取库存: GET /api/sap/stock?profile=KK-cp101&werks=1200&lgort=1094[&matnr=...][&withDesc=1]
router.get("/sap/stock", async (req, res) => {
  try {
    const { profile = "KK-cp101", werks, lgort, matnr, adapter } = req.query;
    if (!werks || !lgort) {
      return res.status(400).json({ ok: false, error: "werks(工厂) 与 lgort(仓储地点) 为必填参数" });
    }
    const data = await getStock(profile, {
      werks,
      lgort,
      matnr,
      adapter,
    });
    res.json({ ok: true, count: data.length, profile, werks, lgort, data });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

export default router;
