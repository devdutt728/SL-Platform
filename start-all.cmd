@echo off
setlocal EnableExtensions EnableDelayedExpansion

title SLP Start
for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOGDIR=%ROOT%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo.
echo Starting Studio Lotus Platform services...
echo Root: %ROOT%
echo Logs: %LOGDIR%
echo.

call "%ROOT%\stop-all.cmd" /quiet

set "IT_BACKEND_OUT=%LOGDIR%\it-backend.log"
set "IT_BACKEND_ERR=%LOGDIR%\it-backend.err.log"
set "REC_BACKEND_OUT=%LOGDIR%\recruitment-backend.log"
set "REC_BACKEND_ERR=%LOGDIR%\recruitment-backend.err.log"
set "IT_FRONTEND_OUT=%LOGDIR%\it-frontend.log"
set "IT_FRONTEND_ERR=%LOGDIR%\it-frontend.err.log"
set "REC_FRONTEND_OUT=%LOGDIR%\recruitment-frontend.log"
set "REC_FRONTEND_ERR=%LOGDIR%\recruitment-frontend.err.log"
set "WORKBOOK_OUT=%LOGDIR%\workbook-frontend.log"
set "WORKBOOK_ERR=%LOGDIR%\workbook-frontend.err.log"
set "CADDY_OUT=%LOGDIR%\caddy.log"
set "CADDY_ERR=%LOGDIR%\caddy.err.log"

for %%F in (
  "%IT_BACKEND_OUT%"
  "%IT_BACKEND_ERR%"
  "%REC_BACKEND_OUT%"
  "%REC_BACKEND_ERR%"
  "%IT_FRONTEND_OUT%"
  "%IT_FRONTEND_ERR%"
  "%REC_FRONTEND_OUT%"
  "%REC_FRONTEND_ERR%"
  "%WORKBOOK_OUT%"
  "%WORKBOOK_ERR%"
  "%CADDY_OUT%"
  "%CADDY_ERR%"
) do (
  if not exist "%%~fF" type nul > "%%~fF"
)

set "IT_BACKEND_DIR=%ROOT%\SL_IT\backend"
set "REC_BACKEND_DIR=%ROOT%\SL_Recruitment\backend"
set "IT_FRONTEND_DIR=%ROOT%\SL_IT\frontend"
set "REC_FRONTEND_DIR=%ROOT%\SL_Recruitment\frontend"
set "WORKBOOK_DIR=%ROOT%\SL_Workbook\frontend"

if not exist "%IT_BACKEND_DIR%" echo Missing: %IT_BACKEND_DIR%
if not exist "%REC_BACKEND_DIR%" echo Missing: %REC_BACKEND_DIR%
if not exist "%IT_FRONTEND_DIR%" echo Missing: %IT_FRONTEND_DIR%
if not exist "%REC_FRONTEND_DIR%" echo Missing: %REC_FRONTEND_DIR%
if not exist "%WORKBOOK_DIR%" echo Missing: %WORKBOOK_DIR%

if exist "%IT_BACKEND_DIR%" (
  call :spawn "%IT_BACKEND_DIR%" "python -m uvicorn app.main:app --reload --port 8001" "%IT_BACKEND_OUT%" "%IT_BACKEND_ERR%"
)
if exist "%REC_BACKEND_DIR%" (
  call :spawn "%REC_BACKEND_DIR%" "python -m uvicorn app.main:app --reload --port 8002" "%REC_BACKEND_OUT%" "%REC_BACKEND_ERR%"
)
if exist "%IT_FRONTEND_DIR%" (
  call :spawn "%IT_FRONTEND_DIR%" "set PORT=3001 ^&^& npm run dev" "%IT_FRONTEND_OUT%" "%IT_FRONTEND_ERR%"
)
if exist "%REC_FRONTEND_DIR%" (
  call :spawn "%REC_FRONTEND_DIR%" "set PORT=3002 ^&^& npm run dev" "%REC_FRONTEND_OUT%" "%REC_FRONTEND_ERR%"
)
if exist "%WORKBOOK_DIR%" (
  call :spawn "%WORKBOOK_DIR%" "set PORT=3003 ^&^& npm run dev" "%WORKBOOK_OUT%" "%WORKBOOK_ERR%"
)

if exist "%ROOT%\tools\caddy.exe" (
  call :spawn "%ROOT%" "tools\\caddy.exe run --config Caddyfile --adapter caddyfile" "%CADDY_OUT%" "%CADDY_ERR%"
)

if exist "%ROOT%\monitor.cmd" (
  call "%ROOT%\monitor.cmd"
) else (
  echo Missing: %ROOT%\monitor.cmd
)

exit /b

:spawn
set "SPAWN_DIR=%~1"
set "SPAWN_CMD=%~2"
set "SPAWN_OUT=%~3"
set "SPAWN_ERR=%~4"

if not defined SPAWN_DIR exit /b 1
if not defined SPAWN_CMD exit /b 1
if not exist "%SPAWN_DIR%" exit /b 1

start "" /b /d "%SPAWN_DIR%" cmd /c "%SPAWN_CMD% 1>>""%SPAWN_OUT%"" 2>>""%SPAWN_ERR%"""
exit /b
