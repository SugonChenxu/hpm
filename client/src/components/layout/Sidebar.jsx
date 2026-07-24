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
  SvgIcon,
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
import { useAuth } from "../../context/AuthContext";

const DRAWER_WIDTH = 240;

// 内联用户图标（避免 @mui/icons-material，遵循 Vite 8 兼容约束）
function PeopleIcon(props) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </SvgIcon>
  );
}

// 内联仓库图标（库存管理）
function WarehouseIcon(props) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M22 21V7L12 3 2 7v14h9v-5h2v5h9zM10 9.05l2 .8 2-.8v1.9l-2 .8-2-.8V9.05z" />
    </SvgIcon>
  );
}

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
      { text: "会议计划", icon: <EventNote />, path: "/week-meetings" },
      { text: "会议纪要", icon: <Group />, path: "/meetings" },
    ],
  },
  {
    title: "数据管理",
    items: [
      { text: "物料管理", icon: <Inventory />, path: "/materials" },
      { text: "库存管理", icon: <WarehouseIcon />, path: "/inventory" },
      { text: "故障管理", icon: <BugReport />, path: "/issues" },
      { text: "周报记录", icon: <Description />, path: "/reports" },
      ],
    },
    {
      title: "系统设置",
      items: [
        { text: "用户管理", icon: <PeopleIcon />, path: "/users" },
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
  const { user } = useAuth();
  // 仅 owner / admin 可见「系统设置 → 用户管理」
  const isAdmin = user && (user.role === "owner" || user.role === "admin");

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
        {NAV_GROUPS.map((group) => {
          // 非管理员隐藏「系统设置」整组（含用户管理）
          if (group.title === "系统设置" && !isAdmin) return null;
          return (
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
                        ? "rgba(124,58,237,0.08)"
                        : "transparent",
                      "&:hover": {
                        bgcolor: selected
                          ? "rgba(124,58,237,0.12)"
                          : "#F3F4F6",
                      },
                      "&.Mui-selected": {
                        bgcolor: "rgba(124,58,237,0.08)",
                      },
                      "&.Mui-selected:hover": {
                        bgcolor: "rgba(124,58,237,0.12)",
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
          );
        })}
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
