#!/bin/sh
# Install GitHub CLI and configure HTTPS Git credentials. Never store tokens here.
set -eu
export PATH="/opt/homebrew/bin:$PATH"
case "${1:-}" in
  --check) check_only=1 ;;
  "") check_only=0 ;;
  *) echo "Usage: $0 [--check]" >&2; exit 2 ;;
esac
if ! command -v gh >/dev/null 2>&1; then
  if [ "$check_only" = 1 ]; then
    echo "GitHub CLI missing. Run brew install gh, then this script." >&2
    exit 1
  fi
  brew install gh
fi
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  if [ "$check_only" = 1 ]; then
    echo "GitHub is not signed in. Run ~/.config/git/setup-github.sh in a terminal." >&2
    exit 1
  fi
  # Device approval opens a browser. Do not run this in unattended provisioning.
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git --hostname github.com
gh api user --jq '"GitHub authenticated as " + .login'
