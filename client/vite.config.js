import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Vite 8 + @mui/x-date-pickers v7 子路径目录导入兼容修复
// 子路径目录（如 /AdapterDayjs）在 Vite 8 无 exports 字段时 ESM 解析异常 → object
// resolve.alias 强制映射到具体 .js 文件，绕过 directory→package.json→module 解析链
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mui/x-date-pickers/LocalizationProvider": path.resolve(
        "node_modules/@mui/x-date-pickers/LocalizationProvider/LocalizationProvider.js"
      ),
      "@mui/x-date-pickers/AdapterDayjs": path.resolve(
        "node_modules/@mui/x-date-pickers/AdapterDayjs/AdapterDayjs.js"
      ),
      "@mui/x-date-pickers/DatePicker": path.resolve(
        "node_modules/@mui/x-date-pickers/DatePicker/DatePicker.js"
      ),
    },
  },
});
