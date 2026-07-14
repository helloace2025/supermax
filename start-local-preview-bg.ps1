# Background local preview — no console window (won't die when you close a random terminal)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

$env:HTTPS_PROXY = if ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } else { "http://127.0.0.1:7897" }
$env:HTTP_PROXY  = if ($env:HTTP_PROXY)  { $env:HTTP_PROXY }  else { "http://127.0.0.1:7897" }

Get-NetTCPConnection -LocalPort 3789 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    Write-Host "Stopping old pid $_ on :3789"
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Seconds 1

$outLog = Join-Path $Root "server-local.log"
$errLog = Join-Path $Root "server-local.err.log"

$proc = Start-Process -FilePath "node.exe" `
  -ArgumentList "server/index.js" `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Write-Host "Started node pid=$($proc.Id)"

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if ($proc.HasExited) {
    Write-Host "Process exited early code=$($proc.ExitCode)"
    if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Tail 20 }
    if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Tail 20 }
    exit 1
  }
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3789/api/health" -UseBasicParsing -TimeoutSec 2
    if ($r.Content -match "ok") { $ok = $true; break }
  } catch {}
}

if (-not $ok) {
  Write-Host "Health check failed. Logs:"
  if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Tail 30 }
  if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Tail 30 }
  exit 1
}

Write-Host "OK  http://127.0.0.1:3789/  (pid $($proc.Id))"
Start-Process "http://127.0.0.1:3789/"
exit 0
