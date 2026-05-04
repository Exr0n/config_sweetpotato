#!/usr/bin/env python3
"""
Hot-patch live claude code processes' progress-spinner verb pool by
overwriting the verb strings in their JS heap memory.

The on-disk patcher (`patch_claude_verbs.py`) only affects future
invocations — running processes have the binary mmap'd and the verb
pool already parsed into JSC heap, so they keep the original verbs
until restart. This script reaches into each running process via
/proc/<pid>/mem and overwrites each verb string in place.

Constraints:
  - Same-byte-length replacement only. JSC's StringImpl stores an
    explicit length field; we don't touch it, so the replacement
    must occupy the exact same number of bytes as the original.
    For lengths the duck pool can't cover, we pad shorter ducks
    with trailing space chars (looks fine in spinner display).
  - Requires write access to /proc/<pid>/mem. On Linux with
    yama.ptrace_scope=1 (Ubuntu default), this needs sudo or
    PTRACE_ATTACH. Run with sudo.

Usage:
    sudo python3 hot_patch_running.py PID [PID ...]
    sudo python3 hot_patch_running.py --auto         # all `^claude` PIDs
    sudo python3 hot_patch_running.py --dry-run PID  # count matches, no writes
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from collections import defaultdict

# -----------------------------------------------------------------------------
# Original Claude Code verb pool, in runtime byte form (\xE9 escapes resolved).
# -----------------------------------------------------------------------------
ORIGINAL_VERBS: list[bytes] = [
    b'Accomplishing', b'Actioning', b'Actualizing', b'Architecting', b'Baking',
    b'Beaming', b"Beboppin'", b'Befuddling', b'Billowing', b'Blanching',
    b'Bloviating', b'Boogieing', b'Boondoggling', b'Booping', b'Bootstrapping',
    b'Brewing', b'Bunning', b'Burrowing', b'Calculating', b'Canoodling',
    b'Caramelizing', b'Cascading', b'Catapulting', b'Cerebrating', b'Channeling',
    b'Channelling', b'Choreographing', b'Churning', b'Clauding', b'Coalescing',
    b'Cogitating', b'Combobulating', b'Composing', b'Computing', b'Concocting',
    b'Considering', b'Contemplating', b'Cooking', b'Crafting', b'Creating',
    b'Crunching', b'Crystallizing', b'Cultivating', b'Deciphering', b'Deliberating',
    b'Determining', b'Dilly-dallying', b'Discombobulating', b'Doing', b'Doodling',
    b'Drizzling', b'Ebbing', b'Effecting', b'Elucidating', b'Embellishing',
    b'Enchanting', b'Envisioning', b'Evaporating', b'Fermenting', b'Fiddle-faddling',
    b'Finagling', b'Flamb\xe9ing', b'Flibbertigibbeting', b'Flowing', b'Flummoxing',
    b'Fluttering', b'Forging', b'Forming', b'Frolicking', b'Frosting',
    b'Gallivanting', b'Galloping', b'Garnishing', b'Generating', b'Gesticulating',
    b'Germinating', b'Gitifying', b'Grooving', b'Gusting', b'Harmonizing',
    b'Hashing', b'Hatching', b'Herding', b'Honking', b'Hullaballooing',
    b'Hyperspacing', b'Ideating', b'Imagining', b'Improvising', b'Incubating',
    b'Inferring', b'Infusing', b'Ionizing', b'Jitterbugging', b'Julienning',
    b'Kneading', b'Leavening', b'Levitating', b'Lollygagging', b'Manifesting',
    b'Marinating', b'Meandering', b'Metamorphosing', b'Misting', b'Moonwalking',
    b'Moseying', b'Mulling', b'Mustering', b'Musing', b'Nebulizing',
    b'Nesting', b'Newspapering', b'Noodling', b'Nucleating', b'Orbiting',
    b'Orchestrating', b'Osmosing', b'Perambulating', b'Percolating', b'Perusing',
    b'Philosophising', b'Photosynthesizing', b'Pollinating', b'Pondering', b'Pontificating',
    b'Pouncing', b'Precipitating', b'Prestidigitating', b'Processing', b'Proofing',
    b'Propagating', b'Puttering', b'Puzzling', b'Quantumizing', b'Razzle-dazzling',
    b'Razzmatazzing', b'Recombobulating', b'Reticulating', b'Roosting', b'Ruminating',
    b'Saut\xe9ing', b'Scampering', b'Schlepping', b'Scurrying', b'Seasoning',
    b'Shenaniganing', b'Shimmying', b'Simmering', b'Skedaddling', b'Sketching',
    b'Slithering', b'Smooshing', b'Sock-hopping', b'Spelunking', b'Spinning',
    b'Sprouting', b'Stewing', b'Sublimating', b'Swirling', b'Swooping',
    b'Symbioting', b'Synthesizing', b'Tempering', b'Thinking', b'Thundering',
    b'Tinkering', b'Tomfoolering', b'Topsy-turvying', b'Transfiguring', b'Transmuting',
    b'Twisting', b'Undulating', b'Unfurling', b'Unravelling', b'Vibing',
    b'Waddling', b'Wandering', b'Warping', b'Whatchamacalliting', b'Whirlpooling',
    b'Whirring', b'Whisking', b'Wibbling', b'Working', b'Wrangling',
    b'Zesting', b'Zigzagging',
]

# -----------------------------------------------------------------------------
# Duck pool by byte length (for length-exact replacement).
# -----------------------------------------------------------------------------
DUCK_BY_LENGTH: dict[int, list[bytes]] = {
    5:  [b'Quack', b'Drake', b'Float'],
    6:  [b'Diving', b'Wading', b'Hiding', b'Drying'],
    7:  [b'Bobbing', b'Honking', b'Nesting', b'Hissing', b'Quaking',
         b'Bathing', b'Wagging', b'Pluming', b'Webbing', b'Hopping'],
    8:  [b'Quacking', b'Waddling', b'Paddling', b'Dabbling', b'Foraging',
         b'Preening', b'Floating', b'Roosting', b'Hatching', b'Brooding',
         b'Moulting', b'Skimming', b'Drifting', b'Drinking'],
    9:  [b'Splashing', b'Migrating', b'Pondering', b'Squawking', b'Quack-ing',
         b'Re-diving', b'Re-honkng', b'Pondhopng'],
    10: [b'Imprinting', b'Mallarding', b'Re-nesting', b'Egg-laying',
         b'Pre-flying', b'Pre-honkng', b'Drake-bobs', b'Pond-divng'],
    11: [b'Pond-diving', b'Re-quacking', b'Out-honking', b'Re-paddling',
         b'Pre-dabbling', b'Out-flapping'],  # last two are 12, will fail assert — fix
    12: [b'Pond-bobbing', b'Out-quacking', b'Mud-puddling', b'Bill-dipping',
         b'Tail-wagging', b'Reed-bobbing', b'Pond-bathing', b'Pond-padding'],
    13: [b'Pond-skimming', b'Reed-rustling', b'Drake-honking', b'Wing-fluffing',
         b'Worm-snapping', b'Beak-cleaning', b'Down-fluffing', b'Drake-bobbing',
         b'Lake-cruising', b'Pre-migrating', b'Pond-paddling'],
    14: [b'Splash-landing', b'Algae-nibbling', b'Drake-quacking',
         b'Marsh-paddling', b'Cygnet-rearing', b'Cattail-hiding'],
    15: [b'Drake-strutting', b'Bread-snatching', b'Crumb-snatching'],
    16: [b'Lily-pad-leaping', b'Lily-pad-bobbing', b'Pond-bath-having'],
    17: [b'Tail-feather-bobs', b'Quack-quack-cals'],
    18: [b'Bread-crumb-hunting', b'Cattail-fluttering', b'Mate-quack-calling'],
}


def build_mapping() -> dict[bytes, bytes]:
    """Map each original verb (bytes) to a same-byte-length duck variant."""
    counters: dict[int, int] = defaultdict(int)
    out: dict[bytes, bytes] = {}
    for orig in ORIGINAL_VERBS:
        L = len(orig)
        pool = DUCK_BY_LENGTH.get(L, [])
        # Filter pool to only entries actually matching length (cheap defensive)
        pool = [v for v in pool if len(v) == L]
        if pool:
            d = pool[counters[L] % len(pool)]
            counters[L] += 1
        else:
            # Fallback: shorter duck verb + trailing spaces
            for fl in range(L - 1, 0, -1):
                fpool = [v for v in DUCK_BY_LENGTH.get(fl, []) if len(v) == fl]
                if fpool:
                    short = fpool[counters[fl] % len(fpool)]
                    counters[fl] += 1
                    d = short + b' ' * (L - fl)
                    break
            else:
                d = orig
        if len(d) != L:
            raise AssertionError(f"length mismatch building mapping: {orig!r} -> {d!r}")
        out[orig] = d
    return out


def writable_regions(pid: int) -> list[tuple[int, int]]:
    """Read /proc/<pid>/maps and return the (lo, hi) of private writable regions."""
    out = []
    with open(f"/proc/{pid}/maps") as f:
        for line in f:
            parts = line.split()
            addr_range, perms = parts[0], parts[1]
            # rw-p = private writable (heap, anonymous mmap, JS heap, etc.)
            if perms.startswith("rw") and "p" in perms:
                lo, hi = addr_range.split("-")
                out.append((int(lo, 16), int(hi, 16)))
    return out


def find_pool_buckets(hits: list[tuple[int, bytes]],
                      bucket_size: int = 32 * 1024,
                      min_distinct: int = 25) -> list[tuple[int, bytes]]:
    """Identify verb-pool storage by fixed-size bucket density.

    JSC's WKFastMalloc allocates the 187 verb-pool JSStrings densely when
    it parses the array literal — 187 strings × ~16 bytes = ~3 KB of
    contiguous heap. Each parse produces a bucket where 100+ distinct
    verbs sit within 2-4 KB. Bucket density is a much sharper signal
    than a sliding window, since stray occurrences of common words
    elsewhere (Thinking/Working/Processing inside other JS data) almost
    never share a bucket with 25+ distinct pool verbs.

    Returns the subset of `hits` whose 32-KB bucket contains at least
    `min_distinct` distinct verbs."""
    bucket_distinct: dict[int, set[bytes]] = defaultdict(set)
    bucket_hits: dict[int, list[tuple[int, bytes]]] = defaultdict(list)
    for addr, verb in hits:
        b = addr // bucket_size
        bucket_distinct[b].add(verb)
        bucket_hits[b].append((addr, verb))
    pool: list[tuple[int, bytes]] = []
    for b in sorted(bucket_distinct):
        if len(bucket_distinct[b]) >= min_distinct:
            pool.extend(bucket_hits[b])
    return pool


def patch_pid(pid: int, mapping: dict[bytes, bytes], dry_run: bool,
              max_region_mb: int = 1024,
              bucket_size: int = 32 * 1024,
              bucket_min_distinct: int = 25) -> None:
    """Scan and patch one process. Skips writable regions larger than
    `max_region_mb` (default 1 GB) — those are usually JSC virtual-address
    reservations or memory-mapped data files, not the live JS heap."""
    print(f"[pid {pid}] starting", flush=True)
    try:
        regions = writable_regions(pid)
    except FileNotFoundError:
        print(f"[pid {pid}] no longer exists, skipping")
        return

    # Filter: skip regions too big to plausibly be JS heap.
    big_byte_limit = max_region_mb * 1024 * 1024
    eligible = [(lo, hi) for lo, hi in regions if (hi - lo) <= big_byte_limit]
    skipped = len(regions) - len(eligible)
    eligible_size = sum(hi - lo for lo, hi in eligible)
    print(f"[pid {pid}] {len(regions)} writable regions ({sum(hi-lo for lo,hi in regions)/1024/1024:.0f} MB total); "
          f"scanning {len(eligible)} ≤{max_region_mb}MB ({eligible_size/1024/1024:.0f} MB), skipping {skipped} larger")

    # Build a single regex that matches any verb. re engine compiles literal
    # alternation efficiently and gives us one scan per chunk.
    verb_re = re.compile(b"|".join(re.escape(v) for v in mapping))

    # Pass 1: scan for verb occurrences. We don't write yet — the cluster
    # analysis below decides which addresses are part of the pool.
    fd = os.open(f"/proc/{pid}/mem", os.O_RDWR)
    all_hits: list[tuple[int, bytes]] = []
    bytes_scanned = 0
    t0 = time.monotonic()
    try:
        eligible.sort(key=lambda r: r[1] - r[0], reverse=True)
        for region_idx, (lo, hi) in enumerate(eligible):
            size = hi - lo
            CHUNK = 64 * 1024 * 1024
            offset = lo
            while offset < hi:
                n = min(CHUNK, hi - offset)
                try:
                    os.lseek(fd, offset, os.SEEK_SET)
                    data = os.read(fd, n)
                except OSError:
                    offset += n
                    continue
                if not data:
                    offset += n
                    continue
                bytes_scanned += len(data)
                for m in verb_re.finditer(data):
                    all_hits.append((offset + m.start(), m.group(0)))
                offset += len(data)
            if (region_idx + 1) % 500 == 0 or size >= 64 * 1024 * 1024:
                rate = bytes_scanned / max(time.monotonic() - t0, 0.001) / 1024 / 1024
                print(f"[pid {pid}] scan {region_idx+1}/{len(eligible)}; "
                      f"{bytes_scanned/1024/1024:.0f} MB @ {rate:.0f} MB/s, "
                      f"{len(all_hits)} hits", flush=True)

        scan_elapsed = time.monotonic() - t0
        unique_hits = len({v for _, v in all_hits})
        print(f"[pid {pid}] scan complete: {len(all_hits)} hits / "
              f"{unique_hits} unique verbs in {scan_elapsed:.1f}s")

        # Bucket analysis — pick out verb-pool JSString clusters.
        in_pool = find_pool_buckets(all_hits,
                                    bucket_size=bucket_size,
                                    min_distinct=bucket_min_distinct)
        if not in_pool:
            print(f"[pid {pid}] no dense bucket found — verb pool may not be "
                  f"present yet, or thresholds need tuning. Skipping writes.")
            return

        # Report cluster bounds, broken out by bucket
        cluster_unique = {v for _, v in in_pool}
        bucket_summary: dict[int, int] = defaultdict(int)
        bucket_distinct: dict[int, set[bytes]] = defaultdict(set)
        for a, v in in_pool:
            b = a // bucket_size
            bucket_summary[b] += 1
            bucket_distinct[b].add(v)
        print(f"[pid {pid}] cluster: {len(in_pool)} addrs across "
              f"{len(bucket_summary)} bucket(s), {len(cluster_unique)} unique verbs total")
        for b in sorted(bucket_summary):
            print(f"   0x{b * bucket_size:x}: {bucket_summary[b]} hits, "
                  f"{len(bucket_distinct[b])} distinct verbs")

        # Pass 2: write only inside-cluster addresses
        if dry_run:
            print(f"[pid {pid}] dry-run, not writing")
        else:
            write_failures = 0
            written = 0
            for addr, verb in in_pool:
                dup = mapping[verb]
                try:
                    os.lseek(fd, addr, os.SEEK_SET)
                    os.write(fd, dup)
                    written += 1
                except OSError:
                    write_failures += 1
            print(f"[pid {pid}] patched {written} strings "
                  f"(write failures: {write_failures})")

        # Top-N replacement summary
        cluster_summary: dict[bytes, int] = defaultdict(int)
        for _, v in in_pool:
            cluster_summary[v] += 1
        for orig in sorted(cluster_summary, key=lambda k: -cluster_summary[k])[:8]:
            dup = mapping[orig]
            print(f"   {orig!r:>26}  ->  {dup!r:<26}  x{cluster_summary[orig]}")
    finally:
        os.close(fd)


def find_claude_pids() -> list[int]:
    """Discover all `claude` processes (binary name match, not just substring)."""
    out = subprocess.run(
        ["ps", "-eo", "pid,comm"],
        capture_output=True, text=True, check=True,
    ).stdout
    pids = []
    for line in out.splitlines()[1:]:
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and parts[1] == "claude":
            pids.append(int(parts[0]))
    return pids


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pids", nargs="*", type=int,
                    help="PID(s) to patch (omit + use --auto for all claude PIDs)")
    ap.add_argument("--auto", action="store_true",
                    help="patch every running `claude` process found via ps")
    ap.add_argument("--dry-run", action="store_true",
                    help="locate verbs but don't write")
    ap.add_argument("--show-mapping", action="store_true",
                    help="print the verb->duck mapping and exit")
    args = ap.parse_args()

    mapping = build_mapping()
    if args.show_mapping:
        for orig, dup in mapping.items():
            print(f"{orig!r:>26}  ->  {dup!r}")
        return 0

    pids = list(args.pids)
    if args.auto:
        pids.extend(find_claude_pids())
    pids = sorted(set(pids))
    if not pids:
        print("No PIDs given. Use --auto or pass PIDs explicitly.", file=sys.stderr)
        return 1

    print(f"Targeting {len(pids)} process(es): {pids}")
    print(f"Mapping: {len(mapping)} verbs ({sum(len(v) for v in mapping.values())} total bytes)")

    failures = 0
    for pid in pids:
        try:
            patch_pid(pid, mapping, args.dry_run)
        except PermissionError as e:
            print(f"[pid {pid}] permission denied: {e}", file=sys.stderr)
            print("                 (need sudo or matching ptrace ownership)",
                  file=sys.stderr)
            failures += 1
        except Exception as e:
            print(f"[pid {pid}] ERROR: {e}", file=sys.stderr)
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
