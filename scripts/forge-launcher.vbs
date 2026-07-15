' =============================================
' Forge 静默启动器（无命令行窗口）
' 功能：启动 PM2 服务 → 等待就绪 → 打开浏览器
' 用法：双击此文件，或创建桌面快捷方式指向它
' =============================================
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 切换到项目根目录
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
projectDir = FSO.GetParentFolderName(scriptDir)
WshShell.CurrentDirectory = projectDir

' Node 路径
nodePath = "C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node.exe"
pm2Path  = "C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node_modules\pm2\bin\pm2"

' 1. 检查 PM2 进程是否已在运行，不在则启动
WshShell.Run """" & nodePath & """ """ & pm2Path & """ resurrect", 0, False
WScript.Sleep 2000

' 2. 再次检查——如果 resurrect 没恢复（第一次用），则 start
WshShell.Run """" & nodePath & """ """ & pm2Path & """ start " & projectDir & "\ecosystem.config.js", 0, False
WScript.Sleep 3000

' 3. 保存进程列表（确保开机自启）
WshShell.Run """" & nodePath & """ """ & pm2Path & """ save", 0, False
WScript.Sleep 500

' 4. 打开浏览器
WshShell.Run "http://localhost:3000"
