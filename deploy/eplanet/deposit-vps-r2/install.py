#!/usr/bin/env python3
"""VPS-specific MMTRADE ePlanet Deposit R2, guarded staged install and rollback.
Targets VPS p37ChangeWorkflow with independent Prisma transaction, no p37LockWorkflow.
DOES NOT change API env vars, restart a service, or enable live auto-approval.
"""
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
import hashlib, json, os, subprocess, sys, tempfile

ROOT=Path('/root/miniapp10x')
WEB=ROOT/'public/miniapp/p74/eplanet'
LIVE=Path('/srv/tenx-public/miniapp/p74/eplanet')
WORK=Path('/root/MMTRADE_EPLANET_DEPOSIT_VPS_R2')
STATE=WORK/'state.json'
PIN='4d8053c6262aa8a81679025c6cb8171597cb290d'
BASE=f'https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/{PIN}/deploy/eplanet/deposit-r1/'
ASSETS={
 'module':('eplanet-deposit-r1.ts','f0489c3f4dde2279c27091e522e15db6449050e7'),
 'ui':('deposit-ui-r1.js','86d831c526a04345f6cb16ae9eee7bfd12ff7602')
}
T={
 'api':ROOT/'apps/api/src/index.ts',
 'source_html':WEB/'index.html',
 'live_html':LIVE/'index.html',
 'module':ROOT/'apps/api/src/eplanet-deposit-vps-r2.ts',
 'source_ui':WEB/'deposit-ui-vps-r2.js',
 'live_ui':LIVE/'deposit-ui-vps-r2.js'
}
MARK=b'// EPLANET_OFFICIAL_R2_END'
IMPORT=b"import { registerEplanetDepositEngineR1 } from './eplanet-deposit-vps-r2.js';\n"
HOOK=(b'\n// MMTRADE_EPLANET_DEPOSIT_VPS_R2_BEGIN\n'
      b'registerEplanetDepositEngineR1({app,prisma,miniUser,superSession:p37SuperSession});\n'
      b'// MMTRADE_EPLANET_DEPOSIT_VPS_R2_END\n')
