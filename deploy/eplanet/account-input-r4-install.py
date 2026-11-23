#!/usr/bin/env python3
"""ePlanet account input R4: isolated, reversible, cache-safe stylesheet."""
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import urlopen
import hashlib,json,os,sys,tempfile
SOURCE=Path('/root/miniapp10x/public/miniapp/p74/eplanet')
LIVE=Path('/srv/tenx-public/miniapp/p74/eplanet')
ROOT=Path('/root/MMTRADE_EPLANET_ACCOUNT_INPUT_R4')
STATE=ROOT/'install-state.json'
NAME='account-input-hit-test-r4.css'
SHA='ad5fee59916cc4ae4973f212e3bedad615b05c323d8fcdd5916add31b252c9fa'
URL='https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/7856623e678e12806a8527c496bf896c646fd469/deploy/eplanet/'+NAME
LINK='<link rel="stylesheet" href="/miniapp/p74/eplanet/'+NAME+'?v=R4">'

def sha(b):return hashlib.sha256(b).hexdigest()
def write(path,data):
    fd,tmp=tempfile.mkstemp(prefix='.r4-',dir=str(path.parent))
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(tmp,(path.stat().st_mode & 0o777) if path.exists() else 0o644)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def fetch():
    with urlopen(URL,timeout=20) as res:data=res.read(60000)
    if sha(data)!=SHA:raise RuntimeError('REMOTE_CSS_HASH_MISMATCH')
    return data
def snapshot():
    if STATE.exists():raise RuntimeError('R4_ALREADY_INSTALLED')
    files={}
    for location,dir in [('source',SOURCE),('live',LIVE)]:
        for key in ('index.html','styles.css','app.js'):
            path=dir/key
            if not path.is_file():raise RuntimeError('MISSING:'+str(path))
            files[location+'_'+key]=path.read_bytes()
        if (dir/NAME).exists():raise RuntimeError('R4_CSS_ALREADY_EXISTS:'+str(dir/NAME))
    for key in ('index.html','styles.css'):
        if files['source_'+key]!=files['live_'+key]:raise RuntimeError('SOURCE_LIVE_DIFFER:'+key)
    for key in ('source_index.html','live_index.html'):
        h=files[key].decode('utf-8')
        if h.count('</head>')!=1 or 'EPLANET_GLASS_WEBVIEW_R3A' not in h or LINK in h:
            raise RuntimeError('UNEXPECTED_R3A_HTML:'+key)
        if 'id="accountId"' not in h or 'id="brokerEmail"' not in h:
            raise RuntimeError('EXPECTED_FORM_INPUTS_MISSING:'+key)
    return files
def transformed(old):return old.replace(b'</head>',LINK.encode()+b'</head>',1)
def audit():
    snapshot();fetch()
    print('AUDIT=PASS WRITES=NO R3A_BASELINE=YES SCOPE=EXTRA_CSS_LINK_AND_NEW_CSS_FILE')
def install():
    before=snapshot();css=fetch()
    backup=ROOT/'backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup.mkdir(parents=True,exist_ok=False)
    for key,data in before.items():(backup/(key+'.bin')).write_bytes(data)
    state={'backup':str(backup),'original':{k:sha(v) for k,v in before.items()}}
    try:
        for dir in (SOURCE,LIVE):
            write(dir/NAME,css)
            write(dir/'index.html',transformed((dir/'index.html').read_bytes()))
        ROOT.mkdir(parents=True,exist_ok=True)
        STATE.write_text(json.dumps(state,indent=2))
        verify()
    except Exception:
        for dir,location in ((SOURCE,'source'),(LIVE,'live')):
            write(dir/'index.html',before[location+'_index.html'])
            (dir/NAME).unlink(missing_ok=True)
        STATE.unlink(missing_ok=True)
        raise
    print('INSTALL=PASS BACKUP='+str(backup))
def verify():
    if not STATE.exists():raise RuntimeError('NOT_INSTALLED')
    state=json.loads(STATE.read_text());b=Path(state['backup'])
    for location,dir in (('source',SOURCE),('live',LIVE)):
        h=(b/(location+'_index.html.bin')).read_bytes()
        if (dir/'index.html').read_bytes()!=transformed(h):raise RuntimeError('HTML_VERIFICATION_FAILED:'+location)
        if sha((dir/NAME).read_bytes())!=SHA:raise RuntimeError('R4_CSS_VERIFICATION_FAILED:'+location)
        for key in ('styles.css','app.js'):
            if sha((dir/key).read_bytes())!=state['original'][location+'_'+key]:
                raise RuntimeError('R3A_STYLE_OR_JS_CHANGED:'+location+'_'+key)
    print('VERIFY=PASS SOURCE_LIVE_SYNC=YES R3A_CSS_JS_UNCHANGED=YES')
def rollback():
    verify();state=json.loads(STATE.read_text());backup=Path(state['backup'])
    for location,dir in (('source',SOURCE),('live',LIVE)):
        write(dir/'index.html',(backup/(location+'_index.html.bin')).read_bytes())
        (dir/NAME).unlink()
    STATE.unlink()
    print('ROLLBACK=PASS R3A_FILES_RESTORED=YES')
if __name__=='__main__':
    try:
        cmd=sys.argv[1] if len(sys.argv)==2 else ''
        {'audit':audit,'install':install,'verify':verify,'rollback':rollback}[cmd]()
    except KeyError:print('USAGE: install.py audit|install|verify|rollback');sys.exit(2)
    except Exception as error:print('ERROR='+str(error));sys.exit(1)
