import { parseMeetingInvite } from "../client/src/utils/parseMeetingInvite.js";

const base = new Date(2026, 6, 29); // 2026-07-29 周三（测试相对时间基准）

const samples = {
  "腾讯会议全文": `腾讯会议
会议主题：项目周会
会议时间：2026/07/30 15:00-16:00

点击链接入会，或添加至会议列表：
https://meeting.tencent.com/dm/abc123def456
#腾讯会议：123-456-789`,

  "全时会议": `会议主题：曙光硬件评审
会议时间：2026-07-31 14:00 - 15:30 (GMT+08:00)
入会链接：https://globalpage.quanshi.com/meeting/join?id=xyz`,

  "相对-明天下午3点": `明天下午3点 项目评审会，记得准备材料`,

  "中文月日+周四": `7月30日 周四 09:30~11:00 晨会`,

  "下周一下午2-3点": `下周一 下午2:00-3:00 双周复盘`,

  "纯链接(无时间)": `https://meeting.tencent.com/p/1234567890abcdef`,

  "晚上时间": `今晚 20:00-21:00 和供应商对齐 BOM`,
};

for (const [name, text] of Object.entries(samples)) {
  const r = parseMeetingInvite(text, base);
  console.log("\n=== " + name + " ===");
  console.log(JSON.stringify({
    ok: r.ok,
    title: r.title,
    weekday: r.weekday,
    start: r.start_time,
    end: r.end_time,
    url: r.meeting_url,
    warnings: r.warnings,
    error: r.error,
  }, null, 0));
}
