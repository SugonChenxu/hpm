import { createTheme } from "@mui/material";

/**
 * HPM Design System Theme — Dark Tech Purple + Glassmorphism
 *
 * Color palette: deep violet-black backgrounds + violet primary accent.
 * Glassmorphism: semi-transparent surfaces with backdrop-filter blur.
 * Shape: 10px global border radius.
 * Shadows: deep rgba(0,0,0,...) based for dark mode depth.
 *
 * Exported `theme` is consumed by ThemeProvider in main.jsx.
 */
const theme = createTheme({
  palette: {
    mode: "dark",

    // ── Primary — violet-500 (brighter on dark backgrounds) ──
    primary: {
      main: "#8B5CF6",
      light: "#A78BFA",
      dark: "#7C3AED",
      contrastText: "#FFFFFF",
    },

    // ── Secondary — indigo accent ──
    secondary: {
      main: "#6366F1",
      light: "#818CF8",
      dark: "#4F46E5",
      contrastText: "#FFFFFF",
    },

    // ── Semantic colors — vivid on dark ──
    success: {
      main: "#10B981",
      light: "#34D399",
      dark: "#059669",
      contrastText: "#FFFFFF",
    },
    warning: {
      main: "#F59E0B",
      light: "#FBBF24",
      dark: "#D97706",
      contrastText: "#FFFFFF",
    },
    error: {
      main: "#EF4444",
      light: "#F87171",
      dark: "#DC2626",
      contrastText: "#FFFFFF",
    },
    info: {
      main: "#3B82F6",
      light: "#60A5FA",
      dark: "#2563EB",
      contrastText: "#FFFFFF",
    },

    // ── Neutral — purple-tinted dark grey (replaces MUI default grey) ──
    grey: {
      50: "#1A1428",
      100: "#221A33",
      200: "#2A2040",
      300: "#3A2E52",
      400: "#4A3D66",
      500: "#5B4D7A",
      600: "#6B5B8A",
      700: "#7B6B9A",
      800: "#8B7BAA",
      900: "#9B8BBA",
      A100: "#221A33",
      A200: "#2A2040",
      A400: "#4A3D66",
      A700: "#7B6B9A",
    },

    // ── Background & text layers — deep purple-black ──
    background: {
      default: "#0B0815",
      paper: "#15101F",
    },

    text: {
      primary: "#F5F3FF",
      secondary: "#A89BC4",
      disabled: "#6B5B8A",
    },

    divider: "rgba(255,255,255,0.08)",

    // ── Custom action hover — subtle purple tint ──
    action: {
      hover: "rgba(255,255,255,0.05)",
      selected: "rgba(139,92,246,0.12)",
      focus: "rgba(139,92,246,0.12)",
    },
  },

  // ── Typography ──
  typography: {
    fontFamily:
      '"Inter", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    h1: { fontWeight: 700, fontSize: "2.5rem", lineHeight: 1.2, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, fontSize: "2rem", lineHeight: 1.25, letterSpacing: "-0.02em" },
    h3: { fontWeight: 700, fontSize: "1.75rem", lineHeight: 1.3, letterSpacing: "-0.02em" },
    h4: { fontWeight: 700, fontSize: "1.5rem", lineHeight: 1.35, letterSpacing: "-0.01em" },
    h5: { fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.4, letterSpacing: "-0.02em" },
    h6: { fontWeight: 700, fontSize: "1.125rem", lineHeight: 1.4, letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.5 },
    subtitle2: { fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.5 },
    body1: { fontWeight: 400, fontSize: "0.875rem", lineHeight: 1.5 },
    body2: { fontWeight: 400, fontSize: "0.8rem", lineHeight: 1.5 },
    button: { fontWeight: 600, textTransform: "none" },
    caption: { fontWeight: 400, fontSize: "0.75rem", lineHeight: 1.4 },
    overline: {
      fontWeight: 500,
      fontSize: "0.65rem",
      letterSpacing: "0.08em",
      lineHeight: 1.5,
    },
  },

  // ── Shape ──
  shape: {
    borderRadius: 10,
  },

  // ── Deep shadows for dark mode depth ──
  shadows: [
    "none",
    "0 1px 2px rgba(0,0,0,0.3)",
    "0 2px 4px rgba(0,0,0,0.3)",
    "0 4px 8px rgba(0,0,0,0.4)",
    "0 8px 16px rgba(0,0,0,0.4)",
    "0 12px 24px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
    "0 16px 32px rgba(0,0,0,0.5)",
  ],

  // ── Component default overrides — glassmorphism + dark mode ──
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#0B0815",
          scrollbarColor: "#3A2E52 #0B0815",
          "&::-webkit-scrollbar": { width: 8, height: 8 },
          "&::-webkit-scrollbar-track": { background: "#0B0815" },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#3A2E52",
            borderRadius: 4,
            "&:hover": { backgroundColor: "#4A3D66" },
          },
        },
        // Ensure all text uses our palette by default
        "*": {
          scrollbarWidth: "thin",
          scrollbarColor: "#3A2E52 transparent",
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: "rgba(11,8,21,0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "none",
          color: "#F5F3FF",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "rgba(21,16,31,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          boxShadow: "none",
          transition: "all 0.25s cubic-bezier(0.25,1,0.5,1)",
          "&:hover": {
            backgroundColor: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(139,92,246,0.3)",
            transform: "translateY(-2px)",
            boxShadow: "0 8px 24px rgba(139,92,246,0.15)",
          },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(21,16,31,0.6)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
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
          background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
          boxShadow: "0 4px 12px rgba(139,92,246,0.3)",
          "&:hover": {
            background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
            boxShadow: "0 6px 20px rgba(139,92,246,0.4)",
            transform: "translateY(-1px)",
          },
          "&:active": { transform: "translateY(0) scale(0.98)" },
        },
        outlined: {
          borderColor: "rgba(139,92,246,0.3)",
          color: "#A78BFA",
          "&:hover": {
            borderColor: "#8B5CF6",
            backgroundColor: "rgba(139,92,246,0.08)",
          },
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: "2px 8px",
          transition: "all 0.2s cubic-bezier(0.25,1,0.5,1)",
          "&.Mui-selected": {
            backgroundColor: "rgba(139,92,246,0.12)",
            color: "#A78BFA",
            "& .MuiListItemIcon-root": { color: "#A78BFA" },
          },
          "&.Mui-selected:hover": {
            backgroundColor: "rgba(139,92,246,0.18)",
          },
          "&:hover": {
            backgroundColor: "rgba(255,255,255,0.05)",
          },
        },
      },
    },

    MuiTextField: {
      defaultProps: { size: "small" },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: "all 0.2s cubic-bezier(0.25,1,0.5,1)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.1)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(139,92,246,0.4)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#8B5CF6",
            borderWidth: 2,
          },
          "&.Mui-focused": {
            boxShadow: "0 0 0 4px rgba(139,92,246,0.1)",
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

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: "rgba(21,16,31,0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: "1.125rem" },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "rgba(21,16,31,0.9)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.08)",
          fontSize: "0.75rem",
          borderRadius: 6,
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "rgba(21,16,31,0.9)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.08)",
        },
      },
    },

    MuiSnackbar: {
      styleOverrides: {
        root: { zIndex: 1400 },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: "rgba(255,255,255,0.06)",
        },
        head: {
          backgroundColor: "rgba(255,255,255,0.03)",
          color: "#F5F3FF",
          fontWeight: 600,
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "all 0.15s cubic-bezier(0.25,1,0.5,1)",
          "&:hover": {
            backgroundColor: "rgba(139,92,246,0.12)",
          },
        },
      },
    },

    MuiCircularProgress: {
      styleOverrides: {
        root: { color: "#8B5CF6" },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-switchBase.Mui-checked": {
            color: "#8B5CF6",
            "& + .MuiSwitch-track": { backgroundColor: "rgba(139,92,246,0.4)" },
          },
        },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: "rgba(255,255,255,0.3)",
          "&.Mui-checked": { color: "#8B5CF6" },
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: "rgba(255,255,255,0.08)" },
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
