import db from "./db.js";

const phases_json = JSON.stringify([
  // M1 预研阶段
  { name: "L1 预研", order: 1, type: "PHASE", duration_weeks: null, description: "市场代表主导：行业BD/SE全局规划，识别技术风险" },
  { name: "L2 详细需求", order: 2, type: "PHASE", duration_weeks: null, description: "产品经理主导：编制PRD+典配+通用物料" },
  { name: "TR1 产品需求评审", order: 3, type: "GATE", duration_weeks: null, gate_type: "TR", description: "DQA组织评审PRD+典型配置+通用物料" },
  { name: "L3 立项筹备", order: 4, type: "PHASE", duration_weeks: null, description: "PM主导：立项建议书/报告/估算/检查表" },
  { name: "TR2 系统总体方案评审", order: 5, type: "GATE", duration_weeks: null, gate_type: "TR", description: "" },
  { name: "DCP1 立项决策评审", order: 6, type: "GATE", duration_weeks: null, gate_type: "DCP", description: "★ M1出口" },
  // M2 计划阶段
  { name: "L4 概要设计", order: 7, type: "PHASE", duration_weeks: null, description: "架构师主导：方案选择→总体设计→子系统→六性→EarlyBOM+散热仿真+测试配置+发布策略" },
  { name: "TR3 概要设计评审", order: 8, type: "GATE", duration_weeks: null, gate_type: "TR", description: "" },
  { name: "L5 开发计划", order: 9, type: "PHASE", duration_weeks: null, description: "PM主导：项目计划书+物料计划+估算+质量策划+BIOS/BMC版本计划" },
  { name: "MR1 计划评审", order: 10, type: "GATE", duration_weeks: null, gate_type: "MR", description: "★ M2出口" },
  // M3 研发测试阶段
  { name: "L6 详细设计", order: 11, type: "PHASE", duration_weeks: null, description: "多角色并行：板卡(SCH→叠层→Layout→SI→Gerber)+结构+散热+FW+ID+线缆；同步制定Power-On+EVT计划" },
  { name: "TR3A 详细设计评审", order: 12, type: "GATE", duration_weeks: null, gate_type: "TR", description: "" },
  { name: "L7 Power-On", order: 13, type: "PHASE", duration_weeks: 2, description: "HW/DC/BIOS/BMC/CMM/System多专业并行上电验证，启动关键物料到货+BIOS/BMC版本+PortingGuide" },
  { name: "L8 EVT (工程验证)", order: 14, type: "PHASE", duration_weeks: 9, description: "DC(4W)/SI(4-6W)/SIT(前4W重点)/散热(~6W)/可靠性+PA；机构安装评审；软件两周一迭代；TR4原型机评审；B01 G/O" },
  { name: "TR4 原型机技术状态评审", order: 15, type: "GATE", duration_weeks: null, gate_type: "TR", description: "" },
  { name: "MR2 DVT准入评审", order: 16, type: "GATE", duration_weeks: null, gate_type: "MR", di_threshold: 130, description: "EVT→DVT门禁(DI<130)" },
  { name: "L9 DVT (设计验证)", order: 17, type: "PHASE", duration_weeks: 12, description: "全功能测试+SecondSource+线缆开号+机构开模(NCT→报价2-3W→招标→试模→生产)；C01定版；TR4A" },
  { name: "TR4A 工程样机技术状态评审", order: 18, type: "GATE", duration_weeks: null, gate_type: "TR", description: "" },
  { name: "MR3 PVT准入评审", order: 19, type: "GATE", duration_weeks: null, gate_type: "MR", di_threshold: 30, description: "DVT→PVT门禁(DI<30)" },
  // M4 试制阶段
  { name: "L10 首件/批量试制", order: 20, type: "PHASE", duration_weeks: null, description: "11项准备(规格书→料号→BOM→首批采购→生产技术要求→排产→入库)→工艺评审→试制状态检查→首件检验→首件鉴定→批量试制" },
  { name: "L11 PVT (生产验证)", order: 21, type: "PHASE", duration_weeks: 6, description: "SIT+可靠性测试；TR5初始产品技术状态评审" },
  { name: "L12 批量测试", order: 22, type: "PHASE", duration_weeks: null, description: "使用批量试制产线机台批量可靠性测试；软件版本定版" },
  { name: "TR5 初始产品技术状态评审", order: 23, type: "GATE", duration_weeks: null, gate_type: "TR", description: "" },
  { name: "质量评审", order: 24, type: "GATE", duration_weeks: null, gate_type: "MR", di_threshold: 1, description: "NPI准入(DI≈0-1)；DQA主导" },
  // M5 新品导入阶段
  { name: "L13 NPI验收", order: 25, type: "PHASE", duration_weeks: null, description: "NPI工程师验收+资产清算；A/B整机类DQA质量评审→NPI；C类仅质量报告" },
  { name: "结项决策评审", order: 26, type: "GATE", duration_weeks: null, gate_type: "DCP", description: "PMO组织，领导层+品质+产品+采购参加；核对结项检查表" },
  { name: "项目文档归档", order: 27, type: "PHASE", duration_weeks: null, description: "PLM更新+组织过程资产更新" },
]);

const existing = db.prepare("SELECT COUNT(*) as cnt FROM phase_templates WHERE is_preset = 1").get();
if (existing.cnt === 0) {
  db.prepare("INSERT INTO phase_templates (name, is_preset, phases_json) VALUES (?, 1, ?)").run("曙光硬件产品开发标准流程", phases_json);

  const kanban_defaults = [
    { name: "待开始", order: 1, color: "#9E9E9E", is_default: 1 },
    { name: "进行中", order: 2, color: "#1565C0", is_default: 1 },
    { name: "待验证", order: 3, color: "#ED6C02", is_default: 1 },
    { name: "已完成", order: 4, color: "#2E7D32", is_default: 1 },
  ];
  const insertCol = db.prepare("INSERT INTO kanban_columns (name, column_order, color, is_default) VALUES (?, ?, ?, ?)");
  kanban_defaults.forEach(col => insertCol.run(col.name, col.order, col.color, col.is_default));

  db.prepare("INSERT INTO meeting_platform_config (platform, is_active) VALUES ('tencent', 0), ('quanshi', 0)").run();

  console.log("Seed data inserted: 曙光流程模板 + 看板默认列 + 会议平台配置");
}
