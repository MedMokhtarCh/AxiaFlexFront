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
  [string]$ServiceName = "AxiaPrintersPrintAgent"
)

$ErrorActionPreference = "Stop"

function Test-IsElevated {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = [Security.Principal.WindowsPrincipal]::new($id)
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

function Resolve-NodeCommand {
  $candidates = @()
  try {
    $fromCmd = (Get-Command node -ErrorAction Stop).Source
    if ($fromCmd) { $candidates += $fromCmd }
  } catch {}
  $candidates += @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe")
  )
  foreach ($p in $candidates) {
    try {
      if ($p -and (Test-Path $p)) { return $p }
    } catch {}
  }
  return $null
}

function Escape-BatchEnv([string]$s) {
  if ($null -eq $s) { return "" }
  return ($s -replace '%', '%%')
}

$elevated = (Test-IsElevated) -or (Test-NetSessionOk)
Write-Host "[axiaprinters-agent] Etape 1/5: verification droits administrateur..."
Write-Host "[axiaprinters-agent]   - SID S-1-5-32-544 (Administrateurs): $(Test-IsElevated)"
Write-Host "[axiaprinters-agent]   - net session: $(Test-NetSessionOk)"
if (-not $elevated) {
  Write-Host "[axiaprinters-agent] ATTENTION: privileges administrateur recommandes pour la tache planifiee."
}

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "[axiaprinters-agent] Etape 2/5: recherche de Node.js..."
$nodeCmd = Resolve-NodeCommand
if (-not $nodeCmd) {
  throw "Node.js introuvable. Relancez l'installateur AxiaPrinters (il installe Node automatiquement) ou installez Node LTS puis recommencez."
}
Write-Host "[axiaprinters-agent]   Node: $nodeCmd"
$agentEntry = Join-Path $agentDir "agent-worker.js"

if (-not (Test-Path $agentEntry)) {
  throw "agent-worker.js introuvable dans $agentDir"
}

$taskName = $ServiceName
Write-Host "[axiaprinters-agent] Etape 3/5: nettoyage ancien service Windows (erreur 1053 si Node en service)..."
$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
  if ($existingSvc.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  }
  sc.exe delete $ServiceName 2>$null | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host "[axiaprinters-agent] Etape 4/5: tache planifiee demarrage machine (remplace service Windows)..."
try {
  $oldTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($oldTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Start-Sleep -Seconds 1
  }
} catch {}

$launchCmd = Join-Path $agentDir "axiaflex-agent-launch.cmd"
$c = Escape-BatchEnv $CloudApiUrl
$t = Escape-BatchEnv $AgentMasterToken
$a = Escape-BatchEnv $TerminalAlias
$sn = Escape-BatchEnv $SiteName
$pm = [int][Math]::Max(1500, $PollMs)

$bat = @"
@echo off
setlocal
set "CLOUD_API_URL=$c"
set "AGENT_MASTER_TOKEN=$t"
set "TERMINAL_ALIAS=$a"
set "SITE_NAME=$sn"
set "AGENT_POLL_MS=$pm"
set "AGENT_HOME=%LOCALAPPDATA%\AxiaPrinters\AppWinAgent"
if not exist "%AGENT_HOME%" mkdir "%AGENT_HOME%"
cd /d "%~dp0"
"$nodeCmd" --trace-uncaught "%~dp0agent-worker.js" >> "%AGENT_HOME%\worker.log" 2>&1
exit /b %ERRORLEVEL%
"@
[System.IO.File]::WriteAllText($launchCmd, $bat, [System.Text.Encoding]::ASCII)
Write-Host "[axiaprinters-agent]   Fichier lancement: $launchCmd"
Write-Host "[axiaprinters-agent]   Log worker: %LOCALAPPDATA%\AxiaPrinters\AppWinAgent\worker.log"

$action = New-ScheduledTaskAction -Execute $launchCmd -WorkingDirectory $agentDir
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "[axiaprinters-agent]   Tache enregistree: $taskName (utilisateur $currentUser, au logon)"

Write-Host "[axiaprinters-agent] Etape 5/5: demarrage immediat de la tache (test)..."
try {
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
  Start-Sleep -Seconds 2
  $info = Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo
  Write-Host "[axiaprinters-agent] Derniere execution: $($info.LastRunTime) Resultat: $($info.LastTaskResult)"
} catch {
  Write-Host "[axiaprinters-agent] AVIS: impossible de lancer la tache maintenant: $($_.Exception.Message)"
  Write-Host "[axiaprinters-agent] Redemarrez le PC ou lancez l'agent depuis AxiaPrinters (Demarrer agent)."
}

Write-Host "[axiaprinters-agent] Termine (demarrage auto = tache planifiee, pas service Windows)."
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
