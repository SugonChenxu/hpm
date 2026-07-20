import { Outlet, useSearchParams } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Button,
  SvgIcon,
  Avatar,
} from "@mui/material";
import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import CreateProjectDialog from "../common/CreateProjectDialog";
import { useAuth } from "../../context/AuthContext";

// 内联菜单图标（避免 @mui/icons-material）
function MenuIcon(props) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
    </SvgIcon>
  );
}

function LogoutIcon(props) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </SvgIcon>
  );
}

/**
 * Root layout: AppBar + Sidebar + page content outlet.
 * Manages the CreateProjectDialog and exposes openCreateDialog
 * to child pages via Outlet context.
 */
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuth();

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

          {/* 当前用户 + 退出登录 */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            {user && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 0.5 }}>
                <Avatar sx={{ width: 30, height: 30, bgcolor: "primary.main", fontSize: 14 }}>
                  {user.username.slice(0, 1).toUpperCase()}
                </Avatar>
                <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 600, display: { xs: "none", sm: "block" } }}>
                  {user.username}
                </Typography>
              </Box>
            )}
            <Button
              color="inherit"
              size="small"
              onClick={logout}
              startIcon={<LogoutIcon />}
              sx={{ textTransform: "none" }}
            >
              退出
            </Button>
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
