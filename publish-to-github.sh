#!/usr/bin/env bash
# Usage: ./publish-to-github.sh [repo-name]
# Creates a NEW private repository in your authenticated GitHub account.
set -euo pipefail

REPO_NAME="${1:-kolbevintage-vite}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. On Arch Linux: sudo pacman -S github-cli" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Authenticate first: gh auth login" >&2
  exit 1
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo "An 'origin' remote already exists. Review it before publishing." >&2
  exit 1
fi

gh repo create "$REPO_NAME" --private --source=. --remote=origin --push
