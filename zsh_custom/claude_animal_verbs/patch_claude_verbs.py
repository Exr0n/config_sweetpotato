#!/usr/bin/env python3
"""
Patch Claude Code's progress-spinner verb pool with a themed animal pool.

Claude Code (Bun-compiled native binary) embeds its progress verbs as a JS
literal `$38=["Accomplishing","Actioning",...,"Zigzagging"]` in the bundled
source blob inside the executable. There are two byte-identical copies far
apart in the file (one in the runtime bundle, one in source-map debug info).

To avoid shifting any subsequent bytes (which would break offset-references in
the bundle), we keep the *total byte count of the array literal* identical and
just rearrange duck-verb content inside it. We then re-sign ad-hoc so the
hardened-runtime check accepts the modified file.

Usage:
    patch_claude_verbs.py [--binary PATH] [--pool ANIMAL] [--seed N]
                          [--restore] [--dry-run]

Defaults: binary=$(readlink -f ~/.local/bin/claude), pool=duck.

Idempotent — re-running picks a fresh draw and patches in place. Keeps a
backup at <binary>.orig the first time it runs.
"""

from __future__ import annotations

import argparse
import os
import random
import re
import shutil
import subprocess
import sys
from pathlib import Path

# -----------------------------------------------------------------------------
# Animal verb pools. Each entry is a plain-ASCII gerund / verb-shaped phrase.
# The packer needs lengths spanning roughly 6–18 bytes to hit any byte target.
# -----------------------------------------------------------------------------

POOLS: dict[str, list[str]] = {
    "duck": [
        # 6 bytes
        "Diving", "Wading", "Hiding", "Drying",
        # 7
        "Bobbing", "Honking", "Nesting", "Hissing", "Quaking",
        "Bathing", "Wagging", "Pluming", "Webbing", "Hopping",
        # 8
        "Quacking", "Waddling", "Paddling", "Dabbling", "Foraging",
        "Preening", "Floating", "Roosting", "Hatching", "Brooding",
        "Moulting", "Skimming", "Drifting", "Drinking",
        # 9
        "Splashing", "Migrating", "Pondering", "Squawking", "Quack-ing",
        # 10
        "Imprinting", "Mallarding", "Re-nesting", "Egg-laying",
        "Pre-flying", "Pre-honking",
        # 11
        "Pond-diving", "Re-quacking", "Out-honking", "Re-paddling",
        # 12
        "Pond-bobbing", "Out-quacking", "Mud-puddling", "Bill-dipping",
        "Tail-wagging", "Reed-bobbing", "Pond-bathing", "Pond-padding",
        # 13
        "Pond-skimming", "Reed-rustling", "Drake-honking", "Wing-fluffing",
        "Worm-snapping", "Beak-cleaning", "Down-fluffing", "Drake-bobbing",
        "Lake-cruising", "Pre-migrating", "Pond-paddling",
        # 14
        "Splash-landing", "Algae-nibbling", "Drake-quacking",
        "Marsh-paddling", "Cygnet-rearing", "Cattail-hiding",
        "Worm-grabbing!",
        # 15
        "Drake-strutting", "Bread-snatching", "Crumb-snatching",
        "Pond-skimmering",
        # 16
        "Lily-pad-leaping", "Lily-pad-bobbing", "Pond-bath-having",
        "Reed-bed-hiding!",
        # 17
        "Tail-feather-bobs", "Quack-quack-calls",
        # 18
        "Bread-crumb-hunting", "Cattail-fluttering", "Mate-quack-calling",
    ],
    # Future pools follow the same shape — coverage of byte-lengths 6..18.
    # When the rotation feature lands, add: cat, fox, owl, frog, etc.
}


# -----------------------------------------------------------------------------
# Packer
# -----------------------------------------------------------------------------

def array_byte_length(verbs: list[str]) -> int:
    """Bytes of `["v1","v2",...,"vN"]` when written as ASCII JSON."""
    if not verbs:
        return 2
    return 2 + 2 * len(verbs) + (len(verbs) - 1) + sum(len(v.encode("utf-8")) for v in verbs)


