#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/root/miniapp10x
SOURCE="$ROOT/public/miniapp"
LIVE=/srv/tenx-public/miniapp
STAGE=$(mktemp -d /root/MMTRADE_HOME_PARITY_R8_STAGE_XXXXXXXX)
BACKUP="/root/MMTRADE_HOME_PARITY_R8_BACKUP_$(date +%Y%m%d_%H%M%S)"
FILES=(p74/studio/studio.js p74/studio/index.html p74/home.js index.html)
STAMP=MMTRADE_HOME_PARITY_R8_20261121

echo '===== VERIFY SOURCE AND LIVE ====='
for rel in "${FILES[@]}"; do
  test -s "$SOURCE/$rel" && test -s "$LIVE/$rel"
  cmp -s "$SOURCE/$rel" "$LIVE/$rel" || { echo "ABORT_SOURCE_LIVE_DIFFER=$rel"; exit 2; }
  mkdir -p "$STAGE/$(dirname "$rel")"
  cp -a "$SOURCE/$rel" "$STAGE/$rel"
done
export STAGE STAMP
python3 - <<'PY'
from pathlib import Path
import os,re
base=Path(os.environ['STAGE'])
studio=base/'p74/studio/studio.js'
home=base/'p74/home.js'
page=base/'index.html'
admin=base/'p74/studio/index.html'
s=studio.read_text(encoding='utf8')
h=home.read_text(encoding='utf8')
p=page.read_text(encoding='utf8')
a=admin.read_text(encoding='utf8')
if 'MMTRADE_HOME_PARITY_R8' in s or 'MMTRADE_HOME_PARITY_R8' in h:
    raise RuntimeError('R8_ALREADY_INSTALLED')

def exactly(src,anchor,new,name):
    n=src.count(anchor)
    if n!=1:raise RuntimeError(f'ABORT_ANCHOR {name} count={n}')
    return src.replace(anchor,new,1)

# If an editor draft has no P74 marker, use the published source as read-only
# preview input. Do not silently replace or write any draft blocks.
s=exactly(s,
"let previewPublishedHome=false;",
"""let previewPublishedHome=false;
/* MMTRADE_HOME_PARITY_R8: explicit draft / live sources, without fake seed. */
let publishedHomeFallback=null;
const homeConfigMarker=items=>(Array.isArray(items)?items:[]).find(
 b=>b?.type==='element'&&b.selector==='#p74-home-config'&&typeof b.text==='string'
);
async function loadPublishedHomeFallback(response){
 const marker=homeConfigMarker(response?.published?.blocks);
 if(marker){
  const config=JSON.parse(marker.text);
  if(config?.version===74)return config;
 }
 const result=await fetch('/public/p74-home-config',{
  cache:'no-store',credentials:'same-origin'
 });
 if(!result.ok)throw Error('HOME_PUBLISHED_HTTP_'+result.status);
 const data=await result.json();
 if(data?.enabled!==true||data?.config?.version!==74)
  throw Error('HOME_PUBLISHED_CONFIG_MISSING');
 return data.config;
}
""",'studio.fallbackDeclaration')

s=exactly(s,
"const marker=blocks.find(b=>b.type==='element'&&b.selector==='#p74-home-config');\n let config=null;",
"""const marker=blocks.find(b=>b.type==='element'&&b.selector==='#p74-home-config');
 let config=publishedHomeFallback;""",'studio.mountHomeTools')

# Do not mark published parity as a visual editor mode: the Home renderer
# must receive the same URL flags and configuration source as real users.
old="url.searchParams.set('visualPreview','1');url.searchParams.set('adminPreview','1');if(page==='index'&&(!isPublishedHomePreview()||homeToolsOpen)){"
new="if(!isPublishedHomePreview()){url.searchParams.set('visualPreview','1');url.searchParams.set('adminPreview','1');}if(page==='index'&&(!isPublishedHomePreview()||homeToolsOpen)){"
s=exactly(s,old,new,'studio.previewUrl')

# Always deliver a valid P74 preview configuration; don't leave Home on its
# five-stage seed if the editor's content list has no marker.
s=exactly(s,
"""  if(marker?.text)target.postMessage({type,config:JSON.parse(marker.text)},location.origin);""",
"""  if(marker?.text)target.postMessage({type,config:JSON.parse(marker.text)},location.origin);
  else if(selector==='#p74-home-config'&&page==='index'&&publishedHomeFallback)
    target.postMessage({type,config:clone(publishedHomeFallback)},location.origin);""",
'studio.postPreview')

