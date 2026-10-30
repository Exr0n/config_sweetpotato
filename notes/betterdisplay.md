# BetterDisplay notes

Snapshot of BetterDisplay 5.2.1 on sweetpotato3, 2026-10-29. This is a categorized feature inventory based on the official guide and a partial inspection of the installed settings UI, not an exhaustive pane-by-pane audit or a full reading of the wiki.

## Applied and verified

- Three members of the default group: built-in tag 2, Samsung Odyssey G81SF tag 3, Dell U4025QW tag 4. Group layout protection and synchronization are enabled.
- General Brightness synchronization has nits sync and externally triggered updates enabled. Only built-in tag 2 is selected as a synchronization source; all group members are eligible targets. A 1%-down/up CLI adjustment on the built-in changed both targets to their ceilings at the high end. Intermediate brightness matching is not verified.
- Nits anchors stored: Dell manual 25-450; Samsung manual max 250 (the minimum shown was 25). These are manufacturer typical maximum figures, not measurement/calibration. Samsung reports 255 nits via Apple brightness at maximum even with the 250 manual maximum saved, indicating the active controller's reporting can override that manual figure. Built-in UI showed 1-600 for hardware and 500-1600 for HDR. Built-in measured full-screen nits are not verified. Estimated equal nits do not guarantee equal perceived brightness.
- Brightness keys target the screen with mouse pointer, not all screens, so a change on the built-in can propagate through the group. Control plus brightness key targets the built-in according to the official native-key documentation; actual keypress behavior was not tested. Ordinary keys with pointer on an external adjust that external, not the group. All-screen mode bypasses group sync.
- Software video adjustments and combined brightness were shown enabled on each display. Built-in uses Apple brightness, Dell uses DDC, Samsung's active combined controller was Apple, with DDC configured too. Below-minimum behavior has not been tested end-to-end.
- At the high-end source test, DDC luminance reads Dell 100/100 and Samsung 50/50. Thus 50 is Samsung's reported maximum, not 50%; a direct attempt to set 100 read back 50/50. Samsung's normal group path still uses Apple, not verified as DDC.
- XDR software brightness upscaling is on for the built-in; the current full-screen light output was not measured. Accessibility permission was granted. Keys listening after restarting BetterDisplay were visible in settings.
- The Pro trial/license status should be checked before relying on features marked Pro long-term.

## Feature inventory and suggestions

[object Promise]

## Deferred work

The full UI click-through and complete wiki review requested by Albert were not completed. After non-focus-stealing computer control is available, inspect every settings pane and complete this inventory; switch Samsung's normal brightness controller from Apple to DDC if supported and verify reads/writes; configure an always-built-in native-key target or a safe tested shortcut/remap, then verify native keypresses and a mid-range synchronization curve. Check how manual nits ranges interact with Apple-reported nits; measure both minima and maxima with a luminance meter to calibrate if precise matching matters. Do not claim nominal manufacturer SDR specifications are measured HDR/XDR brightness.
