import { Box, Typography } from "@mui/material";

/**
 * Unified page header with title, subtitle, and action area.
 *
 * Props:
 *   title    — page title string (required)
 *   subtitle — optional description text below the title
 *   children — optional action buttons / controls rendered on the right
 */
export default function PageHeader({ title, subtitle, children }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2,
        mb: 3,
      }}
    >
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {children && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
}
