import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Vite 8 / rolldown 不兼容 @mui/x-date-pickers v7 子路径目录导入（目录→package.json→module 解析失败→object）
// 通配 alias 将 @mui/x-date-pickers/XXX 映射到 node_modules/.../XXX/XXX.js 解决
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@mui\/x-date-pickers\/(.+)$/,
        replacement: path.resolve("node_modules/@mui/x-date-pickers/$1/$1.js"),
      },
    ],
  },
  optimizeDeps: {
    include: ["@mui/x-date-pickers"],
  },
});
