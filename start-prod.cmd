@echo off
set "ROOT=D:\SL Platform"
set "LOGDIR=%ROOT%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

rem Build on each start (set to 0 to skip builds)
if not defined BUILD_ON_START set "BUILD_ON_START=1"
if not defined PAUSE_ON_ERROR set "PAUSE_ON_ERROR=1"
if not defined START_MONITOR set "START_MONITOR=1"
if not defined KEEP_WINDOW_OPEN set "KEEP_WINDOW_OPEN=1"

rem Global env for all Node processes
set "NODE_ENV=production"
set "HOSTNAME=127.0.0.1"
set "SL_ENVIRONMENT=production"
set "SPP_ENVIRONMENT=production"
set "SPL_ENVIRONMENT=production"
if not defined ENABLE_IT_MODULE set "ENABLE_IT_MODULE=0"
if not defined ENABLE_PROJECT_PLANNER set "ENABLE_PROJECT_PLANNER=1"
if not defined ENABLE_PEOPLE_MODULE set "ENABLE_PEOPLE_MODULE=0"

powershell -NoProfile -Command "& { $ErrorActionPreference = 'Continue'; $ports = 3000,3001,3002,3003,3004,8001,8002,8003,8004; foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { $procId = $_.OwningProcess; if ($procId) { try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {} } } } }"

set "RUN_ID=%DATE%_%TIME%"
set "RUN_ID=%RUN_ID: =%"
set "RUN_ID=%RUN_ID::=%"
set "RUN_ID=%RUN_ID:.=%"
set "RUN_ID=%RUN_ID:/=%"
set "RUN_ID=%RUN_ID:-=%"
set "RUN_ID=%RUN_ID:,=%"

set "RUN_LOGDIR=%LOGDIR%\run-%RUN_ID%"
if not exist "%RUN_LOGDIR%" mkdir "%RUN_LOGDIR%"
set "TRACE_LOG=%RUN_LOGDIR%\\start-prod.trace.log"
echo [%DATE% %TIME%] start-prod begin> "%TRACE_LOG%"

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
set "PLANNER_BACKEND_OUT=%RUN_LOGDIR%\planner-backend.log"
set "PLANNER_BACKEND_ERR=%RUN_LOGDIR%\planner-backend.err.log"
set "PLANNER_FRONTEND_OUT=%RUN_LOGDIR%\planner-frontend.log"
set "PLANNER_FRONTEND_ERR=%RUN_LOGDIR%\planner-frontend.err.log"
set "PEOPLE_BACKEND_OUT=%RUN_LOGDIR%\people-backend.log"
set "PEOPLE_BACKEND_ERR=%RUN_LOGDIR%\people-backend.err.log"
set "IT_FRONTEND_BUILD_OUT=%RUN_LOGDIR%\it-frontend-build.log"
set "IT_FRONTEND_BUILD_ERR=%RUN_LOGDIR%\it-frontend-build.err.log"
set "REC_FRONTEND_BUILD_OUT=%RUN_LOGDIR%\recruitment-frontend-build.log"
set "REC_FRONTEND_BUILD_ERR=%RUN_LOGDIR%\recruitment-frontend-build.err.log"
set "WORKBOOK_BUILD_OUT=%RUN_LOGDIR%\workbook-frontend-build.log"
set "WORKBOOK_BUILD_ERR=%RUN_LOGDIR%\workbook-frontend-build.err.log"
set "PLANNER_FRONTEND_BUILD_OUT=%RUN_LOGDIR%\planner-frontend-build.log"
set "PLANNER_FRONTEND_BUILD_ERR=%RUN_LOGDIR%\planner-frontend-build.err.log"
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
  echo set "IT_FRONTEND_ERR_LOG=%IT_FRONTEND_ERR%"
  echo set "REC_FRONTEND_LOG=%REC_FRONTEND_OUT%"
  echo set "REC_FRONTEND_ERR_LOG=%REC_FRONTEND_ERR%"
  echo set "WORKBOOK_LOG=%WORKBOOK_OUT%"
  echo set "WORKBOOK_ERR_LOG=%WORKBOOK_ERR%"
  echo set "PLANNER_BACKEND_LOG=%PLANNER_BACKEND_OUT%"
  echo set "PLANNER_BACKEND_ERR_LOG=%PLANNER_BACKEND_ERR%"
  echo set "PLANNER_FRONTEND_LOG=%PLANNER_FRONTEND_OUT%"
  echo set "PLANNER_FRONTEND_ERR_LOG=%PLANNER_FRONTEND_ERR%"
  echo set "PEOPLE_BACKEND_LOG=%PEOPLE_BACKEND_OUT%"
  echo set "PEOPLE_BACKEND_ERR_LOG=%PEOPLE_BACKEND_ERR%"
  echo set "IT_FRONTEND_BUILD_LOG=%IT_FRONTEND_BUILD_OUT%"
  echo set "IT_FRONTEND_BUILD_ERR_LOG=%IT_FRONTEND_BUILD_ERR%"
  echo set "REC_FRONTEND_BUILD_LOG=%REC_FRONTEND_BUILD_OUT%"
  echo set "REC_FRONTEND_BUILD_ERR_LOG=%REC_FRONTEND_BUILD_ERR%"
  echo set "WORKBOOK_BUILD_LOG=%WORKBOOK_BUILD_OUT%"
  echo set "WORKBOOK_BUILD_ERR_LOG=%WORKBOOK_BUILD_ERR%"
  echo set "PLANNER_FRONTEND_BUILD_LOG=%PLANNER_FRONTEND_BUILD_OUT%"
  echo set "PLANNER_FRONTEND_BUILD_ERR_LOG=%PLANNER_FRONTEND_BUILD_ERR%"
  echo set "CADDY_LOG=%CADDY_OUT%"
  echo set "CADDY_ERR_LOG=%CADDY_ERR%"
) > "%CURRENT_LOGS%"

