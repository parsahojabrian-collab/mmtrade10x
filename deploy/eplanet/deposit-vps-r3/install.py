#!/usr/bin/env python3
"""MMTRADE Deposit UI Safe R3 — guarded static-only fix; no API or database writes."""
from pathlib import Path
from datetime import datetime,timezone
from urllib.request import urlopen
import hashlib,json,os,subprocess,sys,tempfile
ROOT=Path('/root/miniapp10x/public/miniapp/p74/eplanet')
LIVE=Path('/srv/tenx-public/miniapp/p74/eplanet')
WORK=Path('/root/MMTRADE_EPLANET_DEPOSIT_UI_R3')
STATE=WORK/'state.json'
FILES={
 'source_html':ROOT/'index.html',
 'live_html':LIVE/'index.html',
 'source_ui':ROOT/'deposit-ui-vps-r2.js',
 'live_ui':LIVE/'deposit-ui-vps-r2.js'
}
OLD_UI_SHA16='a63037f860d6b8f6'
OLD_HTML_SHA16='c3ab0ffcc65861e2'
OLD_TAG=b'/miniapp/p74/eplanet/deposit-ui-vps-r2.js?v=DEP_VPS_R2'
NEW_TAG=b'/miniapp/p74/eplanet/deposit-ui-vps-r2.js?v=DEP_SAFE_R3'
REV='515a5a8d8fe363b2ede21c12bc64214dd29e5f70'
BLOB='5e229ae8470a60e1c1b833cce95fc92762ca2282'
URL=f'https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/{REV}/deploy/eplanet/deposit-vps-r3/deposit-ui-safe-r3.js'
def sha(data):return hashlib.sha256(data).hexdigest()
def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\x00'+data).hexdigest()
def download():
 with urlopen(URL,timeout=25) as resp:content=resp.read(250000)
 if blob(content)!=BLOB:raise RuntimeError('REMOTE_JS_BLOB_MISMATCH')
 if b'ENGINE_DISABLED' not in content or b'BROKER_NOT_CONFIGURED' not in content or b'BROKER_EMAIL_UNVERIFIED' not in content:
  raise RuntimeError('JS_SAFETY_ASSERTION_FAILED')
 if b'innerHTML' in content:raise RuntimeError('UNSAFE_HTML_NOT_ALLOWED')
 with tempfile.TemporaryDirectory(prefix='mmtrade-deposit-r3-') as temp:
  p=Path(temp)/'ui.js';p.write_bytes(content)
  result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True,timeout=15)
  if result.returncode:raise RuntimeError('JS_SYNTAX_FAILED:'+result.stderr[:500])
 return content
def originals():
 if STATE.exists():raise RuntimeError('STATE_EXISTS_USE_STATUS_VERIFY_OR_ROLLBACK')
 old={}
 for name,path in FILES.items():
  if not path.is_file():raise RuntimeError('BASE_FILE_MISSING:'+name)
  old[name]=path.read_bytes()
 if old['source_html']!=old['live_html']:raise RuntimeError('HTML_SOURCE_LIVE_DIFFER')
 if old['source_ui']!=old['live_ui']:raise RuntimeError('UI_SOURCE_LIVE_DIFFER')
 if sha(old['source_html'])[:16]!=OLD_HTML_SHA16:
  raise RuntimeError('HTML_VERSION_CHANGED_DO_NOT_FORCE_PATCH')
 if sha(old['source_ui'])[:16]!=OLD_UI_SHA16:
  raise RuntimeError('R2_UI_CHANGED_DO_NOT_FORCE_PATCH')
 if old['source_html'].count(OLD_TAG)!=1 or NEW_TAG in old['source_html']:
  raise RuntimeError('R2_SCRIPT_REFERENCE_NOT_UNIQUE')
 if b'MMTRADE_EPLANET_DIALOG_CLOSE_R5' not in old['source_html']:
  raise RuntimeError('R5_MODAL_MARKER_MISSING')
 if b'id="brokerEmail"' not in old['source_html']:
  raise RuntimeError('REGISTRATION_EMAIL_FIELD_MISSING')
 return old
def payload(old,js):
 html=old['source_html'].replace(OLD_TAG,NEW_TAG,1)
 return {'source_html':html,'live_html':html,'source_ui':js,'live_ui':js}
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 fd,p=tempfile.mkstemp(prefix='.deposit-safe-r3-',dir=str(path.parent))
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(p,path.stat().st_mode&0o777)
  os.replace(p,path)
 finally:
  if os.path.exists(p):os.unlink(p)
