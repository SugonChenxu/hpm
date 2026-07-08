#!/bin/bash
# HPM 启动脚本 — 可靠版
# 使用 node 直接调用避免 npx 依赖问题

echo "=== HPM 启动 ==="

# 清理旧进程
taskkill //F //IM node.exe 2>/dev/null
sleep 1

# 后端
cd /d/HPM/server
nohup node src/index.js > /d/HPM/server/server.log 2>&1 &
echo "后端 PID=$! — http://localhost:3001"
sleep 2

# 前端 (直接用 node 调 vite，不用 npx)
cd /d/HPM/client
nohup node node_modules/vite/bin/vite.js --host --port 5173 > /d/HPM/client/vite.log 2>&1 &
echo "前端 PID=$! — http://localhost:5173"
sleep 4

# 验证
echo ""
echo "=== 验证 ==="
curl -s http://localhost:3001/api/health && echo " → 后端 OK"
curl -s -o /dev/null -w "前端 HTTP %{http_code}" http://localhost:5173 && echo " OK"
echo ""
echo "访问: http://localhost:5173"
