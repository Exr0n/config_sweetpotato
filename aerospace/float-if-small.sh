#!/usr/bin/env bash
# Float the newly-detected window ($AEROSPACE_WINDOW_ID) if it's smaller than
# 1/3 x 1/3 of the monitor it's on — i.e. a tiny popup (iCloud Passwords sheet,
# auth dialogs) that AeroSpace would otherwise stretch/"cook". Otherwise leave it.
# Re-tile a floated window manually with alt-backslash.
#
# AeroSpace window-id == CoreGraphics window number, so win-vs-screen.js reads the
# exact bounds of THIS window regardless of focus/Space (no frontmost guessing).
set -uo pipefail

WID="${AEROSPACE_WINDOW_ID:-}"
[[ -n "$WID" ]] || exit 0

sleep 0.15  # let AeroSpace finish its default layout pass before measuring
read -r w h sw sh <<<"$(osascript -l JavaScript "$HOME/.config/aerospace/win-vs-screen.js" "$WID" 2>/dev/null)"
[[ -n "${sh:-}" && "${sw:-0}" -gt 0 ]] || exit 0

# float only if BOTH dimensions are under a third of the screen
if (( w * 3 < sw && h * 3 < sh )); then
  aerospace layout --window-id "$WID" floating
fi
