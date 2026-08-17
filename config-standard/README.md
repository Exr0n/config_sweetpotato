# Pink Matter configuration standard

A public, versioned catalog describing the full Pink Matter computer setup.
Every behavior has a stable ID so a person or coding agent can install one
specific standard without applying unrelated choices.

## Catalog

| Standard ID | Behavior |
| --- | --- |
| `macos.keyboard.caps-control-escape` | macOS swaps Caps Lock ↔ Control; Karabiner adds tap-for-Escape only |

The machine-readable catalog is [`standard.json`](standard.json). Detailed
instructions live under [`standards/`](standards/).

## Install one standard

Review the repository, then run the exact ID:

```sh
git clone https://github.com/Exr0n/config-standard.git
cd config-standard
./install.sh macos.keyboard.caps-control-escape
```

List the IDs supported by the installer:

```sh
./install.sh list
```

For delegated installation, give a coding agent
[`AGENT-INSTRUCTIONS.md`](AGENT-INSTRUCTIONS.md) and name the exact standard ID.

## Design rules

- Document the complete behavior, including which operating-system or app layer
  owns each part.
- Keep standards independently addressable.
- Preserve unrelated user configuration.
- Never publish credentials, private infrastructure, host aliases, or personal
  machine behavior.

## License

MIT
