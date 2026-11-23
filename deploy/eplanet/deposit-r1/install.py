#!/usr/bin/env python3
"""MMTRADE ePlanet deposit engine R1: guarded, reversible installation. No service restart."""
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import urlopen
import hashlib,json,os,subprocess,sys,tempfile

ROOT=Path('/root/miniapp10x')
LIVE=Path('/srv/tenx-public/miniapp/p74/eplanet')
WORK=Path('/root/MMTRADE_EPLANET_DEPOSIT_R1')
STATE=WORK/'install-state.json'
REV='4d8053c6262aa8a81679025c6cb8171597cb290d'
PREFIX=f'https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/{REV}/deploy/eplanet/deposit-r1/'
ASSETS={
 'module':('eplanet-deposit-r1.ts','f0489c3f4dde2279c27091e522e15db6449050e7'),
 'ui':('deposit-ui-r1.js','86d831c526a04345f6cb16ae9eee7bfd12ff7602')
}
TARGETS={
 'api': ROOT/'apps/api/src/index.ts',
 'html_source': ROOT/'public/miniapp/p74/eplanet/index.html',
 'html_live': LIVE/'index.html',
 'module': ROOT/'apps/api/src/eplanet-deposit-r1.ts',
 'ui_source': ROOT/'public/miniapp/p74/eplanet/deposit-ui-r1.js',
 'ui_live': LIVE/'deposit-ui-r1.js'
}
IMPORT=b"import { registerEplanetDepositEngineR1 } from './eplanet-deposit-r1.js';\n"
HOOK=(b"\n// MMTRADE_EPLANET_DEPOSIT_ENGINE_R1_BEGIN\n"
 b"registerEplanetDepositEngineR1({app,prisma,miniUser,eplanetSerialize,p37LockWorkflow,superSession:p37SuperSession});\n"
 b"// MMTRADE_EPLANET_DEPOSIT_ENGINE_R1_END\n")
