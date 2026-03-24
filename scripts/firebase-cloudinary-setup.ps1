# OBSOLETE for Cloudinary delete: Firebase Cloud Functions need Blaze billing.
# Use cloudinary-delete-proxy/ instead (HTTP + Firebase ID token).
#
# This script only installs proxy dependencies locally.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Proxy = Join-Path $Root "cloudinary-delete-proxy"
if (-not (Test-Path -LiteralPath $Proxy)) {
  Write-Error "Missing folder: cloudinary-delete-proxy"
  exit 1
}
Set-Location -LiteralPath $Proxy
npm install
Write-Host "Done. Next:" -ForegroundColor Cyan
Write-Host "1) Deploy this folder to Render/Railway (start command: npm start)" -ForegroundColor Yellow
Write-Host "2) Set env vars from cloudinary-delete-proxy\env.sample.txt" -ForegroundColor Yellow
Write-Host "3) Set cloudinaryDeleteProxyUrl in Mota7 + mota7-admin environment.ts / prod" -ForegroundColor Yellow
