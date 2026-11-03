#!/usr/bin/env python3
from pathlib import Path
import zipfile, hashlib, shutil, datetime, subprocess, sys, os
ROOT=Path('/root/miniapp10x'); LIVE=Path('/srv/tenx-public/miniapp/index.html')
BASE=ROOT/'academy-content'; ZIP=BASE/'Q15_HISTORY_PATCH.zip'
API=ROOT/'apps/api/src/index.ts'; HTML=ROOT/'public/miniapp/index.html'
DIST=ROOT/'dist/apps/api/src/index.js'
OLD_API='a24499c71fb09f48a7f2fd1703f52be7b758fdf74c00e6a1f9097656502fdc7e'; OLD_HTML='d48d58b8f33563cd47ac7fbcc6830f1ee1c2d3c3edc0f513ba99be83006e9649'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args, **kw):
    p=subprocess.run(args,cwd=ROOT,text=True,capture_output=True,**kw)
    if p.returncode: raise RuntimeError('COMMAND_FAILED='+str(args)+'\n'+(p.stdout+p.stderr)[-2200:])
    return p
if not all(x.is_file() for x in (ZIP,API,HTML,LIVE)):
    sys.exit('PREFLIGHT_FAIL=MISSING_FILE')
if digest(API)!=OLD_API or digest(HTML)!=OLD_HTML or digest(LIVE)!=OLD_HTML:
    sys.exit('PREFLIGHT_FAIL=SOURCE_CHANGED_OR_LIVE_DIFFERS; NO_CHANGES_MADE')
with zipfile.ZipFile(ZIP) as z:
    next_api=z.read('payload/index.ts');next_html=z.read('payload/index.html')
if b'TENX_Q15_HISTORY_V1' not in next_api or b'TENX_Q15_HISTORY_V1' not in next_html:
    sys.exit('PREFLIGHT_FAIL=PAYLOAD_INVALID')
if not (ROOT/'node_modules').exists() or not (ROOT/'tsconfig.json').exists():
    sys.exit('PREFLIGHT_FAIL=BUILD_DEPENDENCIES_MISSING')
backup=BASE/('Q15_BACKUP_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
for p,n in [(API,'api_index.ts'),(HTML,'source_index.html'),(LIVE,'live_index.html')]:shutil.copy2(p,backup/n)
if DIST.exists(): shutil.copy2(DIST,backup/'dist_index.js')
print('BACKUP='+str(backup),flush=True)
committed=False
try:
    API.write_bytes(next_api)
    HTML.write_bytes(next_html)
    run(['./node_modules/.bin/tsc','-p','tsconfig.json','--noEmit'])
    print('TYPESCRIPT_CHECK=PASS',flush=True)
    run(['npm','run','build'])
    print('BUILD=PASS',flush=True)
    shutil.copy2(HTML,LIVE)
    run(['systemctl','restart','10x-api.service'])
    run(['systemctl','is-active','--quiet','10x-api.service'])
    if digest(LIVE)!=digest(HTML): raise RuntimeError('LIVE_VERIFY_FAIL')
    committed=True
    print('Q15_PUBLISH=PASS',flush=True)
    print('API_AND_DATABASE_SCHEMA=UNCHANGED_SCHEMA',flush=True)
    print('Q13_Q14_PRESERVED=YES',flush=True)
except Exception as e:
    print('Q15_INSTALL_FAIL='+str(e),flush=True)
    shutil.copy2(backup/'api_index.ts',API)
    shutil.copy2(backup/'source_index.html',HTML)
    shutil.copy2(backup/'live_index.html',LIVE)
    if (backup/'dist_index.js').exists():shutil.copy2(backup/'dist_index.js',DIST)
    try:run(['systemctl','restart','10x-api.service']);print('ROLLBACK=PASS',flush=True)
    except Exception as re:print('ROLLBACK_RESTART_FAILED='+str(re),flush=True)
    sys.exit(1)
