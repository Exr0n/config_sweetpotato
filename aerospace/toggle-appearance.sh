#!/usr/bin/env bash
set -eu

# AeroSpace bindings can receive a second key-down from macOS key repeat while
# the physical chord is still held. A raw toggle would therefore flip twice and
# appear to do nothing. Admit only one invocation per short keypress window.
lock_dir="$HOME/.caches/aerospace/toggle-appearance.lock"
mkdir -p "${lock_dir%/*}"
if ! mkdir "$lock_dir" 2>/dev/null; then
    exit 0
fi

# Release the debounce lock independently even if System Events fails.
nohup /bin/sh -c 'sleep 0.75; rmdir "$1"' sh "$lock_dir" >/dev/null 2>&1 &

osascript -e 'tell app "System Events" to tell appearance preferences to set dark mode to not dark mode'
