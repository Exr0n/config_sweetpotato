#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Switch Session (Picker)
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔀
# @raycast.argument1 { "type": "text", "placeholder": "Session Name (optional)", "optional": true }

# Documentation:
# @raycast.author Exr0n
# @raycast.description Switch to a cached session with MRU ordering and picker

set -euo pipefail

BASE_DIR="$HOME/.caches/yabai_custom"
SESSIONS_DIR="$BASE_DIR/sessions"
MRU_FILE="$BASE_DIR/session_mru"
SWITCH_SCRIPT="$HOME/.config/skhd/switch-session.sh"

list_sessions() {
    sessions=()
    seen=""

    if [[ -f "$MRU_FILE" ]]; then
        while IFS=$'\t' read -r ts name; do
            [[ -z "$name" ]] && continue
            case " $seen " in
                *" $name "*) continue ;;
                *) sessions+=("$name"); seen="$seen$name " ;;
            esac
        done < <(sort -r -n -k1,1 "$MRU_FILE")
    fi

    if [[ -d "$SESSIONS_DIR" ]]; then
        while IFS= read -r dir; do
            name="${dir##*/}"
            [[ -z "$name" ]] && continue
            case " $seen " in
                *" $name "*) continue ;;
                *) sessions+=("$name"); seen="$seen$name " ;;
            esac
        done < <(find "$SESSIONS_DIR" -maxdepth 1 -mindepth 1 -type d -print 2>/dev/null | sort)
    fi

    printf "%s\n" "${sessions[@]}"
}

pick_session() {
    local items=("$@")
    [[ ${#items[@]} -gt 0 ]] || return 1

    local escaped=()
    for item in "${items[@]}"; do
        escaped+=("${item//\"/\\\"}")
    done

    local as_list
    as_list=$(printf '"%s",' "${escaped[@]}" | sed 's/,$//')
    local choice
    choice="$(osascript -e 'set theList to {'"$as_list"'}' \
                       -e 'choose from list theList with prompt "Switch session:" default items {item 1 of theList}' \
                       -e 'if result is false then return ""' 2>/dev/null)"
    printf "%s" "$choice"
}

TARGET="${1-}"

if [[ -z "$TARGET" ]]; then
    ordered_sessions=()
    while IFS= read -r s; do
        ordered_sessions+=("$s")
    done < <(list_sessions)
    TARGET="$(pick_session "${ordered_sessions[@]}")"
fi

[[ -z "$TARGET" ]] && exit 0

if [[ ! -x "$SWITCH_SCRIPT" ]]; then
    echo "switch-session.sh not executable" >&2
    exit 1
fi

"$SWITCH_SCRIPT" "$TARGET"
