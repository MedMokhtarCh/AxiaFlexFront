$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "AxiaFlexPrintAgent"
)

Write-Host "[agent] Suppression du service $ServiceName ..."

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "[agent] Service non trouvé."
  exit 0
}

if ($existing.Status -eq "Running") {
  Stop-Service -Name $ServiceName -Force
}

sc.exe delete $ServiceName | Out-Null
Start-Sleep -Seconds 1

Write-Host "[agent] Service supprimé."
