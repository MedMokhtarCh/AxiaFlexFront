$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "AxiaFlexPrintAgent"
)

Write-Host "[appwin-agent] Suppression du service $ServiceName ..."

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "[appwin-agent] Service non trouve."
  exit 0
}

if ($existing.Status -eq "Running") {
  Stop-Service -Name $ServiceName -Force
}

sc.exe delete $ServiceName | Out-Null
Start-Sleep -Seconds 1
Write-Host "[appwin-agent] Service supprime."
