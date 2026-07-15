// PM2 进程守护配置 — Forge 全栈应用（单进程生产模式）
// 特性：崩溃自动重启、内存超限重启、系统启动自动拉起
// 生产模式下 Express 直接托管前端静态文件，无需 Vite dev server

module.exports = {
  apps: [
    {
      name: "forge",
      script: "src/index.js",
      cwd: "D:/HPM/server",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "D:/HPM/server/pm2-error.log",
      out_file: "D:/HPM/server/pm2-out.log",
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
