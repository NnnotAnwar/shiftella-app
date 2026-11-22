"""
One command: start the harness dev server, capture every shot, optimise the
PNGs, stop the server.  `corepack yarn screenshots` runs this.

    python3 tools/screenshots/run.py [--dark] [--only name ...] [--out DIR]

Extra arguments are passed to capture.py.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PORT = int(os.environ.get("SCREENSHOT_PORT", "5199"))


def wait_for_port(port: int, timeout: float = 60) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.3)
    raise SystemExit(f"harness server did not start on :{port}")


def main() -> int:
    args = sys.argv[1:]
    out = args[args.index("--out") + 1] if "--out" in args else str(ROOT / "docs/screenshots")
    server = subprocess.Popen(
        ["corepack", "yarn", "vite", "--config", "tools/screenshots/vite.config.ts"],
        cwd=ROOT,
        env={**os.environ, "SCREENSHOT_PORT": str(PORT)},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        wait_for_port(PORT)
        code = subprocess.call([sys.executable, str(HERE / "capture.py"), "--base", f"http://127.0.0.1:{PORT}", *args])
        if code == 0:
            code = subprocess.call([sys.executable, str(HERE / "optimize.py"), out])
        return code
    finally:
        server.terminate()
        server.wait(timeout=10)


if __name__ == "__main__":
    sys.exit(main())
