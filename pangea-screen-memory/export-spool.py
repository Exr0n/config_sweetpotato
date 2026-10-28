#!/usr/bin/python3
"""Private incremental GUI exporter. Read latest/ snapshot pair atomically via readlink."""
import fcntl, hashlib, json, os, pathlib, subprocess, time, uuid
HOME = pathlib.Path.home()
STATE = HOME / ".local/state/pangea-screen-memory/export-spool"
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
        cursor_path = STATE / "cursor.json"
        cursor = json.loads(cursor_path.read_text()) if cursor_path.exists() else {}
        # Each immutable page is committed before cursor advancement. A crash may
        # replay records but cannot skip them. Consumers deduplicate record IDs.
        for _ in range(100):
            page = STATE / ("page-" + str(time.time_ns()) + "-" + uuid.uuid4().hex[:8])
            page.mkdir(mode=0o700)
            out = page / "snapshot.jsonl"
            args = [HELPER, "--root", str(HOME / "Library/Application Support/PangeaScreenMemory"),
                    "--account-id", "albert", "--out", str(out), "--limit", "1000"]
            for key, flag in [("afterActivity", "--after-activity"), ("afterOCR", "--after-ocr")]:
                if cursor.get(key) is not None: args += [flag, str(cursor[key])]
            result = subprocess.run(args, capture_output=True, text=True, timeout=45)
            if result.returncode:
                raise RuntimeError("export failed: " + result.stderr.strip())
            manifest = json.loads((page / "snapshot.jsonl.manifest.json").read_text())
            digest = hashlib.sha256()
            count = 0
            with out.open("rb") as f:
                for line in f: digest.update(line); json.loads(line); count += 1
            if digest.hexdigest() != manifest["sha256"] or count != manifest["records"] or manifest["unreadable"] != 0:
                raise RuntimeError("snapshot validation failed")
            atomic_json(page / "commit.json", {"cursorBefore": cursor, "manifest": manifest})
            link = STATE / ("latest-" + uuid.uuid4().hex)
            link.symlink_to(page.name, target_is_directory=True)
            os.replace(link, STATE / "latest")
            cursor = {k: manifest[k] for k in ["afterActivity", "afterOCR"]}
            atomic_json(cursor_path, cursor)
            atomic_json(STATE / "status.json", {"ok": True, "checkedAt": time.time(),
                        "latest": page.name, "records": count, "complete": manifest["complete"], **cursor})
            if manifest["complete"]: break
        else: raise RuntimeError("pagination limit reached; next tick resumes committed cursor")
if __name__ == "__main__":
    try: main()
    except Exception as error:
        if STATE.exists(): atomic_json(STATE / "error.json", {"at": time.time(), "error": str(error)})
        raise
