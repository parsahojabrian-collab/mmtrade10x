#!/usr/bin/env python3
"""Repair the isolated Sandbox and explicitly restore the existing manual production flow.
No DB writes, account approvals, API builds, restarts, environment changes, or fake live results.
"""
from pathlib import Path
from datetime import datetime,timezone
from tempfile import TemporaryDirectory
import hashlib,json,os,re,stat,subprocess,sys,tempfile

ROOT=Path('/root/miniapp10x')
PUB=[ROOT/'public/miniapp/p74',Path('/srv/tenx-public/miniapp/p74')]
OLD_STATE=Path('/root/MMTRADE_EPLANET_SANDBOX_V1/state.json')
WORK=Path('/root/MMTRADE_EPLANET_RECOVERY_V1')
JOURNAL=WORK/'journal.json'
OLD_TAG=b'<script type="module" src="/miniapp/p74/eplanet-sandbox/sandbox-ui.mjs?v=SBX_V1"></script>'
NEW_TAG=b'<script defer src="/miniapp/p74/eplanet-sandbox/sandbox-classic.js?v=SBX_CLASSIC_1"></script>'
OLD_PROD_URL=b'/miniapp/p74/eplanet/deposit-ui-vps-r2.js?v=DEP_SAFE_R3'
BUNDLE='sandbox-classic.js'
def sha(data):return hashlib.sha256(data).hexdigest()
def atomic(p,data,mode=0o644):
 fd,tmp=tempfile.mkstemp(dir=p.parent,prefix='.eplanet-recovery-')
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(tmp,mode)
  os.replace(tmp,p)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def check_node(data):
 with TemporaryDirectory(prefix='eplanet-recovery-') as d:
  f=Path(d)/BUNDLE;f.write_bytes(data)
  run=subprocess.run(['node','--check',str(f)],capture_output=True,text=True,timeout=15)
  if run.returncode:raise RuntimeError('BUNDLE_SYNTAX:'+run.stderr[:250])
def shell(*args):
 return subprocess.check_output(args,stderr=subprocess.DEVNULL,text=True,timeout=8).strip()
def manual_guard():
 # Do not remove auto UI if any known active runtime/deployment flag requests the engine.
 # Values other than this one boolean are never printed or copied into the journal.
 pid=int(shell('systemctl','show','10x-api.service','-p','MainPID','--value'))
 if pid<=1 or shell('systemctl','is-active','10x-api.service')!='active':
  raise RuntimeError('API_NOT_ACTIVE_MANUAL_RESTORE_REFUSED')
 proc=Path('/proc')/str(pid)
 entries=(proc/'environ').read_bytes().split(b'\0')
 vals=[e.split(b'=',1)[1].strip() for e in entries if e.startswith(b'EPLANET_DEPOSIT_ENABLED=')]
 if any(v not in (b'0',b'false',b'') for v in vals):raise RuntimeError('AUTO_ENGINE_FLAG_PRESENT_MANUAL_RESTORE_REFUSED')
 cwd=(proc/'cwd').resolve()
 candidates={ROOT/'.env',ROOT/'.env.local',ROOT/'.env.production',ROOT/'.env.production.local',
             ROOT/'apps/api/.env',ROOT/'apps/api/.env.local',cwd/'.env',cwd/'.env.local',
             cwd/'.env.production',cwd/'.env.production.local'}
 envfiles=shell('systemctl','show','10x-api.service','-p','EnvironmentFiles','--value')
 for f in re.findall(r'(?:^|\s)(/[^\s]+)',envfiles):
  if '*' in f or '?' in f:raise RuntimeError('ENV_FILE_GLOB_MANUAL_RESTORE_REFUSED')
  candidates.add(Path(f))
 for path in candidates:
  if not path.is_file():continue
  for row in path.read_bytes().splitlines():
   m=re.match(rb'\s*(?:export\s+)?EPLANET_DEPOSIT_ENABLED\s*=\s*(.*)$',row)
   if m and m.group(1).split(b'#',1)[0].strip().strip(b"'\"") not in (b'0',b'false',b''):
    raise RuntimeError('AUTO_ENGINE_CONFIG_PRESENT_MANUAL_RESTORE_REFUSED')
 # Verify existing real routes are present in VPS source (not the mismatched GitHub branch).
 api=(ROOT/'apps/api/src/index.ts').read_bytes()
 if b'/miniapp/eplanet/submit' not in api or b'/miniapp/eplanet/admin/requests/' not in api:
  raise RuntimeError('LEGACY_SUBMIT_OR_ADMIN_ROUTE_NOT_FOUND')
 print('MANUAL_MODE_PREFLIGHT=PASS AUTO_FLAG_NOT_FOUND_IN_CHECKED_ENV_FILES=YES',flush=True)