set "IT_BACKEND_DIR=%ROOT%\SL_IT\backend"
set "REC_BACKEND_DIR=%ROOT%\SL_Recruitment\backend"
set "IT_FRONTEND_DIR=%ROOT%\SL_IT\frontend"
set "REC_FRONTEND_DIR=%ROOT%\SL_Recruitment\frontend"
set "WORKBOOK_DIR=%ROOT%\SL_Workbook\frontend"
set "PLANNER_BACKEND_DIR=%ROOT%\SL_Project_Planner\backend"
set "PLANNER_FRONTEND_DIR=%ROOT%\SL_Project_Planner\frontend"
set "PEOPLE_BACKEND_DIR=%ROOT%\SL_People\backend"

if not exist "%IT_BACKEND_DIR%" echo Missing: %IT_BACKEND_DIR%
if not exist "%REC_BACKEND_DIR%" echo Missing: %REC_BACKEND_DIR%
if not exist "%IT_FRONTEND_DIR%" echo Missing: %IT_FRONTEND_DIR%
if not exist "%REC_FRONTEND_DIR%" echo Missing: %REC_FRONTEND_DIR%
if not exist "%WORKBOOK_DIR%" echo Missing: %WORKBOOK_DIR%
if "%ENABLE_PROJECT_PLANNER%"=="1" if not exist "%PLANNER_BACKEND_DIR%" echo Missing: %PLANNER_BACKEND_DIR%
if "%ENABLE_PROJECT_PLANNER%"=="1" if not exist "%PLANNER_FRONTEND_DIR%" echo Missing: %PLANNER_FRONTEND_DIR%
if "%ENABLE_PEOPLE_MODULE%"=="1" if not exist "%PEOPLE_BACKEND_DIR%" echo Missing: %PEOPLE_BACKEND_DIR%
echo [%DATE% %TIME%] dirs ready>> "%TRACE_LOG%"

if "%BUILD_ON_START%"=="1" (
  echo Building frontends - this may take a few minutes...
  if "%ENABLE_IT_MODULE%"=="1" if exist "%IT_FRONTEND_DIR%" (
    powershell -NoProfile -Command "$ErrorActionPreference='Continue'; Set-Location -LiteralPath '%IT_FRONTEND_DIR%'; npm run build 2>&1 | Tee-Object -FilePath '%IT_FRONTEND_BUILD_OUT%'; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"
    if errorlevel 1 goto :fail
  )
  if exist "%REC_FRONTEND_DIR%" (
    powershell -NoProfile -Command "$ErrorActionPreference='Continue'; Set-Location -LiteralPath '%REC_FRONTEND_DIR%'; npm run build 2>&1 | Tee-Object -FilePath '%REC_FRONTEND_BUILD_OUT%'; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"
    if errorlevel 1 goto :fail
  )
  if exist "%WORKBOOK_DIR%" (
    powershell -NoProfile -Command "$ErrorActionPreference='Continue'; Set-Location -LiteralPath '%WORKBOOK_DIR%'; npm run build 2>&1 | Tee-Object -FilePath '%WORKBOOK_BUILD_OUT%'; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"
    if errorlevel 1 goto :fail
  )
  if "%ENABLE_PROJECT_PLANNER%"=="1" if exist "%PLANNER_FRONTEND_DIR%" (
    powershell -NoProfile -Command "$ErrorActionPreference='Continue'; Set-Location -LiteralPath '%PLANNER_FRONTEND_DIR%'; npm run build 2>&1 | Tee-Object -FilePath '%PLANNER_FRONTEND_BUILD_OUT%'; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"
    if errorlevel 1 goto :fail
  )
)

