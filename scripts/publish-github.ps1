param(
  [string]$RepoName = "cite-local",
  [string]$Description = "Local, offline citation and bibliography manager"
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is not installed. Install it from https://cli.github.com/ and run this script again."
}

cmd /c "gh auth status >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
  Write-Host "GitHub CLI is not logged in. Run this first:" -ForegroundColor Yellow
  Write-Host "  gh auth login" -ForegroundColor Cyan
  exit 1
}

$existingRemote = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $existingRemote) {
  git push -u origin main
  exit $LASTEXITCODE
}

gh repo create $RepoName --public --source . --remote origin --push --description $Description
