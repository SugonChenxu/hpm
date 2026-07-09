// PM2 进程守护配置 — HPM 全栈应用
// 特性：崩溃自动重启、内存超限重启、系统启动自动拉起

module.exports = {
  apps: [
    {
      name: "hpm-server",
      script: "src/index.js",
      cwd: "D:/HPM/server",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "D:/HPM/server/pm2-error.log",
      out_file: "D:/HPM/server/pm2-out.log",
      merge_logs: true,
      kill_timeout: 5000,
    },
    {
      name: "hpm-client",
      script: "node_modules/vite/bin/vite.js",
      cwd: "D:/HPM/client",
      interpreter: "node",
      args: "--host --port 5173 --force",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "D:/HPM/client/pm2-error.log",
      out_file: "D:/HPM/client/pm2-out.log",
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
