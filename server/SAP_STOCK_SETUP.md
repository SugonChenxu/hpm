# HPM 接入 SAP 库存（直接自动拉取）

已在 HPM 后端新增库存接口，支持**后端直连 SAP**（无需开 GUI、可无人值守），
通过 `GET /api/sap/stock?werks=工厂&lgort=库位` 直接从 SAP 读目标仓库库存。

## 接口
- `GET /api/sap/stock?profile=KK-cp101&werks=1200&lgort=1094`
  - 返回该仓库每个物料：可用库存(labst)、质检中(insme)、冻结(speme)、在途(umlme)、物料描述(maktx)
  - `profile` 可选：`KK-cp101`(开发测试) / `SUGON-cp_pm`(天津生产)
- `GET /api/sap/stock/health?profile=KK-cp101` —— 连接自检
- `GET /api/sap/profiles` —— 列出可用 profile

## 两种取数通道（环境变量 `SAP_STOCK_ADAPTER` 切换）
- `rfc` （默认）：node-rfc 调 `RFC_READ_TABLE` 读表 `MARD`，最通用，不依赖 OData 服务是否激活
- `odata`：走 SAP Gateway OData（免 NWRFC SDK，但需 basis 激活库存服务）

## 密码安全
密码一律走环境变量，**不写死**：
- `KK-cp101` → 设 `SAP_KK_PASS`
- `SUGON-cp_pm` → 设 `SAP_SUGON_PASS`

（你的桌面 `.bat` 里目前是明文密码，强烈建议改走 SNC/SSO 单点登录。）

---

## 当前卡点 & 你需要做的一步（二选一）

### 路径 A：RFC（推荐，最稳）
1. 下载 **64 位 SAP NWRFC SDK**（SAP Support Portal，需 S-user）：
   搜 "SAP NetWeaver RFC SDK 7.50"，下 **Windows x86_64** 版
2. 解压到如 `C:\nwrfcsdk`，把 `C:\nwrfcsdk\lib` 加入系统 PATH
3. 在 `D:\HPM\server` 执行：
   ```
   npm i node-rfc
   ```
4. 重启 HPM（pm2 restart forge），设好 `SAP_KK_PASS`，即可调用接口

### 路径 B：OData（免 SDK，但需 basis 配合）
1. 让 basis 在事务码 `/IWFND/MAINT_SERVICE` 激活库存服务
   （标准服务名 `API_MATERIAL_STOCK_SRV`；或用你们自建的 Z* 服务，设 `SAP_ODATA_SERVICE`）
2. 设 `SAP_STOCK_ADAPTER=odata` 与 `SAP_KK_PASS`，重启 HPM 即可

> 已实测：KK 系统 HTTP 8001 端口可达、Basic Auth 鉴权通过；但当前 KK 上
> 该 OData 服务未激活（返回 404），所以走 OData 前必须完成第 1 步。

## 验证
```bash
# 设好密码后
curl "http://localhost:3000/api/sap/stock/health?profile=KK-cp101"
curl "http://localhost:3000/api/sap/stock?profile=KK-cp101&werks=1200&lgort=1094"
```
