// PM2 进程守护配置 — Forge 开发模式（双进程）
// Vite dev server (5173) 带 HMR 热更新 + Express API (3001)
// 前端 proxy /api → localhost:3001

module.exports = {
  apps: [
    {
      name: "forge-api",
      script: "src/index.js",
      cwd: "D:/HPM/server",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "D:/HPM/server/pm2-error.log",
      out_file: "D:/HPM/server/pm2-out.log",
      merge_logs: true,
      kill_timeout: 5000,
    },
    {
      name: "forge-ui",
      script: "node_modules/.bin/vite",
      cwd: "D:/HPM/client",
      interpreter: "node",
      args: "--host --port 5173",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "development",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "D:/HPM/client/pm2-error.log",
      out_file: "D:/HPM/client/pm2-out.log",
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
