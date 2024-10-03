SESSION_PATH="$HOME/.caches/yabai_custom/session_name"
SESSION_NAME="$(< "$SESSION_PATH")"

DIRPATH="$HOME/.caches/yabai_custom/sessions/$SESSION_NAME/window_id_"
# osascript -e "display notification \"checking file $DIRPATH$1 with $(cat "$DIRPATH$1")\" with title \"switch window or space\""
if [[ -s "$DIRPATH$1" ]]; then
    if yabai -m window --focus $(cat "$DIRPATH$1"); then 
        echo 'yay'
    else
        # osascript -e 'display notification "window not found" with title "switch window or space"'
        rm -f "$DIRPATH$1"
        yabai -m space --focus $1
    fi
else
    # osascript -e 'display notification "file empty" with title "switch window or space"'
    yabai -m space --focus $1
fi
