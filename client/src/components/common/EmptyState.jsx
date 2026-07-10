import { Box, Typography } from "@mui/material";
import { InboxOutlined } from "@mui/icons-material";

/**
 * Empty state placeholder with icon and message.
 *
 * Props:
 *   message — text to display (default: "暂无数据")
 */
export default function EmptyState({ message = "暂无数据" }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 6,
        color: "text.disabled",
      }}
    >
      <InboxOutlined sx={{ fontSize: 48, mb: 1 }} />
      <Typography variant="body2">{message}</Typography>
    </Box>
  );
}