SCRIPT=b'<script defer src="/miniapp/p74/eplanet/deposit-ui-r1.js?v=DEP_R1"></script>'
MARKER=b'// EPLANET_OFFICIAL_R2_END'
def sha(b):return hashlib.sha256(b).hexdigest()
def gitsha(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\x00'+b).hexdigest()
def get_asset(which):
 name,blob_sha=ASSETS[which]
 with urlopen(PREFIX+name,timeout=25) as res:data=res.read(500000)
 if gitsha(data)!=blob_sha:raise RuntimeError('ASSET_GIT_SHA_MISMATCH:'+which)
 return data
def atomic(p,data):
 p.parent.mkdir(parents=True,exist_ok=True)
 fd,tmp=tempfile.mkstemp(prefix='.deposit-r1-',dir=str(p.parent))
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(tmp,p.stat().st_mode&0o777 if p.exists() else 0o644)
  os.replace(tmp,p)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def check_base():
 if STATE.exists():raise RuntimeError('ALREADY_INSTALLED')
 for k in ('module','ui_source','ui_live'):
  if TARGETS[k].exists():raise RuntimeError('TARGET_ALREADY_EXISTS:'+k)
 for k in ('api','html_source','html_live'):
  if not TARGETS[k].is_file():raise RuntimeError('MISSING_BASE:'+k)
 api=TARGETS['api'].read_bytes()
 hs=TARGETS['html_source'].read_bytes()
 hl=TARGETS['html_live'].read_bytes()
 if hs!=hl:raise RuntimeError('EPLANET_HTML_SOURCE_LIVE_DIFFER')
 if api.count(MARKER)!=1 or api.count(b"import 'dotenv/config';")!=1:
  raise RuntimeError('API_INJECTION_ANCHOR_MISSING_OR_DUPLICATE')
 for needle in (b'const eplanetSerialize=',b'function eplanetStatuses',b'app.post(\'/miniapp/eplanet/submit\'',
                b'async function p37LockWorkflow',b'async function p37ChangeWorkflow'):
  if needle not in api:raise RuntimeError('API_BASELINE_MISSING:'+needle.decode())
 if IMPORT in api or b'MMTRADE_EPLANET_DEPOSIT_ENGINE_R1' in api:
  raise RuntimeError('API_ALREADY_PATCHED')
 if hs.count(b'</body>')!=1 or SCRIPT in hs or b'MMTRADE_EPLANET_DIALOG_CLOSE_R5' not in hs:
  raise RuntimeError('R5_HTML_EXPECTATION_FAILED')
 if b'id="stepDialog"' not in hs or b'id="submitVerification"' not in hs:
  raise RuntimeError('DIALOG_IDS_MISSING')
 return {'api':api,'html_source':hs,'html_live':hl}
def changes(old,assets):
 api=old['api'].replace(b"import 'dotenv/config';",IMPORT+b"import 'dotenv/config';",1)
 api=api.replace(MARKER,MARKER+HOOK,1)
 html=old['html_source'].replace(b'</body>',SCRIPT+b'</body>',1)
 return {'api':api,'html_source':html,'html_live':html,'module':assets['module'],
         'ui_source':assets['ui'],'ui_live':assets['ui']}
def audit():
 original=check_base()
 assets={k:get_asset(k) for k in ASSETS}
 change=changes(original,assets)
 if b'registerEplanetDepositEngineR1' not in change['api']:raise RuntimeError('INJECTION_ERROR')
 print('AUDIT=PASS NO_WRITES=YES SOURCE_LIVE_SYNC=YES R5_BASELINE=YES')
 print('TARGETS=6 NEW_FILES=3 CHANGED_FILES=3 BACKEND_BUILD=REQUIRED')
 print('AUTO_APPROVAL_DEFAULT=DISABLED REQUIRES_TRUSTED_EMAIL_AND_BROKER_CONFIG')
 print('SOURCE_API_SHA256='+sha(original['api']))
 print('LIVE_HTML_SHA256='+sha(original['html_live']))
def build():
 result=subprocess.run(['npm','run','build'],cwd=ROOT,timeout=160)
 if result.returncode!=0:raise RuntimeError('TYPESCRIPT_BUILD_FAILED')
def jscheck():
 result=subprocess.run(['node','--check',str(TARGETS['ui_source'])],cwd=ROOT,timeout=30)
 if result.returncode!=0:raise RuntimeError('UI_JS_SYNTAX_FAILED')
def restore(original,changed):
 for k in ('api','html_source','html_live'):
  atomic(TARGETS[k],original[k])
 for k in ('module','ui_source','ui_live'):
  if changed.get(k) and TARGETS[k].exists():TARGETS[k].unlink()
def install():
 original=check_base()
 assets={k:get_asset(k) for k in ASSETS};new=changes(original,assets)
 backup=WORK/'backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 backup.mkdir(parents=True,exist_ok=False)
 for k,v in original.items(): (backup/(k+'.bin')).write_bytes(v)
 state={'backup':str(backup),'original':{k:sha(v) for k,v in original.items()},
        'installed':{k:sha(v) for k,v in new.items()},'revision':REV}
 created={}
 try:
  # Stage backend first; do not touch live HTML until API compiles.
  for k in ('module','api','ui_source'):
   atomic(TARGETS[k],new[k]);created[k]=True
  jscheck();build()
  for k in ('html_source','html_live','ui_live'):
   atomic(TARGETS[k],new[k]);created[k]=True
  WORK.mkdir(parents=True,exist_ok=True)
  STATE.write_text(json.dumps(state,indent=2))
  verify()
 except BaseException:
  restore(original,created)
  STATE.unlink(missing_ok=True)
  raise
 print('INSTALL=PASS BACKUP='+str(backup))
 print('API_RESTART_REQUIRED=YES RESTART_PERFORMED=NO AUTO_APPROVAL=DISABLED_UNTIL_CONFIGURED')
def verify():
 if not STATE.exists():raise RuntimeError('NOT_INSTALLED')
 state=json.loads(STATE.read_text())
 for k,expected in state['installed'].items():
  p=TARGETS[k]
  if not p.is_file() or sha(p.read_bytes())!=expected:raise RuntimeError('VERIFY_FILE_MISMATCH:'+k)
 print('VERIFY=PASS SOURCE_LIVE_HTML_SYNC=YES R5_MODAL_CSS_UNCHANGED=YES')
 print('GIT_REV='+REV)
def rollback():
 if not STATE.exists():raise RuntimeError('NOT_INSTALLED')
 verify()
 state=json.loads(STATE.read_text());backup=Path(state['backup'])
 original={k:(backup/(k+'.bin')).read_bytes() for k in ('api','html_source','html_live')}
 for k,data in original.items():
  if sha(data)!=state['original'][k]:raise RuntimeError('BACKUP_CHECKSUM_FAILED:'+k)
 restore(original,{k:True for k in ('module','ui_source','ui_live')})
 STATE.unlink()
 print('ROLLBACK=PASS RESTORED_SOURCE_LIVE=YES')
 print('NOTE=RUN_NPM_BUILD_AND_RESTART_API_TO_APPLY_ROLLBACK')
if __name__=='__main__':
 try:
  action=sys.argv[1] if len(sys.argv)==2 else None
  if action=='audit':audit()
  elif action=='install':install()
  elif action=='verify':verify()
  elif action=='rollback':rollback()
  else:raise RuntimeError('USAGE: install.py audit|install|verify|rollback')
 except Exception as error:
  print('ERROR='+str(error));sys.exit(1)
