#!/usr/bin/env bash
# Loads (or reloads) Arc as an unpacked extension in Google Chrome on macOS.
#
#   ./install.sh
#
# Chrome does not allow scripts to install extensions, so the last step is two
# clicks in chrome://extensions. This script does everything else: it works out
# whether Arc is already loaded from this folder, puts the folder path on the
# clipboard, and opens the extensions page.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME_APP="${CHROME_APP:-Google Chrome}"
CHROME_DATA="$HOME/Library/Application Support/Google/Chrome"

if [ ! -d "/Applications/$CHROME_APP.app" ]; then
  echo "Could not find /Applications/$CHROME_APP.app (set CHROME_APP to override)." >&2
  exit 1
fi

# Find profiles that already have Arc loaded from this directory.
installed=()
if [ -d "$CHROME_DATA" ]; then
  for prefs in "$CHROME_DATA"/*/"Secure Preferences" "$CHROME_DATA"/*/Preferences; do
    [ -f "$prefs" ] || continue
    if grep -q "\"path\":\"$DIR\"" "$prefs" 2>/dev/null || grep -q "\"path\": \"$DIR\"" "$prefs" 2>/dev/null; then
      profile="$(basename "$(dirname "$prefs")")"
      case " ${installed[*]-} " in *" $profile "*) ;; *) installed+=("$profile") ;; esac
    fi
  done
fi

printf '%s' "$DIR" | pbcopy

if [ "${#installed[@]}" -gt 0 ]; then
  echo "Arc is already loaded from this folder in: ${installed[*]}"
  echo
  echo "To pick up the latest code, either:"
  echo "  • open the palette (Cmd+Shift+K), type 'reload', press Enter, or"
  echo "  • click the reload (↻) icon on the Arc card in the extensions page that just opened."
else
  echo "Arc is not loaded yet. In the extensions page that just opened:"
  echo "  1. Turn on 'Developer mode' (top right)."
  echo "  2. Click 'Load unpacked'."
  echo "  3. In the file dialog press Cmd+Shift+G, then Cmd+V (the folder path is on your clipboard), then Enter."
  echo "  4. Click 'Select'."
  echo
  echo "Then set the shortcuts at chrome://extensions/shortcuts if Chrome did not assign them."
fi

open -a "$CHROME_APP" "chrome://extensions/"