def prepare():
 if JOURNAL.exists():raise RuntimeError('JOURNAL_EXISTS_USE_STATUS_VERIFY_OR_ROLLBACK')
 state=json.loads(OLD_STATE.read_text())
 if state.get('phase')!='INSTALLED':raise RuntimeError('SANDBOX_NOT_INSTALLED')
 expected=state['sha256']
 for base in PUB:
  root=base/'eplanet-sandbox'
  for name,digest in expected.items():
   path=root/name
   if not path.is_file() or path.is_symlink() or sha(path.read_bytes())!=digest:
    raise RuntimeError('SANDBOX_FILE_CHANGED:'+name)
  if (root/BUNDLE).exists():raise RuntimeError('BUNDLE_ALREADY_EXISTS')
 sandbox=PUB[0]/'eplanet-sandbox'
 original=(sandbox/'index.html').read_bytes()
 if original.count(OLD_TAG)!=1 or b"connect-src 'none'" not in original:
  raise RuntimeError('SANDBOX_SCRIPT_OR_CSP_CONTRACT')
 model=(sandbox/'sandbox-state.mjs').read_text()
 ui=(sandbox/'sandbox-ui.mjs').read_text()
 # Only the tested state + adapter are bundled. No external libraries.
 model,n=re.subn(r'^export\s+', '',model,flags=re.M)
 if n<5:raise RuntimeError('MODEL_EXPORT_CONTRACT')
 ui,n=re.subn(r"^import\s+\{[^\n]+\}\s+from\s+'\./sandbox-state\.mjs';\s*$",'',ui,count=1,flags=re.M)
 if n!=1:raise RuntimeError('UI_IMPORT_CONTRACT')
 # JSON-only model data is safe to clone this way; works without structuredClone.
 model=model.replace('structuredClone(input)','JSON.parse(JSON.stringify(input))')
 model=model.replace('Object.hasOwn(SCENARIOS,event.value)','Object.prototype.hasOwnProperty.call(SCENARIOS,event.value)')
 ui=ui.replace('Object.hasOwn(SCENARIOS,value.scenario)','Object.prototype.hasOwnProperty.call(SCENARIOS,value.scenario)')
 ui=ui.replace("render();\n", "render();\n") # no-op, preserve original UI logic
 if re.search(r'^\s*(?:import|export)\s+',model+'\n'+ui,re.M):raise RuntimeError('BUNDLE_STILL_MODULE')
 if re.search(r'\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(',model+'\n'+ui):
  raise RuntimeError('NETWORK_CALL_NOT_ALLOWED')
 # Visible boot message remains if the script fails to load.
 boot=b'<p id="sandboxBoot" role="status" style="padding:12px;color:#fff;background:#154b40">SANDBOX: loading test controller...</p>'
 index=original.replace(OLD_TAG,NEW_TAG).replace(b'<main class="app-shell">',b'<main class="app-shell">'+boot,1)
 if index.count(b'id="sandboxBoot"')!=1:raise RuntimeError('SANDBOX_BOOT_MARKER_CONTRACT')
 bundle=(";(function(){'use strict';\n"+model+'\n'+ui+
  "\nvar boot=document.getElementById('sandboxBoot');if(boot)boot.textContent='SANDBOX READY - simulated only';\n})();\n").encode()
 check_node(bundle)
 # Guard the temporary manual mode before touching any real UI.
 manual_guard()
 prod=[(base/'eplanet/index.html').read_bytes() for base in PUB]
 if prod[0]!=prod[1]:raise RuntimeError('PRODUCTION_HTML_NOT_SYNC')
 pat=rb'<script\b[^>]*\bsrc\s*=\s*["\']'+re.escape(OLD_PROD_URL)+rb'["\'][^>]*>\s*</script\s*>'
 restored,n=re.subn(pat,b'<!-- EPLANET_MANUAL_REVIEW_MODE: auto UI dormant until verified broker rollout -->',prod[0],count=1,flags=re.I)
 if n!=1 or OLD_PROD_URL in restored:raise RuntimeError('PRODUCTION_R3_SCRIPT_ANCHOR_CHANGED')
 if b'id="submitVerification"' not in restored or b'app.js' not in restored:
  raise RuntimeError('EXISTING_MANUAL_UI_MISSING')
 changes={}
 for base in PUB:
  changes[base/'eplanet-sandbox/index.html']=index
  changes[base/'eplanet-sandbox'/BUNDLE]=bundle
  changes[base/'eplanet/index.html']=restored
 # Keep existing Sandbox installer verify/rollback aware of repaired files.
 state['sha256']['index.html']=sha(index);state['sha256'][BUNDLE]=sha(bundle)
 changes[OLD_STATE]=json.dumps(state,indent=2).encode()
 return changes
