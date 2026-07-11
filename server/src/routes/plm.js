/**
 * PLM 集成路由
 *
 * 端点：
 *   GET  /plm/connection   — 读取 PLM 连接配置（api_token 完整返回以便前端回填）
 *   PUT  /plm/connection   — 保存/更新 PLM 连接配置
 *   POST /plm/probe        — 只读探针：探测任意 PLM URL 并返回结构化结果
 *
 * 注意：本 P0 只做连接配置 + 只读探针，不实现实际排程同步（P1 负责）。
 * 路由挂载在 /api 下 → 完整路径为 /api/plm/*
 */

import { Router } from "express";
import PlmAdapter from "../adapters/plm.js";

const router = Router();

// ── 错误映射 ───────────────────────────────────────────────
function mapError(error) {
  const code = error.code;
  switch (code) {
    case "network_error":
      return { status: 502, message: "无法连接 PLM（网络/TLS）" };
    case "tls_error":
      return { status: 502, message: "无法连接 PLM（网络/TLS）" };
    case "auth_failed":
      return { status: 502, message: error.message || "PLM 鉴权失败" };
    case "invalid_url":
      return { status: 400, message: error.message || "探测 URL 无效" };
    case "validation_failed":
      return { status: 400, message: error.message || "参数校验失败" };
    default:
      return { status: 400, message: error.message || "PLM 请求失败" };
  }
}

// ═════════════════════════════════════════════════════════
// GET /plm/connection — 读取 PLM 连接配置
// ═════════════════════════════════════════════════════════
router.get("/plm/connection", (req, res) => {
  try {
    const conn = PlmAdapter.getConfig();
    res.json({ ok: true, data: conn || {} });
  } catch (error) {
    const { status, message } = mapError(error);
    res.status(status).json({ ok: false, error: message });
  }
});

// ═════════════════════════════════════════════════════════
// PUT /plm/connection — 保存/更新 PLM 连接配置
// ═════════════════════════════════════════════════════════
router.put("/plm/connection", (req, res) => {
  try {
    const { server_url, api_token, collab_space, tls_reject_unauthorized } =
      req.body || {};

    if (!server_url || !String(server_url).trim()) {
      return res
        .status(400)
        .json({ ok: false, error: "server_url 必填" });
    }

    const saved = PlmAdapter.saveConfig({
      server_url,
      api_token,
      collab_space,
      tls_reject_unauthorized,
    });

    res.json({ ok: true, data: saved });
  } catch (error) {
    const { status, message } = mapError(error);
    res.status(status).json({ ok: false, error: message });
  }
});

// ═════════════════════════════════════════════════════════
// POST /plm/probe — 只读探针
// ═════════════════════════════════════════════════════════
router.post("/plm/probe", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || !String(url).trim()) {
      return res.status(400).json({ ok: false, error: "url 必填" });
    }

    const result = await PlmAdapter.probe(String(url).trim());
    res.json({ ok: true, data: result });
  } catch (error) {
    const { status, message } = mapError(error);
    res.status(status).json({ ok: false, error: message });
  }
});

export default router;
