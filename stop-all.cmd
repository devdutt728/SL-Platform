@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOGDIR=%ROOT%\logs"
set "STOP_SIGNAL=%LOGDIR%\stop-live-logs.signal"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
break > "%STOP_SIGNAL%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\tools\stop-platform.ps1" -Root "%ROOT%" -LogDir "%LOGDIR%"

taskkill /F /FI "WINDOWTITLE eq SLP Live Logs*" >nul 2>nul
exit /b 0
