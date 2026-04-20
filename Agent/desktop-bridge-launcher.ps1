$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true)]
  [string]$BridgeExePath,

  [Parameter(Mandatory = $false)]
  [string]$BridgeArgs = "",

  [Parameter(Mandatory = $false)]
  [string]$HealthUrl = "http://127.0.0.1:17888/health",

  [Parameter(Mandatory = $false)]
  [int]$WaitSeconds = 2,

  [Parameter(Mandatory = $false)]
  [switch]$Quiet
)

function Write-Info([string]$msg) {
  if (-not $Quiet) { Write-Host $msg }
}

if (-not (Test-Path $BridgeExePath)) {
  throw "Bridge introuvable: $BridgeExePath"
}

$exeResolved = (Resolve-Path $BridgeExePath).Path
$isRunning = $false
try {
  $proc = Get-CimInstance Win32_Process -Filter "Name='$(Split-Path $exeResolved -Leaf)'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $exeResolved) } |
    Select-Object -First 1
  $isRunning = $null -ne $proc
} catch {
  $isRunning = $false
}

if (-not $isRunning) {
  Write-Info "[bridge] Demarrage: $exeResolved"
  if ([string]::IsNullOrWhiteSpace($BridgeArgs)) {
    Start-Process -FilePath $exeResolved -WindowStyle Hidden | Out-Null
  } else {
    Start-Process -FilePath $exeResolved -ArgumentList $BridgeArgs -WindowStyle Hidden | Out-Null
  }
} else {
  Write-Info "[bridge] Deja demarre."
}

if ($WaitSeconds -gt 0) {
  Start-Sleep -Seconds $WaitSeconds
}

try {
  $res = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 3
  if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300) {
    Write-Info "[bridge] OK health=$HealthUrl status=$($res.StatusCode)"
    exit 0
  }
  Write-Info "[bridge] KO health=$HealthUrl status=$($res.StatusCode)"
  exit 2
} catch {
  Write-Info "[bridge] KO health=$HealthUrl (offline)"
  exit 3
}

