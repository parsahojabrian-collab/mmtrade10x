#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/root/miniapp10x
BASE="$ROOT/public/miniapp"
LIVE=/srv/tenx-public/miniapp
STAMP=MMTRADE_HOME_STUDIO_OWNER_R5_20261120
STAGE=$(mktemp -d /root/MMTRADE_HOME_STUDIO_R5_STAGE_XXXXXXXX)
BACKUP="/root/MMTRADE_HOME_STUDIO_R5_BACKUP_$(date +%Y%m%d_%H%M%S)"
FILES=(blocks.js index.html p74/studio/bridge.js p74/studio/studio.js p74/studio/index.html)
TEST=tests/home-studio-single-owner.test.mjs

echo '===== PREFLIGHT (READ-ONLY) ====='
command -v rsync >/dev/null
test -d "$ROOT/node_modules"
for rel in "${FILES[@]}"; do
  test -s "$BASE/$rel" && test -s "$LIVE/$rel"
  cmp -s "$BASE/$rel" "$LIVE/$rel" || { echo "ABORT: LIVE_SOURCE_MISMATCH $rel"; exit 2; }
done
test ! -e "$ROOT/$TEST" || { echo "ABORT: TEST_ALREADY_EXISTS"; exit 2; }
nginx -t

echo '===== BUILD ISOLATED STAGE ====='
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude='*.log' "$ROOT/" "$STAGE/"
ln -s "$ROOT/node_modules" "$STAGE/node_modules"
export STAGE STAMP
python3 - <<'PY'
from pathlib import Path
import os,re
root=Path(os.environ['STAGE'])/'public/miniapp'
stamp=os.environ['STAMP']
def replace_exact(rel, old, new):
    path=root/rel
    s=path.read_text(encoding='utf-8')
    if s.count(old)!=1: raise RuntimeError(f'ABORT_ANCHOR_MISMATCH {rel} count={s.count(old)} {old[:55]}')
    path.write_text(s.replace(old,new,1),encoding='utf-8')

# The P74 Home editor is the sole owner of native mountain step labels/links.
replace_exact('blocks.js',
    'if(!target)return;\n// TENX_V9_8_PUBLISHED_DELETE',
    """if(!target)return;
// MMTRADE_HOME_STUDIO_SINGLE_OWNER_R5: generic published elements must not
// inject old text/overrides into native Home mountain steps.
if(slug==='index' && target.closest &&
   target.closest('#p74-app .p74-mountain-area'))return;
// TENX_V9_8_PUBLISHED_DELETE""")
# A single stable statement is the anchor; surrounding whitespace and the
# following "if(b.deleted)" can vary between the deployed and repository files.
replace_exact('p74/studio/bridge.js',
    "const el=safeSelect(b.selector);if(!el)return;",
    """const el=safeSelect(b.selector);if(!el)return;
 // MMTRADE_HOME_STUDIO_SINGLE_OWNER_R5: native stages belong to Home editor.
 if(slug==='index' && el.closest &&
    el.closest('#p74-app .p74-mountain-area'))return;""")
replace_exact('p74/studio/bridge.js',
    """if(target.matches?.('#p74-app,#mf62-home,#mmvs-root,#app,main.home-shell,.stage-page,.stage-shell'))return;
const sel=uniqueSelector(target);""",
    """if(target.matches?.('#p74-app,#mf62-home,#mmvs-root,#app,main.home-shell,.stage-page,.stage-shell'))return;
const nativeStage=slug==='index'&&target.closest?.('#p74-app .p74-mountain-area .p74-step');
if(nativeStage){
 e.preventDefault();e.stopImmediatePropagation();
 window.parent.postMessage({type:'MMVS_HOME_NATIVE_STEP',step:Number(nativeStage.dataset.step)},location.origin);
 return;
}
const sel=uniqueSelector(target);""")
replace_exact('p74/studio/studio.js',
    "else if(e.data.type==='MMVS_SELECT'){chooseElement(e.data.element)}",
    """else if(e.data.type==='MMVS_SELECT'){chooseElement(e.data.element)}
else if(e.data.type==='MMVS_HOME_NATIVE_STEP'&&page==='index'){
 const n=Number(e.data.step);
 if(!Number.isInteger(n)||n<1||n>8)return;
 if(isPublishedHomePreview()||reviewSnapshot){
   toast('نسخه منتشرشده فقط خواندنی است؛ برای تغییر به پیش‌نویس Home برگرد.',true);
 }else{
   if(!homeToolsOpen&&!workspaceBusy())toggleHomeTools();
   toast('مرحله '+n+' را از پنل اختصاصی Home ویرایش کن؛ متن تکراری عمومی اعمال نمی‌شود.');
 }
}""")

def refresh_query(rel, prefixes):
    p=root/rel
    s=p.read_text(encoding='utf-8')
    for prefix in prefixes:
        rx=re.compile(r'('+re.escape(prefix)+r'\?v=)[^"\'\s<>&]+')
        s,n=rx.subn(lambda m:m.group(1)+stamp,s)
        if n!=1: raise RuntimeError(f'ABORT_ASSET_REFERENCE {rel} {prefix} count={n}')
    p.write_text(s,encoding='utf-8')
