#!/usr/bin/env python3
"""MMTRADE ePlanet Sandbox V1 — isolated static clone, strict no-network policy.

Reads the existing VPS *live* ePlanet markup/styles to preserve current design.
Sanitizes all scripts/handlers and builds an independent simulated state machine.
Does NOT touch ePlanet production assets, API, DB, service, or env.
"""
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import urlopen
from tempfile import TemporaryDirectory
from collections import OrderedDict
import hashlib,json,os,re,shutil,subprocess,sys

REAL_SRC=Path('/root/miniapp10x/public/miniapp/p74/eplanet')
REAL_LIVE=Path('/srv/tenx-public/miniapp/p74/eplanet')
DEST_SRC=REAL_SRC.parent/'eplanet-sandbox'
DEST_LIVE=REAL_LIVE.parent/'eplanet-sandbox'
WORK=Path('/root/MMTRADE_EPLANET_SANDBOX_V1')
STATE=WORK/'state.json'
REV='d3c3348fff88df6aa475fd423b3cf97dd1ac287f'
BASE=f'https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/{REV}/deploy/eplanet/sandbox-v1/'
PIN={
 'sandbox-state.mjs':'94a9183e204971d85d0ec3489cf106dfe434df1a',
 'sandbox-ui.mjs':'92403fcb239056c586b31dccde69d943c9571bb5',
 'sandbox.css':'bb1f27d1ed9d8ffc9a8103f8543b2c30d2c174b5',
 'sandbox.test.mjs':'75b4019145b731df66c3adb758d84b70ab292463'
}
MIME_EXT={'.webp','.png','.svg','.jpg','.jpeg','.avif','.gif','.ico','.woff','.woff2'}
URL_B=b'/miniapp/p74/eplanet/'
URL_DEMO=b'/miniapp/p74/eplanet-sandbox/'
CSP=(b'<meta http-equiv="Content-Security-Policy" content="'
     b"default-src 'none'; script-src 'self'; connect-src 'none'; "
     b"img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
     b"font-src 'self' data:; form-action 'none'; base-uri 'none'; "
     b"object-src 'none'; frame-src 'none'\">")
TAG=b'<script type="module" src="/miniapp/p74/eplanet-sandbox/sandbox-ui.mjs?v=SBX_V1"></script>'
STYLE=b'<link rel="stylesheet" href="/miniapp/p74/eplanet-sandbox/sandbox.css?v=SBX_V1">'
MARK=b'<!-- MMTRADE_EPLANET_SANDBOX_ONLY: NO API, NO BROKER, NO PRODUCTION WRITES -->'
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def fetch_assets():
 out={}
 for name,expected in PIN.items():
  with urlopen(BASE+name,timeout=25) as r:raw=r.read(200000)
  if blob(raw)!=expected:raise RuntimeError('PIN_SHA_INVALID:'+name)
  out[name]=raw
 return out
def source_check():
 if STATE.exists():raise RuntimeError('STATE_EXISTS_RUN_STATUS_OR_ROLLBACK')
 for dest in [DEST_SRC,DEST_LIVE]:
  if dest.exists() or dest.is_symlink():raise RuntimeError('SANDBOX_ALREADY_EXISTS:'+str(dest))
 for root in [REAL_SRC,REAL_LIVE]:
  for file in ('index.html','styles.css'):
   if not (root/file).is_file():raise RuntimeError('REAL_EPLANET_FILE_MISSING:'+str(root/file))
 if REAL_SRC.resolve()==DEST_SRC.resolve() or REAL_LIVE.resolve()==DEST_LIVE.resolve():
  raise RuntimeError('SANDBOX_DEST_EQUALS_PRODUCTION')
 html=REAL_LIVE.joinpath('index.html').read_bytes()
 css=REAL_LIVE.joinpath('styles.css').read_bytes()
 if html!=REAL_SRC.joinpath('index.html').read_bytes() or css!=REAL_SRC.joinpath('styles.css').read_bytes():
  raise RuntimeError('SOURCE_LIVE_NOT_SYNC')
 for anchor in (b'<head>',b'</head>',b'</body>',b'id="stepDialog"',
                b'id="submitVerification"',b'id="progressFill"',b'id="doneCount"'):
  if html.count(anchor)!=1:raise RuntimeError('LIVE_HTML_CONTRACT:'+anchor.decode())
 for n in range(4):
  if html.count(('data-step="'+str(n)+'"').encode())!=1:
   raise RuntimeError('MISSING_STEP_'+str(n))
 if re.search(rb'<\s*(iframe|object|embed|base)\b',html,re.I):
  raise RuntimeError('UNEXPECTED_EMBEDDED_CONTENT')
 return html,css
