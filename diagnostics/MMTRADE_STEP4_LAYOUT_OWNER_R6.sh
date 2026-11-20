#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/root/miniapp10x
SOURCE="$ROOT/public/miniapp"
LIVE=/srv/tenx-public/miniapp
STAGE=$(mktemp -d /root/MMTRADE_STEP4_STAGE_R6_XXXXXXXX)
BACKUP="/root/MMTRADE_STEP4_R6_BACKUP_$(date +%Y%m%d_%H%M%S)"
REL_SPATIAL=p74/studio/spatial-bridge.js
REL_CSS=p74/mm-uux-r5/mm-r5-home.css
REL_HTML=index.html
STAMP=MMTRADE_STEP4_LAYOUT_R6_20261120
FILES=("$REL_SPATIAL" "$REL_CSS" "$REL_HTML")

echo '===== READ-ONLY PREFLIGHT ====='
test -d "$ROOT/node_modules"
command -v rsync >/dev/null
for rel in "${FILES[@]}"; do
  test -s "$SOURCE/$rel" && test -s "$LIVE/$rel"
  cmp -s "$SOURCE/$rel" "$LIVE/$rel" || { echo "ABORT: SOURCE_LIVE_DIFFER: $rel"; exit 3; }
done
nginx -t

echo '===== ISOLATED PATCH ====='
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude='*.log' "$ROOT/" "$STAGE/"
ln -s "$ROOT/node_modules" "$STAGE/node_modules"
export STAGE STAMP
python3 - <<'PY'
from pathlib import Path
import os,re
base=Path(os.environ['STAGE'])/'public/miniapp'
stamp=os.environ['STAMP']
spatial=base/'p74/studio/spatial-bridge.js'
css=base/'p74/mm-uux-r5/mm-r5-home.css'
html=base/'index.html'

def exact_once(source,anchor,replacement,label):
    count=source.count(anchor)
    if count!=1: raise RuntimeError(f'ABORT_ANCHOR_MISMATCH {label} count={count}')
    return source.replace(anchor,replacement,1)

s=spatial.read_text(encoding='utf-8')
if 'MMTRADE_HOME_SPATIAL_OWNER_R6' in s:
    raise RuntimeError('R6_ALREADY_INSTALLED')
# The Home stage editor owns step geometry. General Spatial must not alter it.
anchor='function eligible(el){if(mmvsR11Unsafe(el))return false;'
insert="""/* MMTRADE_HOME_SPATIAL_OWNER_R6: stage geometry is owned by P74 Home editor. */
function mmvsNativeHomeStage(el){
 return slug==='index' && !!el?.closest?.('#p74-app .p74-mountain-area .p74-step');
}
function eligible(el){if(mmvsNativeHomeStage(el))return false;if(mmvsR11Unsafe(el))return false;"""
s=exact_once(s,anchor,insert,'spatial.eligible')
# DOM ordering is another Spatial pathway; it must not move native steps.
dom_anchor='function mmvsDomSafeNode(el){\n'
dom_insert="""function mmvsDomSafeNode(el){
 if(el?.closest?.('#p74-app .p74-mountain-area .p74-step'))return false;
"""
s=exact_once(s,dom_anchor,dom_insert,'spatial.domSafeNode')
spatial.write_text(s,encoding='utf-8')

c=css.read_text(encoding='utf-8')
marker='MMTRADE_STEP4_TEXT_ALIGN_R6'
if marker in c: raise RuntimeError('R6_CSS_ALREADY_INSTALLED')
c += """
/* MMTRADE_STEP4_TEXT_ALIGN_R6 — only native stage 4.
   Respect Home Studio top/right/width/height and existing visual theme. */
#p74-app .p74-mountain-area .p74-step[data-step="4"] {
  display:grid!important;
  direction:rtl!important;
  grid-template-columns:minmax(19px,25px) minmax(0,1fr) minmax(15px,20px)!important;
  align-items:center!important;
  column-gap:clamp(2px,.8vw,5px)!important;
  padding-inline:clamp(6px,1.8vw,10px)!important;
}
#p74-app .p74-mountain-area .p74-step[data-step="4"] > .p74-step-number {
  grid-column:1!important;grid-row:1!important;
  justify-self:center!important;align-self:center!important;
}
#p74-app .p74-mountain-area .p74-step[data-step="4"] > .p74-step-label {
  grid-column:2!important;grid-row:1!important;
  display:block!important;justify-self:stretch!important;align-self:center!important;
  width:100%!important;min-width:0!important;max-width:100%!important;
  margin:0!important;padding:0!important;
  text-align:center!important;direction:rtl!important;
  white-space:normal!important;text-wrap:balance!important;
  overflow-wrap:break-word!important;word-break:normal!important;
  text-overflow:clip!important;overflow:hidden!important;
  line-height:1.13!important;font-size:clamp(10px,2.65vw,12px)!important;
}
#p74-app .p74-mountain-area .p74-step[data-step="4"] > .p74-step-label-group {
  display:flex!important;flex-direction:column!important;
  align-items:center!important;justify-content:center!important;
  gap:1px!important;white-space:normal!important;
}
#p74-app .p74-mountain-area .p74-step[data-step="4"] .p74-step-label-sub {
  display:block!important;max-width:100%!important;
  white-space:nowrap!important;line-height:1.1!important;
  font-size:clamp(9px,2.3vw,10px)!important;text-align:center!important;
}
#p74-app .p74-mountain-area .p74-step[data-step="4"] > .p74-step-icon {
  grid-column:3!important;grid-row:1!important;
  justify-self:center!important;align-self:center!important;
}
"""
css.write_text(c,encoding='utf-8')

