import { Outlet, useSearchParams } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
} from "@mui/material";
import { Menu as MenuIcon } from "@mui/icons-material";
import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import CreateProjectDialog from "../common/CreateProjectDialog";

/**
 * Root layout: AppBar + Sidebar + page content outlet.
 * Manages the CreateProjectDialog and exposes openCreateDialog
 * to child pages via Outlet context.
 */
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Support ?create=true in URL to trigger the dialog
  const createParam = searchParams.get("create") === "true";
  const createDialogOpen = createParam || manualDialogOpen;

  const openCreateDialog = useCallback(() => {
    setManualDialogOpen(true);
  }, []);

  const closeCreateDialog = useCallback(() => {
    setManualDialogOpen(false);
    if (createParam) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("create");
      setSearchParams(newParams, { replace: true });
    }
  }, [createParam, searchParams, setSearchParams]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexGrow: 1 }}>
            {/* ── Forge App Icon (flame-F) ── */}
            <Box
              component="img"
              src="/forge-icon-192.png"
              alt="Forge"
              sx={{
                width: 36,
                height: 36,
                borderRadius: "8px",
                flexShrink: 0,
                objectFit: "cover",
                filter: "drop-shadow(0 2px 4px rgba(255,107,53,0.35))",
              }}
            />
            {/* ── Forge Brand Word (cursive art text) ── */}
            <Typography
              noWrap
              sx={{
                fontFamily: '"Pacifico", cursive',
                fontSize: { xs: "1.3rem", sm: "1.55rem" },
                fontWeight: 400,
                background:
                  "linear-gradient(135deg, #FF4500 0%, #FF8C00 28%, #FFD700 52%, #FF6B35 78%, #DC2626 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.02em",
                lineHeight: 1.25,
                filter: "drop-shadow(0 1px 3px rgba(255,107,53,0.3))",
              }}
            >
              Forge
            </Typography>
            {/* ── Subtitle ── */}
            <Typography
              noWrap
              variant="body2"
              sx={{
                color: "text.secondary",
                ml: 0.4,
                mt: 0.2,
                lineHeight: 1.4,
                display: { xs: "none", sm: "block" },
              }}
            >
              硬件项目管理
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Sidebar
        temporaryOpen={mobileOpen}
        onTemporaryClose={() => setMobileOpen(false)}
        onCreateClick={openCreateDialog}
      />

      <Box
        component="main"
        className="page-enter"
        sx={{ flexGrow: 1, mt: 8, p: { xs: 2, md: 3 }, maxWidth: 1280, mx: "auto" }}
      >
        <Outlet context={{ openCreateDialog }} />
      </Box>

      <CreateProjectDialog
        open={createDialogOpen}
        onClose={closeCreateDialog}
        onCreated={() => {
          // Dialog already refreshed project list; no further action needed
        }}
      />
    </Box>
  );
}
