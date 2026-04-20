$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:3003"

Write-Host "1) GET /fiscal/manifest" -ForegroundColor Cyan
$manifest = Invoke-RestMethod -Method GET -Uri "$base/fiscal/manifest"
$manifest | ConvertTo-Json -Depth 8

Write-Host "`n2) POST /fiscal/checkout" -ForegroundColor Cyan
$checkoutBody = @{
  terminalId    = "POS-01"
  cashierId     = "u1"
  cashierName   = "Admin AxiaFlex"
  paymentMethod = "CASH"
  total         = 151.400
  discount      = 0
  timbre        = 1.000
  items = @(
    @{
      productId = "P001"
      name      = "Produit A"
      quantity  = 2
      unitPrice = 50.000
      lineTotal = 100.000
    },
    @{
      productId = "P002"
      name      = "Produit B"
      quantity  = 1
      unitPrice = 50.400
      lineTotal = 50.400
    }
  )
} | ConvertTo-Json -Depth 10

$checkout = Invoke-RestMethod -Method POST -Uri "$base/fiscal/checkout" -ContentType "application/json" -Body $checkoutBody
$checkout | ConvertTo-Json -Depth 10

$ticketId = $checkout.ticketId
$orderId  = $checkout.orderId

Write-Host "`n3) GET /fiscal/transactions" -ForegroundColor Cyan
$transactions = Invoke-RestMethod -Method GET -Uri "$base/fiscal/transactions"
$transactions | ConvertTo-Json -Depth 10

Write-Host "`n4) GET /fiscal/transactions/$ticketId" -ForegroundColor Cyan
$tx = Invoke-RestMethod -Method GET -Uri "$base/fiscal/transactions/$ticketId"
$tx | ConvertTo-Json -Depth 10

Write-Host "`n5) GET /pos/orders/$orderId/fiscal-status" -ForegroundColor Cyan
$orderFiscal = Invoke-RestMethod -Method GET -Uri "$base/pos/orders/$orderId/fiscal-status"
$orderFiscal | ConvertTo-Json -Depth 10

Write-Host "`n6) POST /fiscal/transactions/$ticketId/retry-sync" -ForegroundColor Cyan
$retry = Invoke-RestMethod -Method POST -Uri "$base/fiscal/transactions/$ticketId/retry-sync"
$retry | ConvertTo-Json -Depth 10

Write-Host "`nTests terminés ✅" -ForegroundColor Green