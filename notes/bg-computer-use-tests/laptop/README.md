# Laptop native-background acceptance receipts

These files contain sanitized receipts only. Raw Notes trees and screenshots remain private in ~/.local/state/cua-laptop-acceptance and are deliberately not exported.

input-observer.jsonl covers the reversible Notes Folders AXPress collapse/restore. Tree readback confirmed disappearance/reappearance of the Folders AXOutline; initial total element count1021, collapsed988. Operation responses alone report effect unverifiable and must not be treated as effect proof.

capture-summary.json records the separate live window capture dimensions. capture-observer.jsonl covers that capture with the same frontmost/cursor observer. Both observers include an NSWorkspace activation listener and report zero violations. The timer targets1ms; these are finite samples, not proof about all future app behavior.

Source is ../Observe.swift. During laptop runs its private output directory was changed to ~/.local/state/cua-laptop-acceptance/run1 or run2. Each observer waited for observer-ready before operations and observer-stop afterward. Explicit Cua session laptop-acceptance was reused for snapshots and mutations. Window IDs and element tokens are transient and must never be replayed blindly.

permissions.json is the live daemon-owned TCC status, not inherited terminal authorization. Live capture independently verifies usable capture despite direct_capture_status not_checked in that read-only status call.

betterdisplay-nits-tests.json records original state, source150/source15 numerical readbacks and restoration. samsung-ddc-test.json records raw49/read49/restored50. They are not physical luminance measurements.

io.albot.cua.driver.plist is installed under ~/Library/LaunchAgents for next login. Adjust home paths and create the private log directory before migration. The current session used launchctl submit with the same label/arguments, avoiding reload/restart. No TCP server is exposed. New-machine permissions require normal consent.

Do not enable foreground fallback, create windows, send global key events or try unsupported canvas input from these receipts.
