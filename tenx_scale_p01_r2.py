#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = Path("/root/miniapp10x")
CONFIG = Path("/etc/nginx/sites-available/10x")
SOURCE = ROOT / "public/miniapp"
STATIC = Path("/srv/tenx-public/miniapp")
DOMAIN = "mmtrade.parsahojabrian.ir"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
BACKUP = ROOT / "academy-content" / ("scale-p01-r2-" + STAMP)

FILES = [
    "index.html", "support.html",
    "10x-fonts.css", "10x-onboarding.css",
    "10x-onboarding.js", "10x-theme.css",
    "blocks.js", "tenx-hybrid3d-examples.js",
    "tenx-hybrid3d-premium.css",
    "tenx-hybrid3d-scenes.js",
    "tenx-hybrid3d.js",
    "tenx-lesson-renderer.js",
    "tenx-quiz-ui.js",
]

FILES += [
    str(p.relative_to(STATIC))
    for p in sorted((STATIC / "fonts/doran").glob("*.woff2"))
]

def fail(msg):
    raise RuntimeError(msg)

def run(args):
    return subprocess.run(
        args, capture_output=True, text=True, timeout=20
    )

def sha(data):
    return hashlib.sha256(data).hexdigest()

def probe(path, method="GET"):
    args = [
        "curl", "-sS", "--max-time", "8",
        "--resolve", f"{DOMAIN}:443:127.0.0.1",
        "-o", "/dev/null",
        "-w", "%{http_code}",
        "-X", method,
        f"https://{DOMAIN}{path}"
    ]
    p = run(args)
    if p.returncode:
        fail("CURL_FAILED_" + path)
    return int(p.stdout.strip())

def fetch(path):
    p = subprocess.run([
        "curl", "-fsS", "--max-time", "8",
        "--resolve", f"{DOMAIN}:443:127.0.0.1",
        f"https://{DOMAIN}{path}"
    ], capture_output=True, timeout=15)
    if p.returncode:
        fail("FETCH_FAILED_" + path)
    return p.stdout

if os.geteuid() != 0:
    raise SystemExit("P01_R2=BLOCKED_ROOT_REQUIRED")

if not CONFIG.is_file() or not STATIC.is_dir():
    raise SystemExit("P01_R2=BLOCKED_MISSING_FILES")

original = CONFIG.read_bytes()
source = original.decode("utf-8")

if "TENX_SCALE_P01_BEGIN" in source:
    raise SystemExit("P01_R2=BLOCKED_ALREADY_INSTALLED")

if source.count("location / {") != 1:
    raise SystemExit("P01_R2=BLOCKED_LOCATION_STRUCTURE")

if source.count(f"server_name {DOMAIN};") != 2:
    raise SystemExit("P01_R2=BLOCKED_SERVER_STRUCTURE")

for name in FILES:
    a = SOURCE / name
    b = STATIC / name
    if (
        not a.is_file()
        or not b.is_file()
        or a.is_symlink()
        or b.is_symlink()
    ):
        raise SystemExit("P01_R2=BLOCKED_FILE_" + name)
    if sha(a.read_bytes()) != sha(b.read_bytes()):
        raise SystemExit("P01_R2=BLOCKED_STALE_STATIC_" + name)

if run(["nginx", "-t"]).returncode:
    raise SystemExit("P01_R2=BLOCKED_NGINX_PREFLIGHT")

if probe("/health") != 200 or probe("/miniapp/") != 200:
    raise SystemExit("P01_R2=BLOCKED_HTTP_PREFLIGHT")

BACKUP.mkdir(parents=True, exist_ok=False, mode=0o700)
(BACKUP / "nginx.before").write_bytes(original)

lines = [
    "    # TENX_SCALE_P01_BEGIN",
    "    location = /miniapp/ {",
    "        root /srv/tenx-public;",
    "        index index.html;",
    '        add_header Cache-Control "no-store" always;',
    "    }",
    "",
    "    location = /miniapp/profile/save {",
    "        proxy_pass http://127.0.0.1:3000;",
    "        proxy_set_header Host $host;",
    "        proxy_set_header X-Real-IP $remote_addr;",
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "        proxy_set_header X-Forwarded-Proto $scheme;",
    "    }",
]

