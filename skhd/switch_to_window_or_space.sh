DIRPATH="$HOME/.caches/yabai_custom/window_id_"
# osascript -e "display notification \"checking file $DIRPATH$1 with $(cat "$DIRPATH$1")\" with title \"switch window or space\""
if [[ -s "$DIRPATH$1" ]]; then
    # osascript -e "display notification \"$(cat "$DIRPATH$1") in $(yabai -m query --windows | jq -r '.[].id')\" with title \"switch window or space\""
    if echo "$( yabai -m query --windows | jq -r '.[].id')" | grep -q "$(cat "$DIRPATH$1")"; then
        # osascript -e 'display notification "window found" with title "switch window or space"'
        yabai -m window --focus $(cat "$DIRPATH$1")
    else
        # osascript -e 'display notification "window not found" with title "switch window or space"'
        rm -f "$DIRPATH$1"
        yabai -m space --focus $1
    fi
else
    # osascript -e 'display notification "file empty" with title "switch window or space"'
    yabai -m space --focus $1
fi