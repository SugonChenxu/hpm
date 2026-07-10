import { useNavigate, useLocation } from "react-router-dom";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Button,
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

const DRAWER_WIDTH = 240;

/**
 * Navigation items grouped into three sections for visual hierarchy.
 * Each group has a label and a list of route items.
 */
const NAV_GROUPS = [
  {
    title: "项目管理",
    items: [
      { text: "项目概览", icon: <Dashboard />, path: "/dashboard" },
      { text: "项目计划", icon: <CalendarMonth />, path: "/plans" },
      { text: "待办事项", icon: <Checklist />, path: "/todos" },
    ],
  },
  {
    title: "协作沟通",
    items: [
      { text: "本周会议", icon: <EventNote />, path: "/week-meetings" },
      { text: "会议纪要", icon: <Group />, path: "/meetings" },
    ],
  },
  {
    title: "数据管理",
    items: [
      { text: "物料管理", icon: <Inventory />, path: "/materials" },
      { text: "故障管理", icon: <BugReport />, path: "/issues" },
      { text: "周报记录", icon: <Description />, path: "/reports" },
    ],
  },
];

/**
 * Sidebar navigation with grouped items + "New Project" button.
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
      {/* Grouped navigation items */}
      <Box sx={{ flexGrow: 1, overflowY: "auto", py: 1 }}>
        {NAV_GROUPS.map((group) => (
          <Box key={group.title}>
            {/* Group header */}
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{
                display: "block",
                px: 2.5,
                pt: 2,
                pb: 0.5,
                fontSize: "0.65rem",
                letterSpacing: "0.08em",
                fontWeight: 500,
              }}
            >
              {group.title}
            </Typography>
            <List sx={{ py: 0 }}>
              {group.items.map((item) => {
                const selected = isSelected(item.path);
                return (
                  <ListItemButton
                    key={item.path}
                    selected={selected}
                    onClick={() => handleNavigate(item.path)}
                    sx={{
                      mx: 1,
                      my: 0.25,
                      borderRadius: 1,
                      py: 0.75,
                      // 3px left accent bar — always rendered to avoid layout shift
                      borderLeft: "3px solid",
                      borderColor: selected ? "primary.main" : "transparent",
                      bgcolor: selected
                        ? "rgba(139,92,246,0.12)"
                        : "transparent",
                      "&:hover": {
                        bgcolor: selected
                          ? "rgba(139,92,246,0.12)"
                          : "rgba(255,255,255,0.05)",
                      },
                      "&.Mui-selected": {
                        bgcolor: "rgba(139,92,246,0.12)",
                      },
                      "&.Mui-selected:hover": {
                        bgcolor: "rgba(139,92,246,0.18)",
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: selected ? "primary.main" : "text.secondary",
                        minWidth: 36,
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontWeight: selected ? 600 : 500,
                        fontSize: "0.875rem",
                        color: selected ? "primary.main" : "text.primary",
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* Bottom "New Project" button */}
      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={<Add />}
          onClick={handleCreateClick}
          sx={{ justifyContent: "flex-start" }}
        >
          新建项目
        </Button>
      </Box>
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
