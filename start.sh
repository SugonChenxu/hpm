#!/bin/bash
# Forge 启动脚本 — PM2 进程守护版
# 开发模式: bash start.sh dev    → Vite(5173)+API(3001)，热更新
# 生产模式: bash start.sh start  → 单进程 Forge(3000)，稳定运行
#
# 开机自启: 注册表 HKCU\Run → pm2-resurrect.bat → pm2 resurrect

echo "=== Forge PM2 管理 ==="

cd /d/HPM

case "${1:-start}" in
  dev)
    echo "启动 开发模式（Vite HMR + API）..."
    npx pm2 delete forge 2>/dev/null
    npx pm2 start ecosystem.dev.config.js
    npx pm2 save
    echo ""
    npx pm2 status
    echo ""
    echo "前端: http://localhost:5173  ← 改代码自动热更新"
    echo " API: http://localhost:3001"
    ;;
  start|prod)
    echo "启动 生产模式（单进程 3000）..."
    npx pm2 delete forge-api forge-ui 2>/dev/null
    npx pm2 start ecosystem.config.js
    npx pm2 save
    echo ""
    npx pm2 status
    echo ""
    echo "访问: http://localhost:3000"
    ;;
  stop)
    echo "停止所有 Forge 服务..."
    npx pm2 delete forge forge-api forge-ui 2>/dev/null
    ;;
  restart)
    echo "重启 Forge 服务..."
    npx pm2 restart all
    echo ""
    npx pm2 status
    ;;
  status)
    npx pm2 status
    ;;
  logs)
    npx pm2 logs
    ;;
  build)
    echo "编译 + 切换生产模式..."
    cd client && npm run build && cd ..
    npx pm2 delete forge forge-api forge-ui 2>/dev/null
    npx pm2 start ecosystem.config.js
    npx pm2 save
    echo ""
    echo "完成！访问: http://localhost:3000"
    ;;
  *)
    echo "用法: bash start.sh [dev|start|stop|restart|status|logs|build]"
    echo ""
    echo "  dev    开发模式 — Vite 热更新 5173 + API 3001"
    echo "  start  生产模式 — 单进程 3000（默认）"
    echo "  build  编译前端 + 切生产模式"
    echo "  stop   停止所有服务"
    echo "  restart 重启当前服务"
    ;;  
esac
