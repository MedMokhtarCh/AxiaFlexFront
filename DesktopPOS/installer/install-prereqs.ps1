$ErrorActionPreference = "Stop"

param(
  [string]$AppDir = "",
  [switch]$SkipNodeInstall
)

$script:InstallerLog = Join-Path $env:TEMP "desktoppos-installer-prereqs.log"
if (-not [string]::IsNullOrWhiteSpace($AppDir)) {
  try {
    $script:InstallerLog = Join-Path $AppDir "installer-prereqs.log"
  } catch {}
}
try {
  Start-Transcript -Path $script:InstallerLog -Force | Out-Null
} catch {}

function Test-Command([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Select-CompanyType {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Configuration initiale DesktopPOS"
  $form.StartPosition = "CenterScreen"
  $form.Width = 460
  $form.Height = 200
  $form.TopMost = $true

  $label = New-Object System.Windows.Forms.Label
  $label.Text = "Choisir le type de societe:"
  $label.Left = 20
  $label.Top = 20
  $label.Width = 380
  $form.Controls.Add($label)

  $combo = New-Object System.Windows.Forms.ComboBox
  $combo.Left = 20
  $combo.Top = 48
  $combo.Width = 400
  $combo.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
  $null = $combo.Items.Add("RESTAURANT_CAFE")
  $null = $combo.Items.Add("FAST_FOOD")
  $null = $combo.Items.Add("SHOP_SINGLE")
  $null = $combo.Items.Add("SHOP_MULTI")
  $combo.SelectedIndex = 0
  $form.Controls.Add($combo)

  $okButton = New-Object System.Windows.Forms.Button
  $okButton.Text = "OK"
  $okButton.Left = 250
  $okButton.Top = 95
  $okButton.Width = 80
  $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Controls.Add($okButton)

  $cancelButton = New-Object System.Windows.Forms.Button
  $cancelButton.Text = "Annuler"
  $cancelButton.Left = 340
  $cancelButton.Top = 95
  $cancelButton.Width = 80
  $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $form.Controls.Add($cancelButton)

  $form.AcceptButton = $okButton
  $form.CancelButton = $cancelButton

  $result = $form.ShowDialog()
  if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Configuration annulee par l'utilisateur."
  }
  return String($combo.SelectedItem || "RESTAURANT_CAFE")
}

function Ask-DbConfigWinForms {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Configuration PostgreSQL"
  $form.StartPosition = "CenterScreen"
  $form.Width = 520
  $form.Height = 310
  $form.TopMost = $true

  $labels = @("DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME")
  $defaults = @("localhost", "5432", "postgres", "postgres", "posdb")
  $textBoxes = @{}

  for ($i = 0; $i -lt $labels.Count; $i++) {
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $labels[$i]
    $lbl.Left = 20
    $lbl.Top = 24 + ($i * 38)
    $lbl.Width = 130
    $form.Controls.Add($lbl)

    $tb = New-Object System.Windows.Forms.TextBox
    $tb.Left = 160
    $tb.Top = 20 + ($i * 38)
    $tb.Width = 320
    $tb.Text = $defaults[$i]
    if ($labels[$i] -eq "DB_PASSWORD") {
      $tb.UseSystemPasswordChar = $true
    }
    $form.Controls.Add($tb)
    $textBoxes[$labels[$i]] = $tb
  }

  $okButton = New-Object System.Windows.Forms.Button
  $okButton.Text = "OK"
  $okButton.Left = 310
  $okButton.Top = 220
  $okButton.Width = 80
  $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Controls.Add($okButton)

  $cancelButton = New-Object System.Windows.Forms.Button
  $cancelButton.Text = "Annuler"
  $cancelButton.Left = 400
  $cancelButton.Top = 220
  $cancelButton.Width = 80
  $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $form.Controls.Add($cancelButton)

  $form.AcceptButton = $okButton
  $form.CancelButton = $cancelButton
  $result = $form.ShowDialog()
  if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Configuration DB annulee par l'utilisateur."
  }

  return @{
    DB_HOST = String($textBoxes["DB_HOST"].Text || "localhost").Trim()
    DB_PORT = String($textBoxes["DB_PORT"].Text || "5432").Trim()
    DB_USER = String($textBoxes["DB_USER"].Text || "postgres").Trim()
    DB_PASSWORD = String($textBoxes["DB_PASSWORD"].Text || "postgres").Trim()
    DB_NAME = String($textBoxes["DB_NAME"].Text || "posdb").Trim()
  }
}

