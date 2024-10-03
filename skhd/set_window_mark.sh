SESSION_PATH="$HOME/.caches/yabai_custom/session_name"
SESSION_NAME="$(< "$SESSION_PATH")"

DIRPATH="$HOME/.caches/yabai_custom/sessions/$SESSION_NAME/window_id_"

# rm -f "$DIRPATH$1"
CUR_ID="$(yabai -m query --windows --window | jq -r '.id')"
if [[ $(< "$DIRPATH$1") == "$CUR_ID" ]]; then
    osascript -e "display notification \"$SESSION_NAME: unset $1\" with title \"switch window or space\""
    rm -f "$DIRPATH$1"
else
    osascript -e "display notification \"$SESSION_NAME: set $1\" with title \"switch window or space\""
    mkdir -p "$DIRPATH"
    echo "$CUR_ID" > "$DIRPATH$1"
fi
