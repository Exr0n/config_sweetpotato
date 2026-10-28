#!/usr/bin/python3
"""Publish complete private snapshots via an atomic pointer for calendar readers."""
import collections, fcntl, hashlib, json, os, pathlib, shutil, subprocess, time, uuid
HOME = pathlib.Path.home()
STATE = HOME / ".local/state/pangea-screen-memory/calendar-export"
HELPER = "/Applications/Pangea Screen Memory.app/Contents/Helpers/ScreenMemoryExport"
def atomic_json(path, value):
    temp = path.with_name(path.name + "." + uuid.uuid4().hex)
    with temp.open("x") as f:
        json.dump(value, f, sort_keys=True); f.flush(); os.fsync(f.fileno())
    os.replace(temp, path)
def main():
    os.umask(0o077)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(STATE, 0o700)
    with (STATE / "lock").open("a") as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: return
        dest = STATE / ("snapshot-" + str(time.time_ns()) + "-" + uuid.uuid4().hex[:8])
        dest.mkdir(mode=0o700)
        cursor = {}
        count = 0
        counts = collections.Counter()
        oldest = newest = None
        digest = hashlib.sha256()
        combined = dest / "snapshot.jsonl"
        with combined.open("xb") as output:
            # No page cap: never publish a truncated snapshot.
            page_index = 0
            while True:
                page_index += 1
                page = dest / ("page-" + str(page_index) + ".jsonl")
                args = [HELPER, "--root", str(HOME / "Library/Application Support/PangeaScreenMemory"),
                        "--account-id", "albert", "--out", str(page), "--limit", "1000"]
                for key, flag in [("afterActivity", "--after-activity"), ("afterOCR", "--after-ocr")]:
                    if cursor.get(key) is not None: args += [flag, str(cursor[key])]
                result = subprocess.run(args, capture_output=True, text=True, timeout=45)
                if result.returncode: raise RuntimeError("export failed: " + result.stderr.strip())
                mp = pathlib.Path(str(page) + ".manifest.json")
                manifest = json.loads(mp.read_text())
                data = page.read_bytes()
                rows = [json.loads(line) for line in data.splitlines()]
                if hashlib.sha256(data).hexdigest() != manifest["sha256"] or len(rows) != manifest["records"] or manifest["unreadable"] != 0:
                    raise RuntimeError("page validation failed")
                for row in rows:
                    stream = row["metadata"]["streamID"]
                    counts[stream] += 1
                    at = row["occurredAt"]
                    oldest = min(oldest, at) if oldest else at
                    newest = max(newest, at) if newest else at
                output.write(data); digest.update(data); count += len(rows)
                next_cursor = {k: manifest[k] for k in ["afterActivity", "afterOCR"]}
                if not manifest["complete"] and next_cursor == cursor:
                    raise RuntimeError("pagination made no progress")
                cursor = next_cursor
                page.unlink(); mp.unlink()
                if manifest["complete"]: break
            output.flush(); os.fsync(output.fileno())
        final = dict(manifest)
        final.update(records=count, sourceCounts=dict(counts), sha256=digest.hexdigest(),
                     oldestOccurredAt=oldest, newestOccurredAt=newest, complete=True, remaining=0, unreadable=0)
        final_path = dest / "snapshot.jsonl.manifest.json"
        atomic_json(final_path, final)
        atomic_json(STATE / "latest.json", {"path": str(combined), "manifest": str(final_path)})
        atomic_json(STATE / "status.json", {"ok": True, "checkedAt": time.time(), "records": count, "pages": page_index})
        for old in STATE.glob("snapshot-*"):
            if old != dest and old.is_dir() and not old.is_symlink() and old.stat().st_mtime < time.time() - 86400:
                shutil.rmtree(old)
if __name__ == "__main__":
    try: main()
    except Exception as error:
        if STATE.exists(): atomic_json(STATE / "error.json", {"at": time.time(), "error": str(error)})
        raise
