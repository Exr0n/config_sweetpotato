#!/usr/bin/env bash
# gather.sh — collect one or more windows and send them to the same workspace.
#
# Flow (driven by aerospace `mode gather`, entered with alt-i):
#   start          clear the marked set (focused window is included at commit time)
#   mark <dir>     add focused window, focus <dir> (left/down/up/right), add that too
#   fresh          move marked set + focused window to a fresh empty workspace (this monitor)
#   tag  <tag>     move marked set + focused window to the workspace of tagged-window <tag>
#                  (fallback: a workspace literally named <tag>)
#   clear          drop the marked set (cancel)
#
# Marked set lives in ~/.caches/aerospace/gather_set (one window-id per line).
# Commits ALWAYS include the live-focused window and capture the set into memory
# before moving, so they don't race the async `start`/`mark` writers.
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

# Capture marked set + the live-focused window, clear the set, move them all to
# workspace $1. Prints the number of windows moved. Race-proof: the id list is
# snapshotted into a variable before any async writer can touch the file again.
commit_to() {
  local ws="$1" ids id n=0
  ids="$(cat "$STATE" 2>/dev/null; focused_id)"
  : > "$STATE"
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    aerospace move-node-to-workspace --window-id "$id" "$ws" && n=$((n + 1))
  done < <(printf '%s\n' "$ids" | awk 'NF && !seen[$0]++')
  echo "$n"
}

case "${1:-}" in
  start)
    : > "$STATE"
    wt_notify "gather: mark windows w/ hjkl, then tag / shift-i"
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
    moved="$(commit_to "$dest")"
    aerospace move-workspace-to-monitor --workspace "$dest" "$mon" 2>/dev/null || true
    aerospace workspace "$dest"
    wt_notify "gathered $moved → fresh workspace $dest"
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
    moved="$(commit_to "$dest")"
    aerospace workspace "$dest"
    wt_notify "gathered $moved → $dest"
    ;;

  clear)
    : > "$STATE"
    ;;

  *)
    echo "usage: gather.sh {start|mark <dir>|fresh|tag <tag>|clear}" >&2
    exit 2
    ;;
esac
