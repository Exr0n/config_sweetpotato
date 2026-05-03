#!/bin/zsh
# modern_shell.zsh
# ----------------
# Bundles the "modern interactive shell" stack:
#   • zsh-autocomplete       — real-time popup completion menu
#   • zsh-autosuggestions    — greyed inline history suggestions
#   • zsh-syntax-highlighting — live coloring of the buffer
#   • uv-module-completion   — dotted python module names after `uv run -m`
#
# Auto-sourced by oh-my-zsh from $ZSH_CUSTOM after compinit.
# Order matters: autocomplete first, syntax-highlighting last.

# --- Source the brew-installed plugins (silently skip if missing) ---

local _brew_share="${HOMEBREW_PREFIX:-/opt/homebrew}/share"

[[ -r "$_brew_share/zsh-autocomplete/zsh-autocomplete.plugin.zsh" ]] && \
    source "$_brew_share/zsh-autocomplete/zsh-autocomplete.plugin.zsh"

[[ -r "$_brew_share/zsh-autosuggestions/zsh-autosuggestions.zsh" ]] && \
    source "$_brew_share/zsh-autosuggestions/zsh-autosuggestions.zsh"

[[ -r "$_brew_share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]] && \
    source "$_brew_share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

# uv-module-completion lives alongside this file in the dotfiles
[[ -r "$ZSH_CUSTOM/uv-module-completion/uv-module-completion.plugin.zsh" ]] && \
    source "$ZSH_CUSTOM/uv-module-completion/uv-module-completion.plugin.zsh"

unset _brew_share

# --- Dim styling: completion menu in the same grey as autosuggest (color 8) ---

# Default item color, plus highlighted-selection color (bright fg on grey bg).
zstyle ':completion:*:default' list-colors \
    'no=38;5;8' \
    'ma=48;5;240;38;5;15;1'
zstyle ':completion:*' list-colors '=*=38;5;8'

# Section headers / messages / no-match warnings: dim too.
zstyle ':completion:*:descriptions' format $'\e[38;5;8m── %d ──\e[0m'
zstyle ':completion:*:messages'     format $'\e[38;5;8m── %d ──\e[0m'
zstyle ':completion:*:warnings'     format $'\e[38;5;8mno matches: %d\e[0m'

# --- Zoxide integration: surface frecent dirs in `cd <TAB>` too ---
# (zoxide's own command — `c` per rc.zsh — already gets popup completion
# automatically via the `__zoxide_z` compdef installed by `zoxide init zsh`.)
if (( $+functions[__zoxide_z_complete] )); then
    compdef __zoxide_z_complete cd
elif (( $+functions[_zoxide_z] )); then
    compdef _zoxide_z cd
fi

# --- Right-arrow accepts the autosuggested line (rebind after autocomplete) ---
bindkey '^[[C' autosuggest-accept
