#!/bin/bash
# Swap the staged, already-patched Beeper (built by apply-search-patch.sh with BEEPER_APP=staged path) into /Applications and relaunch.
set -euo pipefail
S="$HOME/.local/share/beeper-patch/staged/Beeper Desktop.app"; APP="/Applications/Beeper Desktop.app"
[ -d "$S" ] || { echo "nothing staged"; exit 1; }
codesign --verify --strict "$S"
osascript -e 'quit app "Beeper Desktop"' >/dev/null 2>&1 || true
for _ in $(seq 1 40); do pgrep -f "$APP/Contents/MacOS/Beeper Desktop" >/dev/null || break; sleep 0.5; done
mv "$APP" "$APP.patched-$(date +%Y%m%d%H%M%S)"
cp -c -R -p "$S" "$APP"
open -a "$APP"; echo "swapped and relaunched"
