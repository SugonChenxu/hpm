@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3000
set NODE_ENV=production
echo ============================================
echo   Forge 硬件项目管理工具
echo ============================================
echo 本机访问:  http://localhost:%PORT%
echo --------------------------------------------
"%~dp0forge-node\node.exe" -e "const ni=require('os').networkInterfaces();const ips=Object.values(ni).flat().filter(i=>i.family==='IPv4'&&!i.internal).map(i=>i.address);console.log(ips.length?('  局域网地址: '+ips.join('  /  ')):'  (未检测到局域网IP)')"
echo --------------------------------------------
echo 正在启动服务... (Ctrl+C 退出)
echo ============================================
"%~dp0forge-node\node.exe" "%~dp0server\src\index.js"
