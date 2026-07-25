// SAP 连接配置
// 设计原则：密码一律走环境变量，绝不写死在代码/仓库里。
//
// 需要的环境变量：
//   SAP_KK_PASS         KK-cp101 的登录密码
//   SAP_SUGON_PASS      SUGON-cp_pm 的登录密码
//   SAP_STOCK_ADAPTER   'rfc'(默认) 或 'odata'  —— 选择取数通道
//   SAP_ODATA_SERVICE   自定义 OData 服务名（默认 API_MATERIAL_STOCK_SRV）
//
// 两套系统对应你桌面上的自动登录 .bat：
//   KK-cp101   -> KK_S4_KP1   (开发测试, client 600)
//   SUGON-cp_pm-> SUGON_PRD_TIANJIN (天津生产, client 800)

export const PROFILES = {
  "KK-cp101": {
    label: "KK_S4_KP1 (开发测试)",
    user: "cp101",
    client: "600",
    // RFC 直连 (node-rfc) —— 应用服务器方式
    ashOst: "10.8.100.11",
    sysnr: "01",
    sysid: "BP2",
    // OData (HTTP ICM) —— 已实测 8001 端口可达且 Basic Auth 通过
    httpHost: "10.8.100.11",
    httpPort: "8001",
    passEnv: "SAP_KK_PASS",
  },
  "SUGON-cp_pm": {
    label: "SUGON_PRD_TIANJIN (天津生产)",
    user: "cp_pm",
    client: "800",
    // RFC 直连 —— 消息服务器方式
    mshost: "10.2.101.36",
    msserv: "3600",
    group: "PUBLIC",
    sysid: "PRD",
    // OData —— 端口需按实际确认（此处为占位）
    httpHost: "10.2.101.36",
    httpPort: "8000",
    passEnv: "SAP_SUGON_PASS",
  },
};

export function getProfile(key) {
  const p = PROFILES[key];
  if (!p) {
    throw new Error(`未知 profile: ${key}，可选: ${Object.keys(PROFILES).join(", ")}`);
  }
  return p;
}