def audit():
 old=originals()
 js=download()
 new=payload(old,js)
 assert new['source_html']==new['live_html']
 print('AUDIT=PASS NO_WRITES_TO_PROJECT=YES PATCH_SCOPE=EPLANET_UI_ONLY')
 print('LIVE_SOURCE_SYNC=YES R5_AND_REGISTRATION_EMAIL_PRESERVED=YES')
 print('OLD_UI_SHA256='+sha(old['source_ui']))
 print('NEW_UI_SHA256='+sha(js))
 print('BACKEND_API_JS_DATABASE_SERVICE=UNCHANGED')
def write_state(state):STATE.write_text(json.dumps(state,indent=2),encoding='utf-8')
def install():
 old=originals();new=payload(old,download())
 backup=WORK/'backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 backup.mkdir(parents=True,exist_ok=False)
 for name,data in old.items():(backup/(name+'.bin')).write_bytes(data)
 state={'phase':'INSTALLING','backup':str(backup),'revision':REV,
        'before':{k:sha(v) for k,v in old.items()},
        'after':{k:sha(v) for k,v in new.items()}}
 WORK.mkdir(parents=True,exist_ok=True)
 write_state(state)
 try:
  # Replace files in place, keeping existing R2 HTML/script path.
  for name in ('source_ui','live_ui','source_html','live_html'):
   atomic(FILES[name],new[name])
  state['phase']='INSTALLED';write_state(state)
  verify()
 except BaseException:
  try:restore(state);STATE.unlink(missing_ok=True)
  except Exception as e:print('RECOVERY_REQUIRED='+str(e),flush=True)
  raise
 print('INSTALL=PASS NO_API_RESTART_REQUIRED=YES')
 print('ROLLBACK_ORDER=FIRST_R3_THEN_R2_IF_NEEDED')
def status():
 if not STATE.is_file():print('STATUS=NOT_INSTALLED');return
 state=json.loads(STATE.read_text());print('STATUS='+state['phase'])
 for name,path in FILES.items():
  digest=sha(path.read_bytes()) if path.is_file() else 'MISSING'
  print(name+'='+('INSTALLED' if digest==state['after'][name] else 'MODIFIED_OR_MISSING'))
def verify():
 if not STATE.is_file():raise RuntimeError('NO_INSTALL_STATE')
 state=json.loads(STATE.read_text())
 if state['phase']!='INSTALLED':raise RuntimeError('INSTALL_INCOMPLETE_ROLLBACK_FIRST')
 for name,path in FILES.items():
  if not path.is_file() or sha(path.read_bytes())!=state['after'][name]:
   raise RuntimeError('VERIFY_FAILED:'+name)
 if FILES['source_html'].read_bytes()!=FILES['live_html'].read_bytes():
  raise RuntimeError('HTML_SOURCE_LIVE_DIFFER')
 print('VERIFY=PASS SOURCE_LIVE_SYNC=YES R5_CSS_UNCHANGED=YES')
def restore(state):
 backup=Path(state['backup'])
 for name,path in FILES.items():
  data=(backup/(name+'.bin')).read_bytes()
  if sha(data)!=state['before'][name]:raise RuntimeError('BACKUP_INVALID:'+name)
  atomic(path,data)
def rollback():
 if not STATE.is_file():raise RuntimeError('NOT_INSTALLED')
 state=json.loads(STATE.read_text())
 if state['phase']=='INSTALLED':
  for name,path in FILES.items():
   if not path.is_file() or sha(path.read_bytes())!=state['after'][name]:
    raise RuntimeError('UNEXPECTED_FILE_CHANGE:'+name)
 restore(state);STATE.unlink()
 print('ROLLBACK=PASS R2_UI_AND_HTML_RESTORED=YES')
if __name__=='__main__':
 try:
  action=sys.argv[1] if len(sys.argv)==2 else ''
  if action=='audit':audit()
  elif action=='install':install()
  elif action=='verify':verify()
  elif action=='status':status()
  elif action=='rollback':rollback()
  else:raise RuntimeError('USAGE: install.py audit|install|verify|status|rollback')
 except Exception as exc:
  print('ERROR='+str(exc),flush=True);sys.exit(1)
