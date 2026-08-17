# `macos.keyboard.caps-control-escape`

## Desired behavior

- Hold physical **Caps Lock**: behave as **Control**.
- Tap physical **Caps Lock** alone: emit **Escape**.
- Physical **Control**: behave as **Caps Lock**.

## Ownership by layer

### 1. macOS owns the modifier swap

For every keyboard in use, open:

**System Settings → Keyboard → Keyboard Shortcuts → Modifier Keys**

Set:

- **Caps Lock Key → Control**
- **Control Key → Caps Lock**

Repeat this for the built-in keyboard and each external keyboard. macOS stores
modifier choices per keyboard, so configuring only one device is incomplete.

### 2. Karabiner owns tap-for-Escape only

Karabiner must not contain simple modifications sourced from `caps_lock` or
`left_control`; those would duplicate or interfere with the macOS swap.

The selected Karabiner profile contains one complex rule:

```json
{
  "description": "Pink Matter: remapped Control is Control when held, Escape when tapped",
  "manipulators": [
    {
      "type": "basic",
      "from": {
        "key_code": "left_control",
        "modifiers": {
          "optional": ["any"]
        }
      },
      "to": [
        {
          "key_code": "left_control",
          "lazy": true
        }
      ],
      "to_if_alone": [
        {
          "key_code": "escape"
        }
      ]
    }
  ]
}
```

Install that overlay with:

```sh
./install.sh macos.keyboard.caps-control-escape
```

The installer removes only conflicting Karabiner simple mappings sourced from
Caps Lock or Left Control, replaces its own named complex rule idempotently,
preserves unrelated mappings, validates JSON, and makes a timestamped backup.

## Verification

1. Hold physical Caps Lock while pressing a control shortcut such as `C`; it
   must behave as Control-C.
2. Tap physical Caps Lock alone; it must emit Escape.
3. Press physical Control; it must toggle Caps Lock.
4. Confirm unrelated Karabiner mappings still work.
5. Repeat on every configured keyboard.
