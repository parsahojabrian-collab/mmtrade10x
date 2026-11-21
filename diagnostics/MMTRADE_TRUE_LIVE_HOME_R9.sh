#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/root/miniapp10x/public/miniapp
LIVE=/srv/tenx-public/miniapp
STUDIO=p74/studio/studio.js
HTML=p74/studio/index.html
TAG=MMTRADE_TRUE_LIVE_HOME_R9_20261121
STAGE=$(mktemp -d /root/MMTRADE_TRUE_LIVE_HOME_R9_STAGE_XXXXXXXX)
BACKUP="/root/MMTRADE_TRUE_LIVE_HOME_R9_BACKUP_$(date +%Y%m%d_%H%M%S)"

echo '===== READ-ONLY PREFLIGHT ====='
for rel in "$STUDIO" "$HTML"; do
  test -s "$ROOT/$rel" && test -s "$LIVE/$rel"
  cmp -s "$ROOT/$rel" "$LIVE/$rel" || { echo "ABORT_SOURCE_LIVE_DIFFER=$rel"; exit 2; }
  mkdir -p "$STAGE/$(dirname "$rel")"
  cp -a "$ROOT/$rel" "$STAGE/$rel"
done

export STAGE TAG
python3 - <<'PY'
import os,re
from pathlib import Path
root=Path(os.environ['STAGE'])
studio=root/'p74/studio/studio.js'
html=root/'p74/studio/index.html'
source=studio.read_text(encoding='utf-8')
markup=html.read_text(encoding='utf-8')
if 'MMTRADE_TRUE_LIVE_HOME_R9' in source:
    raise RuntimeError('R9_ALREADY_INSTALLED')

# Current server source is authoritative. Require existing published/draft state
# handling; never modify its data sources, toggle or publish behavior.
required=('function previewUrl(){','function isPublishedHomePreview(){',
          'previewPublishedHome','function postPreview(){')
for item in required:
    if item not in source: raise RuntimeError('ABORT_UNEXPECTED_STUDIO_SOURCE '+item)
if source.count('function previewUrl(){')!=1:
    raise RuntimeError('ABORT_PREVIEW_URL_COUNT')

# Switch ONLY the live Home iframe to the same public URL as users.
# Draft and every other page retain the existing preview implementation.
guard="""function previewUrl(){
/* MMTRADE_TRUE_LIVE_HOME_R9: published Home is a real public rendering,
   not a visualPreview/adminPreview/p74Preview editing canvas. */
if(page==='index'&&isPublishedHomePreview()){
 const live=new URL('/miniapp/index.html',location.origin);
 live.searchParams.set('vs',Date.now().toString());
 return live.pathname+live.search;
}
"""
source=source.replace('function previewUrl(){',guard,1)

# Bust the editor script cache, without modifying any other app asset.
rx=re.compile(r'(\./studio\.js\?v=)[^"\'\s<>]+')
markup,n=rx.subn(lambda m:m.group(1)+os.environ['TAG'],markup)
if n!=1: raise RuntimeError('ABORT_STUDIO_SCRIPT_REFERENCE count='+str(n))
studio.write_text(source,encoding='utf-8')
html.write_text(markup,encoding='utf-8')
print('R9_STAGE=PASS')
PY

echo '===== TEST PUBLIC PREVIEW URL ====='
node --check "$STAGE/$STUDIO"
node - "$STAGE/$STUDIO" "$STAGE/$HTML" <<'JS'
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2],'utf8');
const html=fs.readFileSync(process.argv[3],'utf8');
assert.match(html,/studio\.js\?v=MMTRADE_TRUE_LIVE_HOME_R9_20261121/);
const m=source.match(/function previewUrl\(\)\{[\s\S]*?(?=\nfunction postPreview\(\))/);
assert.ok(m,'previewUrl found before postPreview');
function compute(page,live,homeToolsOpen=false){
 const ctx={
  page,homeToolsOpen,reviewSnapshot:null,
  isPublishedHomePreview:()=>live,
  PAGES:[['index','Home','/miniapp/index.html'],['academy','Academy','/miniapp/academy.html']],
  location:{origin:'https://mmtrade.parsahojabrian.ir'},
  URL,Date
 };
 return vm.runInNewContext(m[0]+';previewUrl()',ctx);
}
const live=compute('index',true);
const draft=compute('index',false);
const other=compute('academy',false);
assert.equal(new URL(live,'https://mmtrade.parsahojabrian.ir').pathname,'/miniapp/index.html');
for(const flag of ['visualPreview','adminPreview','p74Preview','stepEdit'])
 assert.equal(new URL(live,'https://mmtrade.parsahojabrian.ir').searchParams.has(flag),false,'no '+flag+' in live');
assert.match(draft,/visualPreview=1/);
assert.match(draft,/p74Preview=1/);
assert.match(other,/visualPreview=1/);
assert.ok(source.includes('MMTRADE_TRUE_LIVE_HOME_R9'));
console.log('LIVE_HOME_PUBLIC_ROUTE=PASS');
console.log('DRAFT_EDITING_UNCHANGED=PASS');
console.log('OTHER_PAGES_UNCHANGED=PASS');
JS
nginx -t

echo '===== BACKUP ====='
mkdir -p "$BACKUP/source/p74/studio" "$BACKUP/live/p74/studio"
for rel in "$STUDIO" "$HTML"; do
  cp -a "$ROOT/$rel" "$BACKUP/source/$rel"
  cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done

started=0
rollback(){
  local rc=$?
  trap - ERR
  if [[ "$started" == 1 ]]; then
    for rel in "$STUDIO" "$HTML"; do
      cp -a "$BACKUP/source/$rel" "$ROOT/$rel"
      cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
    done
    echo 'ROLLBACK=COMPLETE'
  fi
  exit "$rc"
}
trap rollback ERR
started=1
echo '===== INSTALL ====='
for rel in "$STUDIO" "$HTML"; do
  cp -a "$STAGE/$rel" "$ROOT/$rel"
  cp -a "$STAGE/$rel" "$LIVE/$rel"
  cmp "$ROOT/$rel" "$LIVE/$rel"
done
nginx -t
trap - ERR
echo 'MMTRADE_TRUE_LIVE_HOME_R9=PASS'
echo "BACKUP=$BACKUP"
echo 'HOME_CSS_AND_CONFIG_CHANGED=NO'
echo 'DATABASE_WRITES=NONE'
echo 'API_BOT_RESTARTS=NONE'