function Ask-AdminConfigWinForms {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Configuration Admin"
  $form.StartPosition = "CenterScreen"
  $form.Width = 460
  $form.Height = 220
  $form.TopMost = $true

  $nameLabel = New-Object System.Windows.Forms.Label
  $nameLabel.Text = "Nom admin"
  $nameLabel.Left = 20
  $nameLabel.Top = 24
  $nameLabel.Width = 120
  $form.Controls.Add($nameLabel)

  $nameBox = New-Object System.Windows.Forms.TextBox
  $nameBox.Left = 150
  $nameBox.Top = 20
  $nameBox.Width = 280
  $nameBox.Text = "Admin"
  $form.Controls.Add($nameBox)

  $pinLabel = New-Object System.Windows.Forms.Label
  $pinLabel.Text = "PIN admin (4-8 chiffres)"
  $pinLabel.Left = 20
  $pinLabel.Top = 68
  $pinLabel.Width = 140
  $form.Controls.Add($pinLabel)

  $pinBox = New-Object System.Windows.Forms.TextBox
  $pinBox.Left = 150
  $pinBox.Top = 64
  $pinBox.Width = 280
  $pinBox.Text = "1234"
  $pinBox.UseSystemPasswordChar = $true
  $form.Controls.Add($pinBox)

  $okButton = New-Object System.Windows.Forms.Button
  $okButton.Text = "OK"
  $okButton.Left = 260
  $okButton.Top = 120
  $okButton.Width = 80
  $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Controls.Add($okButton)

  $cancelButton = New-Object System.Windows.Forms.Button
  $cancelButton.Text = "Annuler"
  $cancelButton.Left = 350
  $cancelButton.Top = 120
  $cancelButton.Width = 80
  $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $form.Controls.Add($cancelButton)

  $form.AcceptButton = $okButton
  $form.CancelButton = $cancelButton
  $result = $form.ShowDialog()
  if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Configuration Admin annulee par l'utilisateur."
  }

  $pin = String($pinBox.Text || "1234").Trim()
  if ($pin -notmatch '^\d{4,8}$') {
    throw "PIN admin invalide. Utiliser 4 a 8 chiffres."
  }
  return @{
    adminName = String($nameBox.Text || "Admin").Trim()
    adminPin = $pin
  }
}

function Install-WithWinget([string[]]$ids) {
  foreach ($id in $ids) {
    try {
      & winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
      if ($LASTEXITCODE -eq 0) { return $true }
    } catch {}
  }
  return $false
}

function Ensure-Node {
  if ($SkipNodeInstall) {
    Write-Host "[setup] Skip Node.js install (mode runtime installer)."
    return
  }
  if (Test-Command "node") { return }
  if (Test-Command "winget") {
    if (Install-WithWinget @("OpenJS.NodeJS.LTS", "OpenJS.NodeJS")) { return }
  }
  if (Test-Command "choco") {
    choco install nodejs-lts -y
    if ($LASTEXITCODE -eq 0) { return }
  }
  throw "Node.js installation impossible."
}

function Ensure-Postgres {
  if (Test-Command "psql") { return }
  if (Test-Command "winget") {
    Install-WithWinget @("PostgreSQL.PostgreSQL.16", "PostgreSQL.PostgreSQL") | Out-Null
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
    throw "PostgreSQL installation impossible (psql introuvable apres tentative winget/choco)."
  }
}

function Ensure-PostgresService {
  $svc = Get-Service | Where-Object { $_.Name -like "postgresql*" } | Select-Object -First 1
  if (-not $svc) { return }
  if ($svc.Status -ne "Running") { Start-Service -Name $svc.Name }
  Set-Service -Name $svc.Name -StartupType Automatic
}

function Ensure-Database([hashtable]$dbConfig) {
  if (-not (Test-Command "psql")) { return }
  $env:PGPASSWORD = String($dbConfig.DB_PASSWORD)
  $exists = & psql -h $dbConfig.DB_HOST -p $dbConfig.DB_PORT -U $dbConfig.DB_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$($dbConfig.DB_NAME)';" 2>$null
  if (String($exists).Trim() -eq "1") { return }
  & psql -h $dbConfig.DB_HOST -p $dbConfig.DB_PORT -U $dbConfig.DB_USER -d postgres -c "CREATE DATABASE `"$($dbConfig.DB_NAME)`";" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Creation DB echouee (host=$($dbConfig.DB_HOST), port=$($dbConfig.DB_PORT), user=$($dbConfig.DB_USER), db=$($dbConfig.DB_NAME))."
  }
}

function Write-BackendEnv([string]$targetDir, [hashtable]$dbConfig) {
  if ([string]::IsNullOrWhiteSpace($targetDir)) { return }
  $backendDir = Join-Path $targetDir "backend"
  if (-not (Test-Path $backendDir)) { return }
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
}

function Write-PendingBootstrapConfig([string]$targetDir, [string]$companyType, [hashtable]$adminConfig) {
  if ([string]::IsNullOrWhiteSpace($targetDir)) { return }
  $backendDir = Join-Path $targetDir "backend"
  if (-not (Test-Path $backendDir)) { return }
  $pendingPath = Join-Path $backendDir "pending-bootstrap.json"
  $obj = @{
    companyType = $companyType
    adminName = String($adminConfig.adminName || "Admin").Trim()
    adminPin = String($adminConfig.adminPin || "1234").Trim()
    createdAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  $obj | ConvertTo-Json | Out-File -FilePath $pendingPath -Encoding UTF8
  Write-Host "[setup] Bootstrap differe configure: $pendingPath"
}

try {
  $companyType = Select-CompanyType
  $dbConfig = Ask-DbConfigWinForms
  $adminConfig = Ask-AdminConfigWinForms
  Ensure-Node
  Ensure-Postgres
  Ensure-PostgresService
  Ensure-Database -dbConfig $dbConfig
  Write-BackendEnv -targetDir $AppDir -dbConfig $dbConfig
  Write-PendingBootstrapConfig -targetDir $AppDir -companyType $companyType -adminConfig $adminConfig
  Write-Host "[setup] Prerequis et initialisation OK."
  try { Stop-Transcript | Out-Null } catch {}
  exit 0
} catch {
  Write-Host "[setup] ECHEC: $($_.Exception.Message)"
  Write-Host "[setup] Log: $script:InstallerLog"
  try { Stop-Transcript | Out-Null } catch {}
  exit 1
}
