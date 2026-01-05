@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOGDIR=%ROOT%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

title SLP Live Logs

set "CURRENT_LOGS=%LOGDIR%\current-logs.cmd"
if exist "%CURRENT_LOGS%" (
  call "%CURRENT_LOGS%"
) else (
  set "IT_BACKEND_LOG=%LOGDIR%\it-backend.log"
  set "IT_BACKEND_ERR_LOG=%LOGDIR%\it-backend.err.log"
  set "REC_BACKEND_LOG=%LOGDIR%\recruitment-backend.log"
  set "REC_BACKEND_ERR_LOG=%LOGDIR%\recruitment-backend.err.log"
  set "IT_FRONTEND_LOG=%LOGDIR%\it-frontend.log"
  set "REC_FRONTEND_LOG=%LOGDIR%\recruitment-frontend.log"
  set "WORKBOOK_LOG=%LOGDIR%\workbook-frontend.log"
  set "CADDY_LOG=%LOGDIR%\caddy.log"
  set "CADDY_ERR_LOG=%LOGDIR%\caddy.err.log"
)

echo Studio Lotus Platform - Live Logs
echo Press Q to exit log monitor.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$files = [ordered]@{" ^
  "  'IT-BACKEND'      = '%IT_BACKEND_LOG%';" ^
  "  'IT-BACKEND-ERR'  = '%IT_BACKEND_ERR_LOG%';" ^
  "  'REC-BACKEND'     = '%REC_BACKEND_LOG%';" ^
  "  'REC-BACKEND-ERR' = '%REC_BACKEND_ERR_LOG%';" ^
  "  'IT-FRONTEND'     = '%IT_FRONTEND_LOG%';" ^
  "  'REC-FRONTEND'    = '%REC_FRONTEND_LOG%';" ^
  "  'WORKBOOK'        = '%WORKBOOK_LOG%';" ^
  "  'CADDY'           = '%CADDY_LOG%';" ^
  "  'CADDY-ERR'       = '%CADDY_ERR_LOG%';" ^
  "};" ^
  "$positions = @{};" ^
  "while ($true) {" ^
  "  Start-Sleep -Milliseconds 500;" ^
  "  if ([Console]::KeyAvailable) {" ^
  "    $key = [Console]::ReadKey($true);" ^
  "    if ($key.Key -eq 'Q') { break }" ^
  "  }" ^
  "  foreach ($name in $files.Keys) {" ^
  "    $path = $files[$name];" ^
  "    if (-not (Test-Path $path)) { continue }" ^
  "    $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite);" ^
  "    try {" ^
  "      if (-not $positions.ContainsKey($path)) { $positions[$path] = 0 }" ^
  "      $fs.Seek($positions[$path], [System.IO.SeekOrigin]::Begin) | Out-Null;" ^
  "      $sr = New-Object System.IO.StreamReader($fs);" ^
  "      while (-not $sr.EndOfStream) {" ^
  "        $line = $sr.ReadLine();" ^
  "        if ($null -ne $line) {" ^
  "          $ts = (Get-Date).ToString('HH:mm:ss');" ^
  "          Write-Host \"[$ts][$name] $line\";" ^
  "        }" ^
  "      }" ^
  "      $positions[$path] = $fs.Position;" ^
  "    } finally {" ^
  "      $fs.Dispose();" ^
  "    }" ^
  "  }" ^
  "}"

echo.
echo Closing log monitor. Press any key to exit.
pause >nul