SCRIPT=b'<script defer src="/miniapp/p74/eplanet/deposit-ui-vps-r2.js?v=DEP_VPS_R2"></script>'
MODULE_ANCHOR=b'const {app,prisma,miniUser,eplanetSerialize,p37LockWorkflow,superSession}=deps;'
TX_HELPER=b'''const {app,prisma,miniUser,superSession}=deps;
 // The VPS has only an in-process eplanetSerialize. R2 uses a DB row
 // transaction lock, and its workflow update uses an optimistic version CAS.
 async function eplanetSerialize<T>(work:(tx:any)=>Promise<T>):Promise<T>{
  return prisma.$transaction(async (tx:any)=>{
   const key='EPLANET_DEPOSIT_VPS_R2_TX_LOCK';
   await tx.systemSetting.upsert({
    where:{key},create:{key,value:{locked:true}},update:{value:{locked:true}}
   });
   return work(tx);
  },{isolationLevel:'ReadCommitted',maxWait:10000,timeout:20000});
 }
'''
def sha(b):return hashlib.sha256(b).hexdigest()
def gitsha(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def fetch_asset(which):
 name,expected=ASSETS[which]
 with urlopen(BASE+name,timeout=25) as resp:data=resp.read(500000)
 if gitsha(data)!=expected:raise RuntimeError('PINNED_ASSET_HASH_MISMATCH:'+which)
 return data
def patched_module(data):
 if data.count(MODULE_ANCHOR)!=1:raise RuntimeError('R1_MODULE_ADAPTER_ANCHOR_INVALID')
 if data.count(b'await p37LockWorkflow(tx,')!=2:raise RuntimeError('R1_LOCK_CALL_COUNT_CHANGED')
 data=data.replace(MODULE_ANCHOR,TX_HELPER,1)
 # Remove only the nonexistent VPS helper; all workflow CAS and audit checks remain.
 import re
 data,n=re.subn(rb'^[ \t]*await p37LockWorkflow\(tx,[^\n]*\);[ \t]*\n',b'',data,flags=re.M)
 if n!=2:raise RuntimeError('VPS_LOCK_REMOVAL_FAILED')
 if b'p37LockWorkflow' in data:
  # In a comment, references are harmless; actual executable references are not.
  if b'await p37LockWorkflow(' in data:raise RuntimeError('OLD_LOCK_STILL_IN_USE')
 return data
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 fd,tmp=tempfile.mkstemp(prefix='.dep-vps-r2-',dir=str(path.parent))
 try:
  with os.fdopen(fd,'wb') as file:
   file.write(data);file.flush();os.fsync(file.fileno())
  os.chmod(tmp,path.stat().st_mode&0o777 if path.exists() else 0o644)
  os.replace(tmp,path)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def original_check():
 if STATE.exists():raise RuntimeError('STATE_EXISTS_USE_STATUS_OR_ROLLBACK')
 for k in ('module','source_ui','live_ui'):
  if T[k].exists():raise RuntimeError('ADDON_ALREADY_PRESENT:'+k)
 for k in ('api','source_html','live_html'):
  if not T[k].is_file():raise RuntimeError('MISSING_BASE_FILE:'+k)
 old={k:T[k].read_bytes() for k in ('api','source_html','live_html')}
 a,h=old['api'],old['source_html']
 if old['source_html']!=old['live_html']:raise RuntimeError('SOURCE_LIVE_NOT_IN_SYNC')
 if a.count(MARK)!=1 or a.count(b"import 'dotenv/config';")!=1:
  raise RuntimeError('API_ANCHORS_NOT_UNIQUE')
 if a.count(b'async function p37ChangeWorkflow(')!=1:raise RuntimeError('P37_CAS_HELPER_MISSING')
 if a.count(b'async function eplanetSerialize<T>(work:()=>Promise<T>)')!=1:
  raise RuntimeError('VPS_SERIALIZER_SIGNATURE_MISMATCH')
 if b'async function p37LockWorkflow' in a:raise RuntimeError('THIS_IS_NOT_VPS_R2_BASELINE')
 if b'MMTRADE_EPLANET_EMAIL_MATCH_VPS_R3_BEGIN' not in a:
  raise RuntimeError('VPS_EMAIL_R3_MISSING')
 if b'/miniapp/eplanet/submit' not in a or b'p37SuperSession' not in a:
  raise RuntimeError('VPS_EPLANET_ROUTES_MISSING')
 if IMPORT in a or b'MMTRADE_EPLANET_DEPOSIT_VPS_R2_BEGIN' in a:
  raise RuntimeError('API_ALREADY_PATCHED')
 if h.count(b'</body>')!=1 or b'MMTRADE_EPLANET_DIALOG_CLOSE_R5' not in h:
  raise RuntimeError('R5_DIALOG_BASELINE_MISSING')
 if b'id="stepDialog"' not in h or b'id="brokerEmail"' not in h or b'id="accountId"' not in h:
  raise RuntimeError('EPLANET_FORM_MISSING')
 if SCRIPT in h:raise RuntimeError('R2_SCRIPT_ALREADY_PRESENT')
 return old
def outputs(old):
 m=patched_module(fetch_asset('module'))
 u=fetch_asset('ui')
 a=old['api'].replace(b"import 'dotenv/config';",IMPORT+b"import 'dotenv/config';",1)
 a=a.replace(MARK,MARK+HOOK,1)
 h=old['source_html'].replace(b'</body>',SCRIPT+b'</body>',1)
 return {'api':a,'source_html':h,'live_html':h,'module':m,'source_ui':u,'live_ui':u}
def check_patched_m(module):
 for needle in (b"const key='EPLANET_DEPOSIT_VPS_R2_TX_LOCK'",b"await tx.eplanetUserWorkflow.updateMany(",b"action:'EPLANET_DEPOSIT_AUTO_APPROVED'"):
  if needle not in module:raise RuntimeError('MODULE_CRITICAL_CHECK_MISSING:'+needle.decode())
def audit():
 old=original_check();new=outputs(old);check_patched_m(new['module'])
 print('AUDIT=PASS NO_WRITES=YES TARGET=VPS_IN_PROCESS_SERIALIZER_AND_DB_CAS')
 print('SRC_LIVE=SYNC EMAIL_R3_AND_CLOSE_R5=PRESERVED')
 print('AUTO_APPROVAL=DISABLED_UNTIL_SECRETS_AND_INDEPENDENT_EMAIL_VERIFICATION')
 print('BUILD=NOT_RUN_ON_AUDIT; INSTALL_RUNS_NPM_BUILD_WITH_NODE_HEAP_LIMIT')
 print('API_SHA256_BEFORE='+sha(old['api']))
def snapshot():
 if not STATE.exists():raise RuntimeError('NO_INSTALL_STATE')
 state=json.loads(STATE.read_text())
 return state,Path(state['backup'])
def restore(state):
 backup=Path(state['backup'])
 for k in ('api','source_html','live_html'):
  data=(backup/(k+'.bin')).read_bytes()
  if sha(data)!=state['original'][k]:raise RuntimeError('BACKUP_CORRUPT:'+k)
  atomic(T[k],data)
 for k in ('module','source_ui','live_ui'):
  T[k].unlink(missing_ok=True)
def install():
 old=original_check();new=outputs(old);check_patched_m(new['module'])
 backup=WORK/'backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 backup.mkdir(parents=True,exist_ok=False)
 for k,data in old.items():(backup/(k+'.bin')).write_bytes(data)
 state={'phase':'INSTALLING','backup':str(backup),
  'original':{k:sha(v) for k,v in old.items()},
  'installed':{k:sha(v) for k,v in new.items()},
  'revision':PIN,'createdAt':datetime.now(timezone.utc).isoformat()}
 # Commit journal BEFORE any mutation. If SSH dies, rollback is still available.
 WORK.mkdir(parents=True,exist_ok=True)
 STATE.write_text(json.dumps(state,indent=2))
 try:
  atomic(T['module'],new['module'])
  atomic(T['source_ui'],new['source_ui'])
  atomic(T['api'],new['api'])
  print('STAGE=PASS API_PATCH=STAGED BUILD=START',flush=True)
  nodeenv=os.environ.copy()
  nodeenv['NODE_OPTIONS']='--max-old-space-size=1536'
  if subprocess.run(['node','--check',str(T['source_ui'])],cwd=ROOT,timeout=25).returncode:
   raise RuntimeError('CLIENT_JS_SYNTAX_FAILED')
  if subprocess.run(['npm','run','build'],cwd=ROOT,env=nodeenv,timeout=180).returncode:
   raise RuntimeError('BUILD_FAILED_NO_LIVE_DEPLOY')
  print('BUILD=PASS',flush=True)
  atomic(T['live_ui'],new['live_ui'])
  atomic(T['source_html'],new['source_html'])
  atomic(T['live_html'],new['live_html'])
  state['phase']='INSTALLED'
  STATE.write_text(json.dumps(state,indent=2))
  verify()
 except BaseException:
  # Exit path rolls back normal errors/KeyboardInterrupt, while journal survives SIGKILL.
  try:restore(state);STATE.unlink(missing_ok=True)
  except Exception as recovery_error:print('ROLLBACK_REQUIRED='+str(recovery_error),flush=True)
  raise
 print('INSTALL=PASS BACKUP='+str(backup))
 print('RESTART_REQUIRED=YES NOT_PERFORMED=YES ENGINE_ENABLED=NO')
def verify():
 state,backup=snapshot()
 if state['phase']!='INSTALLED':raise RuntimeError('INCOMPLETE_INSTALL_RUN_ROLLBACK')
 for k,expected in state['installed'].items():
  if not T[k].is_file() or sha(T[k].read_bytes())!=expected:raise RuntimeError('INSTALLED_FILE_MISMATCH:'+k)
 if T['source_html'].read_bytes()!=T['live_html'].read_bytes():raise RuntimeError('SOURCE_LIVE_DIVERGED')
 print('VERIFY=PASS SOURCE_LIVE_SYNC=YES R5_HTML_PRESERVED=YES')
def status():
 if not STATE.exists():
  print('STATUS=NOT_INSTALLED')
 else:
  state,_=snapshot()
  print('STATUS='+state['phase'])
  print('BACKUP='+state['backup'])
 for k in ('api','source_html','live_html','module','source_ui','live_ui'):
  print(k.upper()+'='+('EXISTS' if T[k].is_file() else 'MISSING'))
def rollback():
 state,_=snapshot()
 # Fail closed if an installed artifact was changed by a different deploy.
 if state['phase']=='INSTALLED':
  for k,expected in state['installed'].items():
   if not T[k].is_file() or sha(T[k].read_bytes())!=expected:
    raise RuntimeError('FILE_CHANGED_SINCE_INSTALL:'+k)
 restore(state);STATE.unlink()
 print('ROLLBACK=PASS SOURCE_LIVE_RESTORED=YES')
 print('API_BUILD_AND_SERVICE_RESTART=REQUIRED_TO_COMPLETE_RUNTIME_ROLLBACK')
if __name__=='__main__':
 try:
  command=sys.argv[1] if len(sys.argv)==2 else ''
  if command=='audit':audit()
  elif command=='install':install()
  elif command=='verify':verify()
  elif command=='status':status()
  elif command=='rollback':rollback()
  else:raise RuntimeError('USAGE: install.py audit|install|verify|status|rollback')
 except Exception as error:
  print('ERROR='+str(error),flush=True)
  sys.exit(1)
