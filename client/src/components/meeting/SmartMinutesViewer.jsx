import { Box, Typography, Skeleton, Alert, Button } from "@mui/material";
import { InfoOutlined, OpenInNew } from "@mui/icons-material";

/**
 * SmartMinutesViewer — AI 智能纪要内容展示组件
 *
 * Props:
 *   loading — 是否加载中
 *   error   — 错误消息字符串（如有）
 *   data    — 纪要数据对象，含 content / summary / action_items_json 字段
 *             为 null 时表示无纪要
 */
export default function SmartMinutesViewer({ loading, error, data }) {
  // ---- Loading state ----
  if (loading) {
    return (
      <Box data-testid="minutes-loading">
        <Skeleton variant="text" width="80%" height={28} />
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="rectangular" width="100%" height={120} sx={{ mt: 2 }} />
      </Box>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 1 }} data-testid="minutes-error">
        加载纪要失败: {error}
      </Alert>
    );
  }

  // ---- Link state (全时会议分享链接) ----
  if (data && data.source === "link" && data.url) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 1.5,
          mt: 1,
          py: 3,
        }}
      >
        <Alert severity="info" sx={{ width: "100%" }}>
          该会议纪要通过全时分享链接查看
        </Alert>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<OpenInNew />}
          href={data.url}
          target="_blank"
          rel="noopener"
        >
          打开全时会议纪要
        </Button>
        <Typography variant="body2" color="text.secondary">
          链接将在新标签页打开，需登录全时账号查看完整内容
        </Typography>
      </Box>
    );
  }

  // ---- Empty state (data is null/undefined = no minutes available) ----
  if (!data) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mt: 2,
          py: 3,
          color: "text.secondary",
        }}
        data-testid="minutes-empty"
      >
        <InfoOutlined fontSize="small" />
        <Typography variant="body2">该会议暂无录制/智能纪要</Typography>
      </Box>
    );
  }

  // ---- Has content ----
  return (
    <Box data-testid="minutes-content">
      {/* 摘要区域 */}
      {data.summary && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            摘要
          </Typography>
          <Typography
            variant="body2"
            whiteSpace="pre-wrap"
            sx={{ color: "text.primary", lineHeight: 1.7 }}
          >
            {data.summary}
          </Typography>
        </Box>
      )}

      {/* 纪要全文 */}
      <Typography
        variant="body2"
        whiteSpace="pre-wrap"
        sx={{ color: "text.primary", lineHeight: 1.8 }}
      >
        {data.content}
      </Typography>

      {/* 待办项（如有） */}
      {data.action_items_json && (() => {
        try {
          const items = typeof data.action_items_json === "string"
            ? JSON.parse(data.action_items_json)
            : data.action_items_json;
          if (Array.isArray(items) && items.length > 0) {
            return (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  待办事项
                </Typography>
                {items.map((item, idx) => (
                  <Typography key={idx} variant="body2" sx={{ ml: 1, lineHeight: 1.7 }}>
                    {idx + 1}. {typeof item === "string" ? item : item.content || item.text || JSON.stringify(item)}
                  </Typography>
                ))}
              </Box>
            );
          }
        } catch (_) { /* ignore parse errors */ }
        return null;
      })()}
    </Box>
  );
}
