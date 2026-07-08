#!/bin/bash
# HPM 启动脚本 — 使用 nohup 确保进程不被终端关闭影响
# 用法: bash start.sh

echo "=== HPM 启动 ==="

# 清理旧进程
echo "清理端口 5173/5174/3001..."
taskkill //F //IM node.exe 2>/dev/null
sleep 1

# 启动后端
cd /d/HPM/server
rm -f server.log
nohup node src/index.js > server.log 2>&1 &
echo "后端 PID=$! — http://localhost:3001"
sleep 2

# 启动前端
cd /d/HPM/client
rm -f vite.log
nohup npx vite --host --port 5173 > vite.log 2>&1 &
echo "前端 PID=$! — http://localhost:5173"
sleep 3

# 验证
echo ""
echo "=== 验证 ==="
curl -s http://localhost:3001/api/health && echo " → 后端 OK"
curl -s -o /dev/null -w "前端 HTTP %{http_code}" http://localhost:5173 && echo " OK"
echo ""
echo "访问: http://localhost:5173"
