@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOGDIR=%ROOT%\logs"
set "STOP_SIGNAL=%LOGDIR%\stop-live-logs.signal"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
break > "%STOP_SIGNAL%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'SilentlyContinue';" ^
  "$root = '%ROOT%';" ^
  "$logDir = '%LOGDIR%';" ^
  "$self = $PID;" ^
  "$parent = (Get-CimInstance Win32_Process -Filter \"ProcessId=$self\").ParentProcessId;" ^
  "$excludeIds = @($self, $parent);" ^
  "$ports = 3000,3001,3002,3003,3004,8001,8002,8003,8004,8005,8010;" ^
  "foreach ($port in $ports) {" ^
  "  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "    $procId = $_.OwningProcess;" ^
  "    if ($procId -and $excludeIds -notcontains $procId) { Stop-Process -Id $procId -Force }" ^
  "  }" ^
  "};" ^
  "$targets = @('cmd.exe','powershell.exe','pwsh.exe','python.exe','pythonw.exe','node.exe','caddy.exe');" ^
  "Get-CimInstance Win32_Process | Where-Object {" ^
  "  $_.CommandLine -and" ^
  "  $targets -contains $_.Name -and" ^
  "  $excludeIds -notcontains $_.ProcessId -and" ^
  "  (" ^
  "    $_.CommandLine -like \"*$root*\" -or" ^
  "    $_.CommandLine -like '*uvicorn*app.main:app*' -or" ^
  "    $_.CommandLine -like '*npm run dev*' -or" ^
  "    $_.CommandLine -like '*npm run start*' -or" ^
  "    $_.CommandLine -like '*caddy.exe run*'" ^
  "  )" ^
  "} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force };" ^
  "$pidsPath = Join-Path $logDir 'pids.json';" ^
  "if (Test-Path $pidsPath) { Remove-Item $pidsPath -Force }"

taskkill /F /FI "WINDOWTITLE eq SLP Live Logs*" >nul 2>nul
exit /b 0
