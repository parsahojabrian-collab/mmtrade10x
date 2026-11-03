#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import ssl

ROOT = Path("/root/miniapp10x")
CONFIG = Path("/etc/nginx/sites-available/10x")
STATIC = Path("/srv/tenx-public/miniapp")
BACKUPS = ROOT / "academy-content"
DOMAIN = "mmtrade.parsahojabrian.ir"

ALLOWED = [
    "index.html",
    "support.html",
    "10x-fonts.css",
    "10x-onboarding.css",
    "10x-onboarding.js",
    "10x-theme.css",
    "blocks.js",
    "tenx-hybrid3d-examples.js",
    "tenx-hybrid3d-premium.css",
    "tenx-hybrid3d-scenes.js",
    "tenx-hybrid3d.js",
    "tenx-lesson-renderer.js",
    "tenx-quiz-ui.js",
]

ALLOWED += [
    str(p.relative_to(STATIC))
    for p in sorted((STATIC / "fonts/doran").glob("*.woff2"))
]

STAMP = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
BACKUP = BACKUPS / ("scale-p01-activate-" + STAMP)

def blocked(message):
    raise SystemExit("P01_ACTIVATE=BLOCKED_" + message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def command(args):
    return subprocess.run(
        args, capture_output=True, text=True
    ).returncode == 0

def check_http(path):
    req = urllib.request.Request(
        "https://127.0.0.1" + path,
        headers={"Host": DOMAIN}
    )
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(
        req, timeout=8, context=ctx
    ) as response:
        return response.status, response.read()

if os.geteuid() != 0:
    blocked("ROOT_REQUIRED")

if not CONFIG.is_file() or not STATIC.is_dir():
    blocked("PREFLIGHT_FILES_MISSING")

if not command(["nginx", "-t"]):
    blocked("NGINX_ALREADY_INVALID")

original = CONFIG.read_bytes()
source = original.decode("utf-8")

if "TENX_SCALE_P01_BEGIN" in source:
    blocked("ALREADY_INSTALLED")

if source.count("location / {") != 1:
    blocked("UNEXPECTED_LOCATION_STRUCTURE")

if source.count("server_name " + DOMAIN + ";") != 2:
    blocked("UNEXPECTED_SERVER_STRUCTURE")

for name in ALLOWED:
    p = STATIC / name
    if not p.is_file() or p.is_symlink():
        blocked("MISSING_OR_UNSAFE_" + name)

# Check existing production before modifying anything.
try:
    before_health = check_http("/health")
    before_index = check_http("/miniapp/")
    if before_health[0] != 200 or before_index[0] != 200:
        blocked("PRODUCTION_PREFLIGHT_HTTP")
except Exception as e:
    blocked("PRODUCTION_PREFLIGHT_" + type(e).__name__)

BACKUP.mkdir(parents=True, exist_ok=False, mode=0o700)
(BACKUP / "nginx.before").write_bytes(original)

# Explicit locations prevent unapproved files from being served
# by the new static handler.
locations = [
    "    # TENX_SCALE_P01_BEGIN",
    "    location = /miniapp {",
    "        return 308 /miniapp/;",
    "    }",
    "    location = /miniapp/ {",
    "        alias /srv/tenx-public/miniapp/index.html;",
    '        add_header Cache-Control "no-store" always;',
    "    }",
]

for name in ALLOWED:
    if name == "index.html":
        cache = "no-store"
    elif name.endswith(".html"):
        cache = "no-cache"
    else:
        cache = "public, max-age=3600"

    locations += [
        f"    location = /miniapp/{name} {{",
        f"        alias /srv/tenx-public/miniapp/{name};",
        f'        add_header Cache-Control "{cache}" always;',
        "    }",
    ]

# Explicitly block backup artifacts, including those still
# present in Fastify's original public directory.
locations += [
    r"    location ~* ^/miniapp/.*(?:\.bak(?:[./_-]|$)|\.backup|\.before-|\.phase1-|\.delete-element-) {",
    "        return 404;",
    "    }",
    "    # TENX_SCALE_P01_END",
    "",
]

new = source.replace(
    "location / {",
    "\n".join(locations) + "\n    location / {",
    1
)

if new == source:
    blocked("PATCH_NOT_APPLIED")

rollback = BACKUP / "rollback.sh"
rollback.write_text(
    "#!/bin/bash\n"
    "set -euo pipefail\n"
    f"cp '{BACKUP}/nginx.before' '{CONFIG}'\n"
    "nginx -t\n"
    "systemctl reload nginx\n"
    "echo P01_ACTIVATE_ROLLBACK=PASS\n"
)
rollback.chmod(0o700)

def restore():
    CONFIG.write_bytes(original)
    if not command(["nginx", "-t"]):
        print("ROLLBACK_CONFIG_VALIDATION=FAIL")
        return False
    if not command(["systemctl", "reload", "nginx"]):
        print("ROLLBACK_RELOAD=FAIL")
        return False
    return True

try:
    CONFIG.write_text(new, encoding="utf-8")

    if not command(["nginx", "-t"]):
        blocked("NGINX_TEST_FAILED")

    if not command(["systemctl", "reload", "nginx"]):
        blocked("NGINX_RELOAD_FAILED")

    status, index = check_http("/miniapp/")
    expected = (STATIC / "index.html").read_bytes()

    if status != 200 or sha(index) != sha(expected):
        blocked("INDEX_HASH_VERIFICATION_FAILED")

    for name in [
        "tenx-hybrid3d.js",
        "tenx-hybrid3d-scenes.js",
        "10x-theme.css",
        "fonts/doran/Doran-Regular.woff2",
    ]:
        status, body = check_http("/miniapp/" + name)
        if status != 200 or sha(body) != sha(
            (STATIC / name).read_bytes()
        ):
            blocked("ASSET_VERIFICATION_FAILED_" + name)

    status, health = check_http("/health")
    if status != 200:
        blocked("HEALTH_FAILED")

    # A previously public backup must now be inaccessible.
    try:
        check_http("/miniapp/index.html.bak-20261101-131915")
        blocked("BACKUP_FILE_EXPOSED")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            blocked("UNEXPECTED_BACKUP_STATUS")

except BaseException as e:
    print("ACTIVATION_ERROR=", str(e))
    print(
        "AUTO_ROLLBACK=",
        "PASS" if restore() else "FAILED_MANUAL_ACTION_REQUIRED"
    )
    sys.exit(1)

manifest = {
    "config_before_sha256": sha(original),
    "config_after_sha256": sha(new.encode()),
    "allowed_files": ALLOWED,
    "static_path": str(STATIC),
    "api_restarted": False,
    "bot_restarted": False,
}
(BACKUP / "manifest.json").write_text(
    json.dumps(manifest, indent=2),
    encoding="utf-8"
)

print("NGINX_PREFLIGHT=PASS")
print("CONFIG_BACKUP=PASS")
print("NGINX_TEST=PASS")
print("NGINX_RELOAD=PASS")
print("STATIC_INDEX_HASH=PASS")
print("STATIC_ASSET_HASHES=PASS")
print("BACKUP_FILE_BLOCK=PASS")
print("API_HEALTH=PASS")
print("API_RESTARTED=NO")
print("BOT_RESTARTED=NO")
print("ROLLBACK_PATH=", rollback)
print("R13_SCALE_P01_ACTIVATE=PASS")
