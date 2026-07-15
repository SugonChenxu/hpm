@echo off
REM =============================================
REM Forge 数据库备份脚本
REM 将 server/data/forge.db 复制到 server/data/backups/
REM =============================================

cd /d %~dp0\..

set BACKUP_DIR=server\data\backups
set DB_FILE=server\data\hpm.db

if not exist "%DB_FILE%" (
    echo [错误] 数据库文件不存在: %DB_FILE%
    pause
    exit /b 1
)

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM 生成时间戳文件名 YYYYMMDD-HHMMSS
for /f "tokens=1-6 delims=/: " %%a in ("%date% %time%") do (
    set TS=%%a%%b%%c-%%d%%e%%f
)
set TS=%TS: =0%

set BACKUP_FILE=%BACKUP_DIR%\hpm-%TS%.db

echo 正在备份: %DB_FILE% -^> %BACKUP_FILE%
copy /y "%DB_FILE%" "%BACKUP_FILE%" >nul

if %ERRORLEVEL% EQU 0 (
    echo [完成] 备份成功: %BACKUP_FILE%
) else (
    echo [错误] 备份失败
    pause
    exit /b 1
)

REM 保留最近 10 份
echo 清理旧备份（保留最近 10 份）...
for /f "skip=10 delims=" %%f in ('dir /b /o-d "%BACKUP_DIR%\hpm-*.db" 2^>nul') do (
    echo   删除: %%f
    del /q "%BACKUP_DIR%\%%f"
)

echo.
echo 当前备份列表:
dir /b /o-d "%BACKUP_DIR%\hpm-*.db" 2>nul

pause
