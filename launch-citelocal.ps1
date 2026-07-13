# Launches CiteLocal: starts the server only if it isn't already running, then opens
# it in Chrome or Firefox specifically — never the system-default browser (Edge).
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

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$firefox = @(
  "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
  "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
  Start-Process -FilePath $chrome -ArgumentList 'http://localhost:4747'
} elseif ($firefox) {
  Start-Process -FilePath $firefox -ArgumentList 'http://localhost:4747'
} else {
  Start-Process 'http://localhost:4747'
}
