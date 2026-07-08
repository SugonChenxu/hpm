/**
 * RefreshBar — 顶部操作栏
 *
 * 项目选择下拉 + 手动刷新按钮 + 上次更新时间。
 * Loading 时刷新按钮显示旋转动画。
 */

import { Box, TextField, MenuItem, IconButton, Typography, keyframes } from "@mui/material";

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;
import RefreshIcon from "@mui/icons-material/Refresh";

/**
 * @param {{
 *   projectId: number|string,
 *   projects: Array<{id:*, name:string}>,
 *   lastUpdated: string|null,
 *   loading: boolean,
 *   onRefresh: () => void,
 *   onProjectChange: (projectId: *) => void,
 * }} props
 */
export default function RefreshBar({
  projectId = "",
  projects = [],
  lastUpdated = null,
  loading = false,
  onRefresh,
  onProjectChange,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        mb: 3,
        flexWrap: "wrap",
      }}
    >
      <TextField
        select
        size="small"
        value={projectId}
        onChange={(e) => onProjectChange && onProjectChange(e.target.value)}
        sx={{ minWidth: 220 }}
        SelectProps={{ displayEmpty: true }}
      >
        <MenuItem value="" disabled>
          选择 Mantis 项目
        </MenuItem>
        {projects.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>

      <IconButton
        onClick={onRefresh}
        disabled={loading || !projectId}
        size="small"
        title="手动刷新"
      >
        <RefreshIcon
          sx={{ animation: loading ? `${spin} 1s linear infinite` : "none" }}
        />
      </IconButton>

      {lastUpdated && (
        <Typography variant="body2" color="text.secondary">
          上次更新: {lastUpdated}
        </Typography>
      )}
    </Box>
  );
}
