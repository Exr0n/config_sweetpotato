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

CURRENT_SESSION="$(< "$BASE_DIR/session_name")"
MINIMIZE="$(cat "$BASE_DIR/sessions/$CURRENT_SESSION/window_id_"* 2>/dev/null)"
FOCUS="$(cat "$BASE_DIR/sessions/$1/window_id_"* 2>/dev/null)"

read -r -a MINIMIZE_IDS <<< "$MINIMIZE"
read -r -a FOCUS_IDS <<< "$FOCUS"
EXCLUDED_APPS_REGEX='^(Arc|ChatGPT|Toggl Track|Notes|Discord|Mail|Messages|Fantastical)$'

in_list() {
    local needle="$1"
    shift
    for candidate in "$@"; do
        [[ "$candidate" == "$needle" ]] && return 0
    done
    return 1
}

echo "$1" > "$BASE_DIR/session_name"

for window_id in "${FOCUS_IDS[@]}"; do
    yabai -m window --deminimize "$window_id" > /dev/null 2>&1
    if ! in_list "$window_id" "${MINIMIZE_IDS[@]}"; then
        yabai -m window --focus "$window_id" &
    fi
done

WINDOWS_INFO="$(yabai -m query --windows | jq -r '.[] | "\(.id)\t\(.app)"')"

while IFS=$'\t' read -r window_id window_app; do
    [[ -z "$window_id" ]] && continue

    if in_list "$window_id" "${FOCUS_IDS[@]}"; then
        continue
    fi

    if [[ "$window_app" =~ $EXCLUDED_APPS_REGEX ]]; then
        continue
    fi

    yabai -m window --minimize "$window_id" > /dev/null 2>&1 &
done <<< "$WINDOWS_INFO"

echo "Focused session $1 with $(ls $BASE_DIR/sessions/$1/window_id_* | wc -l | xargs) windows"

# start toggl if a name/project is provided
# if [[ -s "$SCRIPT_DIR/hooks/$1/toggl_start_args.txt" ]]; then
#     /opt/miniconda3/bin/toggl --config "$HOME/.config/.togglrc" start $(< "$SCRIPT_DIR/hooks/$1/toggl_start_args.txt" | xargs)
# fi
