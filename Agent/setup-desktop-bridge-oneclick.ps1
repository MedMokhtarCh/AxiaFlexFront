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

function Get-TaskStateSafe([string]$TaskName) {
  try {
    $line = schtasks /Query /TN $TaskName /FO LIST 2>$null | Select-String "^Status:"
    if ($line) { return ($line.ToString() -replace "^Status:\s*", "").Trim() }
    return "Unknown"
  } catch {
    return "Missing"
  }
}

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $agentDir "desktop-bridge-launcher.ps1"
$configPath = Join-Path $agentDir "desktop-bridge-config.json"
$taskName = "AxiaFlexDesktopBridgeAutostart"

if (-not (Test-Path $launcher)) {
  throw "desktop-bridge-launcher.ps1 introuvable dans $agentDir"
}

$defaultExe = "C:\Program Files\MyBridge\DesktopBridge.exe"
$defaultHealth = "http://127.0.0.1:17888/health"
$defaultArgs = ""

$existingCfg = $null
if (Test-Path $configPath) {
  try { $existingCfg = Get-Content -Raw -Path $configPath | ConvertFrom-Json } catch { $existingCfg = $null }
}

Write-Host ""
Write-Host "=== AxiaFlex Desktop Bridge - One Click Setup ===" -ForegroundColor Cyan
Write-Host "1) Installer / Mettre a jour auto-demarrage"
Write-Host "2) Demarrer maintenant (test)"
Write-Host "3) Statut"
Write-Host "4) Desinstaller auto-demarrage"
Write-Host ""

$choice = Ask-Value -Prompt "Choix (1/2/3/4)" -Default "1"

if ($choice -eq "3") {
  $state = Get-TaskStateSafe $taskName
  Write-Host "[bridge] Tache: $taskName => $state"
  if ($existingCfg) {
    Write-Host "[bridge] Exe: $($existingCfg.BridgeExePath)"
    Write-Host "[bridge] Health: $($existingCfg.HealthUrl)"
  }
  exit 0
}

if ($choice -eq "4") {
  schtasks /Delete /TN $taskName /F 2>$null | Out-Null
  Write-Host "[bridge] Auto-demarrage supprime." -ForegroundColor Yellow
  exit 0
}

$bridgeExe = Ask-Value -Prompt "Chemin EXE bridge" -Default ([string]($existingCfg.BridgeExePath ?? $defaultExe))
$bridgeArgs = Ask-Value -Prompt "Arguments bridge (optionnel)" -Default ([string]($existingCfg.BridgeArgs ?? $defaultArgs))
$healthUrl = Ask-Value -Prompt "URL health bridge" -Default ([string]($existingCfg.HealthUrl ?? $defaultHealth))

if (-not (Test-Path $bridgeExe)) {
  throw "EXE bridge introuvable: $bridgeExe"
}

$cfg = @{
  BridgeExePath = $bridgeExe
  BridgeArgs    = $bridgeArgs
  HealthUrl     = $healthUrl
}
$cfg | ConvertTo-Json | Out-File -FilePath $configPath -Encoding utf8

if ($choice -eq "2") {
  powershell -NoProfile -ExecutionPolicy Bypass -File $launcher `
    -BridgeExePath $bridgeExe `
    -BridgeArgs $bridgeArgs `
    -HealthUrl $healthUrl
  exit $LASTEXITCODE
}

$taskCmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" -BridgeExePath `"$bridgeExe`" -BridgeArgs `"$bridgeArgs`" -HealthUrl `"$healthUrl`" -Quiet"
schtasks /Create /SC ONLOGON /TN $taskName /TR $taskCmd /F | Out-Null
Write-Host "[bridge] Auto-demarrage installe: $taskName" -ForegroundColor Green

Write-Host "[bridge] Test de demarrage maintenant..." -ForegroundColor Yellow
powershell -NoProfile -ExecutionPolicy Bypass -File $launcher `
  -BridgeExePath $bridgeExe `
  -BridgeArgs $bridgeArgs `
  -HealthUrl $healthUrl

if ($LASTEXITCODE -eq 0) {
  Write-Host "[bridge] OK. Pret pour l'utilisateur (one click)." -ForegroundColor Green
} else {
  Write-Host "[bridge] KO. Verifie port/URL health de ton app desktop." -ForegroundColor Red
}

