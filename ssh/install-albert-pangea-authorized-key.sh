#!/usr/bin/env bash
# Personal-only bootstrap for an Albert-owned laptop.
# Do not run this when helping someone else reproduce the general config.
set -euo pipefail

if [[ "${1:-}" != "--confirm-albert-owned-laptop" || "$#" -ne 1 ]]; then
  printf '%s\n' \
    "Refusing to install the Albot/Pangea access key." \
    "Run only on a laptop actually owned by Albert:" \
    "  $0 --confirm-albert-owned-laptop" >&2
  exit 64
fi

authorized_key='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC34UvoEixU2wE5DX9rzZxWv1kFq+CIE23PIHEH2W+LD albot-to-sweetpotato'

install -d -m 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"

if ! grep -qxF "$authorized_key" "$HOME/.ssh/authorized_keys"; then
  printf '%s\n' "$authorized_key" >> "$HOME/.ssh/authorized_keys"
fi

printf '%s\n' "Installed Albert's Albot/Pangea SSH access key."
