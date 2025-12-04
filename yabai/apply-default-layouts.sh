#!/bin/bash

set -euo pipefail

EXCLUDED_TYPE="float"
BUILTIN_FILTER='.[] | select((."is-native" == 1) or (.native == 1) or (.type == "built-in")) | .spaces[]'
EXTERNAL_FILTER='.[] | select((."is-native" != 1) and (.native != 1) and (.type != "built-in")) | .spaces[]'

spaces_json="$(yabai -m query --spaces)"

for space in $(yabai -m query --displays | jq -r "$BUILTIN_FILTER"); do
    current_type="$(echo "$spaces_json" | jq -r ".[] | select(.id == $space) | .type")"
    [[ "$current_type" == "$EXCLUDED_TYPE" ]] && continue
    yabai -m space "$space" --layout stack
done

for space in $(yabai -m query --displays | jq -r "$EXTERNAL_FILTER"); do
    current_type="$(echo "$spaces_json" | jq -r ".[] | select(.id == $space) | .type")"
    [[ "$current_type" == "$EXCLUDED_TYPE" ]] && continue
    yabai -m space "$space" --layout bsp
done
