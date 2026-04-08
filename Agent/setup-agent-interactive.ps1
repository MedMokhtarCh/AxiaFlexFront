$ErrorActionPreference = "Stop"

function Ask-Value {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )
  if ($Default) {
    $v = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
    return $v
  }
  do {
    $v = Read-Host $Prompt
  } while ([string]::IsNullOrWhiteSpace($v))
  return $v
}

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installScript = Join-Path $agentDir "install-service.ps1"
$uninstallScript = Join-Path $agentDir "uninstall-service.ps1"

if (-not (Test-Path $installScript)) {
  throw "install-service.ps1 introuvable dans $agentDir"
}

Write-Host ""
Write-Host "=== AxiaFlex Print Agent - Setup dynamique ===" -ForegroundColor Cyan
Write-Host "Machine: $env:COMPUTERNAME"
Write-Host ""
Write-Host "1) Installer / Mettre à jour le service"
Write-Host "2) Désinstaller le service"
Write-Host "3) Statut du service"
Write-Host ""

$choice = Ask-Value -Prompt "Choix (1/2/3)" -Default "1"

if ($choice -eq "2") {
  if (-not (Test-Path $uninstallScript)) {
    throw "uninstall-service.ps1 introuvable dans $agentDir"
  }
  & $uninstallScript
  exit 0
}

if ($choice -eq "3") {
  Get-Service AxiaFlexPrintAgent -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType
  exit 0
}

$cloudApiUrl = Ask-Value -Prompt "Cloud API URL (ex: https://axiaflex-backend.onrender.com)"
$agentMasterToken = Ask-Value -Prompt "AGENT_MASTER_TOKEN"
$terminalAlias = Ask-Value -Prompt "Alias terminal (ex: TERMINAL-1)" -Default $env:COMPUTERNAME
$siteName = Ask-Value -Prompt "Nom du site" -Default "SITE-A"
$pollMsRaw = Ask-Value -Prompt "Polling ms" -Default "3000"
$serviceName = Ask-Value -Prompt "Nom du service" -Default "AxiaFlexPrintAgent"

$pollMs = 3000
if ([int]::TryParse($pollMsRaw, [ref]$pollMs) -eq $false) {
  $pollMs = 3000
}
if ($pollMs -lt 1500) { $pollMs = 1500 }

Write-Host ""
Write-Host "Installation en cours..." -ForegroundColor Yellow

& $installScript `
  -CloudApiUrl $cloudApiUrl `
  -AgentMasterToken $agentMasterToken `
  -TerminalAlias $terminalAlias `
  -SiteName $siteName `
  -PollMs $pollMs `
  -ServiceName $serviceName

Write-Host ""
Write-Host "Terminé. Service installé/mis à jour." -ForegroundColor Green
