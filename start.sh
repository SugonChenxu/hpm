#!/bin/bash
# HPM 启动脚本 — PM2 进程守护版
# 进程崩溃自动重启、重启后状态恢复、脱离终端独立运行
# 开机自启：已通过注册表 HKCU\Run + pm2-resurrect.bat 配置

echo "=== HPM PM2 管理 ==="

cd /d/HPM

case "${1:-start}" in
  start)
    echo "启动 HPM 全栈服务..."
    npx pm2 start ecosystem.config.js
    npx pm2 save
    echo ""
    npx pm2 status
    echo ""
    echo "访问: http://localhost:5173"
    echo "状态: npx pm2 status"
    echo "日志: npx pm2 logs"
    echo ""
    echo "开机自启: 已配置（注册表 HKCU\\Run → pm2-resurrect.bat → pm2 resurrect）"
    ;;
  stop)
    echo "停止 HPM 服务..."
    npx pm2 stop ecosystem.config.js
    ;;
  restart)
    echo "重启 HPM 服务..."
    npx pm2 restart ecosystem.config.js
    echo ""
    npx pm2 status
    ;;
  status)
    npx pm2 status
    ;;
  logs)
    npx pm2 logs
    ;;
  *)
    echo "用法: bash start.sh [start|stop|restart|status|logs]"
    echo "默认: start"
    ;;
esac
