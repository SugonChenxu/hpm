import { createTheme } from "@mui/material";

/**
 * HPM Design System Theme — Light Refined Purple
 *
 * Color palette: clean light backgrounds + violet-600 primary accent.
 * Shape: 10px global border radius.
 * Shadows: soft rgba(30,27,46,...) based for light mode depth.
 *
 * Exported `theme` is consumed by ThemeProvider in main.jsx.
 */
const theme = createTheme({
  palette: {
    mode: "light",

    // ── Primary — violet-600 ──
    primary: {
      main: "#7C3AED",
      light: "#8B5CF6",
      dark: "#6D28D9",
      contrastText: "#FFFFFF",
    },

    // ── Secondary — indigo accent ──
    secondary: {
      main: "#6366F1",
    },

    // ── Background & text layers ──
    background: {
      default: "#F9FAFB",
      paper: "#FFFFFF",
    },

    text: {
      primary: "#1E1B2E",
      secondary: "#6B7280",
      disabled: "#9CA3AF",
    },

    divider: "#E5E7EB",

    // ── Semantic colors ──
    success: {
      main: "#059669",
      contrastText: "#FFFFFF",
    },
    warning: {
      main: "#D97706",
      contrastText: "#FFFFFF",
    },
    error: {
      main: "#DC2626",
      contrastText: "#FFFFFF",
    },
    info: {
      main: "#2563EB",
      contrastText: "#FFFFFF",
    },

    // ── Neutral grey scale ──
    grey: {
      50: "#F9FAFB",
      100: "#F3F4F6",
      200: "#E5E7EB",
      300: "#D1D5DB",
      400: "#9CA3AF",
      500: "#6B7280",
      600: "#4B5563",
      700: "#374151",
      800: "#1F2937",
      900: "#111827",
    },
  },

  // ── Typography ──
  typography: {
    fontFamily: '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif',
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },

  // ── Shape ──
  shape: {
    borderRadius: 10,
  },

  // ── Soft shadows for light mode ──
  shadows: [
    "none",
    "0 1px 2px rgba(30,27,46,0.04)",
    "0 1px 3px rgba(30,27,46,0.06),0 1px 2px rgba(30,27,46,0.04)",
    "0 4px 6px -1px rgba(30,27,46,0.06),0 2px 4px -2px rgba(30,27,46,0.04)",
    "0 10px 15px -3px rgba(30,27,46,0.06),0 4px 6px -4px rgba(30,27,46,0.04)",
    "0 20px 25px -5px rgba(30,27,46,0.08),0 8px 10px -6px rgba(30,27,46,0.04)",
    ...Array(19).fill("0 25px 50px -12px rgba(30,27,46,0.1)"),
  ],

  // ── Component default overrides — clean light surfaces ──
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          color: "#1E1B2E",
          boxShadow: "0 1px 3px rgba(30,27,46,0.06)",
          borderBottom: "1px solid #E5E7EB",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#FFFFFF",
          borderRight: "1px solid #E5E7EB",
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0 1px 2px rgba(30,27,46,0.04)",
          transition: "all 0.2s cubic-bezier(0.25,1,0.5,1)",
          "&:hover": {
            boxShadow:
              "0 4px 6px -1px rgba(30,27,46,0.06),0 2px 4px -2px rgba(30,27,46,0.04)",
            borderColor: "#D1D5DB",
          },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          borderRadius: 12,
          backgroundImage: "none",
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 600,
          transition: "all 0.15s cubic-bezier(0.25,1,0.5,1)",
        },
        containedPrimary: {
          background: "#7C3AED",
          boxShadow: "0 1px 3px rgba(124,58,237,0.3)",
          "&:hover": {
            background: "#6D28D9",
            boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
          },
          "&:active": { transform: "scale(0.98)" },
        },
        outlined: {
          borderColor: "#D1D5DB",
          color: "#374151",
          "&:hover": {
            borderColor: "#7C3AED",
            backgroundColor: "rgba(124,58,237,0.04)",
            color: "#7C3AED",
          },
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: "2px 8px",
          transition: "all 0.15s cubic-bezier(0.25,1,0.5,1)",
          "&.Mui-selected": {
            backgroundColor: "rgba(124,58,237,0.08)",
            color: "#7C3AED",
            "& .MuiListItemIcon-root": { color: "#7C3AED" },
          },
          "&.Mui-selected:hover": {
            backgroundColor: "rgba(124,58,237,0.12)",
          },
          "&:hover": {
            backgroundColor: "#F3F4F6",
          },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          transition: "all 0.15s cubic-bezier(0.25,1,0.5,1)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#E5E7EB",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#D1D5DB",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#7C3AED",
            borderWidth: 2,
          },
          "&.Mui-focused": {
            boxShadow: "0 0 0 3px rgba(124,58,237,0.08)",
          },
        },
      },
    },

    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#D1D5DB #F9FAFB",
          "&::-webkit-scrollbar": { width: 8 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: "#D1D5DB",
            borderRadius: 4,
            "&:hover": { background: "#9CA3AF" },
          },
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid #F3F4F6",
        },
        head: {
          fontWeight: 600,
          color: "#6B7280",
          backgroundColor: "#F9FAFB",
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 0.15s",
          "&:hover": {
            backgroundColor: "#F9FAFB",
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1E1B2E",
          fontSize: "0.75rem",
          borderRadius: 6,
        },
      },
    },

    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: "#7C3AED",
        },
      },
    },

    MuiTextField: {
      defaultProps: { size: "small" },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: "#D1D5DB",
          "&.Mui-checked": { color: "#7C3AED" },
        },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-switchBase.Mui-checked": {
            color: "#7C3AED",
            "& + .MuiSwitch-track": {
              backgroundColor: "rgba(124,58,237,0.4)",
            },
          },
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: "#E5E7EB" },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "all 0.15s cubic-bezier(0.25,1,0.5,1)",
          "&:hover": {
            backgroundColor: "rgba(124,58,237,0.08)",
          },
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: "1px solid #E5E7EB",
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

// ── Custom shape radius tokens (supplements MUI shape) ──
theme.shape.borderRadiusSm = 6;
theme.shape.borderRadiusMd = 8;
theme.shape.borderRadiusLg = 12;
theme.shape.borderRadiusXl = 16;

export default theme;
