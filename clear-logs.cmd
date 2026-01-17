@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOGDIR=%ROOT%\logs"
set "FORCE_STOP="
if /I "%~1"=="/force" set "FORCE_STOP=1"

if not exist "%LOGDIR%" (
  echo Logs folder not found: %LOGDIR%
  exit /b 1
)

if defined FORCE_STOP (
  if exist "%ROOT%\stop-all.cmd" (
    call "%ROOT%\stop-all.cmd" /quiet
  )
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference = 'SilentlyContinue';" ^
    "$root = '%ROOT%';" ^
    "$targets = @('python.exe','pythonw.exe','node.exe','caddy.exe','cmd.exe');" ^
    "$self = $PID;" ^
    "$parent = (Get-CimInstance Win32_Process -Filter \"ProcessId=$self\").ParentProcessId;" ^
    "$excludeIds = @($self, $parent);" ^
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and (" ^
    "  $_.CommandLine -like \"*$root*\" -or" ^
    "  $_.CommandLine -like '*uvicorn*' -or" ^
    "  $_.CommandLine -like '*npm run dev*' -or" ^
    "  $_.CommandLine -like '*caddy.exe run*'" ^
    ") -and $targets -contains $_.Name -and $excludeIds -notcontains $_.ProcessId } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
)

echo Clearing log contents under: %LOGDIR%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$logDir = '%LOGDIR%';" ^
  "$cleared = 0; $locked = 0; $lockedPaths = New-Object System.Collections.Generic.List[string];" ^
  "Get-ChildItem -Path $logDir -Recurse -File -Filter '*.log' | ForEach-Object {" ^
  "  $path = $_.FullName;" ^
  "  try {" ^
    "    $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite);" ^
    "    try { $fs.SetLength(0); $cleared++ } finally { $fs.Dispose() }" ^
  "  } catch { $locked++; $lockedPaths.Add($path) | Out-Null }" ^
  "};" ^
  "Write-Host \"Cleared: $cleared file(s)\";" ^
  "if ($locked -gt 0) {" ^
  "  Write-Host \"Skipped (in use): $locked file(s)\";" ^
  "  $lockedPaths | Select-Object -First 20 | ForEach-Object { Write-Host \"  $_\" }" ^
  "}"

echo Done.
exit /b 0
