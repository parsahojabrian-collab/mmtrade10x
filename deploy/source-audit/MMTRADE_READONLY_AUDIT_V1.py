#!/usr/bin/env python3
"""MMTRADE10X read-only VPS source/drift auditor. No uploads, build, restarts or credentials."""
from pathlib import Path
from collections import Counter
import hashlib,subprocess,sys
ROOT=Path('/root/miniapp10x')
LIVE=Path('/srv/tenx-public/miniapp')
API=ROOT/'apps/api/src/index.ts'
OUT=Path('/root/MMTRADE_SOURCE_AUDIT_READONLY.txt')
EXT={'.html','.css','.js','.ts','.mjs','.json','.prisma','.py','.sh'}
SKIP={'node_modules','.git','dist','.venv','venv','__pycache__'}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()[:16]
def read(p):return p.read_text(encoding='utf-8',errors='replace') if p.is_file() else ''
def find_files(path):
 if not path.is_dir():return []
 return [p for p in path.rglob('*') if p.is_file() and p.suffix in EXT and not SKIP.intersection(p.parts) and p.stat().st_size<=3_000_000]
def run(args):
 try:
  x=subprocess.run(args,capture_output=True,text=True,timeout=12)
  return (x.returncode,x.stdout.strip()[:3000],x.stderr.strip()[:1000])
 except Exception as e:return (-1,'',type(e).__name__)
def report():
 lines=[];emit=lines.append
 emit('MMTRADE10X READ-ONLY AUDIT')
 emit('CHANGES=NONE SECRET_VALUES=NOT_READ SERVICE_RESTART=NO BUILD=NO')
 if not API.exists():
  emit('ERROR=API_SOURCE_NOT_FOUND');return lines
 source=read(API)
 fs=find_files(ROOT)
 emit('ROOT='+str(ROOT)+' SCANNED_FILES='+str(len(fs)))
 emit('EXTENSIONS='+str(dict(Counter(p.suffix for p in fs).most_common(12))))
 emit('SOURCE_API_SHA16='+digest(API))
 emit('API_LINES='+str(source.count('\n')+1))
 markers={
  'DEPOSIT_R2_IMPORT':"from './eplanet-deposit-vps-r2.js'",
  'DEPOSIT_R2_HOOK':'MMTRADE_EPLANET_DEPOSIT_VPS_R2_BEGIN',
  'EPLANET_EMAIL_R3':'MMTRADE_EPLANET_EMAIL_MATCH_VPS_R3_BEGIN',
  'EPLANET_ROUTER':'/miniapp/eplanet/submit',
  'EPLANET_OLD_MANUAL_SUBMIT':"app.post('/miniapp/eplanet/submit'",
  'P37_CHANGE_WORKFLOW':'async function p37ChangeWorkflow(',
  'P37_LOCK_WORKFLOW':'async function p37LockWorkflow',
  'IN_PROCESS_EPLANET_SERIALIZER':'async function eplanetSerialize<T>(work:()=>Promise<T>)',
  'NODE_HELMET_CSP_DISABLED':'contentSecurityPolicy: false'
 }
 for k,term in markers.items():emit(k+'='+str(source.count(term)))
 for k,p in {
  'MODULE_SOURCE':ROOT/'apps/api/src/eplanet-deposit-vps-r2.ts',
  'MODULE_BUILD':ROOT/'dist/apps/api/src/eplanet-deposit-vps-r2.js',
  'UI_SOURCE':ROOT/'public/miniapp/p74/eplanet/deposit-ui-vps-r2.js',
  'UI_LIVE':LIVE/'p74/eplanet/deposit-ui-vps-r2.js',
  'HTML_SOURCE':ROOT/'public/miniapp/p74/eplanet/index.html',
  'HTML_LIVE':LIVE/'p74/eplanet/index.html'
 }.items():emit(k+'='+('EXISTS SHA16='+digest(p) if p.is_file() else 'MISSING'))
 source_html=ROOT/'public/miniapp/p74/eplanet/index.html'
 live_html=LIVE/'p74/eplanet/index.html'
 if source_html.is_file() and live_html.is_file():
  emit('EPLANET_HTML_SYNC='+str(source_html.read_bytes()==live_html.read_bytes()))
  emit('R5_MARKER_SOURCE='+str('MMTRADE_EPLANET_DIALOG_CLOSE_R5' in read(source_html)))
  emit('R2_SCRIPT_LIVE='+str('deposit-ui-vps-r2.js' in read(live_html)))
 emit('===== SOURCE/LIVE ASSET DRIFT =====')
 public=ROOT/'public/miniapp'
 mismatches=[]
 missing=[]
 for p in find_files(public):
  if p.suffix not in {'.js','.css','.html'}:continue
  relative=p.relative_to(public)
  live=LIVE/relative
  if not live.is_file():missing.append(str(relative));continue
  if p.stat().st_size!=live.stat().st_size or digest(p)!=digest(live):
   mismatches.append(str(relative))
 emit('MISMATCH_COUNT='+str(len(mismatches)))
 for p in mismatches[:80]:emit('DIFFER='+p)
 emit('MISSING_LIVE_COUNT='+str(len(missing)))
 for p in missing[:80]:emit('MISSING_LIVE='+p)
 emit('===== TEST DISCOVERY (NOT EXECUTED) =====')
 tests=list((ROOT/'tests').glob('*.test.mjs'))
 emit('TEST_FILES='+str(len(tests)))
 for p in sorted(tests):
  if 'eplanet' in p.name or 'bot-' in p.name or 'copytrade' in p.name:
   emit('RELATED_TEST='+p.name)
 emit('===== SYSTEMD READ-ONLY =====')
 code,stdout,stderr=run(['systemctl','show','10x-api.service','--property=MainPID,ActiveState,SubState','--no-pager'])
 emit('SYSTEMCTL_RC='+str(code))
 emit(stdout or stderr)
 emit('===== CHECKS =====')
 emit('NO_RUNTIME_HTTP_CALLS=YES; NO_DEPENDENCY_BUILDS=YES')
 return lines
if __name__=='__main__':
 lines=report()
 content='\n'.join(lines)+'\n'
 # The only write is this user-readable report, never source, database, or logs.
 OUT.write_text(content,encoding='utf-8')
 print(content)
 print('AUDIT_REPORT='+str(OUT))
