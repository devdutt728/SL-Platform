param(
  [Parameter(Mandatory = $true)]
  [string]$Root,

  [Parameter(Mandatory = $true)]
  [string]$LogDir,

  [int[]]$ExcludeProcessIds = @()
)

$ErrorActionPreference = "SilentlyContinue"

$rootPath = (Resolve-Path -LiteralPath $Root).Path
$targets = @("cmd.exe", "powershell.exe", "pwsh.exe", "python.exe", "pythonw.exe", "node.exe", "caddy.exe")
$ports = @(3000, 3001, 3002, 3003, 3004, 8001, 8002, 8003, 8004, 8005, 8010)
$exclude = @($PID) + $ExcludeProcessIds

function Stop-PlatformTree {
  param([int]$ProcessId)

  if (-not $ProcessId -or $exclude -contains $ProcessId) {
    return
  }

  Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" |
    ForEach-Object { Stop-PlatformTree -ProcessId ([int]$_.ProcessId) }

  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-PlatformPidFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path |
    ForEach-Object {
      if ($_ -match "^\d+$") {
        Stop-PlatformTree -ProcessId ([int]$_)
      }
    }
}

Stop-PlatformPidFile -Path (Join-Path $LogDir "pids.txt")

$jsonPidPath = Join-Path $LogDir "pids.json"
if (Test-Path -LiteralPath $jsonPidPath) {
  try {
    $pidData = Get-Content -LiteralPath $jsonPidPath -Raw | ConvertFrom-Json
    $pidData.PSObject.Properties |
      ForEach-Object { $_.Value } |
      ForEach-Object { if ($_ -is [array]) { $_ } else { @($_) } } |
      ForEach-Object { Stop-PlatformTree -ProcessId ([int]$_) }
  } catch {
  }
}

foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.OwningProcess -and $exclude -notcontains $_.OwningProcess) {
        Stop-PlatformTree -ProcessId ([int]$_.OwningProcess)
      }
    }
}

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $targets -contains $_.Name -and
    $exclude -notcontains $_.ProcessId -and
    (
      $_.CommandLine -like "*$rootPath*" -or
      $_.CommandLine -like "*uvicorn*app.main:app*" -or
      $_.CommandLine -like "*npm run dev*" -or
      $_.CommandLine -like "*npm run start*" -or
      $_.CommandLine -like "*caddy.exe run*"
    )
  } |
  Sort-Object ProcessId -Descending |
  ForEach-Object { Stop-PlatformTree -ProcessId ([int]$_.ProcessId) }

Remove-Item -LiteralPath (Join-Path $LogDir "pids.txt") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $jsonPidPath -Force -ErrorAction SilentlyContinue
