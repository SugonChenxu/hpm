@echo off
cd /d D:\HPM\client
start /B C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node.exe node_modules\vite\bin\vite.js --host --port 5173 > vite.log 2>&1
echo Frontend starting on http://localhost:5173
