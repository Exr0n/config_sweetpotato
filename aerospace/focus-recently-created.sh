#!/usr/bin/env bash
# Focus the most-recently-created window (yabai alt-u / focus_recently_created_window).
# The id is written by the on-window-detected 'store latest' callback in aerospace.toml,
# using $AEROSPACE_WINDOW_ID (AeroSpace's equivalent of yabai's $YABAI_WINDOW_ID).
f="$HOME/.caches/aerospace/latest_window_id"
[ -s "$f" ] || exit 0
exec aerospace focus --window-id "$(cat "$f")"
