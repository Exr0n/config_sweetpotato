#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title insert normal timestamp
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🤖

# Documentation:
# @raycast.author Exr0n

# Create timestamp: YYYY-MM-DD-HH:MM
TIMESTAMP="$(date +%Y-%m-%d-%H:%M)"

# Use clipboard with proper handling of non-text content
osascript -e "
delay 0.03

set the clipboard to \"$TIMESTAMP\"
tell application \"System Events\"
    keystroke \"v\" using command down
end tell
"
