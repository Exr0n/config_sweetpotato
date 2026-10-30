# Background computer use (Cua Driver)

Status 2026-10-29: WORK IN PROGRESS. Cua Driver 0.38.0 is installed on the Mac mini only. Mini Accessibility and Screen Recording have not yet been verified, and no end-to-end background input or focus/cursor preservation test has passed. It is NOT installed or authorized on sweetpotato3. Do not treat this guide or the staged wrapper as a working deployment.

## Intended policy

Prefer APIs, CLIs, and background window-scoped GUI actions for laptop work. Never use desktop scope, foreground delivery, foreground fallback, cursor moving, launch/focus work, or GUI testing on sweetpotato3 while Albert uses it. If a background action is unsupported, stop rather than front the app. Some apps can self-activate even when launched in the background, so background launch is not a guarantee. A driver action reporting success is not proof of its effect; re-read the actual setting. Test new workflows on the mini first and observe frontmost process and physical cursor throughout. Avoid GUI restarts and windows on the laptop. This is best effort, not a promise that every app supports background input.

## Restore and provenance

Candidate: Cua Driver, https://cua.ai/docs/cua-driver/quickstart and https://cua.ai/docs/cua-driver/concepts/how-cua-driver-works . Compared against https://github.com/IAmJSD/OpenComputerUse ; Cua exposes per-window AX/pixel actions, capability reporting and explicit no-foreground defaults and refusals. No independent e2e verification yet.

On the mini the signed Homebrew cask is `brew install --cask cuadriver`. Installed bundle `/Applications/CuaDriver.app`, executable `/opt/homebrew/bin/cua-driver`, bundle ID `com.trycua.driver`; version 0.38.0, Developer ID Cua AI Inc, team YCK386LBJ7, notarization verified on installation. Confirm the current cask, code signature and version before future install. Driver telemetry was enabled by default on the mini; inspect `cua-driver telemetry status`, and make an explicit choice with `cua-driver telemetry disable` if desired. No extension, history recorder, or persistent daemon was configured. No config has been exported from a working deployment.

The permissions grant flow is `cua-driver permissions grant` on the actual interactive machine. It requests Accessibility and Screen & System Audio Recording for CuaDriver.app, and macOS Tahoe can additionally ask about direct capture. `cua-driver permissions status --json` is read-only. Require `accessibility:true`, `screen_recording:true`, `source.attribution:"driver-daemon"`, then independently verify a live window capture. A status of unknown is not a grant. OS permissions belong to the machine and signed app; they cannot be migrated as files. Do not edit TCC databases or run resets. LaunchServices attribution matters. Automation permissions for specific target apps may also be requested later. No laptop permissions have been granted for this driver yet.

## Prepared wrapper and complete reference

`notes/bg-computer-use-wrapper.pending` is a prototype, not installed as an executable command. It accepts an allowlisted tool name and JSON arguments. It requires verified driver-owned Accessibility and Screen Recording and denies foreground mode, desktop targets and unscoped actions. It does not start a daemon, prevent an app from self-activating, or prove input delivery. Its unit checks use a fake driver, not a real GUI. Its subprocess control must be end-to-end tested on the mini before promotion.

Use `cua-driver list-tools`, `cua-driver describe <tool>`, `cua-driver manifest --pretty` and `cua-driver --help` for the installed version. Exported snapshots of the v0.38.0 complete CLI manifest and all 62 per-tool descriptions and schemas are in `notes/cua-driver-manifest.json`, `notes/cua-driver-tool-list.txt` and `notes/cua-driver-tool-reference.txt`; newer versions may differ.

Typical pattern, after test and promotion only: list the exact app and window, capture the window with `get_window_state`, use its live element token with `click` or `set_value`, then recapture and verify. A fresh snapshot invalidates prior element tokens. Pixel coordinates are local to the captured window. `run_steps`, `run_script`, desktop input, `bring_to_front`, global clipboard changes and foreground fallback are deliberately not exposed by this prototype; the raw CLI is more powerful and must not bypass the focus boundary.

## Acceptance and deployment checklist

On the mini: obtain normal permission grants; verify driver-owned status; launch a disposable native app on the mini; record continuous frontmost app and cursor position, take a window screenshot, perform background input, verify app state changed and confirm neither frontmost app nor cursor changed throughout. Check unsupported actions fail safely. Keep test receipts and exact commands here.

Only after passing: install on sweetpotato3 without opening any windows or switching focus, arrange the app-owned daemon and permissions in one deliberate batch, verify permission and capture state without touching Albert's active workspace, promote and test the wrapper, and record exact version, configuration, install artifacts, grant state, commands and results here. If the OS prompts cannot be handled without disturbing him, stop and report the precise required prompts. Background window work becomes the default only after it actually works.

Then use the working method to finish BetterDisplay's deferred items in `notes/betterdisplay.md`: mid-range nits matching, below-minimum dimming, brightness-key behavior on all displays and Samsung DDC selection. Verify readback and avoid changing visible brightness while he is using the laptop without an appropriate safe window.
