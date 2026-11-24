#!/usr/bin/env python3
"""Install only the tested ePlanet worker module; controlled restart and rollback.
Requires the existing stage manifest. Never enables the broker engine.
"""
from pathlib import Path
import hashlib,json,os,subprocess,sys,tempfile,time,stat,runpy,urllib.request,urllib.error
from datetime import datetime,timezone
ROOT=Path('/root/miniapp10x')
STAGE=Path('/root/MMTRADE_EPLANET_WORKER_STAGE')
SRC=ROOT/'apps/api/src/eplanet-deposit-vps-r2.ts'
DIST=ROOT/'dist/apps/api/src/eplanet-deposit-vps-r2.js'
WORK=Path('/root/MMTRADE_EPLANET_WORKER_DEPLOY')
STATE=WORK/'state.json'
SERVICE='10x-api.service'
def sha(b):return hashlib.sha256(b).hexdigest()
def cmd(args,timeout=15):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('COMMAND_FAILED:'+args[0]+':'+p.stderr[-300:])
 return p.stdout.strip()
def atomic(p,b,mode):
 fd,t=tempfile.mkstemp(dir=p.parent,prefix='.eplanet-worker-')
 try:
  with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
  os.chmod(t,mode);os.replace(t,p)
 finally:
  if os.path.exists(t):os.unlink(t)
def http(path):
 try:
  with urllib.request.urlopen('http://127.0.0.1:3000'+path,timeout=3) as r:return r.status
 except urllib.error.HTTPError as e:return e.code
 except (OSError,ValueError):return 0
def healthy():
 return cmd(['systemctl','is-active',SERVICE])=='active' and http('/miniapp/eplanet/config')==200 and http('/miniapp/eplanet/deposit/admin/health')==401
def wait_health():
 for _ in range(20):
  try:
   if healthy():return True
  except (RuntimeError,subprocess.TimeoutExpired):pass
  time.sleep(1)
 return False
def guard():
 if not healthy():raise RuntimeError('BASELINE_API_NOT_HEALTHY')
 # Reuse previously installed recovery guard. It verifies manual-only environment,
 # actual VPS routes and active process without printing any secret values.
 guard_path=Path('/root/MMTRADE_EPLANET_RECOVERY_V1/install.py')
 if not guard_path.is_file():raise RuntimeError('MANUAL_GUARD_MISSING')
 ns=runpy.run_path(str(guard_path))
 ns['manual_guard']()
 htmls=[ROOT/'public/miniapp/p74/eplanet/index.html',Path('/srv/tenx-public/miniapp/p74/eplanet/index.html')]
 data=[p.read_bytes() for p in htmls]
 if data[0]!=data[1] or b'EPLANET_MANUAL_REVIEW_MODE' not in data[0]:
  raise RuntimeError('MANUAL_UI_NOT_IN_SYNC')
 if b'deposit-ui-vps-r2.js' in data[0]:raise RuntimeError('AUTO_UI_STILL_ACTIVE')
COMPILE=r'''
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const [root,filename,candidate,output]=process.argv.slice(2);
const ts=createRequire(path.join(root,'package.json'))('typescript');
const text=fs.readFileSync(candidate,'utf8');
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
if(config.error)throw Error('TS_CONFIG_INVALID');
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
if(parsed.errors.length)throw Error('TS_CONFIG_DIAGNOSTICS');
const opts={...parsed.options,noEmit:true,incremental:false,composite:false};
const host=ts.createCompilerHost(opts);
const original=host.readFile.bind(host);
host.readFile=p=>path.resolve(p)===filename?text:original(p);
const program=ts.createProgram([filename],opts,host);
const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
if(errors.length){
 for(const e of errors.slice(0,8))console.error(ts.flattenDiagnosticMessageText(e.messageText,' '));
 process.exit(1);
}
const result=ts.transpileModule(text,{
 fileName:filename,compilerOptions:{...parsed.options,module:ts.ModuleKind.ES2022,
 moduleResolution:ts.ModuleResolutionKind.Bundler,noEmit:false,sourceMap:false,
 inlineSourceMap:false,declaration:false,incremental:false,composite:false},
 reportDiagnostics:true});
if((result.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('EMIT_DIAGNOSTICS');
if(!result.outputText.includes('export function registerEplanetDepositEngineR1(')
 ||!result.outputText.includes("from 'node:crypto'")&&!result.outputText.includes('from "node:crypto"'))
 throw Error('ESM_EXPORT_CONTRACT');
fs.writeFileSync(output,result.outputText);
console.log('ISOLATED_TYPESCRIPT_CHECK=PASS ESM_EMIT=PASS');
'''
def prepare():
 if STATE.exists():raise RuntimeError('DEPLOY_STATE_EXISTS_USE_VERIFY_OR_ROLLBACK')
 guard()
 for p in (SRC,DIST,STAGE/'candidate.ts',STAGE/'manifest.json',STAGE/'tests.cjs'):
  if not p.is_file() or p.is_symlink():raise RuntimeError('MISSING_OR_UNSAFE_FILE:'+str(p))
 manifest=json.loads((STAGE/'manifest.json').read_text())
 old=SRC.read_bytes();candidate=(STAGE/'candidate.ts').read_bytes();oldjs=DIST.read_bytes()
 if manifest.get('scope')!='stage-only' or sha(old)!=manifest['before'] or sha(candidate)!=manifest['candidate']:
  raise RuntimeError('STAGE_HASH_MISMATCH')
 if b'export function registerEplanetDepositEngineR1(' not in oldjs or b"EPLANET_DEPOSIT_VPS_R2_TX_LOCK" not in candidate:
  raise RuntimeError('MODULE_CONTRACT_MISMATCH')
 if b'./eplanet-deposit-vps-r2.js' not in (ROOT/'dist/apps/api/src/index.js').read_bytes():
  raise RuntimeError('COMPILED_API_IMPORT_MISSING')
 for needle in (b'function scheduled(job:any)',b"orderBy:{key:'asc'},take:100",b'!current.ready',b'delete job.availableBalance'):
  if needle not in candidate:raise RuntimeError('CANDIDATE_CONTRACT_MISMATCH')
 clean_env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'NODE_OPTIONS':'--max-old-space-size=512'}
 with tempfile.TemporaryDirectory(prefix='worker-deploy-') as d:
  d=Path(d);script=d/'compile.cjs';script.write_text(COMPILE)
  output=d/'candidate.mjs'
  # Rerun the staged backend tests before deploying any code.
  t=subprocess.run(['node',str(STAGE/'tests.cjs'),str(ROOT),str(STAGE/'candidate.ts')],env=clean_env,cwd=d,timeout=45)
  if t.returncode:raise RuntimeError('BACKEND_MOCK_TESTS_FAILED')
  t=subprocess.run(['node',str(script),str(ROOT),str(SRC),str(STAGE/'candidate.ts'),str(output)],env=clean_env,cwd=d,timeout=75)
  if t.returncode:raise RuntimeError('ISOLATED_TYPESCRIPT_CHECK_FAILED')
  t=subprocess.run(['node','--check',str(output)],env=clean_env,cwd=d,timeout=15)
  if t.returncode:raise RuntimeError('ESM_SYNTAX_FAILED')
  newjs=output.read_bytes()
 return {SRC:(old,candidate),DIST:(oldjs,newjs)}
