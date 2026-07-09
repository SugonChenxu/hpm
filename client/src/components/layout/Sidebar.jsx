import { useNavigate, useLocation } from "react-router-dom";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
} from "@mui/material";
import {
  Dashboard,
  CalendarMonth,
  Checklist,
  Inventory,
  BugReport,
  Group,
  Description,
  Add,
  EventNote,
} from "@mui/icons-material";

const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
  { text: "项目概览", icon: <Dashboard />, path: "/dashboard" },
  { text: "项目计划", icon: <CalendarMonth />, path: "/plans" },
  { text: "待办事项", icon: <Checklist />, path: "/todos" },
  { text: "本周会议", icon: <EventNote />, path: "/week-meetings" },
  { text: "物料管理", icon: <Inventory />, path: "/materials" },
  { text: "故障管理", icon: <BugReport />, path: "/issues" },
  { text: "会议纪要", icon: <Group />, path: "/meetings" },
  { text: "周报记录", icon: <Description />, path: "/reports" },
];

/**
 * Sidebar navigation with 7 items + "New Project" button.
 * Supports permanent (desktop) and temporary (mobile) Drawer variants.
 *
 * Props:
 *   temporaryOpen   — whether the mobile drawer is open
 *   onTemporaryClose — callback to close the mobile drawer
 *   onCreateClick    — callback when "New Project" button is clicked
 */
export default function Sidebar({
  temporaryOpen,
  onTemporaryClose,
  onCreateClick,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // Highlight current route using prefix matching
  const isSelected = (path) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  const handleNavigate = (path) => {
    navigate(path);
    if (onTemporaryClose) onTemporaryClose();
  };

  const handleCreateClick = () => {
    if (onCreateClick) onCreateClick();
    if (onTemporaryClose) onTemporaryClose();
  };

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Navigation items */}
      <List sx={{ pt: 1, flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.path}
            selected={isSelected(item.path)}
            onClick={() => handleNavigate(item.path)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItemButton>
        ))}
      </List>

      {/* Separator + New Project button */}
      <Divider />
      <List>
        <ListItemButton onClick={handleCreateClick}>
          <ListItemIcon>
            <Add />
          </ListItemIcon>
          <ListItemText primary="新建项目" />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <>
      {/* Desktop: permanent drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          display: { xs: "none", sm: "block" },
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            mt: 8,
          },
        }}
        open
      >
        {drawerContent}
      </Drawer>

      {/* Mobile: temporary drawer */}
      <Drawer
        variant="temporary"
        open={temporaryOpen}
        onClose={onTemporaryClose}
        sx={{
          display: { sm: "none" },
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, mt: 8 },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
}
