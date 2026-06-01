#!/bin/bash

set -euo pipefail

EXCLUDED_TYPE="float"
BUILTIN_FILTER='.[] | select(.uuid == "37D8832A-2D66-02CA-B9F7-8F30A301B230") | .spaces[]'
EXTERNAL_FILTER='.[] | select(.uuid != "37D8832A-2D66-02CA-B9F7-8F30A301B230") | .spaces[]'

echo builtin "$BUILTIN_FILTER"
echo external "$EXTERNAL_FILTER"

spaces_json="$(yabai -m query --spaces)"

for space in $(yabai -m query --displays | jq -r "$BUILTIN_FILTER"); do
    echo builtin space $space
    current_type="$(echo "$spaces_json" | jq -r ".[] | select(.id == $space) | .type")"
    [[ "$current_type" == "$EXCLUDED_TYPE" ]] && continue
    yabai -m space "$space" --layout stack
done

for space in $(yabai -m query --displays | jq -r "$EXTERNAL_FILTER"); do
    echo external space $space
    current_type="$(echo "$spaces_json" | jq -r ".[] | select(.id == $space) | .type")"
    [[ "$current_type" == "$EXCLUDED_TYPE" ]] && continue
    yabai -m space "$space" --layout bsp
done
