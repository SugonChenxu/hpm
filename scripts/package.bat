@echo off
setlocal
cd /d "%~dp0\.."
set PKG=forge-package
echo 正在封装 Forge 绿色包到 %PKG% ...

REM 1. 清理旧包
if exist "%PKG%" rmdir /s /q "%PKG%"

REM 2. 目录结构
mkdir "%PKG%\server" "%PKG%\client\dist" "%PKG%\forge-node"

REM 3. 服务端源码 + 依赖（排除 hpm.db 与 pm2 日志，避免带走真实数据）
xcopy /E /I /Q server\src "%PKG%\server\src"
xcopy /E /I /Q server\node_modules "%PKG%\server\node_modules"
copy /Y server\package.json "%PKG%\server\"
if exist server\package-lock.json copy /Y server\package-lock.json "%PKG%\server\"

REM 4. 前端构建产物
xcopy /E /I /Q client\dist "%PKG%\client\dist"

REM 5. 便携 Node 运行时（优先取 WorkBuddy 管理的 Node 22，与 better-sqlite3 编译版本匹配）
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" (
  copy /Y "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" "%PKG%\forge-node\node.exe" >nul
) else (
  echo [警告] 未找到内置 Node 22，请确认 WorkBuddy 已安装 Node 22.22.2，或手动放置 node.exe 到 forge-node\
)
echo 已复制 Node 运行时。

REM 6. 启动 / 运维脚本模板
copy /Y scripts\portable\启动.bat "%PKG%\"
copy /Y scripts\portable\备份.bat "%PKG%\"
copy /Y scripts\portable\开机自启.bat "%PKG%\"
copy /Y scripts\portable\防火墙放行.bat "%PKG%\"
copy /Y scripts\portable\使用说明.txt "%PKG%\"

echo ============ 封装完成 ============
echo 绿色包位置: %CD%\%PKG%
echo 体积（MB）:
powershell -NoProfile -Command "(Get-ChildItem '%PKG%' -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB"
echo.
echo 下一步：将 %PKG% 文件夹压缩发给同事，或双击 启动.bat 自测。
pause