def read_journal():return json.loads(JOURNAL.read_text())
def write_journal(j):atomic(JOURNAL,json.dumps(j,indent=2).encode(),0o600)
def verify():
 j=read_journal()
 if j['phase']!='INSTALLED':raise RuntimeError('INSTALL_INCOMPLETE_USE_ROLLBACK')
 for row in j['entries']:
  p=Path(row['path'])
  if not p.is_file() or sha(p.read_bytes())!=row['after']:raise RuntimeError('VERIFY_FAILED:'+str(p))
 print('VERIFY=PASS SANDBOX_CLASSIC_JS=YES MANUAL_UI_RESTORED=YES',flush=True)
 print('PRODUCTION_DB_API_SERVICES_UNCHANGED=YES',flush=True)
def rollback():
 j=read_journal()
 for row in j['entries']:
  p=Path(row['path'])
  digest=sha(p.read_bytes()) if p.is_file() else None
  if digest not in (row['before'],row['after']):raise RuntimeError('FILE_CHANGED_REFUSE_ROLLBACK:'+str(p))
  if row['backup'] and sha(Path(row['backup']).read_bytes())!=row['before']:raise RuntimeError('BACKUP_HASH_FAIL')
 for row in reversed(j['entries']):
  p=Path(row['path'])
  if row['backup']:atomic(p,Path(row['backup']).read_bytes(),row['mode'])
  elif p.exists():p.unlink()
 JOURNAL.unlink()
 print('ROLLBACK=PASS',flush=True)
def install():
 changes=prepare()
 WORK.mkdir(parents=True,exist_ok=True)
 backup=WORK/('backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
 backup.mkdir(mode=0o700)
 rows=[]
 for i,(p,data) in enumerate(changes.items()):
  if p.is_symlink():raise RuntimeError('SYMLINK_TARGET')
  old=p.read_bytes() if p.is_file() else None
  oldmode=stat.S_IMODE(p.stat().st_mode) if old is not None else 0o644
  b=backup/(str(i)+'.bin') if old is not None else None
  if b:b.write_bytes(old);os.chmod(b,0o600)
  rows.append({'path':str(p),'backup':str(b) if b else None,'before':sha(old) if old is not None else None,'after':sha(data),'mode':oldmode})
 j={'phase':'INSTALLING','entries':rows}
 write_journal(j)
 try:
  # New bundle first so there is never an HTML reference to a missing script.
  for p in sorted(changes,key=lambda x:0 if x.name==BUNDLE else 2 if x==OLD_STATE else 1):
   row=next(x for x in rows if x['path']==str(p))
   current=sha(p.read_bytes()) if p.is_file() else None
   if current!=row['before']:raise RuntimeError('FILE_CHANGED_DURING_INSTALL')
   atomic(p,changes[p],row['mode'])
  j['phase']='INSTALLED';write_journal(j);verify()
 except BaseException:
  try:rollback()
  except Exception as e:print('RECOVERY_REQUIRED='+str(e),flush=True)
  raise
 print('INSTALL=PASS NO_BUILD_NO_RESTART=YES',flush=True)
 print('MANUAL_MODE=EXISTING_ADMIN_REVIEW_REQUIRED NO_FAKE_APPROVAL=YES',flush=True)
 print('SANDBOX=https://mmtrade10x.ir/miniapp/p74/eplanet-sandbox/index.html?v=CLASSIC_1',flush=True)
def main():
 action=sys.argv[1] if len(sys.argv)==2 else ''
 if action=='audit':
  changes=prepare();print('AUDIT=PASS CHANGES='+str(len(changes))+' NO_WRITES=YES',flush=True)
 elif action=='install':install()
 elif action=='verify':verify()
 elif action=='rollback':rollback()
 elif action=='status':print('STATUS='+read_journal()['phase'] if JOURNAL.exists() else 'STATUS=NOT_INSTALLED',flush=True)
 else:raise RuntimeError('USAGE: install.py audit|install|verify|rollback|status')
if __name__=='__main__':
 try:main()
 except Exception as error:print('ERROR='+str(error),flush=True);sys.exit(1)
