$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Command([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Ask-CompanyType {
  Write-Step "Choix du type de societe"
  Write-Host "1) FastFood"
  Write-Host "2) Restaurant cafe"
  Write-Host "3) Shop single"
  Write-Host "4) Shop multi"
  do {
    $choice = Read-Host "Choix [1-4] (defaut 2)"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "2" }
  } while ($choice -notin @("1", "2", "3", "4"))
  switch ($choice) {
    "1" { return "FAST_FOOD" }
    "2" { return "RESTAURANT_CAFE" }
    "3" { return "SHOP_SINGLE" }
    "4" { return "SHOP_MULTI" }
  }
}

function Ask-DbConfig {
  Write-Step "Configuration PostgreSQL"
  $dbHost = Read-Host "DB_HOST [localhost]"
  if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }
  $port = Read-Host "DB_PORT [5432]"
  if ([string]::IsNullOrWhiteSpace($port)) { $port = "5432" }
  $user = Read-Host "DB_USER [postgres]"
  if ([string]::IsNullOrWhiteSpace($user)) { $user = "postgres" }
  $password = Read-Host "DB_PASSWORD [postgres]"
  if ([string]::IsNullOrWhiteSpace($password)) { $password = "postgres" }
  $dbName = Read-Host "DB_NAME [posdb]"
  if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "posdb" }
  return @{
    DB_HOST = $dbHost.Trim()
    DB_PORT = $port.Trim()
    DB_USER = $user.Trim()
    DB_PASSWORD = $password.Trim()
    DB_NAME = $dbName.Trim()
  }
}

function Ask-AdminConfig {
  Write-Step "Configuration compte Admin"
  $adminName = Read-Host "Nom admin [Admin]"
  if ([string]::IsNullOrWhiteSpace($adminName)) { $adminName = "Admin" }
  do {
    $adminPin = Read-Host "PIN admin (4 a 8 chiffres) [1234]"
    if ([string]::IsNullOrWhiteSpace($adminPin)) { $adminPin = "1234" }
  } while ($adminPin -notmatch '^\d{4,8}$')
  return @{
    adminName = $adminName.Trim()
    adminPin = $adminPin.Trim()
  }
}

function Install-WithWinget([string[]]$ids) {
  foreach ($id in $ids) {
    try {
      & winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
      if ($LASTEXITCODE -eq 0) { return $true }
    } catch {
      # try next id
    }
  }
  return $false
}

function Ensure-Node {
  Write-Step "Verification Node.js"
  if (Test-Command "node") {
    Write-Host "Node detecte: $(node -v)" -ForegroundColor Green
    return
  }
  Write-Host "Node introuvable. Installation..." -ForegroundColor Yellow
  if (Test-Command "winget") {
    if (Install-WithWinget @("OpenJS.NodeJS.LTS", "OpenJS.NodeJS")) {
      Write-Host "Node installe avec winget." -ForegroundColor Green
      return
    }
  }
  if (Test-Command "choco") {
    choco install nodejs-lts -y
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Node installe avec Chocolatey." -ForegroundColor Green
      return
    }
  }
  throw "Impossible d'installer Node.js automatiquement. Installe-le puis relance ce script."
}

function Ensure-Postgres {
  Write-Step "Verification PostgreSQL"
  if (Test-Command "psql") {
    Write-Host "PostgreSQL detecte: $(psql --version)" -ForegroundColor Green
    return
  }

  Write-Host "PostgreSQL introuvable. Installation..." -ForegroundColor Yellow
  if (Test-Command "winget") {
    # Try common package IDs (depends on winget catalog version)
    if (Install-WithWinget @("PostgreSQL.PostgreSQL.16", "PostgreSQL.PostgreSQL")) {
      Write-Host "PostgreSQL installe avec winget." -ForegroundColor Green
    }
  }

  if (-not (Test-Command "psql") -and (Test-Command "choco")) {
    choco install postgresql --params "'/Password:postgres'" -y
  }

  if (-not (Test-Command "psql")) {
    $possibleBins = @(
      "C:\Program Files\PostgreSQL\16\bin",
      "C:\Program Files\PostgreSQL\15\bin",
      "C:\Program Files\PostgreSQL\14\bin"
    )
    foreach ($bin in $possibleBins) {
      if (Test-Path $bin) {
        $env:Path = "$bin;$env:Path"
        break
      }
    }
  }

  if (-not (Test-Command "psql")) {
    throw "Impossible d'installer PostgreSQL automatiquement. Installe-le puis relance ce script."
  }

  Write-Host "PostgreSQL detecte: $(psql --version)" -ForegroundColor Green
}

