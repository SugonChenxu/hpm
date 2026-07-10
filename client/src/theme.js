import { createTheme } from "@mui/material";

/**
 * HPM Design System Theme
 *
 * Color palette: deep blue primary + slate neutral tones.
 * Shape: 8px global border radius.
 * Shadows: soft rgba(15,23,42,...) based.
 *
 * Exported `theme` is consumed by ThemeProvider in main.jsx.
 */
const theme = createTheme({
  palette: {
    mode: "light",

    // ── Primary — deep blue ──
    primary: {
      main: "#1E40AF",
      light: "#3B82F6",
      dark: "#1E3A8A",
      contrastText: "#FFFFFF",
    },

    // ── Secondary — indigo accent ──
    secondary: {
      main: "#6366F1",
      light: "#818CF8",
      dark: "#4F46E5",
      contrastText: "#FFFFFF",
    },

    // ── Semantic colors ──
    success: {
      main: "#16A34A",
      light: "#22C55E",
      dark: "#15803D",
      contrastText: "#FFFFFF",
    },
    warning: {
      main: "#D97706",
      light: "#F59E0B",
      dark: "#B45309",
      contrastText: "#FFFFFF",
    },
    error: {
      main: "#DC2626",
      light: "#EF4444",
      dark: "#B91C1C",
      contrastText: "#FFFFFF",
    },
    info: {
      main: "#0EA5E9",
      light: "#38BDF8",
      dark: "#0284C7",
      contrastText: "#FFFFFF",
    },

    // ── Neutral — slate warm-grey (replaces MUI default grey) ──
    grey: {
      50: "#F8FAFC",
      100: "#F1F5F9",
      200: "#E2E8F0",
      300: "#CBD5E1",
      400: "#94A3B8",
      500: "#64748B",
      600: "#475569",
      700: "#334155",
      800: "#1E293B",
      900: "#0F172A",
      A100: "#F1F5F9",
      A200: "#E2E8F0",
      A400: "#94A3B8",
      A700: "#334155",
    },

    // ── Background & text layers ──
    background: {
      default: "#F8FAFC",
      paper: "#FFFFFF",
    },

    text: {
      primary: "#0F172A",
      secondary: "#64748B",
      disabled: "#94A3B8",
    },

    divider: "#E2E8F0",

    // ── Custom action hover ──
    action: {
      hover: "#F1F5F9",
      selected: "rgba(30, 64, 175, 0.08)",
    },
  },

  // ── Typography ──
  typography: {
    fontFamily:
      '"Inter", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    h1: { fontWeight: 700, fontSize: "2.5rem", lineHeight: 1.2 },
    h2: { fontWeight: 700, fontSize: "2rem", lineHeight: 1.25 },
    h3: { fontWeight: 700, fontSize: "1.75rem", lineHeight: 1.3 },
    h4: { fontWeight: 700, fontSize: "1.5rem", lineHeight: 1.35 },
    h5: { fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.4 },
    h6: { fontWeight: 700, fontSize: "1.125rem", lineHeight: 1.4 },
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
    borderRadius: 8,
  },

  // ── Soft shadows (rgba(15,23,42,...) base) ──
  shadows: [
    "none",
    "0 1px 2px 0 rgba(15,23,42,0.04)",
    "0 1px 3px 0 rgba(15,23,42,0.08), 0 1px 2px 0 rgba(15,23,42,0.04)",
    "0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.04)",
    "0 10px 15px -3px rgba(15,23,42,0.08), 0 4px 6px -4px rgba(15,23,42,0.04)",
    "0 12px 20px -4px rgba(15,23,42,0.10), 0 4px 8px -4px rgba(15,23,42,0.04)",
    "0 16px 24px -6px rgba(15,23,42,0.10), 0 6px 10px -6px rgba(15,23,42,0.04)",
    "0 20px 28px -8px rgba(15,23,42,0.12), 0 8px 12px -8px rgba(15,23,42,0.04)",
    "0 24px 32px -8px rgba(15,23,42,0.12), 0 10px 14px -10px rgba(15,23,42,0.04)",
    "0 28px 36px -10px rgba(15,23,42,0.14), 0 12px 16px -12px rgba(15,23,42,0.04)",
    "0 32px 40px -12px rgba(15,23,42,0.14), 0 14px 18px -14px rgba(15,23,42,0.04)",
    "0 36px 44px -14px rgba(15,23,42,0.16), 0 16px 20px -16px rgba(15,23,42,0.04)",
    "0 40px 48px -16px rgba(15,23,42,0.16), 0 18px 24px -18px rgba(15,23,42,0.04)",
    "0 44px 52px -18px rgba(15,23,42,0.18), 0 20px 28px -20px rgba(15,23,42,0.04)",
    "0 48px 56px -20px rgba(15,23,42,0.18), 0 22px 32px -22px rgba(15,23,42,0.04)",
    "0 52px 60px -22px rgba(15,23,42,0.20), 0 24px 36px -24px rgba(15,23,42,0.04)",
    "0 56px 64px -24px rgba(15,23,42,0.20), 0 26px 40px -26px rgba(15,23,42,0.04)",
    "0 60px 68px -26px rgba(15,23,42,0.22), 0 28px 44px -28px rgba(15,23,42,0.04)",
    "0 64px 72px -28px rgba(15,23,42,0.22), 0 30px 48px -30px rgba(15,23,42,0.04)",
    "0 68px 76px -30px rgba(15,23,42,0.24), 0 32px 52px -32px rgba(15,23,42,0.04)",
    "0 72px 80px -32px rgba(15,23,42,0.24), 0 34px 56px -34px rgba(15,23,42,0.04)",
    "0 76px 84px -34px rgba(15,23,42,0.26), 0 36px 60px -36px rgba(15,23,42,0.04)",
    "0 80px 88px -36px rgba(15,23,42,0.26), 0 38px 64px -38px rgba(15,23,42,0.04)",
    "0 84px 92px -38px rgba(15,23,42,0.28), 0 40px 68px -40px rgba(15,23,42,0.04)",
    "0 88px 96px -40px rgba(15,23,42,0.28), 0 42px 72px -42px rgba(15,23,42,0.04)",
  ],

  // ── Component default overrides ──
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#F8FAFC",
          scrollbarColor: "#CBD5E1 #F1F5F9",
          "&::-webkit-scrollbar": { width: 8, height: 8 },
          "&::-webkit-scrollbar-track": { background: "#F1F5F9" },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#CBD5E1",
            borderRadius: 4,
          },
          "&::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "#94A3B8",
          },
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          color: "#0F172A",
          boxShadow:
            "0 1px 3px 0 rgba(15,23,42,0.08), 0 1px 2px 0 rgba(15,23,42,0.04)",
          borderBottom: "1px solid #E2E8F0",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#FFFFFF",
          borderRight: "1px solid #E2E8F0",
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "0 1px 2px 0 rgba(15,23,42,0.04)",
          border: "1px solid #E2E8F0",
          transition:
            "box-shadow 0.2s ease-in-out, transform 0.2s ease-in-out",
          "&:hover": {
            boxShadow:
              "0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.04)",
          },
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },

    MuiTextField: {
      defaultProps: { size: "small" },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#CBD5E1",
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 500 },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: "1.125rem" },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: "background-color 0.15s ease-in-out",
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1E293B",
          fontSize: "0.75rem",
          borderRadius: 6,
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          boxShadow:
            "0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.04)",
          border: "1px solid #E2E8F0",
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
