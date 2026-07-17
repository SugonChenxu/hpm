import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.goto("http://localhost:5173/dashboard", { waitUntil: "networkidle2", timeout: 30000 });
const res = await page.evaluate(async () => {
  const out = {};
  const probe = async (spec) => {
    try {
      const m = await import(spec);
      return Object.fromEntries(
        Object.keys(m)
          .filter((k) => /Provider|Picker|Adapter|Dayjs/i.test(k))
          .map((k) => [k, typeof m[k]])
      );
    } catch (e) {
      return { __err: e.message };
    }
  };
  out.main = await probe("@mui/x-date-pickers");
  out.sub_AdapterDayjs = await probe("@mui/x-date-pickers/AdapterDayjs");
  out.sub_DatePicker = await probe("@mui/x-date-pickers/DatePicker");
  out.sub_LocalizationProvider = await probe("@mui/x-date-pickers/LocalizationProvider");
  return out;
});
console.log(JSON.stringify(res, null, 2));
await browser.close();