def write_state(s):
 atomic(STATE,json.dumps(s,indent=2).encode(),0o600)
def read_state():return json.loads(STATE.read_text())
def rollback_files(s):
 for row in s['files']:
  p=Path(row['path']);backup=Path(row['backup']).read_bytes()
  if sha(backup)!=row['before']:raise RuntimeError('BACKUP_HASH_MISMATCH')
  if sha(p.read_bytes()) not in (row['before'],row['after']):
   raise RuntimeError('UNKNOWN_FILE_CHANGE_REFUSE_ROLLBACK:'+str(p))
 for row in s['files']:
  atomic(Path(row['path']),Path(row['backup']).read_bytes(),row['mode'])
 s['phase']='ROLLED_BACK_FILES';write_state(s)
def restart():
 cmd(['systemctl','restart',SERVICE],timeout=45)
 if not wait_health():raise RuntimeError('API_HEALTH_NOT_RECOVERED')
def deploy():
 files=prepare()
 WORK.mkdir(parents=True,exist_ok=True)
 backup=WORK/('backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
 backup.mkdir(mode=0o700)
 rows=[]
 for i,(p,(old,new)) in enumerate(files.items()):
  dest=backup/(str(i)+'.bin');dest.write_bytes(old);os.chmod(dest,0o600)
  rows.append({'path':str(p),'backup':str(dest),'before':sha(old),'after':sha(new),'mode':stat.S_IMODE(p.stat().st_mode)})
 s={'phase':'INSTALLING','files':rows}
 write_state(s)
 try:
  for row in rows:
   p=Path(row['path'])
   if sha(p.read_bytes())!=row['before']:raise RuntimeError('CONCURRENT_FILE_CHANGE')
   atomic(p,files[p][1],row['mode'])
  print('MODULE_AND_DIST=INSTALLED RESTART=START',flush=True)
  restart()
  guard()
  s['phase']='INSTALLED';write_state(s)
  verify()
 except BaseException:
  print('DEPLOY_FAILED_ATTEMPTING_ROLLBACK',flush=True)
  try:
   rollback_files(s);restart();STATE.unlink()
   print('ROLLBACK=PASS API_RECOVERED=YES',flush=True)
  except Exception as error:print('RECOVERY_REQUIRED='+str(error),flush=True)
  raise
 print('DEPLOY=PASS FULL_BUILD=NO BROKER_ACTIVATION=NO',flush=True)
def verify():
 s=read_state()
 if s['phase']!='INSTALLED':raise RuntimeError('INSTALL_NOT_COMPLETE')
 for row in s['files']:
  if sha(Path(row['path']).read_bytes())!=row['after']:raise RuntimeError('FILE_VERIFY_FAILED')
 if not healthy():raise RuntimeError('API_HEALTH_FAILED')
 print('VERIFY=PASS API=200 DEPOSIT_HEALTH=401 SERVICE=ACTIVE',flush=True)
 print('MANUAL_FLOW_PRESERVED=YES NO_DB_MIGRATION=YES',flush=True)
def main():
 action=sys.argv[1] if len(sys.argv)==2 else ''
 if action=='audit':
  prepare();print('AUDIT=PASS NO_PRODUCTION_WRITES=YES')
 elif action=='deploy':deploy()
 elif action=='verify':verify()
 elif action=='status':
  print('STATUS='+read_state()['phase'] if STATE.exists() else 'STATUS=NOT_INSTALLED')
 elif action=='rollback':
  s=read_state();rollback_files(s);restart();STATE.unlink();print('ROLLBACK=PASS API_RECOVERED=YES')
 else:raise RuntimeError('USAGE: install.py audit|deploy|verify|status|rollback')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR='+str(e),flush=True);sys.exit(1)
