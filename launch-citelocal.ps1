# Launches CiteLocal: starts the server only if it isn't already running, then opens the browser.
$ErrorActionPreference = 'SilentlyContinue'
Set-Location -LiteralPath $PSScriptRoot

$listening = Get-NetTCPConnection -LocalPort 4747 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  # wait (max ~10s) for it to answer before opening the browser
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-WebRequest -Uri 'http://localhost:4747' -UseBasicParsing -TimeoutSec 1 | Out-Null; break } catch {}
  }
}
Start-Process 'http://localhost:4747'
