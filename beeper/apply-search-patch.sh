#!/bin/bash
# Reapply the Beeper Desktop "DM first" chat-search patch. Idempotent.
#   apply-search-patch.sh            patch if needed, re-sign, relaunch if Beeper was running
#   apply-search-patch.sh --check    print patched | unpatched | nomatch and exit
#   apply-search-patch.sh --no-launch  do not relaunch afterwards
#   apply-search-patch.sh --update   install the update Beeper already downloaded
#                                    (~/Library/Caches/beepertexts-updater/pending/*.zip), after
#                                    checking it is notarized and signed by Automattic, then patch it
#   apply-search-patch.sh --restore  put back the pristine Beeper-signed app for this version
# Exit codes: 0 ok / already patched, 3 pattern no longer matches (Beeper changed the code), 1 other error.
set -euo pipefail

APP="${BEEPER_APP:-/Applications/Beeper Desktop.app}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PATCHER="$HERE/patch-search.mjs"
RES="$APP/Contents/Resources"
PLIST="$APP/Contents/Info.plist"
ASAR="$RES/app.asar"
PB=/usr/libexec/PlistBuddy
VERSION="$($PB -c 'Print :CFBundleShortVersionString' "$PLIST")"
BACKUP="$HOME/.local/share/beeper-patch/orig-$VERSION"
MODE="${1:-apply}"

die() { echo "apply-search-patch: $*" >&2; exit "${2:-1}"; }

# node: system node if present, else Beeper's own Electron binary in node mode
# (run from the pristine backup when it exists, so a half-written app never runs the patcher)
run_node() {
  if command -v node >/dev/null 2>&1; then node "$@"; return; fi
  local bin="$APP/Contents/MacOS/Beeper Desktop"
  [ -x "$BACKUP/Beeper Desktop.app/Contents/MacOS/Beeper Desktop" ] && bin="$BACKUP/Beeper Desktop.app/Contents/MacOS/Beeper Desktop"
  ELECTRON_RUN_AS_NODE=1 ELECTRON_NO_ASAR=1 "$bin" "$@"
}

is_running() { pgrep -f "$APP/Contents/MacOS/Beeper Desktop" >/dev/null 2>&1; }

quit_beeper() {
  is_running || return 0
  osascript -e 'quit app "Beeper Desktop"' >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do is_running || return 0; sleep 0.5; done
  die "Beeper did not quit within 20 s; quit it and rerun"
}

launch_and_verify() {
  open -a "$APP"
  sleep 12
  if is_running; then echo "Beeper relaunched and running (pid $(pgrep -f "$APP/Contents/MacOS/Beeper Desktop" | head -1))"
  else die "Beeper exited after relaunch; restore with: $0 --restore"; fi
}

