#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title insert alphanumeric timestamp
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🤖

# Documentation:
# @raycast.author Exr0n

# Function to convert decimal to base 64
dec_to_base64() {
    local num=$1
    if [ $num -eq 0 ]; then
        echo "0"
        return
    fi
    
    local result=""
    local chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    
    while [ $num -gt 0 ]; do
        local remainder=$((num % 64))
        result="${chars:$remainder:1}$result"
        num=$((num / 64))
    done
    
    echo "$result"
}

# Get current date components
YEAR=$(date +%y)  # Last 2 digits of year
MONTH=$(date +%-m)  # Month (1-12)
DAY=$(date +%-d)    # Day (1-31)
HOUR=$(date +%-H)   # Hour (0-23)
MINUTE=$(date +%M)  # Minute (00-59)

# Convert to base 64
MONTH_B64=$(dec_to_base64 $MONTH)
DAY_B64=$(dec_to_base64 $DAY)
HOUR_B64=$(dec_to_base64 $HOUR)
MINUTE_B64=$(dec_to_base64 $MINUTE)

# Create timestamp: YYMDHM
TIMESTAMP="${YEAR}${MONTH_B64}${DAY_B64}.${HOUR_B64}${MINUTE_B64} "

# Use clipboard and wait for modifier release, then paste
osascript -e "
set savedClipboard to the clipboard
delay 0.05
set the clipboard to \"$TIMESTAMP\"
tell application \"System Events\"
    keystroke \"v\" using command down
end tell
delay 0.05
set the clipboard to savedClipboard
"

