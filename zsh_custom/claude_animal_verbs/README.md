# claude_animal_verbs

Hot-patches Claude Code's progress-spinner verb pool (the gerunds shown
during processing — "Pouncing…", "Frolicking…", "Razzmatazzing…") with a
themed animal pool of your choice.

## How it works

Claude Code is a Bun-compiled native binary that embeds its bundled JS
source as plaintext inside a Mach-O / ELF executable. The verb pool lives
as a JS literal `<minified_var>=["Accomplishing","Actioning",…,"Zigzagging"]`
inside an IIFE init block, and there are two byte-identical copies in the
file (one in the runtime bundle, one in source-map debug info).

We can replace the array contents freely — but the **total byte count of
the array literal must stay constant**, otherwise every byte after it
shifts and bundle-internal offsets break. Within that fixed budget we can
have any number of duck (or cat, or owl…) verbs of any length: a packer
walks the pool and lands exactly on the target byte count.

On macOS we then re-sign the binary ad-hoc so the hardened-runtime
page-hash check accepts our edits. On Linux that step is a no-op.

## Usage

```bash
# Patch with random duck verbs
python3 patch_claude_verbs.py

# Pick a specific seed (deterministic)
python3 patch_claude_verbs.py --seed 42

# Future: other pools
python3 patch_claude_verbs.py --pool cat

# Dry-run (show what would be written)
python3 patch_claude_verbs.py --dry-run

# Roll back to the pristine binary
python3 patch_claude_verbs.py --restore
```

Defaults: `--binary $(readlink -f ~/.local/bin/claude)`, `--pool duck`,
`--seed` random.

A backup of the pristine binary is saved alongside as `<binary>.orig` on
the first run; subsequent patches always start from the latest on-disk
state but `--restore` always returns to that pristine copy.

## Idempotency

Detection works pre- and post-patch — the script anchors on the
surrounding JS context (`=>{<init>();<var>=[`) and content-fingerprints
the array against either the original Claude verbs or any verb in any
registered animal pool. So you can re-run freely.

## Caveats

- Claude Code auto-updates. After an update, the patch is gone — re-run.
- "Hot-patch" is a misnomer: a running `claude` process has the binary
  mmap'd; modifying the file does not affect live pages, only future
  invocations. Prank fires the next time the target opens claude.
- The current `claude` session that *runs* the patcher is fine —
  `os.replace` is atomic and the in-flight inode stays alive.

## Future: scheduled rotation

The shape `--pool {animal}` is already in place to rotate themes. To
auto-rotate every 3 hours, add more entries under `POOLS` in the script
and a cron job:

```cron
0 */3 * * *  /usr/bin/python3 ~/.config/zsh_custom/claude_animal_verbs/patch_claude_verbs.py --pool $(shuf -e duck cat owl fox frog -n1)
```