h=html.read_text(encoding='utf-8')
for path in ('/miniapp/p74/studio/spatial-bridge.js','/miniapp/p74/mm-uux-r5/mm-r5-home.css'):
    pattern=re.compile(r'('+re.escape(path)+r'\?v=)[^"\'\s<>&]+')
    h,count=pattern.subn(lambda match:match.group(1)+stamp,h)
    if count!=1: raise RuntimeError(f'ABORT_CACHE_REFERENCE {path}: {count}')
html.write_text(h,encoding='utf-8')
print('STAGE_PATCH=READY')
PY

cat > "$STAGE/tests/step4-layout-owner-r6.test.mjs" <<'JS'
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const spatial=f('public/miniapp/p74/studio/spatial-bridge.js');
const css=f('public/miniapp/p74/mm-uux-r5/mm-r5-home.css');
const html=f('public/miniapp/index.html');
test('native Home steps are not eligible for generic spatial overrides',()=>{
  assert.match(spatial,/function mmvsNativeHomeStage\(el\)/);
  assert.match(spatial,/function eligible\(el\)\{if\(mmvsNativeHomeStage\(el\)\)return false;/);
  assert.match(spatial,/function mmvsDomSafeNode\(el\)\{\s*if\(el\?\.closest\?\.\('#p74-app \.p74-mountain-area \.p74-step'\)\)return false;/);
});
test('Step 4 label has a dedicated RTL grid and wrap without geometry overrides',()=>{
  assert.match(css,/MMTRADE_STEP4_TEXT_ALIGN_R6/);
  assert.match(css,/\.p74-step\[data-step="4"\]/);
  const patch=css.split('MMTRADE_STEP4_TEXT_ALIGN_R6')[1];
  assert.ok(patch);
  for(const v of ['white-space:normal!important','text-align:center!important','grid-column:2!important']){
    assert.ok(patch.includes(v),v);
  }
  const cardRule=patch.match(/\.p74-step\[data-step="4"\]\s*\{([^}]+)\}/)?.[1];
  assert.ok(cardRule,'stage 4 root rule');
  assert.doesNotMatch(cardRule,/\b(?:top|right|height|width)\s*:/);
});
test('both updated assets use fresh cache identifiers',()=>{
  assert.match(html,/mm-r5-home\.css\?v=MMTRADE_STEP4_LAYOUT_R6_20261120/);
  assert.match(html,/spatial-bridge\.js\?v=MMTRADE_STEP4_LAYOUT_R6_20261120/);
});
JS

echo '===== VALIDATE STAGE ====='
node --check "$STAGE/public/miniapp/$REL_SPATIAL"
(cd "$STAGE" && node --test tests/step4-layout-owner-r6.test.mjs)
(cd "$STAGE" && npm test > "$STAGE/STEP4_FULL_TEST.log" 2>&1)
grep -E '^# (tests|pass|fail|skipped)' "$STAGE/STEP4_FULL_TEST.log" | tail -4
(cd "$STAGE" && npm run build > "$STAGE/STEP4_BUILD.log" 2>&1)
nginx -t
echo 'STAGE_VALIDATED=PASS'

echo '===== BACKUP ====='
mkdir -p "$BACKUP/source" "$BACKUP/live"
for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP/source/$(dirname "$rel")" "$BACKUP/live/$(dirname "$rel")"
  cp -a "$SOURCE/$rel" "$BACKUP/source/$rel"
  cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done

STARTED=0
rollback(){
  local code=$?
  trap - ERR
  if [ "$STARTED" -eq 1 ]; then
    echo '===== AUTOMATIC ROLLBACK ====='
    for rel in "${FILES[@]}"; do
      cp -a "$BACKUP/source/$rel" "$SOURCE/$rel"
      cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
    done
    echo 'ROLLBACK=COMPLETE'
  fi
  exit "$code"
}
trap rollback ERR
STARTED=1
echo '===== DEPLOY ====='
for rel in "${FILES[@]}"; do
  cp -a "$STAGE/public/miniapp/$rel" "$SOURCE/$rel"
  cp -a "$STAGE/public/miniapp/$rel" "$LIVE/$rel"
  cmp "$SOURCE/$rel" "$LIVE/$rel"
done
nginx -t
trap - ERR
echo 'MMTRADE_STEP4_R6_INSTALL=PASS'
echo "ROLLBACK_BACKUP=$BACKUP"
echo 'DATABASE_WRITES=NONE'
echo 'SERVICES_RESTARTED=NONE'
