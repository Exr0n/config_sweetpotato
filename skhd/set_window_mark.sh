SCRIPT_DIR="$HOME/.config/skhd"
source "$SCRIPT_DIR/util.sh"

CUR_ID="$(yabai -m query --windows --window | jq -r '.id')"
mkdir -p "$TAG_TO_WINDOW_PATH"
echo "$CUR_ID" > "$TAG_TO_WINDOW_PATH$1"
osascript -e "display notification \"$SESSION_NAME: set $1\" with title \"switch window or space\""

# if [[ $(< "$TAG_TO_WINDOW_PATH$1") == "$CUR_ID" ]]; then
#     # osascript -e "display notification \"$SESSION_NAME: unset $1\" with title \"switch window or space\""
#     # rm -f "$TAG_TO_WINDOW_PATH$1"
# else
#     osascript -e "display notification \"$SESSION_NAME: set $1\" with title \"switch window or space\""
#     mkdir -p "$TAG_TO_WINDOW_PATH"
#     echo "$CUR_ID" > "$TAG_TO_WINDOW_PATH$1"
# fi
