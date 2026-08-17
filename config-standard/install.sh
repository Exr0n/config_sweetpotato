#!/usr/bin/env bash
# Install one addressable Pink Matter configuration standard without replacing
# unrelated personal Karabiner settings.
set -euo pipefail

standard_id="${1:-}"
supported_id="macos.keyboard.caps-control-escape"

if [[ "$standard_id" == "list" ]]; then
  printf '%s\n' "$supported_id"
  exit 0
fi

if [[ "$standard_id" != "$supported_id" || "$#" -ne 1 ]]; then
  printf '%s\n' \
    "Usage: $0 $supported_id" \
    "List available standards with: $0 list" >&2
  exit 64
fi

config_path="${KARABINER_CONFIG_PATH:-$HOME/.config/karabiner/karabiner.json}"
backup_root="${PINK_MATTER_STANDARD_BACKUP_DIR:-$HOME/Library/Application Support/PinkMatterStandard/backups}"
rule_description="Pink Matter: remapped Control is Control when held, Escape when tapped"
legacy_rule_description="Post Esc if Caps is tapped, Control if held."

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' "jq is required. Install it with: brew install jq" >&2
  exit 69
fi

if [[ ! -f "$config_path" ]]; then
  printf '%s\n' \
    "Karabiner config not found at: $config_path" \
    "Install and open Karabiner-Elements once, then rerun this installer." >&2
  exit 66
fi

if ! jq -e \
  '(.profiles // []) | any(.selected == true)' \
  "$config_path" >/dev/null; then
  printf '%s\n' "Karabiner config has no selected profile; refusing to guess." >&2
  exit 65
fi

install -d -m 700 "$backup_root"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$(mktemp "$backup_root/karabiner.json.$timestamp.XXXXXX")"
cp -p "$config_path" "$backup_path"

config_dir="$(dirname "$config_path")"
temp_path="$(mktemp "$config_dir/.pink-matter-karabiner.XXXXXX")"
cleanup() {
  [[ ! -e "$temp_path" ]] || rm -f "$temp_path"
}
trap cleanup EXIT

jq \
  --arg description "$rule_description" \
  --arg legacy_description "$legacy_rule_description" '
  (.profiles[] | select(.selected == true)) |=
    (
      .simple_modifications = (
        (.simple_modifications // [])
        | map(
            select(
              .from.key_code? != "caps_lock"
              and .from.key_code? != "left_control"
            )
          )
      )
      | .complex_modifications = (.complex_modifications // {})
      | .complex_modifications.rules = (
          (.complex_modifications.rules // [])
          | map(
              select(
                .description != $description
                and .description != $legacy_description
              )
            )
          + [
              {
                "description": $description,
                "manipulators": [
                  {
                    "type": "basic",
                    "from": {
                      "key_code": "left_control",
                      "modifiers": {
                        "optional": ["any"]
                      }
                    },
                    "to": [
                      {
                        "key_code": "left_control",
                        "lazy": true
                      }
                    ],
                    "to_if_alone": [
                      {
                        "key_code": "escape"
                      }
                    ]
                  }
                ]
              }
            ]
        )
    )
' "$config_path" > "$temp_path"

jq empty "$temp_path"
chmod "$(stat -f '%Lp' "$config_path")" "$temp_path"
mv "$temp_path" "$config_path"

printf '%s\n' \
  "Applied Karabiner overlay for: $supported_id" \
  "Removed Karabiner simple mappings sourced from Caps Lock or Left Control." \
  "Preserved unrelated simple, complex, and device-specific mappings." \
  "Backup: $backup_path" \
  "" \
  "Required macOS layer (repeat for each keyboard):" \
  "System Settings -> Keyboard -> Keyboard Shortcuts -> Modifier Keys" \
  "  Caps Lock Key: Control" \
  "  Control Key: Caps Lock"