function Ensure-PostgresService {
  Write-Step "Demarrage service PostgreSQL"
  $svc = Get-Service | Where-Object { $_.Name -like "postgresql*" } | Select-Object -First 1
  if (-not $svc) {
    Write-Host "Service PostgreSQL non trouve. Verifie l'installation." -ForegroundColor Yellow
    return
  }
  if ($svc.Status -ne "Running") {
    Start-Service -Name $svc.Name
  }
  Set-Service -Name $svc.Name -StartupType Automatic
  Write-Host "Service actif: $($svc.Name)" -ForegroundColor Green
}

function Ensure-DesktopPosDependencies([string]$desktopPosDir) {
  Write-Step "Installation dependances DesktopPOS"
  Push-Location $desktopPosDir
  try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install DesktopPOS a echoue." }

    npm run install:standalone
    if ($LASTEXITCODE -ne 0) { throw "npm run install:standalone a echoue." }
  } finally {
    Pop-Location
  }
}

function Ensure-BackendEnv([string]$desktopPosDir, [hashtable]$dbConfig) {
  Write-Step "Configuration .env backend"
  $backendDir = Join-Path $desktopPosDir "backend"
  $envPath = Join-Path $backendDir ".env"
  $lines = @(
    "DB_HOST=$($dbConfig.DB_HOST)"
    "DB_PORT=$($dbConfig.DB_PORT)"
    "DB_USER=$($dbConfig.DB_USER)"
    "DB_PASSWORD=$($dbConfig.DB_PASSWORD)"
    "DB_NAME=$($dbConfig.DB_NAME)"
    "PORT=3000"
  )
  Set-Content -Path $envPath -Value ($lines -join "`r`n") -Encoding UTF8
  Write-Host ".env ecrit avec les parametres DB choisis." -ForegroundColor Green
}

function Ensure-Database([hashtable]$dbConfig) {
  Write-Step "Creation base de donnees $($dbConfig.DB_NAME) (si absente)"
  $env:PGPASSWORD = "$($dbConfig.DB_PASSWORD)"
  $exists = & psql -h $dbConfig.DB_HOST -p $dbConfig.DB_PORT -U $dbConfig.DB_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$($dbConfig.DB_NAME)';" 2>$null
  if ("$exists".Trim() -eq "1") {
    Write-Host "Base $($dbConfig.DB_NAME) deja existante." -ForegroundColor Green
    return
  }
  & psql -h $dbConfig.DB_HOST -p $dbConfig.DB_PORT -U $dbConfig.DB_USER -d postgres -c "CREATE DATABASE `"$($dbConfig.DB_NAME)`";" 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Base $($dbConfig.DB_NAME) creee." -ForegroundColor Green
  } else {
    Write-Host "Creation auto de la base echouee. Verifie les identifiants PostgreSQL." -ForegroundColor Yellow
  }
}

function Initialize-DesktopPosDatabase([string]$desktopPosDir, [string]$companyType, [hashtable]$adminConfig) {
  Write-Step "Initialisation base + parametres par defaut"
  Push-Location $desktopPosDir
  try {
    npm --prefix ./backend run db:init
    if ($LASTEXITCODE -ne 0) { throw "db:init a echoue." }
    npm --prefix ./backend run settings:init -- --companyType $companyType
    if ($LASTEXITCODE -ne 0) { throw "settings:init a echoue." }
    npm --prefix ./backend run admin:init -- --adminName "$($adminConfig.adminName)" --adminPin "$($adminConfig.adminPin)"
    if ($LASTEXITCODE -ne 0) { throw "admin:init a echoue." }
    Write-Host "Base initialisee et type societe applique: $companyType" -ForegroundColor Green
  } finally {
    Pop-Location
  }
}

try {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $companyType = Ask-CompanyType
  $dbConfig = Ask-DbConfig
  $adminConfig = Ask-AdminConfig
  if (-not (Test-Admin)) {
    Write-Host "Attention: lance ce script en Administrateur pour installer PostgreSQL/Node automatiquement." -ForegroundColor Yellow
  }
  Ensure-Node
  Ensure-Postgres
  Ensure-PostgresService
  Ensure-DesktopPosDependencies -desktopPosDir $scriptDir
  Ensure-BackendEnv -desktopPosDir $scriptDir -dbConfig $dbConfig
  Ensure-Database -dbConfig $dbConfig
  Initialize-DesktopPosDatabase -desktopPosDir $scriptDir -companyType $companyType -adminConfig $adminConfig

  Write-Host ""
  Write-Host "Installation one-click terminee." -ForegroundColor Green
  Write-Host "Tu peux lancer l'app avec: npm run dev (ou npm run build pour l'executable)." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "Echec setup DesktopPOS: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
