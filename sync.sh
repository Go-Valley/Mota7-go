#!/bin/bash
set -e

echo "=== Mota7 Project — Git Sync ==="
echo ""

# Stage all changes
git add .

# Check if there are changes to commit
if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

# Show summary
echo "Changed files:"
git diff --cached --stat
echo ""

# Commit
MSG="${1:-Auto-sync $(date '+%Y-%m-%d %H:%M')}"
git commit -m "$MSG"

# Pull (rebase to keep history clean), then push
git pull origin main --rebase --autostash
git push origin main

echo ""
echo "Done! All changes pushed to origin/main."