case "$MODE" in
  --check) run_node "$PATCHER" status "$ASAR"; exit 0 ;;
  --restore)
    [ -d "$BACKUP/Beeper Desktop.app" ] || die "no pristine backup at $BACKUP"
    was=0; is_running && was=1
    quit_beeper
    mv "$APP" "$APP.patched-$(date +%Y%m%d%H%M%S)"
    cp -c -R -p "$BACKUP/Beeper Desktop.app" "$APP"
    codesign --verify --deep --strict "$APP" && echo "restored Beeper-signed $VERSION (the patched copy was kept beside it as $APP.patched-*; delete it once Beeper runs)"
    [ "$was" = 1 ] && launch_and_verify
    exit 0 ;;
  --update)
    ZIP="$(ls -t "$HOME/Library/Caches/beepertexts-updater/pending/"*.zip 2>/dev/null | head -1 || true)"
    [ -n "$ZIP" ] || die "no downloaded update in ~/Library/Caches/beepertexts-updater/pending"
    STAGE="$(mktemp -d "$HOME/.local/share/beeper-patch/stage.XXXXXX")"
    ditto -x -k "$ZIP" "$STAGE"
    NEW="$STAGE/Beeper Desktop.app"
    NEWV="$($PB -c 'Print :CFBundleShortVersionString' "$NEW/Contents/Info.plist")"
    [ "$NEWV" != "$VERSION" ] || die "downloaded update is $NEWV, same as installed; nothing to update"
    [ "$(printf '%s\n%s\n' "$VERSION" "$NEWV" | sort -V | tail -1)" = "$NEWV" ] || die "downloaded $NEWV is older than installed $VERSION"
    codesign --verify --deep --strict "$NEW" || die "update signature invalid"
    codesign -dv "$NEW" 2>&1 | grep -q 'TeamIdentifier=PZYM8XX95Q' || die "update not signed by Automattic (PZYM8XX95Q)"
    spctl -a "$NEW" || die "update not accepted by Gatekeeper"
    # Squirrel's staged copy of this same update would otherwise reinstall it unpatched on quit
    SHIP="$HOME/Library/Caches/com.automattic.beeper.desktop.ShipIt"
    if [ -d "$SHIP" ]; then mv "$SHIP" "$HOME/.local/share/beeper-patch/ShipIt-cache-$(date +%Y%m%d%H%M%S)"; fi
    launchctl remove com.automattic.beeper.desktop.ShipIt 2>/dev/null || true
    was=0; is_running && was=1
    quit_beeper
    mkdir -p "$BACKUP"
    mv "$APP" "$BACKUP/Beeper Desktop.app.replaced-$(date +%Y%m%d%H%M%S)"
    mv "$NEW" "$APP"
    rmdir "$STAGE" 2>/dev/null || true
    echo "installed Beeper $NEWV from $ZIP"
    [ "$was" = 1 ] && export BEEPER_LAUNCH=1
    exec "$0" apply ;;
  apply|--no-launch) ;;
  *) die "unknown option $MODE" ;;
esac

STATE="$(run_node "$PATCHER" status "$ASAR")"
case "$STATE" in
  patched) echo "Beeper $VERSION is already patched; nothing to do"; exit 0 ;;
  nomatch) die "Beeper $VERSION: the search sort code no longer matches the patch pattern (sortResults/isNetworkOnlyMatch). The patch needs updating for this version; app left untouched." 3 ;;
  unpatched) ;;
  *) die "unexpected status '$STATE'" ;;
esac

# 1. pristine backup of this version (APFS clone, costs no space); never overwritten
if [ ! -d "$BACKUP/Beeper Desktop.app" ]; then
  mkdir -p "$BACKUP"
  cp -c -R -p "$APP" "$BACKUP/Beeper Desktop.app"
  cp -c -p "$ASAR" "$PLIST" "$RES/app-update.yml" "$BACKUP/" 2>/dev/null || true
  echo "backed up pristine $VERSION to $BACKUP"
fi

# 2. patch into a temp file beside the original, then swap atomically
TMP="$RES/app.asar.patch-tmp"
OUT="$(run_node "$PATCHER" patch "$ASAR" "$TMP")"
echo "$OUT"
HASH="$(run_node "$PATCHER" header-hash "$TMP")"
[ "${#HASH}" = 64 ] || die "bad header hash"

was=0; is_running && was=1
quit_beeper
mv -f "$TMP" "$ASAR"
$PB -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash $HASH" "$PLIST"
[ "$($PB -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$PLIST")" = "$HASH" ] || die "Info.plist hash not updated"

# 3. ad-hoc re-sign the outer bundle (nested frameworks/helpers keep Beeper's signatures)
codesign --force --sign - "$APP"
codesign --verify --strict "$APP" && echo "re-signed ad hoc"
[ "$(run_node "$PATCHER" status "$ASAR")" = patched ] || die "post-check failed"

# 4. relaunch
if [ "$MODE" != "--no-launch" ] && { [ "$was" = 1 ] || [ "${BEEPER_LAUNCH:-}" = 1 ]; }; then launch_and_verify; fi
echo "done: Beeper $VERSION patched"
