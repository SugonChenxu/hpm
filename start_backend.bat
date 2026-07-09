@echo off
cd /d D:\HPM
npx pm2 start ecosystem.config.js
npx pm2 save
echo.
echo HPM 已启动 — http://localhost:5173
echo 状态: npx pm2 status
echo 日志: npx pm2 logs
echo.
npx pm2 status
pause
