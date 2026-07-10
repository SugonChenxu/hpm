import { Box, CircularProgress } from "@mui/material";

/**
 * Centered loading spinner for page-level loading states.
 */
export default function PageLoading() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        py: 8,
      }}
    >
      <CircularProgress size={40} />
    </Box>
  );
}
