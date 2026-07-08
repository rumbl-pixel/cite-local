# Launches CiteLocal as a desktop app and prepares first-run dependencies if needed.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'npm was not found. Install Node.js first, then run this launcher again.'
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  npm install
}

npm run bootstrap
npm run desktop
