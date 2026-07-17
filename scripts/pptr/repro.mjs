import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const PROJECT_ID = "13"; // S2000，含甘特图节点与物料数据
const ROUTES = [
  "/dashboard",
  "/plans",
  "/todos",
  "/week-meetings",
  "/issues",
  "/materials",
  "/meetings",
  "/reports",
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

for (const route of ROUTES) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + (e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      // 过滤掉网络/资源 404 噪声
      if (/Failed to load resource|net::ERR|404|status of 4|status of 5/i.test(t)) return;
      errors.push("CONSOLE.ERROR: " + t);
    }
  });

  const url = BASE + route + "?projectId=" + PROJECT_ID;
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
  } catch (e) {
    errors.push("GOTO-FAIL: " + e.message);
  }
  // 给 API + 渲染留时间
  await new Promise((r) => setTimeout(r, 2500));

  // 检测白屏：根节点是否还有内容
  const rootHtmlLen = await page.evaluate(() => {
    const el = document.getElementById("root");
    return el ? el.innerHTML.length : -1;
  });

  const isWhite = rootHtmlLen <= 50;
  console.log("========================================");
  console.log(`ROUTE ${route}  rootHtmlLen=${rootHtmlLen}  whiteScreen=${isWhite}`);
  if (errors.length) {
    errors.forEach((e) => console.log("  " + e));
  } else {
    console.log("  (no errors captured)");
  }
  await page.close();
}

await browser.close();
console.log("DONE");
