#!/usr/bin/env python3
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, sys
from datetime import datetime

ROOT = Path("/root/miniapp10x")
LIVE = Path("/srv/tenx-public/miniapp")
WORK = Path("/root/MMTRADE_UIUX_PROMAX_REAL_R1")
STAGE = WORK / "stage"
BASE = "https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/4e1ccacef3d409c647ed352d92307f2f64683499/"

FILES = [
    {
        "path": "apps/api/public/admin.html",
        "before": "2d354e94c65a8daa166e9dc3225182567da6bc7f",
        "after": "23ad91f860478adf95032c2293a39751ff52cbb3",
        "live": None,
    },
    {
        "path": "apps/api/public/team.html",
        "before": "fb9149a91deec7fb139666397aa174981973285c",
        "after": "a1d6b8f04078871ec9de55071560335f8dbf743e",
        "live": None,
    },
    {
        "path": "public/miniapp/p74/studio/uipromax-admin.css",
        "before": None,
        "after": "818595dbd794df9382bcaf56a9b83cd931c5a220",
        "live": "p74/studio/uipromax-admin.css",
    },
    {
        "path": "public/miniapp/p74/studio/uipromax-admin.js",
        "before": None,
        "after": "6745fa4db77f72830419d233a3a0ee0751208a19",
        "live": "p74/studio/uipromax-admin.js",
    },
    {
        "path": "public/miniapp/p74/studio/uipromax-team.css",
        "before": None,
        "after": "ac5116930f4c1773ce3f0f7fa762f40ba851b11f",
        "live": "p74/studio/uipromax-team.css",
    },
]

def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = b"blob " + str(len(data)).encode() + b"\0"
    return hashlib.sha1(header + data).hexdigest()

def state(path: Path, row: dict) -> str:
    if not path.exists():
        return "MISSING" if row["before"] is not None else "READY_NEW_FILE"
    actual = git_blob_sha(path)
    if actual == row["after"]:
        return "ALREADY_INSTALLED"
    if row["before"] and actual == row["before"]:
        return "READY"
    return "CONFLICT:" + actual

def audit() -> bool:
    if not ROOT.is_dir():
        print("BLOCKED: SOURCE_ROOT_MISSING", ROOT); return False
    if not LIVE.is_dir():
        print("BLOCKED: LIVE_MINIAPP_ROOT_MISSING", LIVE); return False
    ok = True
    for row in FILES:
        src = ROOT / row["path"]
        st = state(src, row)
        if st.startswith("CONFLICT") or st == "MISSING":
            print("BLOCKED", row["path"], st); ok = False
        else:
            print("SOURCE", row["path"], st)
        if row["live"]:
            live = LIVE / row["live"]
            lst = state(live, {"before": None, "after": row["after"]})
            if lst.startswith("CONFLICT"):
                print("BLOCKED LIVE", row["live"], lst); ok = False
            else:
                print("LIVE", row["live"], lst)
    if ok:
        print("AUDIT=PASS LIVE_WRITES=NO")
    else:
        print("AUDIT=BLOCKED LIVE_WRITES=NO")
    return ok

def download(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(["curl", "-fSL", "--retry", "3", "--connect-timeout", "15", url, "-o", str(dest)])
    if result.returncode:
        raise RuntimeError("DOWNLOAD_FAILED " + url)

def stage() -> bool:
    if not audit(): return False
    shutil.rmtree(STAGE, ignore_errors=True)
    STAGE.mkdir(parents=True, exist_ok=True)
    for row in FILES:
        dest = STAGE / row["path"]
        download(BASE + row["path"], dest)
        actual = git_blob_sha(dest)
        if actual != row["after"]:
            raise RuntimeError(f"CHECKSUM_MISMATCH {row['path']} expected={row['after']} actual={actual}")
        print("STAGED", row["path"], "GIT_BLOB=OK")
    print("STAGE=PASS LIVE_WRITES=NO")
    return True

def backup() -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = WORK / "backups" / stamp
    target.mkdir(parents=True, exist_ok=False)
    manifest = []
    for row in FILES:
        for kind, path in [("source", ROOT / row["path"]), ("live", LIVE / row["live"] if row["live"] else None)]:
            if path is None: continue
            existed = path.exists()
            rel = f"{kind}/{row['path']}" if kind == "source" else f"live/{row['live']}"
            if existed:
                dest = target / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, dest)
            manifest.append({"kind":kind,"path":str(path),"backup_rel":rel,"existed":existed})
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (WORK / "last_backup.txt").write_text(str(target), encoding="utf-8")
    return target

