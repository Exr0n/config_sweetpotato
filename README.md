# sweetpotato — machine migration recipe

_Last updated: **2026-10-25** (sweetpotato3 migration; workflow now mostly through albot)._
_This file evolves; dated snapshots of previous READMEs live in `archive/`._

Compact, ordered recipe to rebuild this machine (macOS 15+, Apple Silicon) from nothing.

The portable company baseline lives publicly at
[Exr0n/config-standard](https://github.com/Exr0n/config-standard)
([site](https://exr0n.github.io/config-standard/)); its local source copy
is under [`config-standard/`](config-standard/README.md). It is the addressable
catalog for the complete Pink Matter setup; keep personal machine behavior in
the rest of this repository.

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
`rc.zsh` deliberately runs `unset NO_COLOR`: GUI apps inherit their launch
environment, and an AeroSpace process once inherited `NO_COLOR=1` and passed it
to every kitty/Codex process it launched. If an already-running launcher is
contaminated, restart it once with `env -u NO_COLOR open -a AeroSpace`.

SSH host aliases that are safe to track live in `~/.config/ssh/config`. Ensure
`~/.ssh/config` includes them near the top, before any `Host` blocks:
```sshconfig
Include ~/.orbstack/ssh/config
Include ~/.config/ssh/config
```
Keep private keys, `known_hosts`, and other secrets in `~/.ssh`; restore those
separately from the encrypted secrets backup and retain permissions (`~/.ssh`
mode 700, private keys mode 600).

### Albert-owned laptops only: Albot/Pangea inbound SSH access

This is a personal machine-identity step, **not part of the reusable config**.
Run it only when provisioning a laptop actually owned by Albert. Never run it
while helping someone else set up a similar configuration:
```sh
~/.config/ssh/install-albert-pangea-authorized-key.sh --confirm-albert-owned-laptop
```
The script is idempotent, preserves existing `authorized_keys` entries, and
enforces `~/.ssh` mode 700 plus `authorized_keys` mode 600. It deliberately
requires the explicit ownership confirmation flag so generic setup work cannot
install the Albot/Pangea access key by accident.

## 3. packages
```sh
brew install pass coreutils zoxide moreutils lsd rm-improved the_silver_searcher neovim jq \
  thefuck atuin fzf gh tig tmux magic-wormhole bottom deno gnupg gping gum just yt-dlp mpv \
  imagemagick wget rsync watch poppler ghostscript graphviz cloudflared libimobiledevice \
  ideviceinstaller libheif iperf3 xcodegen pnpm radare2 julia ruby python@3.11 platformio \
  git-annex zsh-autocomplete zsh-autosuggestions zsh-syntax-highlighting mas defaultbrowser \
  pinentry-mac duti
brew install --cask kitty raycast zotero fantastical claude beeper visual-studio-code \
  nikitabobko/tap/aerospace font-iosevka-term-nerd-font todoist-app orbstack \
  readdle-spark chatgpt discord google-chrome helium-browser
```
- **sudo .pkg casks — run in a real terminal** (they prompt for password): `brew install --cask karabiner-elements mactex`
- **App Store (manual click):** Amphetamine. (Toggl Track and Dayflow dropped 2026-10-25.) The native menu-bar clock is configured as `Mon, July 2, 3:04 PM`; Letter Clock is not required.
- globals: `rustup default stable` (Letta dropped 2026-10-25). Also kept: Rust, Julia, MacTeX (`brew install --cask mactex`, 6.5 GB: do it on real Wi-Fi).
- **No Command Line Tools?** On macOS 26.x Apple's update server may not offer them. Install Homebrew from its tarball instead (`curl -fL https://github.com/Homebrew/brew/tarball/main | tar xz --strip-components 1 -C /opt/homebrew`, branch `main`, `master` is rejected), use `HOMEBREW_NO_AUTO_UPDATE=1`, and fetch repos as tarballs: casks and bottled formulae need neither git nor a compiler. skhd (source build) is not needed; AeroSpace replaces it.
- VSCode extensions: `for e in $(<list); do code --install-extension $e; done` (curated = backup `inventory/vscode_extensions.txt` minus matlab/wpilib/java-pack/flutter/ocaml/jsonnet). NB: in zsh use `${=VAR}` to word-split.
- STALE — do not install: yabai, felixkratz/borders, alacritty (replaced by AeroSpace + kitty)

### Default email client

Spark replaces Apple Mail. After installing it, make Spark the handler for
email links (the App Store and Homebrew builds use different bundle IDs):

```sh
SPARK_BUNDLE_ID="$(mdls -raw -name kMDItemCFBundleIdentifier '/Applications/Spark Desktop.app')"
duti -s "$SPARK_BUNDLE_ID" mailto all
duti -x mailto
```

The last command should report `Spark Desktop`. AeroSpace's Option-8 launcher
also opens Spark directly; Apple Mail is not part of the standard setup.

## 4. keyboard (karabiner) — load order matters
Config auto-loads from `~/.config/karabiner/`. Approve **driver** in Privacy & Security + enable **Input Monitoring**.
- Simple mods now swap **BOTH** cmd↔option pairs (the old Mac did the right side via a macOS-level
  per-keyboard mapping that doesn't migrate — it's been folded into karabiner.json, self-contained now).
- Resulting layer: physical cmd (either side) = **option** · physical option = **cmd** (left tap = Delete, right tap = Return) · capslock held = **control**, physical ctrl = capslock · physical delete = **sleep** · physical return = disabled.

## 5. window manager (AeroSpace + window-tagging)
Config `aerospace/aerospace.toml` uses **`config-version = 2`** (required by
current AeroSpace); every `on-window-detected` block, including the catch-all,
must have an explicit `if` condition (`if = 'true'` for the catch-all).
It has a **dvorak key-mapping preset** (letter binds follow Dvorak char positions; window-tag `',.p` keys are written `quote/comma/period/p` = physical QWER), monocle (accordion pad 0 + yabai gaps), window-tagging `1-7` + `',.p`, per-app workspaces (Beeper/Discord/Spark/fantastical/claude/arc/notes), Finder + System Settings float, cursor-follows-focus (`window-force-center`). **Physical Cmd-9** opens Beeper as the default messaging client; **Cmd-Shift-9** opens Discord. This laptop uses `0.21.3-Beta-exrpatch.1`: upstream's `Monitor.activeWorkspace` recursively retries a stale monitor forever during display refresh, causing the repeat crashes seen on 2026-08-10 and 2026-08-12. The source fix in `aerospace/patches/0001-bound-active-workspace-refresh.patch` replaces that recursion with one cache refresh and a nearest-current-monitor fallback. It is signed with Albert's Apple Development identity, so a newly installed build needs one Accessibility approval. The untouched upstream app is retained in `~/Library/Application Support/AeroSpaceRollback/`.
Binds beyond the old skhd: `⌥⇧i` pop-to-fresh-workspace · `⌥i` **gather mode** (see below) · `⌥u` recently-created (via `$AEROSPACE_WINDOW_ID` catch-all rule) · `⌥⇧v` golden-ratio center-float · `⌥⇧a` **toggle light/dark** (`toggle-appearance.sh` debounces duplicate key-repeat events) · `⌥q` Todoist · `⌥o` Claude · `⌥;` ChatGPT-Codex (physical cmd-;) · `⌥⇧o` timestamp-paste script · `⌃⌥⇧hjkl` **join-with** (nested containers; then `⌥b`/`⌥⇧b` set the sub-layout)
- **Auto-float tiny popups** (`float-if-small.sh` + `win-vs-screen.js`): every `on-window-detected` rule (and the catch-all) runs a size check — if a new window is smaller than **⅓ × ⅓ of its monitor** (iCloud Passwords sheet, auth dialogs), it's set to `layout floating` instead of being stretched into a tile. Re-tile one manually with **`⌥\`** (`alt-backslash`, physical cmd-\). Geometry trick: **AeroSpace window-id == CoreGraphics window number**, so `win-vs-screen.js` reads exact per-window bounds via `CGWindowListCopyWindowInfo` (cast with `ObjC.castRefToObject`) + the containing `NSScreen` — reliable regardless of focus/Space, unlike System Events' fragile "frontmost window". Both window and screen are in points, so the ⅓ ratio is Retina-safe. Browser popups still get moved to the `arc` workspace (where the browser lives = where you are), just floating not tiled.
- **Gather mode** (`gather.sh` + `[mode.gather.binding]`): `⌥i` enters the mode (the focused window is always part of the commit); inside the mode `⌥hjkl` marks current+neighbor (chain to grab more on the same workspace), then `⌥<tag>` (1-7 / `',.p`=q/w/e/r) sends the marked set **+ the focused window** to that **tag's workspace** (same window-id→workspace resolution as the tag jumps, falling back to a workspace literally named `<tag>`), or `⌥⇧i` sends them to a **fresh** empty workspace on the current monitor; `esc`/`⌥i` cancels. Solves "I popped one window out, now how do I send its partner to join it." **Race-proof:** the commit always adds the live-focused window and snapshots the set into memory before moving — it does *not* depend on the async `start`/`mark` writers having finished (the original bug: pressing `⌥i` then a tag quickly moved nothing because `start` hadn't seeded the file yet). Marked-set state in `~/.caches/aerospace/gather_set`; progress shown via notifications (monocle has no visual selection). · monitor focus/move `t/s/n` (+shift moves window AND follows; `⌃⌥⇧t/s/n` moves the **whole workspace** to that monitor) · pop-to-fresh pins the new workspace to the **current** monitor (else empty workspaces materialize on monitor 1). Monitors are bound **by enumeration order** — this laptop enumerates Dell/LG opposite to expectation, so 2/3 are swapped in config; if it bites again, switch to name patterns (`focus-monitor 'dell'`).
First run: grant **Accessibility**; **collapse macOS to ONE native Space** or cross-space focus fails.
Validate after edits with `aerospace reload-config`; a parse error leaves the
previous config/keybind state in place and can make switching appear to stop.

## 6. macOS settings
- Run the **macOS defaults block** in `archive/README-2026-06-03.md` § settings (keyboard repeat, spaces, dock + polish, top-right hot-corner = display sleep, screenshots→clipboard+thumbnail, trackpad 3-finger gestures, Finder column view, autocorrect off, hide AirDrop/Display menu items, symbolichotkeys: ⌘Space/⌘⌥Space/⌃Space/⌃⌥Space disabled, **Show Desktop = ⌥⇧e**).
- **Expanded curated set:** `macos-defaults.sh` (repo root) is the hand-picked, re-runnable settings block — keyboard/text, trackpad+mouse speed, tap-to-click, Dock (incl. `mru-spaces=false` for AeroSpace), Finder (column view, search-current-folder, desktop drives), analog clock, Stage Manager off, Accessibility Zoom (ctrl-scroll), text replacements. Curated by **reading every domain** in `archive/2026-06-01-config/CONFIG/macos_settings/key_defaults_readable.txt` (19 domains) — NOT a blind import (e.g. old `screencapture show-thumbnail=0` was deliberately overridden to keep the floating thumbnail). Judgment calls (re-add Chinese language, auto light/dark, menu-bar layout) are left commented under `# REVIEW`. The **full old-machine dump is captured** there; when a setting seems "missing," mine that file rather than re-deriving.
- symbolichotkeys apply at login — or hot-activate: `/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u`
- **Per-app menu shortcut overrides** (System Settings → Keyboard → Shortcuts → App Shortcuts) live in each app's `NSUserKeyEquivalents` dict. Modifier chars: `@`=cmd `^`=ctrl `~`=opt `$`=shift; the key is appended literally (space = a literal space). Quit the app first (it reads them at launch). Examples:
  - Photos **Start Playback** → ⌃Space (default ⌥Space clashes with Todoist quick-add `Alt+Space`): `defaults write com.apple.Photos NSUserKeyEquivalents -dict-add "Start Playback" '^ '`
- GUI-only: default browser `defaultbrowser helium` (Helium, 2026-10-25; Arc sunsets 2026-12-22; Chrome stays installed for albot's browser control), wallpaper, Reduce Motion, TCC grants per app.
- **Handoff / Universal Clipboard:** `macos-defaults.sh` enables both advertising
  and receiving, then restarts the continuity services. Also enable Handoff on
  the iPhone under **Settings → General → AirPlay & Continuity → Handoff**.
  Both devices must use the same Apple Account with Wi-Fi and Bluetooth on.
- git: `user.name Exr0n`, `user.email mail@exr0n.com`, signingkey `2027A4BB657CDDAD` (gpgsign **off**), `pull.rebase=true`, `push.autoSetupRemote=true`.

## 7. old-machine restore (backup drive → `mac_backup_YYYY-MM-DD/`)
**Never stage a bulk restore inside iCloud Drive, Desktop, or Documents when
those folders are synced.** A 300k-file/112 GB backup and its deletion wedged
CloudDocs/File Provider metadata, Spotlight, and Raycast File Search. Restore
to a clearly local path (for example `~/secrets_restore`, `~/archive_restore`,
or an external disk), empty iCloud.com's **Recently Deleted**, and let iCloud
finish before indexing or searching the restored data.

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
6. **Raycast:** only the prefs plist survives a file backup (global hotkey ⌥⇧Space + ~4 extension names recoverable). Per-command hotkeys/aliases/quicklinks/snippets live in its internal db — **NOT backed up, no free cloud sync**. After configuring: **Raycast Settings → Advanced → Export** a `.rayconfig` into the albdata archive so the next migration carries everything. Re-add script dir: Settings → Extensions → ➕ → `~/.config/raycast-script-commands`. Raycast File Search synchronously asks Spotlight/File Provider for metadata; if it wedges only on iCloud files, clear the iCloud backlog instead of repeatedly resetting Raycast.
7. **DATA/** → `~/albdata/archive/YYYY-MM-DD-<name>/` (dated containers on
   local storage; use `~/Desktop/pass/albdata/...` only after confirming Desktop
   is not synced to iCloud):
   - **Dayflow**: re-encode JPGs → **AV1 CRF36 + screen-content** (`libsvtav1, scm=2:tune=0, gop600, native res per day×resolution group`); verify EVERY video's frame count vs JPG count before deleting sources. Result this round: 338,677 JPGs / 122 GB → 266 videos / **5.0 GB**, SSIM 0.990. (AV1+scm ≈ 2× smaller than HEVC CRF18 at equal quality on screen content — warped motion + IBC handle scroll/aliasing.) Keep `chunks.sqlite`.
   - **Messages**: skipped (iCloud) — ⚠️ verify "Keep Messages: Forever" before trusting that.
   - Mail / Music / Zotero / VoiceMemos / VSCode / screencapture: straight rsync into dated containers.

## 8. known keybind-eaters (debug order for "my shortcut doesn't work")
1. **screenpipe registers GLOBAL hotkeys** (⌃⌘A/Z/X/U/S, ⌃⌘K/L…) that silently swallow app shortcuts (ate Mail's ⌃⌘A archive). Disable: quit app, set `disabledShortcuts` in `~/.screenpipe/store.bin` to all ids (`show start_recording stop_recording start_audio stop_audio show_chat search lock_vault`), relaunch. *(Plan: replace screenpipe with our own tool.)*
2. **Secure Keyboard Entry** (kitty menu toggle, or any pending sudo prompt) blocks AeroSpace while that app is focused.
3. **Disabled menu items** swallow their own shortcut silently (Mail Archive with nothing selected).
4. Wrong-side modifier: both cmd keys must be swapped (see §4) or right-cmd sends real ⌘.
5. **Todoist global shortcuts** live in `~/Library/Application Support/Todoist/settings.json` → `global_shortcuts` (`activate` Ctrl+Cmd+T, `quick_add` Alt+Space, `quick_add_ramble` "Ramble"). Ramble defaulted to **Alt+Shift+R**, which collides on the same physical key as the `alt-shift-p` window-tag (dvorak preset → physical R). Disable: **quit Todoist first** (else it rewrites the file on exit), set the value to `""`, relaunch. ("Ramble" was the long-unidentified eater — it's a Todoist feature, not a separate app.)
6. Diagnose with **Karabiner-EventViewer** (post-remap events) + synthetic keys (`osascript key code N using option down`) to isolate layer.
7. **"Can't switch away from app X after undocking"** (its full-screen window stays drawn on top; other/tagged spaces switch fine): X's window got **orphaned on a disconnected monitor's Space**, so AeroSpace can't see it — check `aerospace list-windows --workspace <x>` (empty despite the app running) and `... --all | grep X` (absent). `reload-config` and even a full AeroSpace restart **won't** recover it (the window's on a phantom Space). Fix: **quit & reopen app X** so it recreates its window on the live Space → AeroSpace re-detects it. Originally seen with Discord after external monitors disconnect; the default messaging client is now Beeper.

## 9. sign-ins & onboarding (manual, last)
Raycast (then export .rayconfig!), Fantastical accounts, Spark email accounts, Toggl, Zotero, VS Code Settings Sync, Arc, Dayflow onboarding, `gh auth login`. Gatekeeper "malware" flags (e.g. Codex): System Settings → Privacy & Security → Open Anyway.

Codex resume performance depends on the active history under
`~/.codex/sessions`. Archive old sessions instead of deleting them; keeping
thousands of multi-GB active sessions makes the resume picker inventory them
all. Restore only recent sessions on a new laptop and keep the rest under
`~/.codex/archived_sessions`.

## 10. before wiping the backup drive — checklist
Copy to local first: ☐ `DATA/Messages` (74 GB — or verified iCloud Keep-Forever) ☐ `CONFIG/` (27 MB) ☐ `README.md` + `MAINTENANCE.md` ☐ `SECRETS.tar.gz.enc` (encrypted safety net — contains the not-yet-restored Chrome profile + Safari data). And don't shred the local `~/secrets_restore` until those are squared away.

## browser extensions (Arc era, from backup manifest; carry-over list to Helium not yet decided)
uBlock Origin (+Lite) · Tampermonkey (+desmos darkmode script) · SheetKeys · Dark Reader · Zotero Connector · YT Playback Speed · Le Git Graph · Unhook · Matter · Claude Continue-from-Here · ActivityWatch Watcher · DownThemAll · iCloud Passwords · Google Docs Offline
