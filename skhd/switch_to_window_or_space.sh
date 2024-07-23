DIRPATH="$HOME/.caches/yabai_custom/window_id_"
# osascript -e "display notification \"checking file $DIRPATH$1 with $(cat "$DIRPATH$1")\" with title \"switch window or space\""
if [[ -s "$DIRPATH$1" ]]; then
    if yabai -m window --focus $(cat "$DIRPATH$1"); then 
    else
        # osascript -e 'display notification "window not found" with title "switch window or space"'
        rm -f "$DIRPATH$1"
        yabai -m space --focus $1
    fi
else
    # osascript -e 'display notification "file empty" with title "switch window or space"'
    yabai -m space --focus $1
fi