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

for window_id in $(cat "$BASE_DIR/sessions/$(< "$BASE_DIR/session_name")/window_id_"*); do
    yabai -m window --minimize "$window_id"
done

echo "$1" > "$BASE_DIR/session_name"

for window_id in $(cat "$BASE_DIR/sessions/$1/window_id_"*); do
    yabai -m window --focus "$window_id"
done

echo "Focused session $1 with $(ls $BASE_DIR/sessions/$1/window_id_* | wc -l | xargs) windows"

# start toggl if a name/project is provided
# if [[ -s "$SCRIPT_DIR/hooks/$1/toggl_start_args.txt" ]]; then
#     /opt/miniconda3/bin/toggl --config "$HOME/.config/.togglrc" start $(< "$SCRIPT_DIR/hooks/$1/toggl_start_args.txt" | xargs)
# fi
