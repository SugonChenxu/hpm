@echo off
REM =============================================
REM Forge 一键编译 + 启动脚本（Windows）
REM 1. 编译前端生产包
REM 2. 停止旧进程
REM 3. 启动单进程 PM2
REM 4. 打开浏览器
REM =============================================

echo === Forge 一键编译启动 ===
echo.

cd /d %~dp0\..

echo [1/4] 编译前端生产包...
cd client
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 前端编译失败，请检查错误信息
    pause
    exit /b 1
)
cd ..

echo.
echo [2/4] 停止旧进程...
call npx pm2 delete forge 2>nul

echo.
echo [3/4] 启动 Forge 服务...
call npx pm2 start ecosystem.config.js
call npx pm2 save

echo.
echo [4/4] 等待服务就绪...
timeout /t 3 /nobreak >nul

echo.
echo =====================================
echo   Forge 启动完成！
echo   浏览器访问: http://localhost:3000
echo =====================================
echo.
echo 管理命令:
echo   pm2 status        查看状态
echo   pm2 logs forge    查看日志
echo   pm2 restart forge 重启服务
echo   pm2 stop forge    停止服务
echo.

start http://localhost:3000
pause
