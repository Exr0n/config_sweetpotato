# Beeper Desktop: DM-first chat search

Patches Beeper Desktop so that searching a person's name (Cmd+K / search) lists the 1:1 DM with them before group chats that contain them.

Made for Beeper Desktop 4.3.229, and applied and verified on 4.3.276 (2026-11-03, sweetpotato3).

## What it changes

Beeper's local chat search runs in the renderer bundle `app.asar:build/renderer/App-<hash>.js`, in the thread-search class's `sortResults()`. That method feeds both search sections, "Chats" (title and network matches) and "In Groups" (participant matches). Upstream it sorts by: network-only match, then low-priority or hidden state, then recency.

The patch puts two keys in front, using lodash `orderBy`, which is stable:

1. **DM match**: the chat is a 1:1 (`type === "single"`, or a merged chat whose members are all 1:1) and the query hit its title (the other person's name) or its participants. These come first.
2. Beeper's network-only demotion stays in place (only relevant when the query matches a network name such as "signal").
3. **Participant count**, ascending: fewest participants first. An unknown count sorts last.
4. Beeper's original keys after that: state penalty, then recency, then id.

`search-sort.diff` shows the change against the original 4.3.229 code, pretty-printed around `sortResults`. `patch-search.mjs` does the real work. It finds the code by shape (`sortResults(x){return f(x,[n=>this.isNetworkOnlyMatch(n)?1:0,...` followed by an `"asc"` directions array), not by minified names, so it survives rebuilds as long as Beeper keeps that method.

`patch-search.mjs` rewrites the one file inside `app.asar` without extracting it, so the unpacked native modules are untouched. It shifts the offsets of later entries, recomputes that file's per-file integrity hashes, and checks every in-archive file hash after writing. It prints the new header hash, which goes into Info.plist `ElectronAsarIntegrity` (Electron refuses to start without it).

## Files

- `apply-search-patch.sh`: idempotent.
  - With no argument: back up the pristine app once per version to `~/.local/share/beeper-patch/orig-<version>/` (an APFS clone, so it costs no space), patch, fix the integrity hash, ad-hoc re-sign the outer bundle, and relaunch if Beeper was running.
  - Already patched: it says so and exits 0.
  - Pattern gone after an update: it exits 3 and leaves the app untouched.
  - `--check` prints `patched`, `unpatched` or `nomatch`.
  - `--update` installs the update Beeper has already downloaded (`~/Library/Caches/beepertexts-updater/pending/*.zip`). It checks first that the bundle is Automattic-signed (team PZYM8XX95Q) and passes Gatekeeper. It moves Squirrel's staged copy aside so the update cannot reinstall unpatched on quit, then patches.
  - `--restore` puts back the pristine Beeper-signed app for the installed version.
- `patch-search.mjs`: the patcher (`status | patch | header-hash`). It needs no system node: the script falls back to Beeper's own binary with `ELECTRON_RUN_AS_NODE=1 ELECTRON_NO_ASAR=1`.
- `search-sort.diff`: the change, for reading.

## After a Beeper update

The ad-hoc signature means Squirrel.Mac will most likely refuse to install future updates itself, because the update no longer matches the running app's signing requirement. Beeper still downloads them. When Beeper says an update is ready, or every so often:

    ~/.config/beeper/apply-search-patch.sh --update   # install the downloaded update and patch it
    ~/.config/beeper/apply-search-patch.sh            # or just re-patch whatever is installed

If either prints "no longer matches the patch pattern", Beeper rewrote its search code and `SORT_RE` in `patch-search.mjs` needs updating. The app is left unpatched but working.

All app data lives in `~/Library/Application Support/BeeperTexts` and is never touched. Login and bridges survived each patch and relaunch.