def sanitize(h):
 # HTML copied from the actual VPS so visual structure matches. NEVER run
 # production app.js, studio bridges, Telegram scripts or inline handlers.
 h,num_scripts=re.subn(rb'<script\b[^>]*>[\s\S]*?</script\s*>',b'',h,flags=re.I)
 if num_scripts<1:raise RuntimeError('NO_SCRIPT_TAGS_FOUND_REFUSE')
 if re.search(rb'<script\b',h,re.I):raise RuntimeError('UNREMOVED_SCRIPT')
 h=re.sub(rb'\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|\'[^\']*\')',b'',h)
 h=re.sub(rb'<a\b[^>]*>',clean_anchor,h,flags=re.I)
 h=re.sub(rb'<form\b([^>]*)>',clean_form,h,flags=re.I)
 h=h.replace(URL_B,URL_DEMO)
 h=h.replace(b'<head>',b'<head>'+CSP+b'<meta name="robots" content="noindex,nofollow,noarchive">',1)
 h=h.replace(b'</head>',STYLE+b'</head>',1)
 h=h.replace(b'</body>',MARK+TAG+b'</body>',1)
 if h.count(TAG)!=1 or h.count(STYLE)!=1 or b'onclick=' in h.lower():
  raise RuntimeError('SANDBOX_HTML_SAFETY_CHECK_FAILED')
 if b'/miniapp/p74/eplanet/app.js' in h or b'telegram-web-app.js' in h or b'/studio/bridge.js' in h:
  raise RuntimeError('PRODUCTION_RUNTIME_LEAK')
 return h
def clean_anchor(m):
 tag=m.group(0)
 tag=re.sub(rb'\s+href\s*=\s*(?:"[^"]*"|\'[^\']*\')',b'',tag,flags=re.I)
 tag=re.sub(rb'\s+target\s*=\s*(?:"[^"]*"|\'[^\']*\')',b'',tag,flags=re.I)
 return tag[:-1]+b' href="#" aria-disabled="true">'
def clean_form(m):
 tag=m.group(0)
 tag=re.sub(rb'\s+action\s*=\s*(?:"[^"]*"|\'[^\']*\')',b'',tag,flags=re.I)
 return tag
def copy_images():
 out={}
 for path in sorted((REAL_LIVE/'assets').rglob('*')):
  if not path.is_file():continue
  if path.is_symlink():raise RuntimeError('SYMLINK_ASSET_NOT_ALLOWED')
  if path.suffix.lower() not in MIME_EXT:continue
  rel=path.relative_to(REAL_LIVE).as_posix()
  if len(rel)>180 or '..' in Path(rel).parts:raise RuntimeError('UNSAFE_ASSET_PATH')
  raw=path.read_bytes()
  if len(raw)>5_000_000:raise RuntimeError('ASSET_TOO_LARGE:'+rel)
  out[rel]=raw
 if not out:raise RuntimeError('EPLANET_ASSETS_NOT_FOUND')
 if sum(map(len,out.values()))>40_000_000:raise RuntimeError('ASSETS_TOTAL_LIMIT')
 return out
def package():
 html,css=source_check()
 assets=fetch_assets()
 out=OrderedDict()
 out['index.html']=sanitize(html)
 out['styles.css']=css.replace(URL_B,URL_DEMO)
 out.update(assets)
 out.update(copy_images())
 test(out)
 return out
def test(files):
 with TemporaryDirectory(prefix='mmtrade-sbx-v1-') as temp:
  p=Path(temp)
  for name,data in files.items():
   if name.startswith('assets/'):continue
   out=p/name;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
  for filename in ('sandbox-state.mjs','sandbox-ui.mjs'):
   a=subprocess.run(['node','--check',str(p/filename)],capture_output=True,text=True,timeout=20)
   if a.returncode:raise RuntimeError('JS_SYNTAX_INVALID:'+filename+':'+a.stderr[:200])
  result=subprocess.run(['node','--test','sandbox.test.mjs'],cwd=p,capture_output=True,text=True,timeout=35)
  if result.returncode:raise RuntimeError('SANDBOX_TEST_FAILED:'+result.stdout[-1500:]+result.stderr[-500:])
  passed=len(re.findall(r'^# pass \d+',result.stdout,re.M))
  if passed!=1:raise RuntimeError('SANDBOX_TEST_REPORT_MISSING')
def audit():
 out=package()
 print('AUDIT=PASS NO_PRODUCTION_WRITES=YES',flush=True)
 print('MOCK_SCENARIOS=5 STAGES=4 NO_API_NO_DATABASE_NO_BROKER=YES',flush=True)
 print('NODE_TESTS=PASS ASSETS='+str(len(out))+' HTML_CLONED_FROM_VPS=YES',flush=True)
 print('OUTPUT_TARGET=/miniapp/p74/eplanet-sandbox/index.html',flush=True)
