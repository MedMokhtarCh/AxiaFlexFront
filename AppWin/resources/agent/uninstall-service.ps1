param(
  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "AxiaPrintersPrintAgent"
)

$ErrorActionPreference = "Stop"

Write-Host "[axiaprinters-agent] Suppression tache planifiee $ServiceName ..."
try {
  $t = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
  if ($t) {
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Write-Host "[axiaprinters-agent] Tache planifiee supprimee."
  } else {
    Write-Host "[axiaprinters-agent] Tache planifiee introuvable."
  }
} catch {
  Write-Host "[axiaprinters-agent] Avertissement tache: $($_.Exception.Message)"
}

Write-Host "[axiaprinters-agent] Suppression eventuelle ancien service Windows $ServiceName ..."
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 1
  Write-Host "[axiaprinters-agent] Ancien service supprime."
} else {
  Write-Host "[axiaprinters-agent] Pas d'ancien service Windows."
}

Write-Host "[axiaprinters-agent] OK."
