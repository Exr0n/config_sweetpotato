SCRIPT_DIR="$HOME/.config/skhd"
source "$SCRIPT_DIR/util.sh"

# osascript -e "display notification \"checking file $TAG_TO_WINDOW_PATH$1 with $(cat "$TAG_TO_WINDOW_PATH$1")\" with title \"switch window or space\""
if [[ -s "$TAG_TO_WINDOW_PATH$1" ]]; then
    if yabai -m window --focus $(cat "$TAG_TO_WINDOW_PATH$1"); then 
        : # it worked!
    else
        osascript -e 'display notification "window not found" with title "switch window or space"'
        rm -f "$TAG_TO_WINDOW_PATH$1"
        yabai -m space --focus $1
        # echo "window not found" # because it died
    fi
else
    # osascript -e 'display notification "window not found" with title "switch window or space"'
    # osascript -e 'display notification "file empty" with title "switch window or space"'
    yabai -m space --focus $1
    # echo "window not found" # because it hasn't been tagged
fi
