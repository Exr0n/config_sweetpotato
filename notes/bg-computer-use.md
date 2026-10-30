# Background computer use (Cua Driver)

Current status 2026-10-29: laptop driver-owned grants, background native AX input and live capture PASSED. Read the current verified laptop deployment section first; historical staging/pause sections below are superseded.

## Verified laptop deployment, 2026-10-29, supersedes earlier pause

Albert explicitly approved a headless daemon restart, a harmless already-running-app acceptance test and reversible BetterDisplay tests. CuaDriver 0.38.0 now serves on sweetpotato3 as launchd job io.albot.cua.driver with arguments serve --no-overlay --no-permissions-gate. Its own com.trycua.driver identity reports Accessibility and Screen Recording true, PID 72453 at verification. No additional System Settings window was needed; earlier normal onboarding grants persisted. No other app was launched, focused or restarted in this resumed pass.

Existing Notes PID 88933/window 8555 supplied a harmless reversible AX test. Its Folders sidebar button collapsed the sidebar; the new tree exposed the button at its new token; a second AXPress restored it, and AXOutline readback confirmed restoration. During this pair, a 1 ms observer recorded 14,020 samples over 14.284913 seconds with zero frontmost-PID/cursor changes and no activation events. A separate live window capture returned 1366x902 pixels while an independent observer recorded 12,130 samples over 12.193535 seconds, again zero changes/no activation. These are sampled results, not universal guarantees for every app. The click result itself said effect unverifiable; the changed tree and restored outline supplied the independent effect proof.

The installed fail-closed wrapper remains the narrow tested subset. Use one explicit stable session across observations and mutations. AX-unresolved Safari and Screen Sharing windows were observation-only; no input was sent to them. Do not enable raw pointer, keypress, drag, scroll, custom-canvas input, foreground fallback or app launch based on this evidence.

Private raw Notes trees and screenshots remain ONLY in ~/.local/state/cua-laptop-acceptance/. They contain user content and must not be committed, published or copied into migration exports. Sanitized observer logs, operation receipts, permission status and display-test results are exported in notes/bg-computer-use-tests/laptop/. No secrets are required for the wrapper. Permissions must be granted normally on every new Mac.

A persistent agent template is in notes/bg-computer-use-tests/laptop/io.albot.cua.driver.plist, installed at ~/Library/LaunchAgents/io.albot.cua.driver.plist for next login. It matches the currently submitted launchd job; no unload/reload was performed. On migration, create the log directory and substitute the destination home path before installing the plist. RunAtLoad starts the driver without a window or overlay. Missing permissions cause the wrapper to refuse rather than bypass consent. Telemetry status remains enabled by the vendor default; it was inspected, not changed.

BetterDisplay CLI tests verified 150-nit and 15-nit numerical synchronization, Dell below-hardware-min software dimming and Samsung raw DDC read/write. Original combined brightness was restored. These do not establish physical luminance calibration, keyboard behavior or Samsung normal-path DDC selection. BetterDisplay settingsWindow is off and its AX tree exposes no settings controls; the no-new-visible-window/no-other-app-launch boundary therefore prevents the remaining UI audit/configuration. See notes/betterdisplay.md. Background computer use is operational for the tested native AX subset, NOT a blanket completion of BetterDisplay.

## Intended policy

Prefer APIs, CLIs, and background window-scoped GUI actions for laptop work. Never use desktop scope, foreground delivery, foreground fallback, cursor moving, launch/focus work, or GUI testing on sweetpotato3 while Albert uses it. If a background action is unsupported, stop rather than front the app. Some apps can self-activate even when launched in the background, so background launch is not a guarantee. A driver action reporting success is not proof of its effect; re-read the actual setting. Test new workflows on the mini first and observe frontmost process and physical cursor throughout. Avoid GUI restarts and windows on the laptop. This is best effort, not a promise that every app supports background input.

## Restore and provenance

Candidate: Cua Driver, https://cua.ai/docs/cua-driver/quickstart and https://cua.ai/docs/cua-driver/concepts/how-cua-driver-works . Compared against https://github.com/IAmJSD/OpenComputerUse ; Cua exposes per-window AX/pixel actions, capability reporting and explicit no-foreground defaults and refusals. Native AppKit AX acceptance is independently verified below; custom-canvas delivery is not.

