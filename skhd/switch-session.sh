#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Switch Session
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🌐
# @raycast.argument1 { "type": "text", "placeholder": "Session Name" }

# Documentation:
# @raycast.author Exr0n

SCRIPT_DIR="$HOME/.config/skhd"
source "$SCRIPT_DIR/util.sh"

MINIMIZE="$(cat "$BASE_DIR/sessions/$(< "$BASE_DIR/session_name")/window_id_"*)"
FOCUS="$(cat "$BASE_DIR/sessions/$1/window_id_"*)"

echo "$1" > "$BASE_DIR/session_name"

for window_id in $FOCUS; do
    if [[ "$MINIMIZE" != *"$window_id"* ]]; then
        yabai -m window --focus "$window_id" &
    fi
done

for window_id in $MINIMIZE; do
    if [[ "$FOCUS" != *"$window_id"* ]]; then
        yabai -m window --minimize "$window_id" > /dev/null 2>&1 &
    fi
done

echo "Focused session $1 with $(ls $BASE_DIR/sessions/$1/window_id_* | wc -l | xargs) windows"

# start toggl if a name/project is provided
# if [[ -s "$SCRIPT_DIR/hooks/$1/toggl_start_args.txt" ]]; then
#     /opt/miniconda3/bin/toggl --config "$HOME/.config/.togglrc" start $(< "$SCRIPT_DIR/hooks/$1/toggl_start_args.txt" | xargs)
# fi
