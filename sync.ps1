$ErrorActionPreference = "Stop"

Write-Host "=== Mota7 Project - Git Sync ===" -ForegroundColor Cyan
Write-Host ""

git add .

$hasChanges = git diff --cached --quiet 2>&1; $LASTEXITCODE -ne 0
if ($LASTEXITCODE -eq 0) {
    Write-Host "No changes to commit." -ForegroundColor Yellow
    exit 0
}

Write-Host "Changed files:" -ForegroundColor Green
git diff --cached --stat
Write-Host ""

$msg = if ($args.Count -gt 0) { $args[0] } else { "Auto-sync $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
git commit -m $msg

git pull origin main --rebase --autostash
git push origin main

Write-Host ""
Write-Host "Done! All changes pushed to origin/main." -ForegroundColor Green
