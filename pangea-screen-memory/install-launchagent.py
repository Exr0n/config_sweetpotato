#!/usr/bin/env python3
"""Install the GUI-session capture supervisor without touching other jobs."""
import pathlib, plistlib, subprocess, os
home = pathlib.Path.home()
state = home / ".local/state/pangea-screen-memory"
state.mkdir(mode=0o700, parents=True, exist_ok=True)
agent = home / "Library/LaunchAgents/com.exr0n.pangea-screen-memory.plist"
agent.parent.mkdir(parents=True, exist_ok=True)
config = {
    "Label": "com.exr0n.pangea-screen-memory",
    "LimitLoadToSessionType": "Aqua",
    "ProgramArguments": ["/usr/bin/open", "-g", "-a", "/Applications/Pangea Screen Memory.app"],
    "RunAtLoad": True, "StartInterval": 300,
    "StandardOutPath": str(state / "launchd.stdout.log"),
    "StandardErrorPath": str(state / "launchd.stderr.log"),
}
assert pathlib.Path("/Applications/Pangea Screen Memory.app/Contents/MacOS/ScreenMemory").is_file()
with agent.open("wb") as stream:
    plistlib.dump(config, stream)
domain = f"gui/{os.getuid()}"
subprocess.run(["launchctl", "bootout", domain, str(agent)], check=False, capture_output=True)
subprocess.run(["launchctl", "bootstrap", domain, str(agent)], check=True)
subprocess.run(["launchctl", "kickstart", f"{domain}/{config['Label']}"], check=True)
print(agent)
