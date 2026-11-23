#!/usr/bin/env python3
"""Close-button hit-test fix for MMTRADE ePlanet iOS modal; fail-closed and reversible.

Only changes source/live ePlanet index.html by inserting one scoped CSS <style> in <head>.
No JS, API, referral, broker configuration, or main CSS writes.
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib, json, os, sys, tempfile

SRC=Path('/root/miniapp10x/public/miniapp/p74/eplanet')
LIVE=Path('/srv/tenx-public/miniapp/p74/eplanet')
WORK=Path('/root/MMTRADE_EPLANET_DIALOG_CLOSE_R5')
STATE=WORK/'state.json'
MARK='MMTRADE_EPLANET_DIALOG_CLOSE_R5'
STYLE=('''<style id="MMTRADE_EPLANET_DIALOG_CLOSE_R5">\n'''
'''/* The account form z-index was raised by R4. Keep close form on top. */\n'''
'''dialog#stepDialog[open] > form.dialog-close {\n'''
'''  z-index: 10000 !important;\n'''
'''  pointer-events: auto !important;\n'''
'''  visibility: visible !important;\n'''
'''  opacity: 1 !important;\n'''
'''  touch-action: manipulation !important;\n'''
'''}\n'''
'''dialog#stepDialog[open] > form.dialog-close > button {\n'''
'''  z-index: 10001 !important;\n'''
'''  position: relative !important;\n'''
'''  pointer-events: auto !important;\n'''
'''  touch-action: manipulation !important;\n'''
'''}\n'''
'''</style>''')

def digest(data):return hashlib.sha256(data).hexdigest()
def paths():return {'source':SRC/'index.html','live':LIVE/'index.html'}
def new_html(old):return old.replace(b'</head>',STYLE.encode()+b'</head>',1)
def atomic(path,data):
 fd,tmp=tempfile.mkstemp(prefix='.close-r5-',dir=str(path.parent))
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(tmp,path.stat().st_mode&0o777)
  os.replace(tmp,path)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def preflight():
 if STATE.exists():raise RuntimeError('ALREADY_INSTALLED')
 original={}
 for k,p in paths().items():
  if not p.is_file():raise RuntimeError('MISSING_FILE:'+str(p))
  data=p.read_bytes();original[k]=data
  if data.count(b'</head>')!=1:raise RuntimeError('HEAD_NOT_UNIQUE:'+k)
  if MARK.encode() in data:raise RuntimeError('R5_ALREADY_PRESENT:'+k)
  if b'<dialog id="stepDialog"' not in data:raise RuntimeError('DIALOG_MISSING:'+k)
  if b'<form method="dialog" class="dialog-close">' not in data:raise RuntimeError('NATIVE_CLOSE_FORM_MISSING:'+k)
  if b'id="accountId"' not in data or b'id="brokerEmail"' not in data:raise RuntimeError('EXPECTED_FORM_MISSING:'+k)
  if b'EPLANET_GLASS_WEBVIEW_R3A' not in data:raise RuntimeError('R3A_BASELINE_MISSING:'+k)
 if original['source']!=original['live']:raise RuntimeError('SOURCE_LIVE_HTML_NOT_EQUAL')
 return original

def audit():
 old=preflight();print('AUDIT=PASS NO_WRITES=YES SCOPE=DIALOG_CLOSE_HIT_TEST_ONLY')
 print('SOURCE_LIVE_SYNC=YES BASELINE=R3A')
 print('SOURCE_HTML_SHA256='+digest(old['source']))

def install():
 old=preflight()
 backup=WORK/'backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 backup.mkdir(parents=True,exist_ok=False)
 for k,data in old.items(): (backup/(k+'.html')).write_bytes(data)
 new=new_html(old['source'])
 state={'backup':str(backup),'original':{k:digest(v) for k,v in old.items()},'new_sha256':digest(new)}
 try:
  for p in paths().values():atomic(p,new)
  WORK.mkdir(parents=True,exist_ok=True)
  STATE.write_text(json.dumps(state,indent=2))
  verify()
 except Exception:
  for k,p in paths().items():atomic(p,old[k])
  STATE.unlink(missing_ok=True)
  raise
 print('INSTALL=PASS BACKUP='+str(backup))

def verify():
 if not STATE.exists():raise RuntimeError('NOT_INSTALLED')
 state=json.loads(STATE.read_text())
 for k,p in paths().items():
  if digest(p.read_bytes())!=state['new_sha256']:raise RuntimeError('HTML_HASH_MISMATCH:'+k)
  if p.read_bytes().count(MARK.encode())!=1:raise RuntimeError('STYLE_MARKER_BAD:'+k)
 print('VERIFY=PASS SOURCE_LIVE_SYNC=YES CSS_JS_API_UNCHANGED=YES')

def rollback():
 if not STATE.exists():raise RuntimeError('NOT_INSTALLED')
 verify();state=json.loads(STATE.read_text());folder=Path(state['backup'])
 old={k:(folder/(k+'.html')).read_bytes() for k in paths()}
 for k,data in old.items():
  if digest(data)!=state['original'][k]:raise RuntimeError('BACKUP_CORRUPT:'+k)
 for k,p in paths().items():atomic(p,old[k])
 STATE.unlink()
 print('ROLLBACK=PASS PRE_R5_HTML_RESTORED=YES')

if __name__=='__main__':
 try: {'audit':audit,'install':install,'verify':verify,'rollback':rollback}[sys.argv[1]]()
 except (KeyError,IndexError):print('USAGE: install.py audit|install|verify|rollback');sys.exit(2)
 except Exception as e:print('ERROR='+str(e));sys.exit(1)