On the mini the signed Homebrew cask is `brew install --cask cuadriver`. Installed bundle `/Applications/CuaDriver.app`, executable `/opt/homebrew/bin/cua-driver`, bundle ID `com.trycua.driver`; version 0.38.0, Developer ID Cua AI Inc, team YCK386LBJ7, notarization verified on installation. Confirm the current cask, code signature and version before future install. Driver telemetry was enabled by default on the mini; inspect `cua-driver telemetry status`, and make an explicit choice with `cua-driver telemetry disable` if desired. No extension, history recorder, or login-start service was configured. The mini app-owned daemon is running for the verified tests. Portable source and acceptance receipts are exported below.

The permissions grant flow is `cua-driver permissions grant` on the actual interactive machine. It requests Accessibility and Screen & System Audio Recording for CuaDriver.app, and macOS Tahoe can additionally ask about direct capture. `cua-driver permissions status --json` is read-only. Require `accessibility:true`, `screen_recording:true`, `source.attribution:"driver-daemon"`, then independently verify a live window capture. A status of unknown is not a grant. OS permissions belong to the machine and signed app; they cannot be migrated as files. Do not edit TCC databases or run resets. LaunchServices attribution matters. Automation permissions for specific target apps may also be requested later. Laptop driver-owned permissions are now verified; see the current laptop deployment section.

## Prepared wrapper and complete reference

`notes/bg-computer-use-wrapper.pending` is a prototype, not installed as an executable command. It accepts an allowlisted tool name and JSON arguments. It requires verified driver-owned Accessibility and Screen Recording and denies foreground mode, desktop targets and unscoped actions. It does not start a daemon, prevent an app from self-activating, or prove input delivery. Its unit checks use a fake driver, not a real GUI. A narrower tested variant is now promoted as notes/bg-computer-use-wrapper; the broader pending prototype remains unchanged and is not the installed command.

Use `cua-driver list-tools`, `cua-driver describe <tool>`, `cua-driver manifest --pretty` and `cua-driver --help` for the installed version. Exported snapshots of the v0.38.0 complete CLI manifest and all 62 per-tool descriptions and schemas are in `notes/cua-driver-manifest.json`, `notes/cua-driver-tool-list.txt` and `notes/cua-driver-tool-reference.txt`; newer versions may differ.

Typical pattern, after test and promotion only: list the exact app and window, capture the window with `get_window_state`, use its live element token with `click` or `set_value`, then recapture and verify. A fresh snapshot invalidates prior element tokens. Pixel coordinates are local to the captured window. `run_steps`, `run_script`, desktop input, `bring_to_front`, global clipboard changes and foreground fallback are deliberately not exposed by this prototype; the raw CLI is more powerful and must not bypass the focus boundary.

## Acceptance and deployment checklist

On the mini: obtain normal permission grants; verify driver-owned status; launch a disposable native app on the mini; record continuous frontmost app and cursor position, take a window screenshot, perform background input, verify app state changed and confirm neither frontmost app nor cursor changed throughout. Check unsupported actions fail safely. Keep test receipts and exact commands here.

Only after passing: install on sweetpotato3 without opening any windows or switching focus, arrange the app-owned daemon and permissions in one deliberate batch, verify permission and capture state without touching Albert's active workspace, promote and test the wrapper, and record exact version, configuration, install artifacts, grant state, commands and results here. If the OS prompts cannot be handled without disturbing him, stop and report the precise required prompts. Background window work becomes the default only after it actually works.

Then use the working method to finish BetterDisplay's deferred items in `notes/betterdisplay.md`: mid-range nits matching, below-minimum dimming, brightness-key behavior on all displays and Samsung DDC selection. Verify readback and avoid changing visible brightness while he is using the laptop without an appropriate safe window.

## Historical mini acceptance and initial deployment boundary, superseded

