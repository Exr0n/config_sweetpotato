DIRPATH="$HOME/.caches/yabai_custom/window_id_"
# rm -f "$DIRPATH$1"
CUR_ID="$(yabai -m query --windows --window | jq -r '.id')"
if [[ $(< "$DIRPATH$1") == "$CUR_ID" ]]; then
    osascript -e "display notification \"untagged window $1\" with title \"switch window or space\""
    rm -f "$DIRPATH$1"
else
    osascript -e "display notification \"tagged window $1\" with title \"switch window or space\""
    echo "$CUR_ID" > "$DIRPATH$1"
fi
