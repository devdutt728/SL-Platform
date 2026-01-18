@echo off
set "ROOT=D:\SL Platform"
set "LOGDIR=%ROOT%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

powershell -NoProfile -Command "& { $ErrorActionPreference = 'Continue'; $ports = 3000,3001,3002,3003,8001,8002; foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { $procId = $_.OwningProcess; if ($procId) { try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {} } } } }"

set "RUN_ID=%DATE%_%TIME%"
set "RUN_ID=%RUN_ID: =%"
set "RUN_ID=%RUN_ID::=%"
set "RUN_ID=%RUN_ID:.=%"
set "RUN_ID=%RUN_ID:/=%"
set "RUN_ID=%RUN_ID:-=%"
set "RUN_ID=%RUN_ID:,=%"

set "RUN_LOGDIR=%LOGDIR%\run-%RUN_ID%"
if not exist "%RUN_LOGDIR%" mkdir "%RUN_LOGDIR%"

set "IT_BACKEND_OUT=%RUN_LOGDIR%\it-backend.log"
set "IT_BACKEND_ERR=%RUN_LOGDIR%\it-backend.err.log"
set "REC_BACKEND_OUT=%RUN_LOGDIR%\recruitment-backend.log"
set "REC_BACKEND_ERR=%RUN_LOGDIR%\recruitment-backend.err.log"
set "IT_FRONTEND_OUT=%RUN_LOGDIR%\it-frontend.log"
set "IT_FRONTEND_ERR=%RUN_LOGDIR%\it-frontend.err.log"
set "REC_FRONTEND_OUT=%RUN_LOGDIR%\recruitment-frontend.log"
set "REC_FRONTEND_ERR=%RUN_LOGDIR%\recruitment-frontend.err.log"
set "WORKBOOK_OUT=%RUN_LOGDIR%\workbook-frontend.log"
set "WORKBOOK_ERR=%RUN_LOGDIR%\workbook-frontend.err.log"
set "CADDY_OUT=%RUN_LOGDIR%\caddy.log"
set "CADDY_ERR=%RUN_LOGDIR%\caddy.err.log"

set "CURRENT_LOGS=%LOGDIR%\current-logs.cmd"
(
  echo set "RUN_ID=%RUN_ID%"
  echo set "RUN_LOGDIR=%RUN_LOGDIR%"
  echo set "IT_BACKEND_LOG=%IT_BACKEND_OUT%"
  echo set "IT_BACKEND_ERR_LOG=%IT_BACKEND_ERR%"
  echo set "REC_BACKEND_LOG=%REC_BACKEND_OUT%"
  echo set "REC_BACKEND_ERR_LOG=%REC_BACKEND_ERR%"
  echo set "IT_FRONTEND_LOG=%IT_FRONTEND_OUT%"
  echo set "REC_FRONTEND_LOG=%REC_FRONTEND_OUT%"
  echo set "WORKBOOK_LOG=%WORKBOOK_OUT%"
  echo set "CADDY_LOG=%CADDY_OUT%"
  echo set "CADDY_ERR_LOG=%CADDY_ERR%"
) > "%CURRENT_LOGS%"

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
  call :spawn "%IT_FRONTEND_DIR%" "npm run dev" "%IT_FRONTEND_OUT%" "%IT_FRONTEND_ERR%" "PORT=3001"
)
if exist "%REC_FRONTEND_DIR%" (
  call :spawn "%REC_FRONTEND_DIR%" "npm run dev" "%REC_FRONTEND_OUT%" "%REC_FRONTEND_ERR%" "PORT=3002"
)
if exist "%WORKBOOK_DIR%" (
  call :spawn "%WORKBOOK_DIR%" "npm run dev" "%WORKBOOK_OUT%" "%WORKBOOK_ERR%" "PORT=3003"
)

if exist "%ROOT%\tools\caddy.exe" (
  "%ROOT%\tools\caddy.exe" fmt --overwrite "%ROOT%\Caddyfile" >nul 2>nul
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
set "SPAWN_ENV=%~5"

if not defined SPAWN_DIR exit /b 1
if not defined SPAWN_CMD exit /b 1
if not exist "%SPAWN_DIR%" exit /b 1

set "RUNNER=%RUN_LOGDIR%\run-%RANDOM%-%RANDOM%.cmd"
(
  echo @echo off
  echo cd /d "%SPAWN_DIR%"
  if defined SPAWN_ENV echo set "%SPAWN_ENV%"
  echo %SPAWN_CMD% 1^>^>"%SPAWN_OUT%" 2^>^>"%SPAWN_ERR%"
) > "%RUNNER%"

start "" /b "%RUNNER%"
exit /b
