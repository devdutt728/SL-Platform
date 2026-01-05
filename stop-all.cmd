@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOGDIR=%ROOT%\logs"
set "PORTS=3000 3001 3002 3003 8001 8002"
set "QUIET="
if /I "%~1"=="/quiet" set "QUIET=1"

if not defined QUIET (
  echo Stopping services...
)

set "ROOT_WQL=%ROOT:\=\\%"
set "MAX_PASSES=3"
set "PASS=1"

:RETRY
call :KillPorts
call :KillRoot
timeout /t 1 /nobreak >nul
call :CheckPorts
if defined PORTS_IN_USE (
  set /a PASS+=1
  if %PASS% LEQ %MAX_PASSES% goto :RETRY
)

if not defined QUIET (
  echo.
  call :PrintPorts
  echo.
  echo Press any key to close.
  pause >nul
)
exit /b

:KillPorts
for %%P in (%PORTS%) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P " ^| findstr /I LISTENING') do (
    call :KillPid %%A
  )
)
exit /b

:KillRoot
for /f "tokens=2 delims==" %%A in ('wmic process where "CommandLine like '%%%ROOT_WQL%%' and Name!='cmd.exe' and Name!='conhost.exe'" get ProcessId /value 2^>nul ^| findstr /I "ProcessId="') do (
  call :KillPid %%A
)
exit /b

:KillPid
set "TARGET_PID=%~1"
if not defined TARGET_PID exit /b
if "%TARGET_PID%"=="0" exit /b
for /f "delims=0123456789" %%X in ("%TARGET_PID%") do exit /b
taskkill /PID %TARGET_PID% /T /F >nul 2>&1
exit /b

:CheckPorts
set "PORTS_IN_USE="
for %%P in (%PORTS%) do (
  for /f "delims=" %%A in ('netstat -ano ^| findstr /R /C:":%%P " ^| findstr /I LISTENING') do (
    set "PORTS_IN_USE=1"
  )
)
exit /b

:PrintPorts
call :CheckPorts
if defined PORTS_IN_USE (
  echo Ports still in use:
  netstat -ano ^| findstr /R /C:":3000 " /C:":3001 " /C:":3002 " /C:":3003 " /C:":8001 " /C:":8002 " ^| findstr /I LISTENING
) else (
  echo All target ports are free.
)
exit /b
