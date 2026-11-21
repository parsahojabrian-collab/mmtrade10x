#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/root/miniapp10x
BASE="$ROOT/public/miniapp"
LIVE=/srv/tenx-public/miniapp
BACKUP="/root/MMTRADE_ONBOARD_NAV_R5_BACKUP_$(date +%Y%m%d_%H%M%S)"
STAGE=$(mktemp -d /root/MMTRADE_ONBOARD_NAV_R5_STAGE_XXXXXXXX)
FILES=(10x-onboarding.js 10x-onboarding.css index.html)

for rel in "${FILES[@]}"; do
  test -s "$BASE/$rel" && test -s "$LIVE/$rel"
  cmp -s "$BASE/$rel" "$LIVE/$rel" || { echo "ABORT_SOURCE_LIVE_MISMATCH=$rel"; exit 2; }
  mkdir -p "$STAGE/$(dirname "$rel")"
  cp -a "$BASE/$rel" "$STAGE/$rel"
done
export STAGE
python3 - <<'PY'
from pathlib import Path
import os,re
base=Path(os.environ['STAGE'])
js=base/'10x-onboarding.js'
css=base/'10x-onboarding.css'
html=base/'index.html'
j=js.read_text(encoding='utf8')
c=css.read_text(encoding='utf8')
h=html.read_text(encoding='utf8')
if 'MMTRADE_ONBOARD_NAV_R5' in j or 'MMTRADE_ONBOARD_NAV_R5' in c:
    raise RuntimeError('PATCH_ALREADY_INSTALLED')
if 'MMTRADE_ONBOARD_PROFILE_R2' not in c:
    raise RuntimeError('REQUIRED_ONBOARD_R4_STYLE_MISSING')
def replace_once(s,a,b,name):
    if s.count(a)!=1: raise RuntimeError('ANCHOR_MISMATCH '+name+' count='+str(s.count(a)))
    return s.replace(a,b,1)
j=replace_once(j,
"""  function close() {
    if (backdrop) backdrop.remove();
    backdrop = null;
    document.body.style.overflow = '';
  }""",
"""  function close() {
    if (backdrop) backdrop.remove();
    backdrop = null;
    // MMTRADE_ONBOARD_NAV_R5: restore navigation only after the sheet closes.
    document.documentElement.classList.remove('mmtrade-onboarding-open');
    document.body.style.overflow = '';
  }""",'close')
j=replace_once(j,
"""    backdrop.append(sheet);
    document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    render();""",
"""    backdrop.append(sheet);
    // Set before mounting: even a dynamically inserted nav inherits the rule.
    document.documentElement.classList.add('mmtrade-onboarding-open');
    document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    render();""",'open')
c += """
/* MMTRADE_ONBOARD_NAV_R5: hide all known Mini App bottom navigation
   layers while first-time onboarding or profile edit is displayed. */
html.mmtrade-onboarding-open #mf-global-bottom-nav,
html.mmtrade-onboarding-open .mf-global-bottom-nav,
html.mmtrade-onboarding-open #mmu-bottom-nav,
html.mmtrade-onboarding-open .mmu-bottom-nav,
html.mmtrade-onboarding-open .tenx-bottom-nav,
html.mmtrade-onboarding-open #p74-app .p74-nav,
html.mmtrade-onboarding-open .bottom-nav {
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
}
html.mmtrade-onboarding-open .tenx-onboard-backdrop {
  z-index:2147483646!important;
}
html.mmtrade-onboarding-open .tenx-onboard-sheet {
  padding-bottom:calc(28px + env(safe-area-inset-bottom,0px))!important;
}
"""
for asset in ('10x-onboarding.js','10x-onboarding.css'):
    rx=re.compile(r'(/miniapp/'+re.escape(asset)+r'\?v=)[^"\'\s<>]+')
    h,count=rx.subn(lambda m:m.group(1)+'MMTRADE_ONBOARD_NAV_R5_20261121',h)
    if count!=1:raise RuntimeError('CACHE_LINK_COUNT '+asset+' '+str(count))
js.write_text(j,encoding='utf8')
css.write_text(c,encoding='utf8')
html.write_text(h,encoding='utf8')
print('NAV_R5_STAGE=PASS')
PY
node --check "$STAGE/10x-onboarding.js"
python3 - "$STAGE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
js=(p/'10x-onboarding.js').read_text()
css=(p/'10x-onboarding.css').read_text()
html=(p/'index.html').read_text()
assert js.count("classList.add('mmtrade-onboarding-open')")==1
assert js.count("classList.remove('mmtrade-onboarding-open')")==1
for selector in ('#mf-global-bottom-nav','#mmu-bottom-nav','.tenx-bottom-nav','#p74-app .p74-nav'):
    assert selector in css,selector
for file in ('10x-onboarding.js','10x-onboarding.css'):
    assert '/miniapp/'+file+'?v=MMTRADE_ONBOARD_NAV_R5_20261121' in html
assert css.count('{')==css.count('}')
print('ONBOARD_NAV_R5_STATIC_TESTS=PASS')
PY
nginx -t

mkdir -p "$BACKUP/source" "$BACKUP/live"
for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP/source/$(dirname "$rel")" "$BACKUP/live/$(dirname "$rel")"
  cp -a "$BASE/$rel" "$BACKUP/source/$rel"
  cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done

started=0
rollback(){
  rc=$?
  trap - ERR
  if [[ "$started" == 1 ]]; then
    for rel in "${FILES[@]}"; do
      cp -a "$BACKUP/source/$rel" "$BASE/$rel"
      cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
    done
    echo "AUTO_ROLLBACK=COMPLETE"
  fi
  exit "$rc"
}
trap rollback ERR
started=1
for rel in "${FILES[@]}"; do
  cp -a "$STAGE/$rel" "$BASE/$rel"
  cp -a "$STAGE/$rel" "$LIVE/$rel"
  cmp "$BASE/$rel" "$LIVE/$rel"
done
nginx -t
trap - ERR
echo "MMTRADE_ONBOARD_NAV_R5=PASS"
echo "BACKUP=$BACKUP"
echo "DATABASE_WRITES=NONE"
echo "SERVICES_RESTARTED=NONE"
