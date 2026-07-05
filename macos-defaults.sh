#!/usr/bin/env bash
# macos-defaults.sh — curated macOS settings for sweetpotato.
# Hand-picked from the old-machine dump (archive/2026-06-01-config/CONFIG/
# macos_settings/key_defaults_readable.txt) by reading every domain, NOT a
# blind import. Re-runnable / idempotent. Run: bash ~/.config/macos-defaults.sh
#
# Sections marked "# REVIEW" are judgment calls left commented — uncomment to opt in.
# After running, the killall block at the bottom restarts affected UI services.
set -uo pipefail

### ── keyboard / text (NSGlobalDomain) ─────────────────────────────
defaults write -g ApplePressAndHoldEnabled -bool false          # hold key = repeat, not accent popup
defaults write -g KeyRepeat -int 1                              # fastest repeat
defaults write -g InitialKeyRepeat -int 10                     # short repeat delay
defaults write -g NSAutomaticCapitalizationEnabled -bool false
defaults write -g NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write -g NSAutomaticSpellingCorrectionEnabled -bool false
defaults write -g NSAutomaticInlinePredictionEnabled -bool false
defaults write -g WebAutomaticSpellingCorrectionEnabled -bool false
defaults write -g AppleShowAllExtensions -bool true            # show all file extensions

### ── UI / windows / animations (NSGlobalDomain) ──────────────────
defaults write -g AppleMenuBarVisibleInFullscreen -bool false
defaults write -g _HIHideMenuBar -bool false                  # don't auto-hide menu bar
defaults write -g AppleReduceDesktopTinting -bool false       # no wallpaper-tinted windows
defaults write -g AppleScrollerPagingBehavior -bool true      # click scrollbar track = jump to spot
defaults write -g AppleSpacesSwitchOnActivate -bool true      # activating app jumps to its space
defaults write -g AppleMiniaturizeOnDoubleClick -bool false
defaults write -g NSAutomaticWindowAnimationsEnabled -bool false
defaults write -g NSDocumentRevisionsWindowTransformAnimation -bool false
defaults write -g NSTableViewDefaultSizeMode -int 2           # medium sidebar icons
defaults write -g AppleEnableSwipeNavigateWithScrolls -bool false  # no 2-finger swipe back/fwd
defaults write -g AppleInterfaceStyleSwitchesAutomatically -bool true  # auto light/dark by time of day

### ── pointer / trackpad speed & behavior ─────────────────────────
defaults write -g com.apple.trackpad.scaling -float 1.5       # trackpad tracking speed
defaults write -g com.apple.mouse.scaling -float 0.6875       # mouse tracking speed
defaults write -g com.apple.scrollwheel.scaling -float 0.75   # scroll speed
defaults write -g com.apple.mouse.linear -bool true
defaults write -g com.apple.trackpad.forceClick -bool true
defaults write -g com.apple.springing.enabled -bool true      # spring-loaded folders
defaults write -g com.apple.springing.delay -float 0.5
for d in com.apple.AppleMultitouchTrackpad com.apple.driver.AppleBluetoothMultitouch.trackpad; do
  defaults write $d Clicking -bool false          # tap-to-click OFF (old-machine pref)
  defaults write $d Dragging -bool false
  defaults write $d DragLock -bool false
  defaults write $d ActuationStrength -int 1      # firm click feel
  defaults write $d FirstClickThreshold -int 0    # light click pressure
  defaults write $d SecondClickThreshold -int 0
  defaults write $d HIDScrollZoomModifierMask -int 262144  # ctrl = scroll-to-zoom modifier
done

### ── Dock ─────────────────────────────────────────────────────────
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock show-process-indicators -bool false   # no running dots
defaults write com.apple.dock mru-spaces -bool false                # DON'T reorder Spaces by use (matters for AeroSpace)
defaults write com.apple.dock launchanim -bool false
defaults write com.apple.dock mineffect -string scale
defaults write com.apple.dock "expose-animation-duration" -float 0.001   # instant Mission Control
defaults write com.apple.dock tilesize -int 39
defaults write com.apple.dock wvous-tr-corner -int 10               # top-right hot corner = display sleep
defaults write com.apple.dock wvous-tr-modifier -int 0

### ── Finder ────────────────────────────────────────────────────────
defaults write com.apple.finder FXPreferredViewStyle -string clmv   # column view default
defaults write com.apple.finder FXPreferredGroupBy -string Name
defaults write com.apple.finder FXArrangeGroupViewBy -string Name
defaults write com.apple.finder FXDefaultSearchScope -string SCcf   # search current folder, not This Mac
defaults write com.apple.finder FXRemoveOldTrashItems -bool true    # auto-empty trash after 30 days
defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool true
defaults write com.apple.finder ShowHardDrivesOnDesktop -bool false
defaults write com.apple.finder ShowMountedServersOnDesktop -bool true
defaults write com.apple.finder ShowRemovableMediaOnDesktop -bool true

# Menu-bar clock: old machine had analog/no-date/no-day, but you prefer the
# digital clock with day + AM/PM — left at the default, not overridden.

### ── Stage Manager / desktop (WindowManager) ─────────────────────
defaults write com.apple.WindowManager GloballyEnabled -bool false            # Stage Manager off
defaults write com.apple.WindowManager EnableStandardClickToShowDesktop -bool false  # clicking wallpaper doesn't hide windows

### ── Accessibility Zoom (ctrl-scroll, full screen, follows pointer) ─
defaults write com.apple.universalaccess closeViewScrollWheelToggle -bool true
defaults write com.apple.universalaccess closeViewScrollWheelModifiersInt -int 262144  # Control
defaults write com.apple.universalaccess closeViewZoomMode -int 0            # full screen
defaults write com.apple.universalaccess closeViewPanningMode -int 0         # continuous w/ pointer
defaults write com.apple.universalaccess closeViewSmoothImages -bool true
defaults write com.apple.universalaccess closeViewHotkeysEnabled -bool true  # ⌥⌘8 / ⌥⌘= zoom hotkeys
defaults write com.apple.universalaccess closeViewDesiredZoomFactor -float 1.345925331115723

### ── Safari (you mostly use Arc, but keep the dev tools on) ───────
defaults write com.apple.Safari IncludeDevelopMenu -bool true
defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true
defaults write com.apple.Safari com.apple.Safari.ContentPageGroupIdentifier.WebKit2DeveloperExtrasEnabled -bool true

### ── screenshots ──────────────────────────────────────────────────
# NB: old machine had show-thumbnail=0, but you WANT the floating thumbnail — keep it on.
defaults write com.apple.screencapture show-thumbnail -bool true

### ── text replacements (⌥⌘ System Settings → Keyboard → Text) ─────
defaults write -g NSUserDictionaryReplacementItems -array \
  '{ on = 1; replace = tn; with = tonight; }'   # (omw removed per request)

# ── REVIEW (uncomment to opt in) ─────────────────────────────────────
# defaults write -g AppleLanguages -array en-US zh-Hans-US   # re-add Chinese as 2nd language (invasive; affects whole UI order)
# defaults write com.apple.dock wvous-br-corner -int 1       # explicitly disable bottom-right hot corner
# Menu-bar item layout (com.apple.controlcenter "NSStatusItem Visible …") is very
# machine/monitor-specific (pixel positions won't match) — set via GUI drag instead.

### ── restart affected UI services ────────────────────────────────
for app in Finder Dock SystemUIServer ControlCenter; do killall "$app" 2>/dev/null; done
/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u 2>/dev/null
killall universalaccessd 2>/dev/null
echo "macos-defaults.sh applied."
