// Forge OA 导入 — Chrome 扩展后台
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["inject.js"],
    });
  } catch (e) {
    // 如果不在 soa.com.cn 域，静默失败
  }
});
