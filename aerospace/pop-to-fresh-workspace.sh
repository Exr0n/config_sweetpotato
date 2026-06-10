#!/usr/bin/env bash
# Move the focused window to the first empty numbered workspace (1-50) and
# follow it there — keeping the new workspace on the CURRENT monitor
# (otherwise an unseen empty workspace materializes on monitor 1).
# Pair with window-tagging: pop a window out, tag it, jump back.
set -uo pipefail

mon="$(aerospace list-monitors --focused --format '%{monitor-id}')"

for ws in $(seq 1 50); do
  if [ -z "$(aerospace list-windows --workspace "$ws" --format '%{window-id}' 2>/dev/null)" ]; then
    aerospace move-node-to-workspace "$ws"
    aerospace move-workspace-to-monitor --workspace "$ws" "$mon"
    exec aerospace workspace "$ws"
  fi
done

echo "pop-to-fresh-workspace: no empty workspace in 1-50" >&2
exit 1
