@echo off
REM HPM PM2 开机自启脚本
REM 由注册表 HKCU\Run 触发，登录后延迟 15 秒执行 pm2 resurrect

REM 等待 15 秒让网络/系统就绪
timeout /t 15 /nobreak >nul

REM 用完整路径执行 pm2 resurrect，不依赖 PATH
"C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node.exe" "C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node_modules\pm2\bin\pm2" resurrect
