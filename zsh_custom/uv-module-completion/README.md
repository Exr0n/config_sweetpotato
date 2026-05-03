# uv-module-completion

Zsh tab-completion for Python module names after `uv run -m`.

```
$ uv run -m lib.<TAB>
lib.beamformers   lib.bin   lib.ipc   lib.viz   ...
```

Walks the current directory (or `$UV_MODULE_COMPLETE_ROOT` if set) and offers
any package (`__init__.py`) or top-level `.py` module as a dotted candidate.
Drills in component-by-component as you keep tabbing.

## Install

### Option 1 — source from `.zshrc`

```zsh
source /path/to/uv-module-completion/uv-module-completion.plugin.zsh
```

Place the line **after** any `compinit` call and after uv's own completion
(if you generated one with `uv generate-shell-completion zsh`).

### Option 2 — drop into `$fpath` as `_uv`

```zsh
mkdir -p ~/.zsh/completions
cp uv-module-completion.plugin.zsh ~/.zsh/completions/_uv
# In .zshrc, before compinit:
fpath=(~/.zsh/completions $fpath)
```

### Option 3 — Oh My Zsh custom plugin

```zsh
mkdir -p $ZSH_CUSTOM/plugins/uv-module-completion
cp uv-module-completion.plugin.zsh $ZSH_CUSTOM/plugins/uv-module-completion/
# Then add `uv-module-completion` to plugins=(...) in .zshrc.
```

After install, `exec zsh` (or open a new terminal).

## Configuration

| Env var                       | Default | Effect                                  |
| ----------------------------- | ------- | --------------------------------------- |
| `UV_MODULE_COMPLETE_ROOT`     | `$PWD`  | Root directory walked for modules.      |

For monorepos with a `src/` layout, set `UV_MODULE_COMPLETE_ROOT=$PWD/src` in
your project's `.envrc` or `.zshrc.local`.

## Behavior

- Triggers only when the previous word is `-m` or `--module` and the command
  line contains `run` after `uv`.
- For every other `uv` completion (subcommands, flags, paths), defers
  transparently to whatever `uv` completion you already had installed.
- Skips `__pycache__` and dotfile/dotdir entries.
- Does not import anything — pure filesystem walk, so it's fast and safe even
  when modules have side effects on import.

## License

MIT.