for name in FILES:
    cache = (
        "no-store" if name == "index.html"
        else "no-cache" if name.endswith(".html")
        else "public, max-age=3600"
    )
    lines.extend([
        f"    location = /miniapp/{name} {{",
        f"        alias /srv/tenx-public/miniapp/{name};",
        f'        add_header Cache-Control "{cache}" always;',
        "    }"
    ])

lines.extend([
    "    location ^~ /miniapp/ {",
    "        return 404;",
    "    }",
    "    # TENX_SCALE_P01_END",
    ""
])

patched = source.replace(
    "location / {",
    "\n".join(lines) + "\n    location / {",
    1
)

rollback = BACKUP / "rollback.sh"
rollback.write_text(
    "#!/bin/bash\n"
    "set -euo pipefail\n"
    f"cp '{BACKUP}/nginx.before' '{CONFIG}'\n"
    "nginx -t\n"
    "systemctl reload nginx\n"
    "echo P01_R2_ROLLBACK=PASS\n",
    encoding="utf-8"
)
rollback.chmod(0o700)

changed = False

try:
    CONFIG.write_text(patched, encoding="utf-8")
    changed = True

    if run(["nginx", "-t"]).returncode:
        fail("NGINX_TEST_FAILED")

    if run(["systemctl", "reload", "nginx"]).returncode:
        fail("NGINX_RELOAD_FAILED")

    if probe("/health") != 200:
        fail("HEALTH_FAILED")

    if probe("/miniapp/") != 200:
        fail("MINIAPP_FAILED")

    for name in [
        "index.html",
        "tenx-hybrid3d.js",
        "tenx-hybrid3d-scenes.js",
        "10x-theme.css",
        "fonts/doran/Doran-Regular.woff2",
    ]:
        actual = fetch("/miniapp/" + name)
        expected = (STATIC / name).read_bytes()
        if sha(actual) != sha(expected):
            fail("HASH_FAILED_" + name)

    for name in [
        "index.html.bak-20261101-131915",
        "blocks.js.backup-v2-20261030-220043",
        "not-a-real-file.js",
    ]:
        if probe("/miniapp/" + name) != 404:
            fail("UNEXPECTED_PUBLIC_ACCESS_" + name)

    if probe("/miniapp") != 200:
        fail("LEGACY_MINIAPP_FAILED")

    # Do not POST to the profile endpoint:
    # doing so could change user data.

except Exception as e:
    print("ACTIVATION_ERROR=", str(e))
    if changed:
        try:
            CONFIG.write_bytes(original)
            valid = run(["nginx", "-t"]).returncode == 0
            reloaded = (
                valid and
                run(["systemctl", "reload", "nginx"]).returncode == 0
            )
            print(
                "AUTO_ROLLBACK=",
                "PASS" if reloaded else "FAILED"
            )
        except Exception:
            print("AUTO_ROLLBACK=FAILED")
    sys.exit(1)

(BACKUP / "manifest.json").write_text(
    json.dumps({
        "config_before_sha256": sha(original),
        "config_after_sha256": sha(patched.encode()),
        "allowed_files": FILES,
        "rollback": str(rollback)
    }, indent=2),
    encoding="utf-8"
)

print("NGINX_TEST=PASS")
print("NGINX_RELOAD=PASS")
print("STATIC_HASHES=PASS")
print("BACKUP_FILES_BLOCKED=PASS")
print("API_HEALTH=PASS")
print("LEGACY_MINIAPP=PASS")
print("PROFILE_ROUTE_PRESERVED=CONFIG_ONLY")
print("API_RESTARTED=NO")
print("BOT_RESTARTED=NO")
print("ROLLBACK_PATH=", rollback)
print("R13_SCALE_P01_R2=PASS")
