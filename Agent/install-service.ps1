$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true)]
  [string]$CloudApiUrl,

  [Parameter(Mandatory = $true)]
  [string]$AgentMasterToken,

  [Parameter(Mandatory = $true)]
  [string]$TerminalAlias,

  [Parameter(Mandatory = $false)]
  [string]$SiteName = "",

  [Parameter(Mandatory = $false)]
  [int]$PollMs = 3000,

  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "AxiaFlexPrintAgent"
)

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeCmd = (Get-Command node -ErrorAction Stop).Source
$agentEntry = Join-Path $agentDir "index.js"

if (-not (Test-Path $agentEntry)) {
  throw "index.js introuvable dans $agentDir"
}

$envRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"

Write-Host "[agent] Création / mise à jour du service $ServiceName ..."

$binaryPath = "`"$nodeCmd`" `"$agentEntry`""

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 1
}

sc.exe create $ServiceName binPath= $binaryPath start= auto DisplayName= "AxiaFlex Print Agent" | Out-Null

New-ItemProperty -Path $envRegPath -Name "Environment" -PropertyType MultiString -Value @(
  "CLOUD_API_URL=$CloudApiUrl"
  "AGENT_MASTER_TOKEN=$AgentMasterToken"
  "TERMINAL_ALIAS=$TerminalAlias"
  "SITE_NAME=$SiteName"
  "AGENT_POLL_MS=$PollMs"
) -Force | Out-Null

Write-Host "[agent] Service installé. Démarrage ..."
Start-Service -Name $ServiceName

Write-Host "[agent] OK. Vérification:"
Get-Service -Name $ServiceName | Select-Object Name, Status, StartType
