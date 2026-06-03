# sweetpotato — machine migration recipe

_Last updated: **2026-06-03** (first write, from the 2026-06 laptop migration)._
_This file evolves; dated snapshots of previous READMEs live in `archive/`._

Compact, ordered recipe to rebuild this machine (macOS 15+, Apple Silicon) from nothing.

## 0. prerequisites
- **Shared machine gotcha:** if Homebrew exists but is owned by another admin user:
  ```sh
  sudo chgrp -R admin /opt/homebrew && sudo chmod -R g+w /opt/homebrew
  ```
- Hostname (optional; skip on shared machines): `sudo scutil --set HostName sweetpotato`

## 1. this repo
```sh
git clone git@github.com:Exr0n/config_sweetpotato.git ~/.config
cd ~/.config && git submodule update --init        # window-tagging
```

## 2. shell
```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/.config/zsh_custom/themes/powerlevel10k
curl -fsSL https://bun.sh/install | bash           # use `bun add -g` for global JS — NOT npm (EACCES on shared brew)
mkdir -p ~/.caches                                  # rc.zsh expects this
```
`~/.zshrc`: p10k instant-prompt, `export ZSH_CUSTOM="$HOME/.config/zsh_custom"`,
`ZSH_THEME="powerlevel10k/powerlevel10k"`, source oh-my-zsh (zsh_custom auto-loads `rc.zsh` + `lean_p10k.zsh` + `modern_shell.zsh`), then brew's zsh-autosuggestions + zsh-syntax-highlighting.

## 3. packages
```sh
brew install pass coreutils zoxide moreutils lsd rm-improved the_silver_searcher neovim jq \
  thefuck atuin fzf gh tig tmux magic-wormhole bottom deno gnupg gping gum just yt-dlp mpv \
  imagemagick wget rsync watch poppler ghostscript graphviz cloudflared libimobiledevice \
  ideviceinstaller libheif iperf3 xcodegen pnpm radare2 julia ruby python@3.11 platformio \
  git-annex zsh-autocomplete zsh-autosuggestions zsh-syntax-highlighting mas defaultbrowser \
  koekeishiya/formulae/skhd
brew install --cask kitty raycast zotero fantastical claude discord visual-studio-code \
  nikitabobko/tap/aerospace font-iosevka-term-nerd-font dayflow todoist-app orbstack
```
- **sudo .pkg casks — run in a real terminal** (they prompt for password): `brew install --cask karabiner-elements mactex`
- **App Store (manual click):** Amphetamine, Toggl Track, Letter Clock
- globals: `bun add -g @letta-ai/letta-code corepack` · `rustup default stable && cargo install witty-phrase-generator`
- VSCode extensions: `while read e; do code --install-extension "$e"; done < <list>` (curated list = old-mac backup `inventory/vscode_extensions.txt`, minus matlab/wpilib/java-pack/flutter/ocaml/jsonnet)
- STALE — do not install: yabai, felixkratz/borders, alacritty (replaced by AeroSpace + kitty)

## 4. window manager (AeroSpace + window-tagging)
- Config is `aerospace/aerospace.toml`: **dvorak key-mapping preset**, monocle (accordion pad 0 + yabai gaps), window-tagging on `1-7` + `',.p` (= physical QWER), per-app workspaces (discord/messages/mail/fantastical **pinned to built-in display**; claude/arc/notes own workspaces), Finder + System Settings float, `⌥⇧i` pop-to-fresh-workspace, `⌥u` recently-created, `⌥⇧v` golden-ratio center-float, `⌥⇧o` timestamp, `⌥x` Todoist, monitor focus/move on `t/s/n` (move follows window).
- First run: grant **Accessibility** to AeroSpace; **collapse macOS to ONE native Space** (Mission Control → ✕ extra desktops) or cross-space focus won't work.
- Karabiner: config auto-loads from `~/.config/karabiner/`; approve **driver** in Privacy & Security + enable in **Input Monitoring**, reboot if prompted.

## 5. macOS settings
- Run the **macOS defaults block** in `archive/README-2026-06-03.md` § settings (keyboard repeat, spaces, dock + polish, top-right hot-corner = display sleep, screenshots→clipboard, trackpad 3-finger gestures, Finder column view, autocorrect off, hide AirDrop/Display menu items, symbolichotkeys: ⌘Space freed for Raycast + Show Desktop ⌥⇧e).
- **Log out/in** afterwards (symbolichotkeys read at login).
- GUI-only: default browser `defaultbrowser browser` (Arc), wallpaper, Reduce Motion, TCC grants per app.
- git: `user.name Exr0n`, `user.email howdy@exr0n.com`, `push.autoSetupRemote true`, `pull.rebase false`, signingkey from SECRETS.

## 6. old-machine restore (backup drive → `mac_backup_YYYY-MM-DD/`)
1. **CONFIG/** — curate, don't copy verbatim: Brewfile (minus stale), `macos_settings/key_defaults_readable.txt` → translate wanted values to `defaults write` (NEVER import all 4698 plists).
2. **SECRETS** (run in a real terminal; prompts for passphrase):
   ```sh
   mkdir -p ~/secrets_restore && cd ~/secrets_restore && \
   openssl enc -d -aes-256-cbc -pbkdf2 -in /Volumes/<drive>/mac_backup_*/SECRETS.tar.gz.enc | tar -xzf -
   ```
   then restore per its inner README: SSH/GPG keys, `pass` store, keychain, browser profiles, `.claude.json`.
3. **DATA/** → archive to `~/Desktop/pass/albdata/archive/YYYY-MM-DD-<name>/` (dated containers):
   - **Dayflow**: re-encode JPG frames → **AV1 CRF36 + screen-content** (`libsvtav1, scm=2:tune=0, gop600, native res per day×resolution`), verify every video's frame count vs JPG count, keep `chunks.sqlite`, then delete JPGs/HEVC. (~122 GB → ~5 GB, SSIM 0.990. CRF18 HEVC was 9.7 GB — AV1+scm wins on screen content.)
   - **Messages**: skip — lives in iCloud.
   - Mail / Music / Zotero / VoiceMemos / VSCode / screencapture: straight rsync into dated containers.

## 7. sign-ins & onboarding (manual, last)
Raycast (cloud-syncs hotkeys incl ⌘⇧A color picker + ⌘Space), Fantastical accounts, Mail accounts, Toggl, Zotero, VS Code Settings Sync, Arc, Dayflow onboarding. Gatekeeper "malware" flags (e.g. Codex): System Settings → Privacy & Security → Open Anyway.

## browser extensions
dark reader · surfingkeys (`;s` disables pdf viewer) · youtube speed control · icloud passwords · tampermonkey (+desmos darkmode) · unhook · ublock origin · zotero connector
