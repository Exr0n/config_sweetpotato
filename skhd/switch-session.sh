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
CURRENT_SESSION_DIR="$BASE_DIR/sessions/$CURRENT_SESSION"
TARGET_SESSION_DIR="$BASE_DIR/sessions/$1"

mkdir -p "$CURRENT_SESSION_DIR" "$TARGET_SESSION_DIR"

EXCLUDED_APPS_REGEX='^(Arc|ChatGPT|Toggl Track|Notes|Discord|Mail|Messages|Fantastical)$'

find_window_files() {
    local dir="$1"
    find "$dir" -maxdepth 1 -type f -name 'window_id_*' 2>/dev/null
}

collect_ids() {
    local files=("$@")
    if ((${#files[@]})); then
        cat "${files[@]}" 2>/dev/null
    fi
}

# capture current session windows (excluding globally excluded apps) before switching away
TAGGED_FILES=($(find_window_files "$CURRENT_SESSION_DIR"))
TAGGED_IDS="$(collect_ids "${TAGGED_FILES[@]}" | sed '/^$/d')"
TAGGED_JSON="$(printf '%s\n' $TAGGED_IDS | jq -R . | jq -s 'map(select(length>0))')"

CURRENT_WINDOWS="$(yabai -m query --windows | jq -r \
    --arg re "$EXCLUDED_APPS_REGEX" \
    --argjson tagged "${TAGGED_JSON:-[]}" '
        ($tagged | map(tostring)) as $t
        | map(
            select(
                (.app | test($re) | not)
                and ((.["is-minimized"] // .minimized // 0) == 0)
                and ((.id | tostring) as $id | ($t | index($id)) | not)
            )
        ) | .[].id
    ')"
printf "%s\n" "$CURRENT_WINDOWS" | sed '/^$/d' | sort -u > "$CURRENT_SESSION_DIR/all_windows"

MINIMIZE_FILES=($(find_window_files "$CURRENT_SESSION_DIR"))
FOCUS_FILES=($(find_window_files "$TARGET_SESSION_DIR"))

[[ -f "$CURRENT_SESSION_DIR/all_windows" ]] && MINIMIZE_FILES+=("$CURRENT_SESSION_DIR/all_windows")
[[ -f "$TARGET_SESSION_DIR/all_windows" ]] && FOCUS_FILES+=("$TARGET_SESSION_DIR/all_windows")

MINIMIZE="$(collect_ids "${MINIMIZE_FILES[@]}" | sort -u)"
FOCUS="$(collect_ids "${FOCUS_FILES[@]}" | sort -u)"

IFS=$'\n' read -r -d '' -a MINIMIZE_IDS < <(printf "%s\n" "$MINIMIZE" | sed '/^$/d' && printf '\0')
IFS=$'\n' read -r -d '' -a FOCUS_IDS < <(printf "%s\n" "$FOCUS" | sed '/^$/d' && printf '\0')

in_list() {
    local needle="$1"
    shift
    for candidate in "$@"; do
        [[ "$candidate" == "$needle" ]] && return 0
    done
    return 1
}

echo "$1" > "$BASE_DIR/session_name"

FOCUS_TARGET="${FOCUS_IDS[0]:-}"

for window_id in "${FOCUS_IDS[@]}"; do
    yabai -m window --deminimize "$window_id" > /dev/null 2>&1 &
done

wait

if [[ -n "$FOCUS_TARGET" ]]; then
    yabai -m window --focus "$FOCUS_TARGET" > /dev/null 2>&1
fi

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
