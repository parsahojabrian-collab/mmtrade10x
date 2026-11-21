#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/root/miniapp10x/public/miniapp
LIVE=/srv/tenx-public/miniapp
REL_CSS=p74/mm-uux-r5/mm-r5-home.css
REL_HTML=index.html
TAG=MMTRADE_STEP4_WRAP_SYNC_R7_20261121
BACKUP="/root/MMTRADE_STEP4_WRAP_R7_BACKUP_$(date +%Y%m%d_%H%M%S)"
STAGE=$(mktemp -d /root/MMTRADE_STEP4_WRAP_R7_STAGE_XXXXXXXX)
for rel in "$REL_CSS" "$REL_HTML"; do
  test -s "$ROOT/$rel" && test -s "$LIVE/$rel"
  cmp -s "$ROOT/$rel" "$LIVE/$rel" || { echo "ABORT_SOURCE_LIVE_DIFFER=$rel"; exit 2; }
  mkdir -p "$STAGE/$(dirname "$rel")"
  cp -a "$ROOT/$rel" "$STAGE/$rel"
done
export STAGE TAG
python3 - <<'PY'
from pathlib import Path
import os,re
base=Path(os.environ['STAGE'])
css=base/'p74/mm-uux-r5/mm-r5-home.css'
html=base/'index.html'
c=css.read_text(encoding='utf8')
h=html.read_text(encoding='utf8')
if 'MMTRADE_STEP4_TEXT_ALIGN_R6' not in c:
    raise RuntimeError('ABORT_R6_STYLE_NOT_FOUND')
if 'MMTRADE_STEP4_WRAP_SYNC_R7' in c:
    raise RuntimeError('ABORT_R7_ALREADY_INSTALLED')
c += """
/* MMTRADE_STEP4_WRAP_SYNC_R7
   Step 4 text only, higher specificity than older generic R5 rules.
   Shared by live Home and Studio preview; leaves stored geometry untouched. */
#p74-app .p74-mountain-area .p74-step[data-step="4"] {
  display:grid!important;
  grid-template-columns:minmax(18px,24px) minmax(0,1fr) minmax(15px,19px)!important;
  grid-template-rows:minmax(0,1fr)!important;
  align-items:center!important;
  column-gap:3px!important;
  padding-inline:clamp(5px,1.5vw,8px)!important;
}
#p74-app .p74-mountain-area .p74-step[data-step="4"] > .p74-step-number {
  grid-column:1!important;
  grid-row:1!important;
  justify-self:center!important;
  align-self:center!important;
  min-width:0!important;
}
#p74-app .p74-mountain-area .p74-step[data-step="4"] > .p74-step-icon {
  grid-column:3!important;
  grid-row:1!important;
  justify-self:center!important;
  align-self:center!important;
  min-width:0!important;
}
#p74-app:not(.mmvs-disabled) .p74-mountain-area .p74-step[data-step="4"] > .p74-step-label,
#p74-app:not(.mmvs-disabled) .p74-mountain-area .p74-step[data-step="4"] > .p74-step-label-group {
  grid-column:2!important;
  grid-row:1!important;
  order:unset!important;
  flex:none!important;
  min-width:0!important;
  width:100%!important;
  max-width:100%!important;
  max-height:100%!important;
  margin:0!important;
  padding:0!important;
  align-self:center!important;
  justify-self:stretch!important;
  text-align:center!important;
  direction:rtl!important;
  white-space:normal!important;
  text-wrap:balance!important;
  overflow-wrap:anywhere!important;
  word-break:normal!important;
  text-overflow:clip!important;
  overflow:hidden!important;
  font-size:clamp(10px,2.45vw,12px)!important;
  line-height:1.12!important;
}
#p74-app:not(.mmvs-disabled) .p74-mountain-area .p74-step[data-step="4"] > .p74-step-label-group {
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  gap:0!important;
}
#p74-app:not(.mmvs-disabled) .p74-mountain-area .p74-step[data-step="4"] .p74-step-label-sub {
  display:block!important;
  min-width:0!important;
  max-width:100%!important;
  margin:0!important;
  padding:0!important;
  text-align:center!important;
  direction:rtl!important;
  font-size:clamp(8px,2.1vw,10px)!important;
  line-height:1.1!important;
  white-space:normal!important;
  overflow-wrap:anywhere!important;
}
"""
pattern=re.compile(r'(/miniapp/p74/mm-uux-r5/mm-r5-home\.css\?v=)[^"\'\s<>]+')
h,n=pattern.subn(lambda m:m.group(1)+os.environ['TAG'],h)
if n!=1:raise RuntimeError('ABORT_LINK_COUNT='+str(n))
css.write_text(c,encoding='utf8')
html.write_text(h,encoding='utf8')
assert c.count('{')==c.count('}')
assert 'MMTRADE_STEP4_WRAP_SYNC_R7' in c
assert '/miniapp/p74/mm-uux-r5/mm-r5-home.css?v='+os.environ['TAG'] in h
print('STEP4_WRAP_R7_STAGED=PASS')
PY
nginx -t
mkdir -p "$BACKUP/source" "$BACKUP/live"
for rel in "$REL_CSS" "$REL_HTML"; do
  mkdir -p "$BACKUP/source/$(dirname "$rel")" "$BACKUP/live/$(dirname "$rel")"
  cp -a "$ROOT/$rel" "$BACKUP/source/$rel"
  cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done
started=0
rollback(){
  rc=$?
  trap - ERR
  if [[ "$started" == 1 ]]; then
    for rel in "$REL_CSS" "$REL_HTML"; do
      cp -a "$BACKUP/source/$rel" "$ROOT/$rel"
      cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
    done
    echo 'ROLLBACK=COMPLETE'
  fi
  exit "$rc"
}
trap rollback ERR
started=1
for rel in "$REL_CSS" "$REL_HTML"; do
  cp -a "$STAGE/$rel" "$ROOT/$rel"
  cp -a "$STAGE/$rel" "$LIVE/$rel"
  cmp "$ROOT/$rel" "$LIVE/$rel"
done
nginx -t
trap - ERR
echo 'MMTRADE_STEP4_WRAP_R7=PASS'
echo "BACKUP=$BACKUP"
echo 'JS_CHANGED=NO'
echo 'DATABASE_WRITES=NONE'
echo 'SERVICES_RESTARTED=NONE'
