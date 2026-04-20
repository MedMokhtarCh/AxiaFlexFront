$ErrorActionPreference = "Stop"

Write-Host "[AxiaPrinters] Nettoyage cache download Electron..." -ForegroundColor Cyan
Remove-Item "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\electron\Cache" -Recurse -Force -ErrorAction SilentlyContinue

# Evite le mode multipart (plus sensible aux erreurs TLS sur certains reseaux)
$env:ELECTRON_BUILDER_DISABLE_MULTIPART_DOWNLOAD = "true"
# Evite la detection auto de certificat/signature (peut declencher winCodeSign)
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK = ""
$env:WIN_CSC_KEY_PASSWORD = ""

Write-Host "[AxiaPrinters] Build NSIS en mode safe..." -ForegroundColor Yellow
npx electron-builder --win nsis

if ($LASTEXITCODE -ne 0) {
  Write-Host "[AxiaPrinters] Echec build. Essayez via un autre reseau (hotspot 4G) ou sans inspection SSL proxy/antivirus." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "[AxiaPrinters] Build termine. Voir dossier dist/." -ForegroundColor Green
