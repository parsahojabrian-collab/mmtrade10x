#!/usr/bin/env python3
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, sys
from datetime import datetime

ROOT = Path("/root/miniapp10x")
LIVE = Path("/srv/tenx-public/miniapp")
WORK = Path("/root/MMTRADE_UIUX_PROMAX_REAL_R2")
STAGE = WORK / "stage"
BASE = "https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/7f491fd5c3b621c805d664dfe2fc653cae5419e5/"

# Git blob SHA-1 preconditions are intentional: a divergent VPS patch must stop deployment.
FILES = [
    {"path":"apps/api/public/admin.html","before":"2d354e94c65a8daa166e9dc3225182567da6bc7f","after":"23ad91f860478adf95032c2293a39751ff52cbb3","live":None},
    {"path":"apps/api/public/team.html","before":"fb9149a91deec7fb139666397aa174981973285c","after":"a1d6b8f04078871ec9de55071560335f8dbf743e","live":None},
    {"path":"public/miniapp/p74/studio/uipromax-admin.css","before":None,"after":"818595dbd794df9382bcaf56a9b83cd931c5a220","live":"p74/studio/uipromax-admin.css"},
    {"path":"public/miniapp/p74/studio/uipromax-admin.js","before":None,"after":"6745fa4db77f72830419d233a3a0ee0751208a19","live":"p74/studio/uipromax-admin.js"},
    {"path":"public/miniapp/p74/studio/uipromax-team.css","before":None,"after":"ac5116930f4c1773ce3f0f7fa762f40ba851b11f","live":"p74/studio/uipromax-team.css"},
    {"path":"public/miniapp/p74/studio/uipromax-miniapp.css","before":None,"after":"71e43460ec9d254b7adca30830d04eace62c54fb","live":"p74/studio/uipromax-miniapp.css"},
    {"path":"public/miniapp/p74/studio/uipromax-studio.css","before":None,"after":"dc932e2fc9b08e7a3bead957324af4d0b1267c93","live":"p74/studio/uipromax-studio.css"},
    {"path":"public/miniapp/index.html","before":"952592371b2681dbba5298be729b278dea704c1f","after":"6bb7451f60c0584d9e8818a21f3effd03dbc7ef1","live":"index.html"},
    {"path":"public/miniapp/p74/learning/academy-home.html","before":"aeb12a07282ecc2fd2dfe8c25a23ee63cadf9731","after":"c9931b537ec54b9e6e21f98674993199634d6b03","live":"p74/learning/academy-home.html"},
    {"path":"public/miniapp/p74/eplanet/index.html","before":"79c9cebb58b6f95da62cfa3accf758d010d7065b","after":"9d98e5ac3053a26e2b0004c6c93a589525cf3fa5","live":"p74/eplanet/index.html"},
    {"path":"public/miniapp/p74/support/support.html","before":"16e15e61210f547ca238f4bd7188f9e4bebe8469","after":"a1e06fb32ce3ef8a2e4140f4701bb1ca8b567119","live":"p74/support/support.html"},
    {"path":"public/miniapp/p74/copytrade-academy/index.html","before":"587f6b1d2b3cad78ce53039f83e9d56ec456f03e","after":"05efdd0b22374f04f642e58cc75843262b637d48","live":"p74/copytrade-academy/index.html"},
    {"path":"public/miniapp/p74/profile/profile.html","before":"1d424a03d6903e13fe345b149c010c34690bfeb6","after":"bd399d3a39605e7e85aeac3caca964be7570999c","live":"p74/profile/profile.html"},
    {"path":"public/miniapp/p74/studio/index.html","before":"1a68d28784021e34f09e8d610e285e24acb8ffba","after":"31495f1c218fa6b506162157982f57d4a0e36f17","live":"p74/studio/index.html"},
]

def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def state(path: Path, row: dict) -> str:
    if not path.exists():
        return "MISSING" if row["before"] is not None else "READY_NEW_FILE"
    actual = git_blob_sha(path)
    if actual == row["after"]: return "ALREADY_INSTALLED"
    if row["before"] and actual == row["before"]: return "READY"
    return "CONFLICT:" + actual

def audit() -> bool:
    if not ROOT.is_dir(): print("BLOCKED: SOURCE_ROOT_MISSING", ROOT); return False
    if not LIVE.is_dir(): print("BLOCKED: LIVE_MINIAPP_ROOT_MISSING", LIVE); return False
    ok = True
    for row in FILES:
        src = ROOT / row["path"]
        st = state(src, row)
        if st.startswith("CONFLICT") or st == "MISSING":
            print("BLOCKED SOURCE", row["path"], st); ok = False
        else: print("SOURCE", row["path"], st)
        if row["live"]:
            live = LIVE / row["live"]
            lst = state(live, row)
            if lst.startswith("CONFLICT") or lst == "MISSING":
                print("BLOCKED LIVE", row["live"], lst); ok = False
            else: print("LIVE", row["live"], lst)
    print("PLAN_FILES=14")
    print("AUDIT=" + ("PASS" if ok else "BLOCKED") + " LIVE_WRITES=NO")
    return ok

