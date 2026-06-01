#!/usr/bin/env bash
# Move the focused window to the first empty numbered workspace (1-50) and
# follow it there. Pair with window-tagging: pop a window out, tag it, jump back.
set -uo pipefail

for ws in $(seq 1 50); do
  if [ -z "$(aerospace list-windows --workspace "$ws" --format '%{window-id}' 2>/dev/null)" ]; then
    exec aerospace move-node-to-workspace --focus-follows-window "$ws"
  fi
done

echo "pop-to-fresh-workspace: no empty workspace in 1-50" >&2
exit 1
