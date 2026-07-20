@echo off
setlocal
cd /d "%~dp0"
set PORT=3000
if not "%1"=="" set PORT=%1
netsh advfirewall firewall add rule name="Forge (%PORT%)" dir=in action=allow protocol=TCP localport=%PORT% >nul 2>&1 && echo 已放行端口 %PORT% 入站（同事可经局域网访问） || echo 失败：请右键本脚本“以管理员身份运行”后再试
pause
