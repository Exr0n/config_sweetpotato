#!/usr/bin/env bash
# gather.sh — collect one or more windows and send them to the same workspace.
#
# Flow (driven by aerospace `mode gather`, entered with alt-i):
#   start          seed the marked set with the focused window
#   mark <dir>     add focused window, focus <dir> (left/down/up/right), add that too
#   fresh          move the whole marked set to a fresh empty workspace (this monitor)
#   tag  <tag>     move the whole marked set to the workspace of tagged-window <tag>
#                  (fallback: a workspace literally named <tag>)
#   clear          drop the marked set (cancel)
#
# Marked set lives in ~/.caches/aerospace/gather_set (one window-id per line).
# Tag resolution reuses the Exr0n/window-tagging helpers.
set -uo pipefail

STATE="$HOME/.caches/aerospace/gather_set"
mkdir -p "$(dirname "$STATE")"

: "${WINDOW_TAGGING_BACKEND:=$HOME/.config/window-tagging/src/aerospace/backend.sh}"
WT_DIR="$HOME/.config/window-tagging/src"
# shellcheck disable=SC1091
source "$WT_DIR/window-tagging.sh"
# shellcheck disable=SC1090
source "$WINDOW_TAGGING_BACKEND"

focused_id() { aerospace list-windows --focused --format '%{window-id}'; }

add() {  # append an id, keeping the file de-duplicated and order-stable
  [[ -n "${1:-}" ]] || return 0
  printf '%s\n' "$1" >> "$STATE"
  awk '!seen[$0]++' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
}

count() { [[ -f "$STATE" ]] && grep -c . "$STATE" || echo 0; }

# move every id in the marked set into workspace $1
move_set_to() {
  local ws="$1" id
  [[ -f "$STATE" ]] || return 0
  while IFS= read -r id; do
    [[ -n "$id" ]] && aerospace move-node-to-workspace --window-id "$id" "$ws"
  done < "$STATE"
}

case "${1:-}" in
  start)
    : > "$STATE"
    add "$(focused_id)"
    wt_notify "gather: 1 window (mark more w/ hjkl)"
    ;;

  mark)
    dir="${2:?usage: gather.sh mark <left|down|up|right>}"
    add "$(focused_id)"
    aerospace focus "$dir" 2>/dev/null || true
    add "$(focused_id)"
    wt_notify "gather: $(count) windows"
    ;;

  fresh)
    mon="$(aerospace list-monitors --focused --format '%{monitor-id}')"
    dest=""
    for ws in $(seq 1 50); do
      if [[ -z "$(aerospace list-windows --workspace "$ws" --format '%{window-id}' 2>/dev/null)" ]]; then
        dest="$ws"; break
      fi
    done
    [[ -n "$dest" ]] || { wt_notify "gather: no empty workspace 1-50"; exit 1; }
    move_set_to "$dest"
    aerospace move-workspace-to-monitor --workspace "$dest" "$mon" 2>/dev/null || true
    aerospace workspace "$dest"
    wt_notify "gathered $(count) → fresh workspace $dest"
    : > "$STATE"
    ;;

  tag)
    tag="${2:?usage: gather.sh tag <tag>}"
    dest=""
    tag_file="$(wt_tag_file "$tag")"
    if [[ -s "$tag_file" ]]; then
      wid="$(< "$tag_file")"
      dest="$(aerospace list-windows --all --format '%{window-id}%{tab}%{workspace}' \
              | awk -F'\t' -v w="$wid" '$1==w{print $2; exit}')"
    fi
    [[ -n "$dest" ]] || dest="$tag"   # fallback: workspace literally named <tag>
    move_set_to "$dest"
    aerospace workspace "$dest"
    wt_notify "gathered $(count) → $dest"
    : > "$STATE"
    ;;

  clear)
    : > "$STATE"
    ;;

  *)
    echo "usage: gather.sh {start|mark <dir>|fresh|tag <tag>|clear}" >&2
    exit 2
    ;;
esac