def download(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if subprocess.run(["curl","-fSL","--retry","3","--connect-timeout","15",url,"-o",str(dest)]).returncode:
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
    print("STAGE=PASS FILES=14 LIVE_WRITES=NO")
    return True

def backup() -> Path:
    target = WORK / "backups" / datetime.now().strftime("%Y%m%d_%H%M%S")
    target.mkdir(parents=True, exist_ok=False)
    manifest=[]
    for row in FILES:
        paths=[("source",ROOT/row["path"])]
        if row["live"]: paths.append(("live",LIVE/row["live"]))
        for kind,path in paths:
            existed=path.exists()
            rel=(f"source/{row['path']}" if kind=="source" else f"live/{row['live']}")
            if existed:
                dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,dest)
            manifest.append({"path":str(path),"backup_rel":rel,"existed":existed})
    (target/"manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    (WORK/"last_backup.txt").write_text(str(target),encoding="utf-8")
    return target

def restore(target: Path):
    manifest=json.loads((target/"manifest.json").read_text(encoding="utf-8"))
    for item in reversed(manifest):
        path=Path(item["path"]);saved=target/item["backup_rel"]
        if item["existed"]:
            path.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(saved,path)
        else: path.unlink(missing_ok=True)

def install() -> bool:
    if not audit(): return False
    if not all((STAGE/row["path"]).is_file() for row in FILES):
        if not stage(): return False
    target=backup();print("BACKUP="+str(target))
    try:
        for row in FILES:
            staged=STAGE/row["path"];src=ROOT/row["path"]
            src.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(staged,src)
            if row["live"]:
                live=LIVE/row["live"];live.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(staged,live)
        print("INSTALL=PASS FILES=14 SERVICES_RESTARTED=NO API_BOT_DB=UNTOUCHED")
        print("ROLLBACK_COMMAND=python3 /root/MMTRADE_UIUX_PROMAX_REAL_R2.py rollback --backup "+str(target))
        return True
    except Exception:
        restore(target);print("INSTALL=FAIL AUTO_ROLLBACK=PASS BACKUP="+str(target));raise

def verify() -> bool:
    ok=True
    for row in FILES:
        src=ROOT/row["path"];actual=git_blob_sha(src) if src.exists() else "MISSING"
        if actual!=row["after"]: print("VERIFY_FAIL SOURCE",row["path"],actual);ok=False
        if row["live"]:
            live=LIVE/row["live"];actual=git_blob_sha(live) if live.exists() else "MISSING"
            if actual!=row["after"]: print("VERIFY_FAIL LIVE",row["live"],actual);ok=False
    admin=(ROOT/"apps/api/public/admin.html").read_text(encoding="utf-8")
    team=(ROOT/"apps/api/public/team.html").read_text(encoding="utf-8")
    if "uipromax-admin.css?v=UIPROMAX_REAL_R1" not in admin or "uipromax-admin.js?v=UIPROMAX_REAL_R1" not in admin or "if(search)search.focus()" in admin:
        print("VERIFY_FAIL SUPERADMIN_LINK_OR_IOS_FOCUS");ok=False
    if 'class="mm-uipromax-team"' not in team or "uipromax-team.css?v=UIPROMAX_REAL_R1" not in team:
        print("VERIFY_FAIL TEAM_LINK");ok=False
    page_checks=[
        ("public/miniapp/index.html","uipromax-home"),
        ("public/miniapp/p74/learning/academy-home.html","uipromax-academy"),
        ("public/miniapp/p74/eplanet/index.html","uipromax-eplanet"),
        ("public/miniapp/p74/support/support.html","uipromax-support"),
        ("public/miniapp/p74/copytrade-academy/index.html","uipromax-copytrade"),
        ("public/miniapp/p74/profile/profile.html","uipromax-profile"),
        ("public/miniapp/p74/studio/index.html","uipromax-studio"),
    ]
    for path,cls in page_checks:
        html=(ROOT/path).read_text(encoding="utf-8")
        if cls not in html or "uipromax-miniapp.css?v=UIPROMAX_REAL_R1" not in html:
            print("VERIFY_FAIL PAGE_LINK",path);ok=False
    studio=(ROOT/"public/miniapp/p74/studio/index.html").read_text(encoding="utf-8")
    if "uipromax-studio.css?v=UIPROMAX_REAL_R1" not in studio:
        print("VERIFY_FAIL STUDIO_LINK");ok=False
    node=shutil.which("node")
    if node and subprocess.run([node,"--check",str(ROOT/"public/miniapp/p74/studio/uipromax-admin.js")]).returncode:
        print("VERIFY_FAIL_JS_SYNTAX");ok=False
    if ok: print("VERIFY=PASS FILES=14 API_BOT_DB=UNTOUCHED SERVICES_RESTARTED=NO")
    else: print("VERIFY=FAIL")
    return ok

def rollback(backup_path: str|None):
    if backup_path: target=Path(backup_path)
    else:
        last=WORK/"last_backup.txt"
        if not last.exists(): raise RuntimeError("NO_BACKUP_FOUND")
        target=Path(last.read_text(encoding="utf-8").strip())
    if not (target/"manifest.json").is_file(): raise RuntimeError("INVALID_BACKUP "+str(target))
    restore(target);print("ROLLBACK=PASS BACKUP="+str(target))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("command",choices=["audit","stage","install","verify","rollback"])
    parser.add_argument("--backup",default=None)
    args=parser.parse_args()
    if args.command=="audit": ok=audit()
    elif args.command=="stage": ok=stage()
    elif args.command=="install": ok=install()
    elif args.command=="verify": ok=verify()
    else: rollback(args.backup);return
    if not ok: sys.exit(1)

if __name__=="__main__": main()