def pack_to_target(target_bytes: int, pool: list[str], seed: int) -> list[str]:
    """Find a random verb list whose JSON-array form is exactly target_bytes."""
    rng = random.Random(seed)
    by_len: dict[int, list[str]] = {}
    for v in pool:
        by_len.setdefault(len(v.encode("utf-8")), []).append(v)
    pool_lens = sorted(by_len)
    min_len, max_len = pool_lens[0], pool_lens[-1]

    # array_bytes(N) = 3*N + 1 + sum(content_lens)
    # so for fixed N: content_target = target_bytes - 3*N - 1
    min_N = max(1, (target_bytes - 1) // (max_len + 3))
    max_N = max(min_N, (target_bytes - 1) // (min_len + 3) + 1)
    candidate_Ns = list(range(min_N, max_N + 1))
    rng.shuffle(candidate_Ns)

    for N in candidate_Ns:
        content_target = target_bytes - 3 * N - 1
        if content_target < N * min_len or content_target > N * max_len:
            continue
        for _ in range(3000):
            picks: list[str] = []
            remaining = content_target
            ok = True
            for i in range(N):
                slots_left = N - i - 1
                if slots_left == 0:
                    if remaining in by_len:
                        picks.append(rng.choice(by_len[remaining]))
                        break
                    ok = False
                    break
                lo = max(min_len, remaining - slots_left * max_len)
                hi = min(max_len, remaining - slots_left * min_len)
                if lo > hi:
                    ok = False
                    break
                # Pick any pool length in [lo, hi]
                options = [L for L in pool_lens if lo <= L <= hi]
                if not options:
                    ok = False
                    break
                L = rng.choice(options)
                picks.append(rng.choice(by_len[L]))
                remaining -= L
            if ok and len(picks) == N and array_byte_length(picks) == target_bytes:
                return picks

    raise RuntimeError(
        f"Cannot pack target={target_bytes}B from pool of {len(pool)} "
        f"(lengths {pool_lens})"
    )


# -----------------------------------------------------------------------------
# Binary scan / patch
# -----------------------------------------------------------------------------

# The Bun-bundled JS assigns the verb pool inside an IIFE init block. The
# minified variable name differs between builds (macOS uses `$38`, Linux uses
# `_56`), but the surrounding shape is stable across both:
#     =>{<init>();<var>=["<v1>","<v2>",...,"<vN>"]
# Anchoring on this pattern works pre- and post-patch (we don't depend on any
# specific verb being present), so the patcher remains idempotent.
ARRAY_RE = re.compile(rb'=>\{[\w$]+\(\);[\w$]+=\[("[^"]+",){50,}"[^"]+"\]')


# Distinctive verbs from the original Claude Code pool — used to identify
# the verb-pool array on a pristine binary. Any one of these inside an array
# match is a near-certain positive ID.
ORIGINAL_VERB_SENTINELS = [
    b"Pouncing", b"Frolicking", b"Schlepping", b"Bloviating",
    b"Boondoggling", b"Discombobulating", b"Flibbertigibbeting",
    b"Hullaballooing", b"Razzmatazzing", b"Lollygagging",
    b"Whatchamacalliting", b"Cogitating", b"Tomfoolering",
]


def is_verb_pool_array(content: bytes) -> bool:
    """True if `content` (an array literal) is the Claude Code verb pool —
    either pristine (contains an original verb) or already patched by us
    (contains a verb from any registered animal pool)."""
    if any(s in content for s in ORIGINAL_VERB_SENTINELS):
        return True
    for pool in POOLS.values():
        for v in pool:
            if (b'"' + v.encode("ascii") + b'"') in content:
                return True
    return False


def find_arrays(data: bytes) -> list[tuple[int, int]]:
    """Return [(start, end_exclusive), ...] of verb-pool array literals."""
    found = []
    for m in ARRAY_RE.finditer(data):
        eq = data.find(b"[", m.start())
        if eq < 0:
            continue
        end = m.end()
        if is_verb_pool_array(data[eq:end]):
            found.append((eq, end))
    seen = set()
    uniq = []
    for a, b in found:
        if (a, b) not in seen:
            seen.add((a, b))
            uniq.append((a, b))
    return uniq


def codesign_adhoc(path: Path) -> None:
    """On macOS, replace the Apple Developer signature with an ad-hoc one so
    the hardened-runtime page-hash check accepts our edits. No-op elsewhere
    (Linux ELFs don't carry signatures by default)."""
    if sys.platform != "darwin":
        return
    subprocess.run(
        ["codesign", "--force", "--sign", "-", "--preserve-metadata=entitlements,flags", str(path)],
        check=True,
        capture_output=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--binary", default=os.path.expanduser("~/.local/bin/claude"))
    ap.add_argument("--pool", default="duck", choices=list(POOLS))
    ap.add_argument("--seed", type=int, default=None,
                    help="RNG seed (default: random per run)")
    ap.add_argument("--restore", action="store_true",
                    help="Restore from <binary>.orig backup and exit")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    bin_path = Path(args.binary)
    if bin_path.is_symlink():
        bin_path = bin_path.resolve()
    if not bin_path.exists():
        print(f"Binary not found: {bin_path}", file=sys.stderr)
        return 1
    backup_path = bin_path.with_name(bin_path.name + ".orig")

    if args.restore:
        if not backup_path.exists():
            print(f"No backup at {backup_path}", file=sys.stderr)
            return 1
        shutil.copy2(backup_path, bin_path)
        codesign_adhoc(bin_path)  # re-sign restored copy
        print(f"Restored {bin_path} from {backup_path} and re-signed.")
        return 0

    print(f"Binary: {bin_path}  ({bin_path.stat().st_size:,} bytes)")
    data = bin_path.read_bytes()
    arrays = find_arrays(data)
    if len(arrays) < 2:
        print(f"Expected ≥2 verb arrays, found {len(arrays)}", file=sys.stderr)
        for a, b in arrays:
            print(f"  [{a:#x}..{b:#x}]  {b - a}B  preview={data[a:a+60]!r}",
                  file=sys.stderr)
        return 1

    # Verify all matches are the same byte count and identical content.
    sizes = {b - a for a, b in arrays}
    contents = {data[a:b] for a, b in arrays}
    if len(sizes) != 1 or len(contents) != 1:
        print(f"Mismatched arrays: sizes={sizes} unique_contents={len(contents)}",
              file=sys.stderr)
        return 1
    target_bytes = sizes.pop()
    print(f"Found {len(arrays)} verb arrays, each {target_bytes} bytes:")
    for a, b in arrays:
        print(f"  [{a:#x}..{b:#x}]")

    pool = POOLS[args.pool]
    seed = args.seed if args.seed is not None else int.from_bytes(os.urandom(4), "big")
    print(f"Pool: {args.pool} ({len(pool)} verbs), seed={seed}")
    new_verbs = pack_to_target(target_bytes, pool, seed)
    new_arr = ('["' + '","'.join(new_verbs) + '"]').encode("ascii")
    assert len(new_arr) == target_bytes, f"size mismatch: {len(new_arr)} vs {target_bytes}"

    print(f"Picked {len(new_verbs)} verbs (sample: {new_verbs[:6]} ... {new_verbs[-3:]})")

    if args.dry_run:
        print("Dry run — not writing.")
        return 0

    if not backup_path.exists():
        shutil.copy2(bin_path, backup_path)
        print(f"Backup: {backup_path}")

    new_data = bytearray(data)
    for a, b in arrays:
        new_data[a:b] = new_arr
    tmp_path = bin_path.with_suffix(bin_path.suffix + ".tmp")
    tmp_path.write_bytes(bytes(new_data))
    os.chmod(tmp_path, bin_path.stat().st_mode)
    os.replace(tmp_path, bin_path)
    print(f"Wrote {len(new_data):,} bytes to {bin_path}")

    print("Re-signing (ad-hoc)...")
    codesign_adhoc(bin_path)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
