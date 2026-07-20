@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:APPDATA+'\Microsoft\Windows\Start Menu\Programs\Startup\Forge.lnk');$s.TargetPath='%~dp0启动.bat';$s.WorkingDirectory='%~dp0';$s.Save()"
echo 已添加开机自启（启动文件夹快捷方式）。
echo 如需移除，删除该快捷方式即可：
echo   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Forge.lnk
pause
