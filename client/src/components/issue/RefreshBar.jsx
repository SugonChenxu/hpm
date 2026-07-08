import { Box, TextField, MenuItem, IconButton, Typography } from "@mui/material";

function RefreshIcon() {
  return <span style={{ fontSize: 20, lineHeight: 1 }}>⟳</span>;
}

export default function RefreshBar({ projectId = "", projects = [], lastUpdated = null, loading = false, onRefresh, onProjectChange }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3, flexWrap: "wrap" }}>
      <TextField select size="small" value={projectId}
        onChange={(e) => onProjectChange && onProjectChange(e.target.value)}
        sx={{ minWidth: 220 }} SelectProps={{ displayEmpty: true }}>
        <MenuItem value="" disabled>选择 Mantis 项目</MenuItem>
        {projects.map((p) => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
      </TextField>
      <IconButton onClick={onRefresh} disabled={loading || !projectId} size="small" title="手动刷新">
        <RefreshIcon />
      </IconButton>
      {lastUpdated && <Typography variant="body2" color="text.secondary">上次更新: {lastUpdated}</Typography>}
    </Box>
  );
}
