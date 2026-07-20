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
            {/* ── Brand name ── */}
            <Typography
              variant="h6"
              noWrap
              sx={{ fontWeight: 700, color: "text.primary", letterSpacing: "-0.01em" }}
            >
              硬件项目管理工具
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
