#!/bin/bash

set -euo pipefail

LATEST_FILE="$HOME/.caches/yabai_custom/latest_window_id"
[[ -s "$LATEST_FILE" ]] || { yabai -m window --focus recent; exit 0; }

target_id="$(< "$LATEST_FILE")"

if ! yabai -m query --windows --window "$target_id" >/dev/null 2>&1; then
    yabai -m window --focus recent
    exit 0
fi

yabai -m window --focus "$target_id"
