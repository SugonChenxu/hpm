import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:5173/materials?projectId=13";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();
const logs = [];
page.on("pageerror", (e) => {
  logs.push("=== PAGEERROR ===");
  logs.push("MSG: " + (e.message || e));
  if (e.stack) logs.push("STACK:\n" + e.stack);
  if (e.componentStack) logs.push("COMPONENT_STACK:\n" + e.componentStack);
});
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    logs.push(`[${msg.type()}] ` + msg.text());
  }
});

try {
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
} catch (e) {
  logs.push("GOTO-FAIL: " + e.message);
}
await new Promise((r) => setTimeout(r, 3500));

const rootLen = await page.evaluate(() => {
  const el = document.getElementById("root");
  return el ? el.innerHTML.length : -1;
});
logs.push("rootHtmlLen=" + rootLen);

console.log(logs.join("\n"));
await browser.close();
console.log("DONE");
