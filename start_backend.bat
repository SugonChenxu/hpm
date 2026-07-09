@echo off
cd /d D:\HPM\server
start /B node src\index.js > server.log 2>&1
echo Backend started — http://localhost:3001
pause
