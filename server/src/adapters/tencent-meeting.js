/**
 * TencentMeetingAdapter — tmeet CLI 封装
 *
 * 通过 child_process.execSync 同步调用 tmeet CLI，
 * 封装 auth / list-ended / record list / smart-minutes 等子命令。
 */

import { execSync } from "child_process";

const TMEET = "C:/Users/chenxu/.workbuddy/binaries/node/cli-connector-packages/tmeet";

/**
 * 执行 tmeet CLI 子命令并返回解析后的 JSON 对象
 * @param {string} args - 子命令及参数（不含 CLI 路径）
 * @returns {object} 解析后的 JSON
 */
function run(args) {
  const cmd = `"${TMEET}" ${args}`;
  try {
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (!stdout.trim()) return {};
    return JSON.parse(stdout);
  } catch (e) {
    // tmeet 有时将 JSON 输出到 stdout 但仍以非零码退出
    if (e.stdout && e.stdout.trim()) {
      try {
        return JSON.parse(e.stdout);
      } catch (_) {
        /* fall through */
      }
    }
    if (e.stderr && e.stderr.trim()) {
      throw new Error(`tmeet CLI 错误 [${args}]: ${e.stderr.trim()}`);
    }
    throw new Error(`tmeet CLI 调用失败 [${args}]: ${e.message}`);
  }
}

/**
 * 校验 ID 参数仅包含字母、数字、下划线和连字符，防止命令注入
 * @param {string} id
 * @param {string} label
 */
function validateId(id, label) {
  if (!id || typeof id !== "string") {
    throw new Error(`${label} 不能为空`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`${label} 包含非法字符: ${id}`);
  }
}

/**
 * 检查 tmeet 登录状态
 * @returns {object} auth status JSON
 */
export function checkAuth() {
  try {
    const cmd = `"${TMEET}" auth status`;
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 1 * 1024 * 1024,
    });
    return stdout.includes("Logged in");
  } catch (e) {
    return false;
  }
}

/**
 * 拉取全量已结束会议列表（自动翻页）
 * @returns {Array<object>} meeting_info_list 中的会议对象数组
 */
export function listEndedMeetings() {
  const all = [];
  let pageToken = "";
  let hasMore = true;
  let page = 0;
  const MAX_PAGES = 20; // 安全上限，防止无限循环

  while (hasMore && page < MAX_PAGES) {
    page++;
    const args = pageToken
      ? `meeting list-ended --compact --page-token "${pageToken}"`
      : "meeting list-ended --compact";
    const result = run(args);
    const data = result && result.data ? result.data : result;

    if (Array.isArray(data.meeting_info_list)) {
      all.push(...data.meeting_info_list);
    }

    hasMore = data.has_more === true && !!data.next_page_token;
    pageToken = hasMore ? data.next_page_token : "";
  }

  console.log(`[tmeet] listEndedMeetings: ${all.length} meetings across ${page} pages`);
  return all;
}

/**
 * 获取指定会议的录制列表
 * @param {string} meetingId - 腾讯会议 ID
 * @returns {Array<object>} record_list
 */
export function getRecordList(meetingId) {
  validateId(meetingId, "meetingId");
  const result = run(`record list --meeting-id ${meetingId} --compact`);
  const data = result && result.data ? result.data : result;
  const records = Array.isArray(data.record_list) ? data.record_list : [];
  console.log(`[tmeet] getRecordList(${meetingId}): ${records.length} recordings`);
  return records;
}

/**
 * 获取 AI 智能纪要
 * @param {string} meetingId - 腾讯会议 ID
 * @param {string} recordFileId - 录制文件 ID
 * @returns {object} 智能纪要原始 JSON
 */
export function getSmartMinutes(meetingId, recordFileId) {
  validateId(meetingId, "meetingId");
  validateId(recordFileId, "recordFileId");
  const result = run(
    `record smart-minutes --meeting-id ${meetingId} --record-file-id ${recordFileId}`
  );
  console.log(`[tmeet] getSmartMinutes(${meetingId}, ${recordFileId}): ok`);
  return result;
}
