# Instructions for a coding agent

This repository is a catalog of addressable Pink Matter setup standards. Install
only the standard IDs named by the user; do not infer or apply the entire
catalog.

## Install one standard

For the Caps Lock / Control / Escape behavior, install:

```text
macos.keyboard.caps-control-escape
```

Procedure:

1. Inspect `standard.json`,
   `standards/macos/caps-control-escape.md`, and `install.sh`.
2. Work only in the current user's account. Do not alter another macOS account.
3. Install prerequisites if missing:
   ```sh
   brew install jq
   brew install --cask karabiner-elements
   ```
4. Open Karabiner-Elements once. Ask the user to approve its required driver,
   Accessibility, and Input Monitoring permissions.
5. Configure the macOS-owned modifier layer for every keyboard the user uses:
   **System Settings → Keyboard → Keyboard Shortcuts → Modifier Keys**.
   Set **Caps Lock Key → Control** and **Control Key → Caps Lock**.
6. From this repository, install only the Karabiner tap overlay:
   ```sh
   ./install.sh macos.keyboard.caps-control-escape
   ```
7. Verify the selected Karabiner profile:
   - has no simple modification sourced from `caps_lock` or `left_control`;
   - has exactly one complex rule whose description is
     `Pink Matter: remapped Control is Control when held, Escape when tapped`;
   - retains all unrelated simple, complex, and device-specific mappings.
8. In Karabiner-EventViewer and a normal app, verify:
   - hold physical Caps Lock with a letter: it behaves as Control;
   - tap physical Caps Lock alone: it emits Escape;
   - physical Control behaves as Caps Lock;
   - unrelated keyboard mappings still work.
9. Run the installer a second time and repeat the structural verification to
   prove idempotence.

Report the standard ID, selected profile name, macOS modifier choices, and
behavioral checks. Do not dump unrelated personal mappings.

## Safety

- The macOS modifier swap owns Caps Lock ↔ Control. Do not recreate that swap
  as Karabiner simple modifications.
- Karabiner owns only the tap-for-Escape overlay.
- Preserve the timestamped backup until the user confirms the behavior.
- If the user requests a different standard, locate its exact ID in
  `standard.json` and follow only its linked documentation.