s=exactly(s,
"""  editor=r;blocks=clone(r.blocks||[]);title=r.title??null;initial=JSON.stringify({title,blocks});""",
"""  editor=r;blocks=clone(r.blocks||[]);title=r.title??null;initial=JSON.stringify({title,blocks});
  publishedHomeFallback=null;
  if(slug==='index'&&!homeConfigMarker(blocks)){
    // Abort rather than inventing a five-step draft from factory defaults.
    publishedHomeFallback=await loadPublishedHomeFallback(r);
    if(request!==pageRequestId)return false;
  }""",
'studio.loadPageFallback')

s=exactly(s,
"""  page=slug;pageLoadError=false;previewPublishedHome=false;updatePreviewSourceToggle();""",
"""  page=slug;pageLoadError=false;
  // Home opens in published parity mode unless its editing tools are open.
  previewPublishedHome=slug==='index'&&!homeToolsOpen;
  updatePreviewSourceToggle();""",
'studio.loadPageDefault')

# Guard against the factory 5-step Home flashing before editor settings arrive.
h=exactly(h,
"function ready(){if(isPreview){render(DEFAULT,null);return}",
"""function ready(){if(isPreview){
 if(params.get('visualPreview')==='1'&&params.get('adminPreview')==='1')return;
 render(DEFAULT,null);return}""",
'home.skipFactorySeed')

def cache_link(src,path):
    pat=re.compile(r'('+re.escape(path)+r'\?v=)[^"\'\s<>]+')
    updated,n=pat.subn(lambda m:m.group(1)+os.environ['STAMP'],src)
    if n!=1:raise RuntimeError(f'CACHE_REFERENCE_MISMATCH {path} count={n}')
    return updated
a=cache_link(a,'./studio.js')
p=cache_link(p,'/miniapp/p74/home.js')
studio.write_text(s,encoding='utf8')
home.write_text(h,encoding='utf8')
page.write_text(p,encoding='utf8')
admin.write_text(a,encoding='utf8')
print('PARITY_R8_STAGE=PASS')
PY

echo '===== JAVASCRIPT SYNTAX ====='
node --check "$STAGE/p74/studio/studio.js"
node --check "$STAGE/p74/home.js"

echo '===== PARITY REGRESSION ASSERTIONS ====='
python3 - "$STAGE" <<'PY'
from pathlib import Path
import sys
r=Path(sys.argv[1])
studio=(r/'p74/studio/studio.js').read_text()
home=(r/'p74/home.js').read_text()
index=(r/'index.html').read_text()
admin=(r/'p74/studio/index.html').read_text()
assert "previewPublishedHome=slug==='index'&&!homeToolsOpen" in studio
assert "if(!isPublishedHomePreview()){url.searchParams.set('visualPreview','1');" in studio
assert 'publishedHomeFallback=await loadPublishedHomeFallback(r)' in studio
assert "else if(selector==='#p74-home-config'&&page==='index'&&publishedHomeFallback)" in studio
assert "if(params.get('visualPreview')==='1'&&params.get('adminPreview')==='1')return;" in home
assert 'home.js?v=MMTRADE_HOME_PARITY_R8_20261121' in index
assert 'studio.js?v=MMTRADE_HOME_PARITY_R8_20261121' in admin
print('PARITY_R8_STATIC_TESTS=PASS')
PY
nginx -t

echo '===== BACKUP ====='
mkdir -p "$BACKUP/source" "$BACKUP/live"
for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP/source/$(dirname "$rel")" "$BACKUP/live/$(dirname "$rel")"
  cp -a "$SOURCE/$rel" "$BACKUP/source/$rel"
  cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done

STARTED=0
rollback(){
 rc=$?
 trap - ERR
 if [[ "$STARTED" == 1 ]]; then
   for rel in "${FILES[@]}"; do
     cp -a "$BACKUP/source/$rel" "$SOURCE/$rel"
     cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
   done
   echo 'ROLLBACK=COMPLETE'
 fi
 exit "$rc"
}
trap rollback ERR
STARTED=1
echo '===== INSTALL ====='
for rel in "${FILES[@]}"; do
  cp -a "$STAGE/$rel" "$SOURCE/$rel"
  cp -a "$STAGE/$rel" "$LIVE/$rel"
  cmp "$SOURCE/$rel" "$LIVE/$rel"
done
nginx -t
trap - ERR
echo 'MMTRADE_HOME_PARITY_R8=PASS'
echo "BACKUP=$BACKUP"
echo 'DATABASE_WRITES=NONE'
echo 'BOT_AND_API_UNCHANGED=YES'
