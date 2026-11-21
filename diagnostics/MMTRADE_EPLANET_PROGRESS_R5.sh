#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/root/miniapp10x/public/miniapp
LIVE=/srv/tenx-public/miniapp
CSS=p74/eplanet/styles.css
HTML=p74/eplanet/index.html
STAGE=$(mktemp -d /root/MMTRADE_EPLANET_PROGRESS_R5_STAGE_XXXXXXXX)
BACKUP="/root/MMTRADE_EPLANET_PROGRESS_R5_BACKUP_$(date +%Y%m%d_%H%M%S)"
TAG=MMTRADE_EPLANET_PROGRESS_FLOW_R5_20261121
echo '===== PREFLIGHT ====='
for f in "$CSS" "$HTML"; do
  test -s "$ROOT/$f" && test -s "$LIVE/$f"
  cmp -s "$ROOT/$f" "$LIVE/$f" || { echo "ABORT_SOURCE_LIVE_DIFFER=$f"; exit 2; }
  mkdir -p "$STAGE/$(dirname "$f")"
  cp -a "$ROOT/$f" "$STAGE/$f"
done
export STAGE TAG
python3 - <<'PY'
from pathlib import Path
import os,re
base=Path(os.environ['STAGE'])
css=base/'p74/eplanet/styles.css'
html=base/'p74/eplanet/index.html'
c=css.read_text(encoding='utf8')
h=html.read_text(encoding='utf8')
required=['.progress-panel','.progress-head','.progress-track','.steps','.step-card']
for selector in required:
    if selector not in c:raise RuntimeError('EPLANET_EXPECTED_STYLE_NOT_FOUND '+selector)
for selector in ('class="progress-panel"','class="progress-head"','id="progressHint"','class="steps"'):
    if h.count(selector)!=1:raise RuntimeError('EPLANET_TEMPLATE_CHANGED '+selector)
if 'MMTRADE_EPLANET_PROGRESS_FLOW_R5' in c:raise RuntimeError('ALREADY_INSTALLED')
c += """
/* MMTRADE_EPLANET_PROGRESS_FLOW_R5
   Ensure the 4-step progress header, track, hint and stage timeline
   remain in normal document flow on small Telegram mobile viewports.
   No positioning or styling changes to individual stage cards. */
html body .app-shell > .progress-panel {
  position:relative!important;
  inset:auto!important;
  top:auto!important;
  left:auto!important;
  right:auto!important;
  bottom:auto!important;
  transform:none!important;
  translate:none!important;
  float:none!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  justify-content:flex-start!important;
  gap:0!important;
  width:100%!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  margin:0 0 20px!important;
  padding:17px clamp(13px,3.5vw,20px) 18px!important;
  overflow:visible!important;
  box-sizing:border-box!important;
  isolation:isolate!important;
}
html body .app-shell > .progress-panel > .progress-head {
  position:relative!important;
  inset:auto!important;
  transform:none!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;
  align-items:center!important;
  justify-content:stretch!important;
  gap:8px!important;
  width:100%!important;
  height:auto!important;
  min-height:0!important;
  margin:0!important;
  padding:0!important;
  white-space:normal!important;
}
html body .app-shell > .progress-panel .progress-head h2 {
  min-width:0!important;
  width:auto!important;
  margin:0!important;
  padding:0!important;
  font-size:clamp(15px,4.3vw,19px)!important;
  line-height:1.55!important;
  text-align:right!important;
  white-space:normal!important;
}
html body .app-shell > .progress-panel .progress-head strong {
  min-width:0!important;
  margin:0!important;
  font-size:clamp(13px,3.6vw,17px)!important;
  line-height:1.5!important;
  white-space:nowrap!important;
  text-align:left!important;
}
html body .app-shell > .progress-panel > .progress-track {
  position:relative!important;
  inset:auto!important;
  transform:none!important;
  display:block!important;
  flex:none!important;
  width:100%!important;
  height:14px!important;
  min-height:14px!important;
  max-height:14px!important;
  margin:13px 0 11px!important;
  overflow:hidden!important;
}
html body .app-shell > .progress-panel > .progress-track > i {
  display:block!important;
  height:100%!important;
}
html body .app-shell > .progress-panel > #progressHint {
  position:static!important;
  inset:auto!important;
  transform:none!important;
  display:block!important;
  clear:both!important;
  flex:none!important;
  width:100%!important;
  height:auto!important;
  max-height:none!important;
  margin:0!important;
  padding:0!important;
  overflow:visible!important;
  text-align:center!important;
  white-space:normal!important;
  overflow-wrap:anywhere!important;
  font-size:clamp(12px,3.2vw,14px)!important;
  line-height:1.8!important;
}
html body .app-shell > .progress-panel + .steps {
  position:relative!important;
  clear:both!important;
  transform:none!important;
  margin-top:0!important;
  padding-top:19px!important;
}
@media(max-width:360px){
 html body .app-shell > .progress-panel > .progress-head {
  grid-template-columns:minmax(0,1fr) auto!important;
  gap:5px!important;
 }
}
"""
# Determine which CSS href the server currently uses. Never rely on a
# previously deployed version token or on one exact HTML URL spelling.
from urllib.parse import urlsplit
links=list(re.finditer(r"""href\s*=\s*(["'])([^"']+)\1""",h,re.I))
style_links=[m for m in links if urlsplit(m.group(2)).path.rstrip('/').endswith('/eplanet/styles.css')
             or urlsplit(m.group(2)).path in ('styles.css','./styles.css')]