if "%ENABLE_IT_MODULE%"=="1" if exist "%IT_BACKEND_DIR%" (
  echo [%DATE% %TIME%] spawn it-backend>> "%TRACE_LOG%"
  call :spawn "%IT_BACKEND_DIR%" "python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1" "%IT_BACKEND_OUT%" "%IT_BACKEND_ERR%"
)
if exist "%REC_BACKEND_DIR%" (
  echo [%DATE% %TIME%] spawn rec-backend>> "%TRACE_LOG%"
  call :spawn "%REC_BACKEND_DIR%" "python -m uvicorn app.main:app --host 127.0.0.1 --port 8002 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1" "%REC_BACKEND_OUT%" "%REC_BACKEND_ERR%"
  call :wait_port 8002 "recruitment backend"
)
if "%ENABLE_IT_MODULE%"=="1" if exist "%IT_FRONTEND_DIR%" (
  echo [%DATE% %TIME%] spawn it-frontend>> "%TRACE_LOG%"
  if exist "%IT_FRONTEND_DIR%\\.next\\standalone\\server.js" (
    call :spawn "%IT_FRONTEND_DIR%" "node .next\\standalone\\server.js" "%IT_FRONTEND_OUT%" "%IT_FRONTEND_ERR%" "PORT=3001"
  ) else (
    call :spawn "%IT_FRONTEND_DIR%" "npm run start" "%IT_FRONTEND_OUT%" "%IT_FRONTEND_ERR%" "PORT=3001"
  )
)
if exist "%REC_FRONTEND_DIR%" (
  echo [%DATE% %TIME%] spawn rec-frontend>> "%TRACE_LOG%"
  call :spawn "%REC_FRONTEND_DIR%" "npm run start" "%REC_FRONTEND_OUT%" "%REC_FRONTEND_ERR%" "PORT=3002"
)
if exist "%WORKBOOK_DIR%" (
  echo [%DATE% %TIME%] spawn workbook>> "%TRACE_LOG%"
  call :spawn "%WORKBOOK_DIR%" "npm run start" "%WORKBOOK_OUT%" "%WORKBOOK_ERR%" "PORT=3003"
)
if "%ENABLE_PROJECT_PLANNER%"=="1" if exist "%PLANNER_BACKEND_DIR%" (
  echo [%DATE% %TIME%] spawn planner-backend>> "%TRACE_LOG%"
  call :spawn "%PLANNER_BACKEND_DIR%" "python -m uvicorn app.main:app --host 127.0.0.1 --port 8003 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1" "%PLANNER_BACKEND_OUT%" "%PLANNER_BACKEND_ERR%"
)
if "%ENABLE_PROJECT_PLANNER%"=="1" if exist "%PLANNER_FRONTEND_DIR%" (
  echo [%DATE% %TIME%] spawn planner-frontend>> "%TRACE_LOG%"
  call :spawn "%PLANNER_FRONTEND_DIR%" "npm run start" "%PLANNER_FRONTEND_OUT%" "%PLANNER_FRONTEND_ERR%" "PORT=3004"
)
if "%ENABLE_PEOPLE_MODULE%"=="1" if exist "%PEOPLE_BACKEND_DIR%" (
  echo [%DATE% %TIME%] spawn people-backend>> "%TRACE_LOG%"
  call :spawn "%PEOPLE_BACKEND_DIR%" "python -m uvicorn app.main:app --host 127.0.0.1 --port 8004 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1" "%PEOPLE_BACKEND_OUT%" "%PEOPLE_BACKEND_ERR%"
)

if exist "%ROOT%\tools\caddy.exe" (
  echo [%DATE% %TIME%] spawn caddy>> "%TRACE_LOG%"
  "%ROOT%\tools\caddy.exe" fmt --overwrite "%ROOT%\Caddyfile" >nul 2>nul
  call :spawn "%ROOT%" "tools\\caddy.exe run --config Caddyfile --adapter caddyfile" "%CADDY_OUT%" "%CADDY_ERR%"
)

if "%START_MONITOR%"=="1" (
  if exist "%ROOT%\monitor.cmd" (
    call "%ROOT%\monitor.cmd"
  ) else (
    echo Missing: %ROOT%\monitor.cmd
  )
)

if "%KEEP_WINDOW_OPEN%"=="1" pause
exit /b

:fail
echo.
echo Start-prod failed. Check build logs in %RUN_LOGDIR%.
if "%PAUSE_ON_ERROR%"=="1" pause
exit /b 1

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

:wait_port
set "WAIT_PORT=%~1"
set "WAIT_NAME=%~2"
if not defined WAIT_PORT exit /b 1
if not defined WAIT_NAME set "WAIT_NAME=service"
echo Waiting for %WAIT_NAME% on port %WAIT_PORT%...
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $port=[int]'%WAIT_PORT%'; $deadline=(Get-Date).AddSeconds(45); while ((Get-Date) -lt $deadline) { $client=New-Object Net.Sockets.TcpClient; try { $iar=$client.BeginConnect('127.0.0.1',$port,$null,$null); if ($iar.AsyncWaitHandle.WaitOne(500)) { $client.EndConnect($iar); $client.Close(); exit 0 } } catch {} finally { try { $client.Close() } catch {} }; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 echo Warning: %WAIT_NAME% did not become ready on port %WAIT_PORT% before continuing.
exit /b 0
