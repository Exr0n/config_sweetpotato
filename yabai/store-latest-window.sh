#!/bin/bash

set -euo pipefail

LATEST_FILE="$HOME/.caches/yabai_custom/latest_window_id"
mkdir -p "$(dirname "$LATEST_FILE")"

if [[ -n "${YABAI_WINDOW_ID-}" ]]; then
    echo "$YABAI_WINDOW_ID" > "$LATEST_FILE"
else
    # fallback: query newest window by recent index
    newest_id="$(yabai -m query --windows | jq 'sort_by(.id) | last(.[]).id // empty')"
    [[ -n "$newest_id" ]] && echo "$newest_id" > "$LATEST_FILE"
fi
