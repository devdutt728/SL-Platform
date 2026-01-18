@echo off
set "ROOT=D:\SL Platform"
set "LOGDIR=%ROOT%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
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

title SLP Live Logs

powershell -NoExit -Command "& { $streams = @(@{Name='IT-BACKEND';File='%IT_BACKEND_LOG%';Color='Cyan'},@{Name='IT-BACKEND-ERR';File='%IT_BACKEND_ERR_LOG%';Color='Red'},@{Name='REC-BACKEND';File='%REC_BACKEND_LOG%';Color='Magenta'},@{Name='REC-BACKEND-ERR';File='%REC_BACKEND_ERR_LOG%';Color='Red'},@{Name='IT-FRONTEND';File='%IT_FRONTEND_LOG%';Color='Green'},@{Name='REC-FRONTEND';File='%REC_FRONTEND_LOG%';Color='Green'},@{Name='WORKBOOK';File='%WORKBOOK_LOG%';Color='Yellow'},@{Name='CADDY';File='%CADDY_LOG%';Color='Blue'},@{Name='CADDY-ERR';File='%CADDY_ERR_LOG%';Color='Red'}); foreach ($s in $streams) { if (-not (Test-Path $s.File)) { New-Item -ItemType File -Force -Path $s.File | Out-Null } }; Write-Host 'Studio Lotus Platform - Live Logs' -ForegroundColor White; Write-Host 'Press Ctrl+C to close.' -ForegroundColor DarkGray; $readers = @(); foreach ($s in $streams) { $fs = [System.IO.File]::Open($s.File, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); $sr = New-Object System.IO.StreamReader($fs); $sr.BaseStream.Seek(0, [System.IO.SeekOrigin]::End) | Out-Null; $readers += @{ Stream = $s; Reader = $sr } }; while ($true) { foreach ($entry in $readers) { $stream = $entry.Stream; $reader = $entry.Reader; while (-not $reader.EndOfStream) { $line = $reader.ReadLine(); if ($null -ne $line) { $ts = (Get-Date).ToString('HH:mm:ss'); Write-Host \"[$ts][$($stream.Name)] $line\" -ForegroundColor $stream.Color } } }; Start-Sleep -Milliseconds 250 } }"
