// 认证中间件：除公开端点外，所有 /api 请求必须携带有效会话。
// 成功后将 req.userId 注入后续处理。

// 公开白名单（相对 /api 挂载点的路径）：
//  - /auth/login、/auth/me、/auth/logout 由 authRouter 自身处理（注册在前，不会走到此）
//  - /materials/oa-import、/materials/oa-fetch 由 OA 书签跨域调用，无会话 cookie，需放行
const OPEN_PATHS = new Set(["/materials/oa-import", "/materials/oa-fetch"]);

export function requireAuth(req, res, next) {
  const p = req.path;
  if (OPEN_PATHS.has(p)) return next();
  // OA 跨域预检
  if (req.method === "OPTIONS" && p.startsWith("/materials/oa")) return next();

  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      ok: false,
      error: "未登录或会话已过期",
      code: "UNAUTHENTICATED",
    });
  }
  req.userId = req.session.userId;
  next();
}