if len(style_links)>1:
    raise RuntimeError('AMBIGUOUS_EPLANET_CSS_LINKS: '+repr([m.group(2) for m in style_links]))
canonical='/miniapp/p74/eplanet/styles.css?v='+os.environ['TAG']
if len(style_links)==1:
    match=style_links[0]
    h=h[:match.start(2)]+canonical+h[match.end(2):]
    print('CSS_LINK_UPDATED_FROM='+match.group(2))
else:
    if h.lower().count('</head>')!=1:
        raise RuntimeError('ABORT_HTML_HEAD_MISSING')
    h=re.sub(r'</head>',lambda _: '<link rel="stylesheet" href="'+canonical+'">\n</head>',h,count=1,flags=re.I)
    print('CSS_LINK_ADDED='+canonical)
if h.count(canonical)!=1:
    raise RuntimeError('ABORT_CSS_LINK_VERIFICATION')
assert c.count('{')==c.count('}'),'CSS_BRACE_MISMATCH'
css.write_text(c,encoding='utf8')
html.write_text(h,encoding='utf8')
print('EPLANET_PROGRESS_R5_STAGE=PASS')
PY
python3 - "$STAGE" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
c=(root/'p74/eplanet/styles.css').read_text()
h=(root/'p74/eplanet/index.html').read_text()
assert 'MMTRADE_EPLANET_PROGRESS_FLOW_R5' in c
assert 'html body .app-shell > .progress-panel > #progressHint' in c
assert 'grid-template-columns:minmax(0,1fr) auto!important' in c
assert 'height:auto!important' in c
assert 'MMTRADE_EPLANET_PROGRESS_FLOW_R5_20261121' in h
print('EPLANET_PROGRESS_R5_STRUCTURE=PASS')
PY
nginx -t
echo '===== BACKUP AND INSTALL ====='
mkdir -p "$BACKUP/source/p74/eplanet" "$BACKUP/live/p74/eplanet"
for f in "$CSS" "$HTML"; do
  cp -a "$ROOT/$f" "$BACKUP/source/$f"
  cp -a "$LIVE/$f" "$BACKUP/live/$f"
done
started=0
rollback(){
  local rc=$?
  trap - ERR
  if [[ "$started" == 1 ]]; then
    for f in "$CSS" "$HTML"; do
      cp -a "$BACKUP/source/$f" "$ROOT/$f"
      cp -a "$BACKUP/live/$f" "$LIVE/$f"
    done
    echo 'ROLLBACK=COMPLETE'
  fi
  exit "$rc"
}
trap rollback ERR
started=1
for f in "$CSS" "$HTML"; do
  cp -a "$STAGE/$f" "$ROOT/$f"
  cp -a "$STAGE/$f" "$LIVE/$f"
  cmp "$ROOT/$f" "$LIVE/$f"
done
nginx -t
trap - ERR
echo 'MMTRADE_EPLANET_PROGRESS_R5=PASS'
echo "BACKUP=$BACKUP"
echo 'HOME_AND_STUDIO_FILES_CHANGED=NO'
echo 'DATABASE_WRITES=NONE'
echo 'SERVICES_RESTARTED=NONE'
