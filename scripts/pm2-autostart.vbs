' PM2 开机自启脚本
' 通过 Windows 任务计划程序在用户登录时运行
' 隐藏窗口执行 pm2 resurrect，恢复保存的进程列表
' 使用完整路径，不依赖 PATH 环境变量

Const NODE_EXE = "C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node.exe"
Const PM2_BIN = "C:\Users\chenxu\.workbuddy\binaries\node\versions\22.22.2\node_modules\pm2\bin\pm2"

Set WshShell = CreateObject("WScript.Shell")

' 等待 15 秒让网络/系统就绪
WScript.Sleep 15000

' 隐藏窗口运行 pm2 resurrect（恢复 pm2 save 保存的进程列表）
' 参数 0 = 隐藏窗口, False = 不等待完成
WshShell.Run """" & NODE_EXE & """ """ & PM2_BIN & """ resurrect", 0, False

Set WshShell = Nothing
