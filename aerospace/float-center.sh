#!/usr/bin/env bash
# alt+shift+v: toggle a "centered float" for the focused window at golden-ratio (phi) size.
# Mirrors old skhd alt+shift-v. AeroSpace can't position floating windows, so geometry is
# set via System Events (needs Accessibility/Automation permission, granted once).
set -uo pipefail
STATE="$HOME/.caches/aerospace/centered_window"
mkdir -p "$(dirname "$STATE")"

wid="$(aerospace list-windows --focused --format '%{window-id}' 2>/dev/null)"
[ -z "$wid" ] && exit 0

# already centered-floated by us -> revert to tiling
if [ -f "$STATE" ] && [ "$(cat "$STATE" 2>/dev/null)" = "$wid" ]; then
  aerospace layout tiling
  rm -f "$STATE"
  exit 0
fi

aerospace layout floating

osascript <<'OSA'
set phi to 1.618
tell application "Finder" to set b to bounds of window of desktop
set sw to (item 3 of b) - (item 1 of b)
set sh to (item 4 of b) - (item 2 of b)
if sw >= 2000 and sh >= 2000 then
  set w to sw / 3
else
  set w to sw / 2
end if
set h to w / phi
set x to (item 1 of b) + (sw - w) / 2
set y to (item 2 of b) + (sh - h) / 2
tell application "System Events"
  set p to first application process whose frontmost is true
  set win to front window of p
  set position of win to {x as integer, y as integer}
  set size of win to {w as integer, h as integer}
end tell
OSA

echo "$wid" > "$STATE"
