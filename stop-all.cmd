@echo off
set "ROOT=D:\SL Platform"
set "LOGDIR=%ROOT%\logs"

powershell -NoProfile -Command "& { $ErrorActionPreference = 'Continue'; $ports = 3000,3001,3002,3003,8001,8002; foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { $procId = $_.OwningProcess; if ($procId) { try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {} } } }; $root = '%ROOT%'; $candidates = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like '*D:\\SL Platform*' }; foreach ($c in $candidates) { try { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }; $pidsPath = Join-Path '%LOGDIR%' 'pids.json'; if (Test-Path $pidsPath) { Remove-Item $pidsPath -Force } }"

taskkill /F /FI "WINDOWTITLE eq SLP Live Logs*" >nul 2>nul
