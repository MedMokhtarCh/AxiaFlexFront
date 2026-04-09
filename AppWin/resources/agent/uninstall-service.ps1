param(
  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "AxiaFlexPrintAgent"
)

$ErrorActionPreference = "Stop"

Write-Host "[appwin-agent] Suppression tache planifiee $ServiceName ..."
try {
  $t = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
  if ($t) {
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Write-Host "[appwin-agent] Tache planifiee supprimee."
  } else {
    Write-Host "[appwin-agent] Tache planifiee introuvable."
  }
} catch {
  Write-Host "[appwin-agent] Avertissement tache: $($_.Exception.Message)"
}

Write-Host "[appwin-agent] Suppression eventuelle ancien service Windows $ServiceName ..."
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 1
  Write-Host "[appwin-agent] Ancien service supprime."
} else {
  Write-Host "[appwin-agent] Pas d'ancien service Windows."
}

Write-Host "[appwin-agent] OK."