refresh_query('index.html',['/miniapp/blocks.js','/miniapp/p74/studio/bridge.js'])
refresh_query('p74/studio/index.html',['./studio.js'])
print('ISOLATED_PATCH=READY')
PY
cat > "$STAGE/$TEST" <<'JS'
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const blocks=read('public/miniapp/blocks.js');
const bridge=read('public/miniapp/p74/studio/bridge.js');
const studio=read('public/miniapp/p74/studio/studio.js');
const index=read('public/miniapp/index.html');
const studioIndex=read('public/miniapp/p74/studio/index.html');
function getApply(){
 const start=blocks.indexOf('function applyElement(b){');
 const end=blocks.indexOf('\n}\n\nd.blocks.forEach(applyElement);',start);
 assert.ok(start>0&&end>start,'applyElement function found');
 return blocks.slice(start,end+2);
}
test('native Home step rejects legacy text and deletion',()=>{
 let changes=0;
 const native={closest:()=>({}),remove(){changes++}};
 const apply=runInNewContext(getApply()+';applyElement',{slug:'index',document:{querySelector:()=>native}});
 apply({type:'element',selector:'#p74-app .p74-step',text:'old',deleted:true});
 assert.equal(changes,0);
});
test('ordinary Visual Studio elements remain editable',()=>{
 const txt={nodeType:3,nodeValue:'old'};
 const other={closest:()=>null,matches:()=>false,childNodes:[txt],style:{},tagName:'DIV'};
 const apply=runInNewContext(getApply()+';applyElement',{slug:'index',document:{querySelector:()=>other}});
 apply({type:'element',selector:'#other',text:'new'});
 assert.equal(txt.nodeValue,'new');
});
test('studio preview and selection use native Home owner',()=>{
 assert.match(bridge,/el\.closest\('#p74-app \.p74-mountain-area'\)/);
 assert.match(bridge,/MMVS_HOME_NATIVE_STEP/);
 assert.match(studio,/MMVS_HOME_NATIVE_STEP/);
});
test('new asset versions prevent stale script reuse',()=>{
 assert.match(index,/blocks\.js\?v=MMTRADE_HOME_STUDIO_OWNER_R5_20261120/);
 assert.match(index,/bridge\.js\?v=MMTRADE_HOME_STUDIO_OWNER_R5_20261120/);
 assert.match(studioIndex,/studio\.js\?v=MMTRADE_HOME_STUDIO_OWNER_R5_20261120/);
});
JS

echo '===== JAVASCRIPT SYNTAX ====='
for js in blocks.js p74/studio/bridge.js p74/studio/studio.js; do
  node --check "$STAGE/public/miniapp/$js"
done
echo '===== TARGETED TESTS ====='
(cd "$STAGE" && node --test "$TEST")
echo '===== COMPLETE REGRESSION TESTS ====='
(cd "$STAGE" && npm test > "$STAGE/MMTRADE_R5_TEST.log" 2>&1)
grep -E '^# (tests|pass|fail|skipped)' "$STAGE/MMTRADE_R5_TEST.log" | tail -4
echo '===== BUILD ====='
(cd "$STAGE" && npm run build > "$STAGE/MMTRADE_R5_BUILD.log" 2>&1)
nginx -t

echo '===== BACKUP AND DEPLOY ====='
mkdir -p "$BACKUP/source" "$BACKUP/live"
for rel in "${FILES[@]}"; do
 mkdir -p "$BACKUP/source/$(dirname "$rel")" "$BACKUP/live/$(dirname "$rel")"
 cp -a "$BASE/$rel" "$BACKUP/source/$rel"
 cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done
STARTED=0
rollback() {
 rc=$?
 trap - ERR
 if [[ "$STARTED" == 1 ]]; then
  echo 'INSTALL_FAILED: AUTOMATIC_ROLLBACK'
  for rel in "${FILES[@]}"; do
   cp -a "$BACKUP/source/$rel" "$BASE/$rel"
   cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
  done
  rm -f "$ROOT/$TEST"
 fi
 exit "$rc"
}
trap rollback ERR
STARTED=1
for rel in "${FILES[@]}"; do
 install -m 644 "$STAGE/public/miniapp/$rel" "$BASE/$rel"
 install -m 644 "$STAGE/public/miniapp/$rel" "$LIVE/$rel"
 cmp "$BASE/$rel" "$LIVE/$rel"
done
cp -a "$STAGE/$TEST" "$ROOT/$TEST"
nginx -t
trap - ERR
echo 'HOME_STUDIO_SINGLE_OWNER_R4=PASS'
echo 'TESTS_AND_BUILD=PASS'
echo "BACKUP=$BACKUP"
echo 'DATABASE_WRITES=NONE'
echo 'SERVICES_RESTARTED=NONE'
