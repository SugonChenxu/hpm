@echo off
setlocal
cd /d "%~dp0"
set "TS=%date:~0,4%%date:~5,2%%date:~6,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TS=%TS: =0%"
if not exist backups mkdir backups
copy /Y "server\hpm.db" "backups\hpm_%TS%.db" >nul && echo 已备份: backups\hpm_%TS%.db
if exist "server\hpm.db-wal" copy /Y "server\hpm.db-wal" "backups\hpm_%TS%.db-wal" >nul
if exist "server\hpm.db-shm" copy /Y "server\hpm.db-shm" "backups\hpm_%TS%.db-shm" >nul
echo 完成。
pause
