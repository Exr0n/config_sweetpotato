# BetterDisplay notes

Verified snapshot on sweetpotato3, 2026-10-29. This is a partial live settings/CLI audit plus scoped official-guide research, not an exhaustive click-through or complete wiki review.

## Verified current configuration and tests

Default group tag -1001 contains built-in tag 2, Samsung Odyssey G81SF tag 3, Dell U4025QW tag 4. Layout protection and General Brightness synchronization are enabled. Nits and externally induced changes are on; only built-in tag 2 is a source. IDs are installation-specific.

Fresh reversible CLI tests set the built-in to 150 nits, then 15 nits. At 150, all three reported 150. At 15, all reported approximately 15; Dell hardware brightness reached 0, software brightness 0.798 and raw DDC luminance 0. This verifies the Dell combined path dims below its minimum hardware setting. These values are app estimates, not measured panel luminance or proof of perceptual matching. Samsung/built-in further-below-min software dimming was not separately tested.

Initial combined brightness was 1.0 on each display. Tests restored 1.0 on all three and read back built-in 600, Samsung 255 and Dell 450 estimated nits. Dell DDC restored 100; Samsung DDC restored 50.

Samsung configured controllers are Apple and DDC; the active normal brightness path remains Apple. At 150/15-nit group changes, Samsung raw DDC stayed 50 while its reported Apple brightness changed. A separate direct DDC test wrote 49, read back 49, then restored/read back 50. Its DDC maximum is 50, not 100. Raw DDC works, but DDC-selected normal/group brightness is NOT configured or verified.

Current videoKeyboardControl is displayWithMouse, not an always-built-in target. Plain brightness keys on an external display do not establish built-in source propagation. Official documentation says Control+brightness targets built-in when additional modifiers are enabled; this key combination has not been live-tested. All suitable screens bypasses group synchronization and should not be selected as a supposed fix for nits-matched source sync.

Software adjustments and combined brightness were enabled on all three in the earlier UI inspection. Built-in uses Apple, Dell DDC, Samsung Apple with DDC also configured. Built-in software XDR upscaling is enabled. Manual anchors remain Dell 25-450 and Samsung max250; Samsung active Apple maximum reports255. These are provisional nominal anchors, not measured calibration. Built-in UI hardware1-600/HDR500-1600 is not proof of sustained full-screen1600.

Accessibility had been granted; the earlier UI reported native-key listening. Current key interception and Pro/trial longevity require live confirmation. No app restart was performed in this resumed pass.

## Scoped settings and official-reference inventory

The official guide lists Displays, Groups, Application, Menu, Keyboard, Pro and About. This map is researched; it does not mean every installed pane was opened. The complete exported preference snapshot contains 240 keys at verification, including per-display saved state and caches; it is retained privately, not treated as 228 verified user-facing settings.

Displays covers per-display general behavior, controller selection, image adjustments, resolution/HiDPI, layout and display identity. Device Control permits multiple controllers. Adding DDC is not the same as selecting it for brightness. Prefer hardware brightness affects the normal control path. Treat as generic third-party display is a separate compatibility override with a vendor warning; do not flip it speculatively to force Samsung DDC.

Groups controls layout and synchronization. The current built-in-only source with nits sync is verified numerically. Synchronization and keyboard target selection are distinct. All-screen keys bypass group sync.

Keyboard covers native brightness/audio interception, target displays, custom shortcuts, standard/fine steps and OSD. Control targets built-in, Control+Command external displays; Shift skips sync, while Option can open Settings and Command+brightness-down can change mirroring. Do not synthesize untested global modifier keys on the active laptop. The narrow Cua wrapper deliberately excludes them.

Application and Menu govern app behavior and menu organization. Their full installed values have not been audited. Pro controls license/trial access; About version/update. None was opened or changed during this pass.

Avoid display activation/system-override Apply, power/disconnection, mirroring, language switches that relaunch the app, update/restart actions, or unsupported controller changes while Albert uses the machine. These can blank displays or alter the workspace.

## Exact remaining boundary and open work

Cua background AX and capture now pass on the laptop. However BetterDisplay has no existing window, settingsWindow reads off, and its application AX tree exposes only the menu extra, not settings controls. Creating its Settings window is a visible-window action excluded by the current permission boundary. Do not use raw defaults writes for guessed live controller/key settings, start another app, open its menu or window, or use foreground fallback to force completion.

Still OPEN are the full installed pane-by-pane click-through and complete wiki review, always-built-in native brightness-key configuration and live key tests, Samsung DDC selection for normal/group control, further Samsung/built-in below-min tests and physical luminance calibration if precision is required. Direct Samsung DDC read/write and Dell below-min dimming are now DONE. Numerical midrange source sync is DONE; measured/visual match is not.

Sanitized evidence is in notes/bg-computer-use-tests/laptop/. Private trees/screenshots and original preference exports remain ~/.local/state/cua-laptop-acceptance/. See notes/bg-computer-use.md for background-control limits.

## Sources read on this pass

https://betterdisplay.pro/guide/interface-reference/settings/
https://betterdisplay.pro/guide/interface-reference/settings/keyboard/
https://betterdisplay.pro/guide/interface-reference/settings/keyboard/target-displays/
https://betterdisplay.pro/guide/interface-reference/settings/keyboard/native-keyboard-control/
https://betterdisplay.pro/guide/interface-reference/settings/displays/display/device-control/
https://betterdisplay.pro/guide/interface-reference/settings/displays/display/device-control/settings/
https://betterdisplay.pro/guide/technical-reference/brightness/


2026-10-29 22:17 continuation81de8e41: live idle1069s then immediate gate1090.789808208s passed. Opened only BetterDisplay Settings via documented CLI; activity/180s auto-close watchdog86174 installed. Window21068 existed, but Cua refused observation/input with screen_locked (screen lock/screensaver/display sleep cannot be distinguished). No AX input, key injection, controller change or brightness change attempted. Closed immediately via CLI and readback settingsWindow=off. This is a real access blocker, not completion; do not wake/unlock or bypass. Remaining keys, Samsung normal DDC and full audit OPEN. Future continuation must first inspect lock/screen-saver state headlessly and never open Settings when unavailable.
