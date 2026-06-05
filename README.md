# sweetpotato — machine migration recipe

_Last updated: **2026-06-04** (during the 2026-06 laptop migration)._
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
  pinentry-mac koekeishiya/formulae/skhd
brew install --cask kitty raycast zotero fantastical claude discord visual-studio-code \
  nikitabobko/tap/aerospace font-iosevka-term-nerd-font dayflow todoist-app orbstack
```
- **sudo .pkg casks — run in a real terminal** (they prompt for password): `brew install --cask karabiner-elements mactex`
- **App Store (manual click):** Amphetamine, Toggl Track, Letter Clock
- globals: `bun add -g @letta-ai/letta-code corepack` · `rustup default stable && cargo install witty-phrase-generator`
- VSCode extensions: `for e in $(<list); do code --install-extension $e; done` (curated = backup `inventory/vscode_extensions.txt` minus matlab/wpilib/java-pack/flutter/ocaml/jsonnet). NB: in zsh use `${=VAR}` to word-split.
- STALE — do not install: yabai, felixkratz/borders, alacritty (replaced by AeroSpace + kitty)

## 4. keyboard (karabiner) — load order matters
Config auto-loads from `~/.config/karabiner/`. Approve **driver** in Privacy & Security + enable **Input Monitoring**.
- Simple mods now swap **BOTH** cmd↔option pairs (the old Mac did the right side via a macOS-level
  per-keyboard mapping that doesn't migrate — it's been folded into karabiner.json, self-contained now).
- Resulting layer: physical cmd (either side) = **option** · physical option = **cmd** (left tap = Delete, right tap = Return) · capslock held = **control**, physical ctrl = capslock · physical delete = **sleep** · physical return = disabled.

## 5. window manager (AeroSpace + window-tagging)
Config `aerospace/aerospace.toml`: **dvorak key-mapping preset** (letter binds follow Dvorak char positions; window-tag `',.p` keys are written `quote/comma/period/p` = physical QWER), monocle (accordion pad 0 + yabai gaps), window-tagging `1-7` + `',.p`, per-app workspaces (discord/messages/mail/fantastical **pinned to built-in display**; claude/arc/notes own workspaces), Finder + System Settings float, cursor-follows-focus (`window-force-center`).
Binds beyond the old skhd: `⌥⇧i` pop-to-fresh-workspace · `⌥u` recently-created (via `$AEROSPACE_WINDOW_ID` catch-all rule) · `⌥⇧v` golden-ratio center-float · `⌥⇧a` **toggle light/dark** (osascript appearance) · `⌥x` Todoist · `⌃⌥⇧hjkl` **join-with** (nested containers; then `⌥b`/`⌥⇧b` set the sub-layout) · monitor focus/move `t/s/n` (+shift moves AND follows). Monitors are bound **by enumeration order** — this laptop enumerates Dell/LG opposite to expectation, so 2/3 are swapped in config; if it bites again, switch to name patterns (`focus-monitor 'dell'`).
First run: grant **Accessibility**; **collapse macOS to ONE native Space** or cross-space focus fails.

## 6. macOS settings
- Run the **macOS defaults block** in `archive/README-2026-06-03.md` § settings (keyboard repeat, spaces, dock + polish, top-right hot-corner = display sleep, screenshots→clipboard+thumbnail, trackpad 3-finger gestures, Finder column view, autocorrect off, hide AirDrop/Display menu items, symbolichotkeys: ⌘Space/⌘⌥Space/⌃Space/⌃⌥Space disabled, **Show Desktop = ⌥⇧e**).
- symbolichotkeys apply at login — or hot-activate: `/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u`
- GUI-only: default browser `defaultbrowser browser` (Arc), wallpaper, Reduce Motion, TCC grants per app.
- git: `user.name Exr0n`, `user.email mail@exr0n.com`, signingkey `2027A4BB657CDDAD` (gpgsign **off**), `pull.rebase=true`, `push.autoSetupRemote=true`.

## 7. old-machine restore (backup drive → `mac_backup_YYYY-MM-DD/`)
1. **CONFIG/** — curate, don't copy verbatim: Brewfile (minus stale), `key_defaults_readable.txt` → wanted `defaults write` lines (NEVER import all 4698 plists). NB: backup plists can be stale vs muscle memory (Show Desktop modifiers were).
2. **SECRETS** (real terminal; openssl prompts for passphrase):
   ```sh
   mkdir -p ~/secrets_restore && cd ~/secrets_restore && \
   openssl enc -d -aes-256-cbc -pbkdf2 -in /Volumes/<drive>/mac_backup_*/SECRETS.tar.gz.enc | tar -xzf -
   ```
   Then: `.ssh` (chmod 700/600) · `.gnupg` (chmod 700; configure `pinentry-mac` in gpg-agent.conf) · `.password-store` · `.netrc` · `.cloudflared` · `app_tokens/` (codex/gemini/docker/gh).
   **Gotchas learned:** the gh token in `gh/hosts.yml` must be **gitignored** (this repo is public!); old gh OAuth tokens are dead → `gh auth login`; the **GPG passphrase** may only exist in the old keychain's GnuPG item — verify it EARLY or the pass store is unrecoverable; switch repo remote to SSH once keys are in.
3. **Keychain:** don't merge — keep the old keychain as a named archive: copy `login.keychain-db` →
   `~/Library/Keychains/<oldmachine>-login-keychain-<date>.keychain-db`, open in Keychain Access, unlock with OLD login password for lookups. Copy **only** browser `* Safe Storage` items into the new login keychain.
4. **Browser profile (Arc) — exact order or you lose the encrypted data:**
   a. Browser QUIT (watch for the other user's instance on shared machines — pgrep -U)
   b. In login keychain: note+delete the NEW "Arc Safe Storage", paste the OLD one in (old date = correct; the key is minted once)
   c. `rsync -a --delete backup/Arc/ ~/Library/Application\ Support/Arc/` (keep current `Storable*.json` aside if spaces were already fixed, overlay after)
   d. First launch with wrong key = Chromium tamper-check **deletes all extensions**. If that happens: reinstall by ID from the Web Store (`chromewebstore.google.com/detail/<id>` — get ids+names from backup `Extensions/*/*/manifest.json`), then with browser quit overlay `Local Extension Settings/<id>`, `Sync Extension Settings/<id>`, `IndexedDB/chrome-extension_<id>_*` from backup → extension data (Tampermonkey scripts etc.) returns.
5. **VSCode:** restore `User/` (settings/keybinds/snippets/profiles/History/globalStorage) + `Workspaces` + `Backups` from the archived `DATA/VSCode` into `~/Library/Application Support/Code/`.
6. **Raycast:** only the prefs plist survives a file backup (global hotkey ⌥⇧Space + ~4 extension names recoverable). Per-command hotkeys/aliases/quicklinks/snippets live in its internal db — **NOT backed up, no free cloud sync**. After configuring: **Raycast Settings → Advanced → Export** a `.rayconfig` into the albdata archive so the next migration carries everything. Re-add script dir: Settings → Extensions → ➕ → `~/.config/raycast-script-commands`.
7. **DATA/** → `~/Desktop/pass/albdata/archive/YYYY-MM-DD-<name>/` (dated containers):
   - **Dayflow**: re-encode JPGs → **AV1 CRF36 + screen-content** (`libsvtav1, scm=2:tune=0, gop600, native res per day×resolution group`); verify EVERY video's frame count vs JPG count before deleting sources. Result this round: 338,677 JPGs / 122 GB → 266 videos / **5.0 GB**, SSIM 0.990. (AV1+scm ≈ 2× smaller than HEVC CRF18 at equal quality on screen content — warped motion + IBC handle scroll/aliasing.) Keep `chunks.sqlite`.
   - **Messages**: skipped (iCloud) — ⚠️ verify "Keep Messages: Forever" before trusting that.
   - Mail / Music / Zotero / VoiceMemos / VSCode / screencapture: straight rsync into dated containers.

## 8. known keybind-eaters (debug order for "my shortcut doesn't work")
1. **screenpipe registers GLOBAL hotkeys** (⌃⌘A/Z/X/U/S, ⌃⌘K/L…) that silently swallow app shortcuts (ate Mail's ⌃⌘A archive). Disable: quit app, set `disabledShortcuts` in `~/.screenpipe/store.bin` to all ids (`show start_recording stop_recording start_audio stop_audio show_chat search lock_vault`), relaunch. *(Plan: replace screenpipe with our own tool.)*
2. **Secure Keyboard Entry** (kitty menu toggle, or any pending sudo prompt) blocks AeroSpace while that app is focused.
3. **Disabled menu items** swallow their own shortcut silently (Mail Archive with nothing selected).
4. Wrong-side modifier: both cmd keys must be swapped (see §4) or right-cmd sends real ⌘.
5. Diagnose with **Karabiner-EventViewer** (post-remap events) + synthetic keys (`osascript key code N using option down`) to isolate layer.

## 9. sign-ins & onboarding (manual, last)
Raycast (then export .rayconfig!), Fantastical accounts, Mail accounts, Toggl, Zotero, VS Code Settings Sync, Arc, Dayflow onboarding, `gh auth login`. Gatekeeper "malware" flags (e.g. Codex): System Settings → Privacy & Security → Open Anyway.

## 10. before wiping the backup drive — checklist
Copy to local first: ☐ `DATA/Messages` (74 GB — or verified iCloud Keep-Forever) ☐ `CONFIG/` (27 MB) ☐ `README.md` + `MAINTENANCE.md` ☐ `SECRETS.tar.gz.enc` (encrypted safety net — contains the not-yet-restored Chrome profile + Safari data). And don't shred the local `~/secrets_restore` until those are squared away.

## browser extensions (Arc, from backup manifest)
uBlock Origin (+Lite) · Tampermonkey (+desmos darkmode script) · SheetKeys · Dark Reader · Zotero Connector · YT Playback Speed · Le Git Graph · Unhook · Matter · Claude Continue-from-Here · ActivityWatch Watcher · DownThemAll · iCloud Passwords · Google Docs Offline
