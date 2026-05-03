#compdef uv
# uv-module-completion
# ---------------------
# Adds dotted Python-module completion after `uv run -m` / `uv run --module`.
# For all other completion contexts, defers to uv's existing completion (if
# installed via `uv generate-shell-completion zsh` or similar).
#
# Walks the filesystem from $UV_MODULE_COMPLETE_ROOT (default: $PWD) and offers
# packages (directories containing __init__.py) and top-level modules (*.py).
# Skips __pycache__ and dotfiles.

_uv_module_complete_python_modules() {
    local cur="${words[CURRENT]}"
    local root="${UV_MODULE_COMPLETE_ROOT:-$PWD}"

    local search_dir base
    if [[ "$cur" == *.* ]]; then
        local parent_dotted="${cur%.*}"
        search_dir="$root/${parent_dotted//.//}"
        base="${parent_dotted}."
    else
        search_dir="$root"
        base=""
    fi

    [[ -d "$search_dir" ]] || return

    local -a packages modules
    local entry name
    for entry in "$search_dir"/*(N); do
        name="${entry:t}"
        case "$name" in
            __pycache__|.*) continue ;;
        esac
        if [[ -d "$entry" && -f "$entry/__init__.py" ]]; then
            packages+=("${base}${name}")
        elif [[ -f "$entry" && "$name" == *.py && "$name" != "__init__.py" ]]; then
            modules+=("${base}${name%.py}")
        fi
    done

    # Packages keep the trailing dot so further <TAB> drills in.
    local -a package_with_dot
    local p
    for p in "${packages[@]}"; do
        package_with_dot+=("${p}.")
    done

    compadd -S '' -- "${package_with_dot[@]}"
    compadd -- "${modules[@]}"
}

_uv_module_complete_dispatch() {
    local prev="${words[CURRENT-1]}"

    if [[ "$prev" == "-m" || "$prev" == "--module" ]]; then
        local i
        for ((i=2; i < CURRENT; i++)); do
            if [[ "${words[i]}" == "run" ]]; then
                _uv_module_complete_python_modules
                return
            fi
        done
    fi

    # Defer to upstream uv completion if present. _uv is autoloaded lazily
    # by compinit, so request it now and call it if available.
    autoload -Uz +X _uv 2>/dev/null
    if (( $+functions[_uv] )); then
        _uv
    fi
}

compdef _uv_module_complete_dispatch uv