CuaDriver 0.38.0 now has both Accessibility and Screen Recording on the mini,
verified through its own daemon identity com.trycua.driver, not inherited SSH or
terminal permissions. Both were added through ordinary macOS System Settings,
using the existing Screen Sharing service to access the acct2 console. No TCC
database was edited or reset. The physical display was sufficient, so neither
SimpleDisplay nor a new virtual display was needed or installed.

The disposable native AppKit acceptance app received an AX button press, AX
value setting, AX text insertion, and window-local coordinate click resolved
through AX hit-testing. The button counter increased by two and the text field
read back "verified background input". Before/after window PNGs were captured.
During the last complete run a 1 ms sampling timer recorded 6,557 samples over
11.339 seconds with zero frontmost-PID or physical-cursor changes; the parallel
NSWorkspace activation listener recorded no activation event. This is sampled
evidence plus activation events, not a claim to detect every submillisecond
cursor excursion. Earlier independent runs also recorded zero changes.

Portable test app/observer source, runner, native-only JSON receipts and observer
log are in notes/bg-computer-use-tests/. Full local screenshots and recovery
artifacts remain on the mini at ~/.local/state/cua-permission-recovery/.
The VNC helper there reads the existing vault credential at runtime; do not
copy credentials into this repo or change the global albot-vnc target.

The tested subset is promoted as notes/bg-computer-use-wrapper and linked from
~/.local/bin/bg-computer-use on sweetpotato3. The original .pending prototype is
preserved unchanged. The promoted wrapper allows only click, set_value and
type_text mutations, requires a stable explicit session on window observations
and mutations, requires an exact window or grounded element token, denies
foreground delivery/fallback, desktop scope and modified input, and requires
driver-owned permission booleans before any operation. Token sessions must be
reused across CLI calls; omitting the explicit session produced stale tokens.

Not proven and therefore not enabled by this wrapper are custom-canvas pointer
delivery, keyboard shortcuts, scrolling, dragging, double/right clicks,
cross-Space actions, or arbitrary apps' behavior. A coordinate click passing via
AX is not proof of raw background mouse events. An AX-unresolved window must
remain observation-only, with no foreground escalation.

The same signed/notarized CuaDriver app bundle was copied headlessly to
/Applications/CuaDriver.app on sweetpotato3; codesign --verify --deep --strict
passed and bundle version read back 0.38.0. It was NOT launched or focused, and
nothing there was restarted. Its read-only permissions status reports
daemon_running=false and status=unknown. A wrapper list_windows attempt refused
with exit 2 before taking any action. Thus installation is staged, not a working
laptop deployment, and no laptop permission grant or capture has been claimed.

Exact remaining blocker: normal macOS permission onboarding needs the CuaDriver
app/consent and System Settings UI, but the active instruction forbids opening,
focusing or restarting anything on the laptop. There is no verified existing
driver daemon there to grant/query through. Do not work around this with TCC
edits or claim mini grants transfer. At an explicitly permitted onboarding
window, batch Accessibility, Screen Recording and any direct-capture consent,
then re-check driver-owned status and a live capture. Disable the agent cursor
overlay for any eventual daemon startup. No daemon/login item was installed on
the laptop, so there is no background service migration step to enable yet.

BetterDisplay's mid-range match, below-minimum dim, always-built-in brightness
key control, Samsung DDC selection and full UI inventory remain unverified.
They were not attempted through a foreground path. Preserve the current
BetterDisplay configuration until its safe background control is actually
available on the laptop.


## Laptop onboarding investigation, 2026-10-29T21:07:45-07:00

Read-only inspection found no already-running, externally callable background UI agent that can safely finish onboarding under the current restrictions. No laptop UI action was attempted.

Pangea Screen Memory is running, but its inspected Swift app source exposes capture, listen-only interaction/AX observation, export and diagnostics, not a remote AX mutation or child-process control endpoint. Its SIGUSR1 handler only refreshes diagnostics. No listening TCP socket was found for the running Pangea PID. Modifying its app bundle, injecting code, or restarting it to add an embedded driver is not an acceptable workaround.

No Cua daemon, Codex Computer Use/SkyComputerUseService, AlbotPermissionHost or albot-ui process was running on this laptop at inspection. The mini's corresponding grants and processes do not transfer to this machine. Cua's read-only permissions status still reports daemon_running=false and status=unknown; this is not a determination that every grant is denied.

