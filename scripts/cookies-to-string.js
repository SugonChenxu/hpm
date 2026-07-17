// 1. 在 OA 页面 DevTools Console 粘贴运行
// 2. 自动从已登录的 cookie 域抓 cookies（document.cookie 拿不到 HttpOnly，仅辅助）
// 3. 真正做法：手动从 DevTools → Network → 选请求 → Cookie 标签 → 复制

console.log("=== 步骤 ===");
console.log("1. 在 Network 标签点任意一个 soa.com.cn 的请求");
console.log("2. 右侧切到「Cookie」标签（你已经在的）");
console.log("3. 在表格内右键 → 复制所有行（如果有）");
console.log("");
console.log("如果没有这个选项，请逐个点击 Value 列单元格，把完整值拼成:");
console.log("aiToken=完整值; ass_secret=完整值; DP_Token=完整值; isg=完整值; JSESSIONID=完整值; tfstk=完整值");
