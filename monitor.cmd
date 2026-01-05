@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOGDIR=%ROOT%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

title SLP Live Logs

set "IT_BACKEND_LOG=%LOGDIR%\it-backend.log"
set "IT_BACKEND_ERR_LOG=%LOGDIR%\it-backend.err.log"
set "REC_BACKEND_LOG=%LOGDIR%\recruitment-backend.log"
set "REC_BACKEND_ERR_LOG=%LOGDIR%\recruitment-backend.err.log"
set "IT_FRONTEND_LOG=%LOGDIR%\it-frontend.log"
set "REC_FRONTEND_LOG=%LOGDIR%\recruitment-frontend.log"
set "WORKBOOK_LOG=%LOGDIR%\workbook-frontend.log"
set "CADDY_LOG=%LOGDIR%\caddy.log"
set "CADDY_ERR_LOG=%LOGDIR%\caddy.err.log"

for %%F in (
  "%IT_BACKEND_LOG%"
  "%IT_BACKEND_ERR_LOG%"
  "%REC_BACKEND_LOG%"
  "%REC_BACKEND_ERR_LOG%"
  "%IT_FRONTEND_LOG%"
  "%REC_FRONTEND_LOG%"
  "%WORKBOOK_LOG%"
  "%CADDY_LOG%"
  "%CADDY_ERR_LOG%"
) do (
  if not exist "%%~fF" type nul > "%%~fF"
)

set "IT_BACKEND_LAST=0"
set "IT_BACKEND_ERR_LAST=0"
set "REC_BACKEND_LAST=0"
set "REC_BACKEND_ERR_LAST=0"
set "IT_FRONTEND_LAST=0"
set "REC_FRONTEND_LAST=0"
set "WORKBOOK_LAST=0"
set "CADDY_LAST=0"
set "CADDY_ERR_LAST=0"

echo Studio Lotus Platform - Live Logs
echo Press any key to close.

set /a WARMUP=2

:loop
timeout /t 1 >nul
if %WARMUP% GTR 0 (
  set /a WARMUP-=1
) else (
  if errorlevel 1 goto :done
)

call :TailFile "%IT_BACKEND_LOG%" "IT-BACKEND" IT_BACKEND_LAST
call :TailFile "%IT_BACKEND_ERR_LOG%" "IT-BACKEND-ERR" IT_BACKEND_ERR_LAST
call :TailFile "%REC_BACKEND_LOG%" "REC-BACKEND" REC_BACKEND_LAST
call :TailFile "%REC_BACKEND_ERR_LOG%" "REC-BACKEND-ERR" REC_BACKEND_ERR_LAST
call :TailFile "%IT_FRONTEND_LOG%" "IT-FRONTEND" IT_FRONTEND_LAST
call :TailFile "%REC_FRONTEND_LOG%" "REC-FRONTEND" REC_FRONTEND_LAST
call :TailFile "%WORKBOOK_LOG%" "WORKBOOK" WORKBOOK_LAST
call :TailFile "%CADDY_LOG%" "CADDY" CADDY_LAST
call :TailFile "%CADDY_ERR_LOG%" "CADDY-ERR" CADDY_ERR_LAST
goto :loop

:TailFile
set "file=%~1"
set "name=%~2"
set "lastVar=%~3"
call set "lastVal=%%%lastVar%%%"
if "%lastVal%"=="" set "lastVal=0"
set "newLast=%lastVal%"
for /f "usebackq tokens=1* delims=:" %%A in (`findstr /n "^" "%file%"`) do (
  if %%A GTR %lastVal% (
    set "newLast=%%A"
    call set "ts=%%time:~0,8%%"
    echo [%ts%][%name%] %%B
  )
)
set "%lastVar%=%newLast%"
exit /b

:done
echo.
echo Closing log monitor. Press any key to close.
pause >nul
