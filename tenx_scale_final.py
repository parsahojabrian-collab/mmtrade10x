#!/usr/bin/env python3
"""10X conservative production scale package. Run as root on the VPS.
Modes: audit, stage, activate, verify, rollback.
No schema migrations, no load testing on production, no bot restart.
"""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, subprocess, sys, urllib.error, urllib.request, ssl
R=pathlib.Path('/root/miniapp10x'); CFG=pathlib.Path('/etc/nginx/sites-available/10x'); SRC=R/'apps/api/src/index.ts'; DIST=R/'dist/apps/api/src/index.js'; STATIC=pathlib.Path('/srv/tenx-public/miniapp'); BASE=R/'academy-content/scale-final'; STATE=BASE/'state.json'; DOMAIN='mmtrade.parsahojabrian.ir'
OLD="await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });"
NEW="await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });"
# 300/min per IP is a guarded starting value, not a validated 2000-user capacity.
def run(cmd, timeout=90):
 p=subprocess.run(cmd, capture_output=True,text=True,timeout=timeout)
 return p.returncode,(p.stdout+'\n'+p.stderr).strip()
def die(s): raise RuntimeError(s)
def hashfile(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def status(path):
 cmd=['curl','-ksS','--max-time','7','--resolve',f'{DOMAIN}:443:127.0.0.1','-o','/dev/null','-w','%{http_code}',f'https://{DOMAIN}{path}']
 rc,out=run(cmd,12)
 if rc: die('HTTP_PROBE_FAILED '+path+' '+out[:200])
 return int(out.strip())
def checks():
 for p in (CFG,SRC,DIST,STATIC/'index.html',R/'package.json'):
  if not p.is_file(): die('MISSING '+str(p))
 if os.geteuid()!=0: die('ROOT_REQUIRED')
 if run(['nginx','-t'])[0]: die('NGINX_INVALID')
 for s in ('nginx','10x-api','10x-bot','mariadb'):
  if run(['systemctl','is-active','--quiet',s])[0]: die('SERVICE_NOT_ACTIVE '+s)
 if status('/health')!=200 or status('/miniapp/')!=200: die('BASELINE_HTTP_FAILED')
 c=CFG.read_text()
 if 'TENX_SCALE_P01_BEGIN' not in c or 'location ^~ /miniapp/' not in c: die('P01_NOT_ACTIVE')
 if 'location = /miniapp/profile/save' not in c: die('PROFILE_ROUTE_NOT_PRESERVED')
 if OLD not in SRC.read_text() and NEW not in SRC.read_text(): die('UNEXPECTED_RATE_LIMIT_SOURCE')
 return c
def audit():
 checks()
 print('BASELINE=PASS')
 print('RATE_LIMIT_100=',OLD in SRC.read_text())
 print('RATE_LIMIT_300=',NEW in SRC.read_text())
 print('P01_STATIC=ACTIVE')
 print('BACKUP_BLOCK_STATUS=',status('/miniapp/index.html.bak-20261101-131915'))
 print('DISK_FREE_GB=',round(shutil.disk_usage('/').free/1024**3,2))
 print('NOTE=Capacity 2000 requires external staged load test; not guaranteed by this script')
 print('SCALE_FINAL_AUDIT=PASS')
def stage():
 checks()
 if STATE.exists(): die('EXISTING_STAGE_OR_ACTIVATION; inspect '+str(STATE))
 if OLD not in SRC.read_text(): die('SOURCE_ALREADY_CHANGED_OR_UNEXPECTED')
 if SRC.read_text().count(OLD)!=1: die('AMBIGUOUS_RATE_LIMIT')
 if shutil.disk_usage('/').free < 2*1024**3: die('INSUFFICIENT_DISK')
 BASE.mkdir(parents=True,exist_ok=True)
 snap=BASE/('snapshot-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
 snap.mkdir(mode=0o700)
 shutil.copy2(SRC,snap/'index.ts'); shutil.copy2(DIST,snap/'index.js'); shutil.copy2(CFG,snap/'nginx.conf')
 # Do not alter nginx: P01 is already serving static assets and blocking backups.
 state={'phase':'staged','snapshot':str(snap),'source_sha':hashfile(SRC),'dist_sha':hashfile(DIST),'config_sha':hashfile(CFG),'before_limit':100,'after_limit':300}
 STATE.write_text(json.dumps(state,indent=2)); os.chmod(STATE,0o600)
 print('STAGE_BACKUP=',snap); print('SCALE_FINAL_STAGE=PASS')
def restore(state):
 snap=pathlib.Path(state['snapshot'])
 if not (snap/'index.ts').exists() or not (snap/'index.js').exists(): die('BACKUP_MISSING')
 shutil.copy2(snap/'index.ts',SRC)
 shutil.copy2(snap/'index.js',DIST)
 rc,out=run(['systemctl','restart','10x-api'],30)
 if rc: die('ROLLBACK_RESTART_FAILED '+out[:500])
 if status('/health')!=200: die('ROLLBACK_HEALTH_FAILED')
 state['phase']='rolled_back'; STATE.write_text(json.dumps(state,indent=2))
 print('ROLLBACK=PASS')
def activate():
 checks()
 if not STATE.exists(): die('RUN_STAGE_FIRST')
 st=json.loads(STATE.read_text())
 if st['phase']!='staged': die('WRONG_STAGE '+st['phase'])
 if hashfile(SRC)!=st['source_sha'] or hashfile(DIST)!=st['dist_sha'] or hashfile(CFG)!=st['config_sha']: die('FILES_CHANGED_SINCE_STAGE')
 original=SRC.read_text()
 if original.count(OLD)!=1: die('EXPECTED_LIMIT_MISSING')
 SRC.write_text(original.replace(OLD,NEW))
 try:
  rc,out=run(['npm','run','build'],180)
  if rc: die('BUILD_FAILED '+out[-1500:])
  if NEW not in SRC.read_text(): die('SOURCE_CHANGE_MISSING')
  rc,out=run(['systemctl','restart','10x-api'],35)
  if rc: die('API_RESTART_FAILED '+out[-600:])
  if status('/health')!=200 or status('/miniapp/')!=200: die('POST_RESTART_HEALTH_FAILED')
  if status('/miniapp/index.html.bak-20261101-131915')!=404: die('BACKUP_EXPOSED')
  if status('/miniapp/blocks.js')!=200: die('STATIC_ASSET_FAILED')
  st['phase']='activated'; st['activated_at']=datetime.datetime.now(datetime.timezone.utc).isoformat(); STATE.write_text(json.dumps(st,indent=2))
  print('API_BUILD=PASS');print('API_RESTART=PASS');print('HEALTH=PASS');print('BACKUP_BLOCK=PASS');print('BOT_RESTARTED=NO');print('SCALE_FINAL_ACTIVATE=PASS')
 except Exception as e:
  print('ACTIVATE_ERROR=',str(e));print('ROLLBACK_ATTEMPT=START')
  try: restore(st)
  except Exception as rollback_error: print('ROLLBACK_ERROR=',str(rollback_error))
  raise

def verify():
 checks()
 if not STATE.exists(): die('NO_STATE')
 st=json.loads(STATE.read_text())
 if st['phase']!='activated': die('NOT_ACTIVATED')
 if NEW not in SRC.read_text(): die('LIMIT_NOT_UPDATED')
 if status('/miniapp/index.html.bak-20261101-131915')!=404: die('BACKUP_EXPOSED')
 if status('/miniapp/blocks.js')!=200: die('ASSET_FAILED')
 if status('/miniapp')!=200: die('LEGACY_MINIAPP_FAILED')
 print('STATIC=PASS');print('SECURITY=PASS');print('HEALTH=PASS');print('RATE_LIMIT_CONFIG=300_PER_MINUTE_PER_IP');print('PROFILE_POST=NOT_TESTED');print('LOAD_2000=NOT_TESTED');print('SCALE_FINAL_VERIFY=PASS')
def rollback():
 if not STATE.exists(): die('NO_STATE')
 st=json.loads(STATE.read_text())
 if st['phase'] not in ('activated','staged'): die('NOT_ROLLBACKABLE_PHASE')
 if st['phase']=='staged':
  st['phase']='cancelled';STATE.write_text(json.dumps(st,indent=2));print('STAGE_CANCELLED=PASS');return
 restore(st)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['audit','stage','activate','verify','rollback']);a=p.parse_args()
 try: globals()[a.mode]()
 except Exception as e: print('SCALE_FINAL_ERROR=',str(e));sys.exit(1)
