import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest 4 + Vite 8：@vitejs/plugin-react 以 automatic JSX 运行时编译所有 .jsx
// （含被导入的 GanttChart/GanttRow 源码），与 vite 生产构建一致。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.{js,jsx}"],
  },
});
