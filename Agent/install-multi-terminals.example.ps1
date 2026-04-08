$ErrorActionPreference = "Stop"

# Exemple de déploiement multi-postes AxiaFlex Print Agent.
# A exécuter SUR CHAQUE MACHINE locale, en PowerShell Administrateur.
#
# 1) Adapter les variables ci-dessous
# 2) Décommenter le bloc correspondant au poste
# 3) Exécuter le script

$CloudApiUrl = "https://your-cloud-api.example.com"
$AgentMasterToken = "change-me"
$SiteName = "SITE-A"
$PollMs = 3000

$InstallScript = Join-Path $PSScriptRoot "install-service.ps1"
if (-not (Test-Path $InstallScript)) {
  throw "install-service.ps1 introuvable dans $PSScriptRoot"
}

Write-Host "=== AxiaFlex multi-postes (exemple) ==="
Write-Host "Machine courante: $env:COMPUTERNAME"
Write-Host "Choisis le bloc correspondant et décommente-le."

# --- CAISSE 1 ---
# & $InstallScript `
#   -CloudApiUrl $CloudApiUrl `
#   -AgentMasterToken $AgentMasterToken `
#   -TerminalAlias "TERMINAL-1" `
#   -SiteName $SiteName `
#   -PollMs $PollMs

# --- CAISSE 2 ---
# & $InstallScript `
#   -CloudApiUrl $CloudApiUrl `
#   -AgentMasterToken $AgentMasterToken `
#   -TerminalAlias "TERMINAL-2" `
#   -SiteName $SiteName `
#   -PollMs $PollMs

# --- PC CUISINE ---
# & $InstallScript `
#   -CloudApiUrl $CloudApiUrl `
#   -AgentMasterToken $AgentMasterToken `
#   -TerminalAlias "KITCHEN-PC-1" `
#   -SiteName $SiteName `
#   -PollMs $PollMs

Write-Host ""
Write-Host "Après installation, vérifie:"
Write-Host "  Get-Service AxiaFlexPrintAgent"