def write_state(obj):
 WORK.mkdir(parents=True,exist_ok=True)
 STATE.write_text(json.dumps(obj,indent=2),encoding='utf-8')
def install():
 files=package()
 work_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 state={'phase':'INSTALLING','id':work_id,'revision':REV,
        'sha256':{k:sha(v) for k,v in files.items()},
        'sources':{'realHtml':sha(REAL_LIVE.joinpath('index.html').read_bytes()),
                   'realCss':sha(REAL_LIVE.joinpath('styles.css').read_bytes())}}
 # Install journal before any deployment to recover from an SSH disconnect.
 write_state(state)
 try:
  for root in (DEST_SRC,DEST_LIVE):
   staged=root.parent/('.eplanet-sandbox-stage-'+work_id)
   if staged.exists():raise RuntimeError('PREEXISTING_STAGE:'+str(staged))
   staged.mkdir()
   for name,data in files.items():
    path=staged/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
   staged.rename(root)
  state['phase']='INSTALLED';write_state(state)
  verify()
 except BaseException:
  # Only delete objects made by this installer, never real ePlanet files.
  try:
   cleanup(state,force=True)
   STATE.unlink(missing_ok=True)
  except Exception as error:
   print('RECOVERY_REQUIRED='+str(error),flush=True)
  raise
 print('INSTALL=PASS PRODUCTION_API_AND_UI=UNCHANGED SERVICE_RESTART=NO',flush=True)
 print('OPEN=/miniapp/p74/eplanet-sandbox/index.html',flush=True)
def assert_owned(root,state,complete):
 if not root.exists():return
 expected=state['sha256']
 paths=[p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()]
 if complete and set(paths)!=set(expected):raise RuntimeError('FILE_SET_CHANGED:'+str(root))
 for name in paths:
  if name not in expected or sha((root/name).read_bytes())!=expected[name]:
   raise RuntimeError('SANDBOX_CHANGED_REFUSE_REMOVE:'+str(root/name))
def cleanup(state,force=False):
 for root in (DEST_SRC,DEST_LIVE):
  if root.is_dir():
   assert_owned(root,state,not force)
   shutil.rmtree(root)
 staged_id=state.get('id','')
 if staged_id:
  for parent in (DEST_SRC.parent,DEST_LIVE.parent):
   stage=parent/('.eplanet-sandbox-stage-'+staged_id)
   if stage.is_dir():
    assert_owned(stage,state,not force)
    shutil.rmtree(stage)
def verify():
 if not STATE.is_file():raise RuntimeError('NOT_INSTALLED')
 state=json.loads(STATE.read_text())
 if state['phase']!='INSTALLED':raise RuntimeError('INSTALL_INCOMPLETE_USE_ROLLBACK')
 for root in (DEST_SRC,DEST_LIVE):
  if not root.is_dir():raise RuntimeError('SANDBOX_DIRECTORY_MISSING:'+str(root))
  assert_owned(root,state,True)
 if (DEST_SRC/'index.html').read_bytes()!=(DEST_LIVE/'index.html').read_bytes():
  raise RuntimeError('SANDBOX_SOURCE_LIVE_DIFFER')
 print('VERIFY=PASS FILES='+str(len(state['sha256']))+' SOURCE_LIVE_SYNC=YES',flush=True)
def status():
 if not STATE.is_file():print('STATUS=NOT_INSTALLED');return
 state=json.loads(STATE.read_text())
 print('STATUS='+state['phase'])
 print('SOURCE_SANDBOX='+str(DEST_SRC))
 print('LIVE_SANDBOX='+str(DEST_LIVE))
def rollback():
 if not STATE.is_file():raise RuntimeError('NOT_INSTALLED')
 state=json.loads(STATE.read_text())
 cleanup(state,force=state['phase']!='INSTALLED')
 STATE.unlink()
 print('ROLLBACK=PASS ONLY_SANDBOX_FILES_REMOVED=YES',flush=True)
if __name__=='__main__':
 try:
  cmd=sys.argv[1] if len(sys.argv)==2 else ''
  if cmd=='audit':audit()
  elif cmd=='install':install()
  elif cmd=='verify':verify()
  elif cmd=='status':status()
  elif cmd=='rollback':rollback()
  else:raise RuntimeError('USAGE: install.py audit|install|verify|status|rollback')
 except Exception as error:
  print('ERROR='+str(error),flush=True)
  sys.exit(1)
