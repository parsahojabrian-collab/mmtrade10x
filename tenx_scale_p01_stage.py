#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import shutil
import subprocess
import sys

ROOT = Path("/root/miniapp10x")
SOURCE = ROOT / "public/miniapp"
TARGET = Path("/srv/tenx-public/miniapp")
CONFIG = Path("/etc/nginx/sites-available/10x")
BACKUPS = ROOT / "academy-content"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
BACKUP = BACKUPS / f"scale-p01-{STAMP}"

def fail(reason):
    raise SystemExit("R13_SCALE_P01=BLOCKED_" + reason)

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def inventory(folder):
    result = {}
    for p in folder.rglob("*"):
        if p.is_symlink():
            fail("SYMLINK_IN_STATIC_TREE")
        if p.is_file():
            result[str(p.relative_to(folder))] = digest(p)
    return result

if os.geteuid() != 0:
    fail("ROOT_REQUIRED")

if not SOURCE.is_dir() or not CONFIG.is_file():
    fail("SOURCE_OR_CONFIG_MISSING")

if TARGET.exists():
    fail("TARGET_ALREADY_EXISTS")

if not (SOURCE / "index.html").is_file():
    fail("INDEX_MISSING")

if not shutil.which("nginx"):
    fail("NGINX_MISSING")

test = subprocess.run(
    ["nginx", "-t"],
    capture_output=True,
    text=True
)
if test.returncode:
    fail("NGINX_PREFLIGHT_FAILED")

original = inventory(SOURCE)
if not original:
    fail("EMPTY_SOURCE")

BACKUPS.mkdir(parents=True, exist_ok=True)
BACKUP.mkdir(mode=0o700, exist_ok=False)
shutil.copy2(CONFIG, BACKUP / "nginx.conf.before")

try:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.parent.chmod(0o755)

    shutil.copytree(
        SOURCE,
        TARGET,
        symlinks=False
    )

    for directory, dirs, files in os.walk(TARGET):
        os.chmod(directory, 0o755)
        for name in files:
            os.chmod(Path(directory) / name, 0o644)

    copied = inventory(TARGET)
    if original != copied:
        fail("HASH_MISMATCH")

    manifest = {
        "source": str(SOURCE),
        "target": str(TARGET),
        "config": str(CONFIG),
        "file_count": len(original),
        "files": original,
        "nginx_modified": False,
        "services_restarted": False
    }

    (BACKUP / "manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8"
    )

    rollback = BACKUP / "rollback.sh"
    rollback.write_text(
        "#!/bin/bash\n"
        "set -euo pipefail\n"
        f"test -f '{BACKUP}/manifest.json'\n"
        f"test -d '{TARGET}'\n"
        f"rm -rf -- '{TARGET}'\n"
        "echo R13_SCALE_P01_STAGE_ROLLBACK=PASS\n",
        encoding="utf-8"
    )
    rollback.chmod(0o700)

except BaseException:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    raise

print("PREFLIGHT=PASS")
print("BACKUP=PASS")
print("STATIC_FILES=", len(original))
print("STATIC_HASH_VERIFICATION=PASS")
print("NGINX_CONFIG_CHANGED=NO")
print("DATABASE_CHANGED=NO")
print("SERVICES_RESTARTED=NO")
print("STATIC_TARGET=", TARGET)
print("ROLLBACK_PATH=", BACKUP / "rollback.sh")
print("R13_SCALE_P01_STAGE=PASS")
