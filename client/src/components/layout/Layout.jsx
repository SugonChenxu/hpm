import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, AppBar, Toolbar, Typography, IconButton, Divider } from "@mui/material";
import { Dashboard, Add, Assessment, Menu as MenuIcon } from "@mui/icons-material";
import { useState } from "react";

const DRAWER_WIDTH = 220;

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { text: "仪表盘", icon: <Dashboard />, path: "/" },
    { text: "新建项目", icon: <Add />, path: "/projects/new" },
  ];

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setOpen(!open)} sx={{ mr: 2, display: { sm: "none" } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1, fontWeight: 700 }}>
            HPM
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            硬件项目管理
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          display: { xs: "none", sm: "block" },
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", mt: 8 },
        }}
        open
      >
        <List sx={{ pt: 1 }}>
          {menuItems.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname === item.path}
              onClick={() => { navigate(item.path); setOpen(false); }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Drawer variant="temporary" open={open} onClose={() => setOpen(false)} sx={{ display: { sm: "none" }, "& .MuiDrawer-paper": { width: DRAWER_WIDTH, mt: 8 } }}>
        <List sx={{ pt: 1 }}>
          {menuItems.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname === item.path}
              onClick={() => { navigate(item.path); setOpen(false); }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, mt: 8, p: 3, maxWidth: 1400, mx: "auto" }}>
        <Outlet />
      </Box>
    </Box>
  );
}