Raycast and AeroSpace are running. Raycast has registered URL schemes and local scripts, including a Python-evaluation script, but no already-proven remote execution route that guarantees no activation or visible window. No URL was invoked and no script was changed. AeroSpace's window management interface is not a permission-onboarding UI agent. Installed app presence is not proof of current Accessibility or Screen Recording authorization.

Cua's documented embedded-host mode is legitimate when the already-authorized owning app directly launches its own private worker. Setting a host bundle ID in an SSH process, or launching via open/NSWorkspace, does not lend that app's grants. There is no existing callable host integration here. The driver-owned-only promoted wrapper deliberately would not accept host-attributed grants without separate tests and an explicit policy change.

Normal standalone onboarding uses permissions grant and macOS Settings, may display Accessibility, Screen Recording and direct-capture consent, and can require restarting the responsible app. Running it, opening Settings in the background, or trying a LaunchServices URL without proof of invariance would violate the present no-visible-window/no-focus/no-restart boundary. Therefore stop here. No TCC edits or resets, permission prompts, app launches, URL invocations, focus changes or restarts were performed during this investigation.

Remaining BetterDisplay work stays OPEN, not completed by staging Cua. Full settings inventory/wiki review, Samsung normal-controller DDC selection/read-write proof, always-built-in brightness key targeting, real native key tests, intermediate nits matching and below-minimum dimming need a verified permitted control path. Precision luminance calibration additionally needs actual measurement, not nominal specs.

Sources checked on this pass are https://cua.ai/docs/cua-driver/guides/use-the-sdk and https://cua.ai/docs/cua-driver/reference/cli/serve-and-configure . The embedding reference explicitly documents parent-process responsibility, read-only embedded permission checks and restart-on-grant-change behavior.


## Historical onboarding attempt and pause, superseded

Albert explicitly authorized a brief Cua/System Settings onboarding exception, with no unrelated app launches and no deletion. The installed signed CuaDriver bundle was reused. `permissions grant` was invoked through its normal LaunchServices flow. Accessibility Settings showed CuaDriver.app; its checkbox was enabled through normal System Events UI scripting. Screen Recording used the normal add-app picker. While the picker was being navigated, System Settings disappeared before selection could be confirmed. The cause is not established. No attempt was made to reopen it after this disappearance.

The original long-running permissions-grant command subsequently returned success for Accessibility, Screen Recording and direct capture, explicitly saying macOS does not distinguish newly granted from already present consent. Its following diagnostic AppleScript failed because it asked for process name CuaDriver, which was not found. This command receipt is evidence of a successful permission probe at that moment, not proof of a currently serving daemon.

Later independent read-only status checks report daemon_running=false and status=unknown. The expected socket and PID-file artifacts remain under ~/Library/Caches/cua-driver but are not evidence of a live service. One brief process listing showed a cua-driver process, later listings showed none. `call list_windows` failed because the daemon was not running and did not return windows. No harmless-app input test or BetterDisplay mutation occurred. No unrelated app was launched.

Caller subsequently explicitly paused laptop GUI and input pending cause/fresh approval. Do not invoke grant, start/launch/restart any app or daemon, open Settings, send input, or change BetterDisplay under this pause. Only headless state inspection/documentation is allowed. Permissions remain currently unverified; all BetterDisplay deferred items remain OPEN.


2026-10-29 22:17 continuation81de8e41: live idle1069s then immediate gate1090.789808208s passed. Opened only BetterDisplay Settings via documented CLI; activity/180s auto-close watchdog86174 installed. Window21068 existed, but Cua refused observation/input with screen_locked (screen lock/screensaver/display sleep cannot be distinguished). No AX input, key injection, controller change or brightness change attempted. Closed immediately via CLI and readback settingsWindow=off. This is a real access blocker, not completion; do not wake/unlock or bypass. Remaining keys, Samsung normal DDC and full audit OPEN. Future continuation must first inspect lock/screen-saver state headlessly and never open Settings when unavailable.