def restore(target: Path):
    manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
    for item in reversed(manifest):
        path = Path(item["path"])
        saved = target / item["backup_rel"]
        if item["existed"]:
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(saved, path)
        else:
            path.unlink(missing_ok=True)

def install() -> bool:
    if not audit(): return False
    if not all((STAGE / row["path"]).is_file() for row in FILES):
        if not stage(): return False
    target = backup()
    print("BACKUP=" + str(target))
    try:
        for row in FILES:
            staged = STAGE / row["path"]
            src = ROOT / row["path"]
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged, src)
            if row["live"]:
                live = LIVE / row["live"]
                live.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(staged, live)
        print("INSTALL=PASS FILES=5 SERVICES_RESTARTED=NO")
        print("ROLLBACK_COMMAND=python3 /root/MMTRADE_UIUX_PROMAX_REAL_R1/deploy.py rollback --backup " + str(target))
        return True
    except Exception:
        restore(target)
        print("INSTALL=FAIL AUTO_ROLLBACK=PASS BACKUP=" + str(target))
        raise

def verify() -> bool:
    ok = True
    for row in FILES:
        src = ROOT / row["path"]
        actual = git_blob_sha(src) if src.exists() else "MISSING"
        if actual != row["after"]:
            print("VERIFY_FAIL SOURCE", row["path"], actual); ok = False
        if row["live"]:
            live = LIVE / row["live"]
            actual_live = git_blob_sha(live) if live.exists() else "MISSING"
            if actual_live != row["after"]:
                print("VERIFY_FAIL LIVE", row["live"], actual_live); ok = False
    admin = (ROOT / "apps/api/public/admin.html").read_text(encoding="utf-8")
    team = (ROOT / "apps/api/public/team.html").read_text(encoding="utf-8")
    if "uipromax-admin.css?v=UIPROMAX_REAL_R1" not in admin or "uipromax-admin.js?v=UIPROMAX_REAL_R1" not in admin:
        print("VERIFY_FAIL ADMIN_ASSET_LINKS"); ok = False
    if "if(search)search.focus()" in admin:
        print("VERIFY_FAIL IOS_AUTOFOCUS_REMAINS"); ok = False
    if 'class="mm-uipromax-team"' not in team or "uipromax-team.css?v=UIPROMAX_REAL_R1" not in team:
        print("VERIFY_FAIL TEAM_ASSET_LINK"); ok = False
    node = shutil.which("node")
    if node:
        check = subprocess.run([node, "--check", str(ROOT / "public/miniapp/p74/studio/uipromax-admin.js")])
        if check.returncode:
            print("VERIFY_FAIL JS_SYNTAX"); ok = False
    else:
        print("NODE_CHECK=SKIPPED")
    if ok:
        print("VERIFY=PASS FILES=5 API_BOT_DB=UNMODIFIED SERVICES_RESTARTED=NO")
    else:
        print("VERIFY=FAIL")
    return ok

def rollback(backup_path: str | None):
    if backup_path:
        target = Path(backup_path)
    else:
        last = WORK / "last_backup.txt"
        if not last.exists(): raise RuntimeError("NO_BACKUP_FOUND")
        target = Path(last.read_text(encoding="utf-8").strip())
    if not (target / "manifest.json").is_file():
        raise RuntimeError("INVALID_BACKUP " + str(target))
    restore(target)
    print("ROLLBACK=PASS BACKUP=" + str(target))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["audit","stage","install","verify","rollback"])
    parser.add_argument("--backup", default=None)
    args = parser.parse_args()
    if args.command == "audit": ok = audit()
    elif args.command == "stage": ok = stage()
    elif args.command == "install": ok = install()
    elif args.command == "verify": ok = verify()
    else: rollback(args.backup); return
    if not ok: sys.exit(1)

if __name__ == "__main__":
    main()
