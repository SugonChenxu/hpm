# HPM 项目启动脚本
# 使用 PowerShell Start-Process 真正分离进程，避免被终端关闭影响

Write-Host "=== HPM 启动 ==="

# 清理所有 node 进程
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 启动后端 (Node.js)
Start-Process -NoNewWindow -FilePath "node.exe" -ArgumentList "src/index.js" -WorkingDirectory "D:\HPM\server"
Write-Host "后端启动中... http://localhost:3001"
Start-Sleep -Seconds 3

# 启动前端 (Vite)
Set-Location "D:\HPM\client"
Start-Process -NoNewWindow -FilePath "npx.cmd" -ArgumentList "vite", "--host", "--port", "5173"
Write-Host "前端启动中... http://localhost:5173"
Start-Sleep -Seconds 4

# 验证
Write-Host "`n=== 验证 ==="
try {
  $be = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 3
  Write-Host "后端: $($be.StatusCode) OK"
} catch { Write-Host "后端: 未响应" }

try {
  $fe = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 3
  Write-Host "前端: $($fe.StatusCode) OK"
} catch { Write-Host "前端: 未响应" }

Write-Host "`n访问: http://localhost:5173"
