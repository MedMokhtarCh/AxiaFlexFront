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

$ErrorActionPreference = "Stop"

function Test-IsElevated {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = [Security.Principal.WindowsPrincipal]::new($id)
    # BUILTIN\Administrators — fiable avec UAC (contrairement a WindowsBuiltInRole::Administrator seul)
    $adminSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
    return $p.IsInRole($adminSid)
  } catch {
    return $false
  }
}

function Test-NetSessionOk {
  try {
    & cmd.exe /c "net session >nul 2>&1" | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

$elevated = (Test-IsElevated) -or (Test-NetSessionOk)
Write-Host "[appwin-agent] Etape 1/5: verification droits administrateur..."
Write-Host "[appwin-agent]   - SID S-1-5-32-544 (Administrateurs): $(Test-IsElevated)"
Write-Host "[appwin-agent]   - net session (methode classique): $(Test-NetSessionOk)"
if (-not $elevated) {
  Write-Host "[appwin-agent] ATTENTION: session non detectee comme elevee. La creation du service peut echouer (acces refuse). Lancez AppWin via clic droit > Executer en tant qu'administrateur."
}

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "[appwin-agent] Etape 2/5: recherche de Node.js..."
$nodeCmd = (Get-Command node -ErrorAction Stop).Source
Write-Host "[appwin-agent]   Node: $nodeCmd"
$agentEntry = Join-Path $agentDir "agent-worker.js"

if (-not (Test-Path $agentEntry)) {
  throw "agent-worker.js introuvable dans $agentDir"
}

$envRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
Write-Host "[appwin-agent] Etape 3/5: creation / mise a jour du service $ServiceName ..."

$binaryPath = "`"$nodeCmd`" `"$agentEntry`""

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

try {
  New-Service `
    -Name $ServiceName `
    -BinaryPathName $binaryPath `
    -DisplayName "AxiaFlex Print Agent" `
    -StartupType Automatic `
    -Description "AxiaFlex local print agent" `
    -ErrorAction Stop | Out-Null
} catch {
  throw "Echec creation service ($ServiceName): $($_.Exception.Message)"
}

Start-Sleep -Milliseconds 400
$serviceKey = Get-Item -Path $envRegPath -ErrorAction SilentlyContinue
if (-not $serviceKey) {
  throw "Cle registre service introuvable apres creation ($envRegPath)."
}

Write-Host "[appwin-agent] Etape 4/5: ecriture des variables d'environnement du service..."
New-ItemProperty -Path $envRegPath -Name "Environment" -PropertyType MultiString -Value @(
  "CLOUD_API_URL=$CloudApiUrl"
  "AGENT_MASTER_TOKEN=$AgentMasterToken"
  "TERMINAL_ALIAS=$TerminalAlias"
  "SITE_NAME=$SiteName"
  "AGENT_POLL_MS=$PollMs"
) -Force | Out-Null

Write-Host "[appwin-agent] Etape 5/5: demarrage du service..."
Start-Service -Name $ServiceName
Get-Service -Name $ServiceName | Select-Object Name, Status, StartType
Write-Host "[appwin-agent] Termine."
