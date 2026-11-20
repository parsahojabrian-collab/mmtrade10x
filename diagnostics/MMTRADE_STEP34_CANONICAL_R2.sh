#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/root/miniapp10x
LIVE=/srv/tenx-public/miniapp
STAGE=$(mktemp -d /root/MMTRADE_STEP34_STAGE_XXXXXXXX)
BACKUP="/root/MMTRADE_STEP34_CANONICAL_BACKUP_$(date +%Y%m%d_%H%M%S)"
CSSREL=p74/mm-uux-r5/mm-r5-home.css
JSREL=p74/home.js
HTMLREL=index.html
ORIGINAL_CSS_BACKUP=/root/MMTRADE_STEP34_BACKUP_20261120_005701/source/p74/mm-uux-r5/mm-r5-home.css

for rel in "$JSREL" "$CSSREL" "$HTMLREL"; do
  test -s "$ROOT/public/miniapp/$rel"
  test -s "$LIVE/$rel"
  cmp -s "$ROOT/public/miniapp/$rel" "$LIVE/$rel" || {
    echo "STOP: source and live differ: $rel"; exit 1;
  }
done
command -v rsync >/dev/null
test -d "$ROOT/node_modules"
echo '===== ISOLATED STAGE ====='
rsync -a --exclude=.git --exclude=node_modules --exclude=dist \
  --exclude='*.log' "$ROOT/" "$STAGE/"
ln -s "$ROOT/node_modules" "$STAGE/node_modules"

export STAGE ORIGINAL_CSS_BACKUP
python3 - <<'PY'
from pathlib import Path
import os, re
root = Path(os.environ['STAGE'])/'public/miniapp'
js = root/'p74/home.js'
html = root/'index.html'
css = root/'p74/mm-uux-r5/mm-r5-home.css'
s = js.read_text(encoding='utf-8')
def one(old,new):
    global s
    if s.count(old) != 1:
        raise RuntimeError('SOURCE_CHANGED / required anchor missing or repeated: '+old[:75])
    s=s.replace(old,new,1)
one('let current=null,lastPayload=null,lastPreviewCfg=null;',
    'let current=null,lastPayload=null,lastPreviewCfg=null,canonicalPublishedHome=null;')
one('const meta=extract(data.blocks);',
    'const meta=canonicalPublishedHome||extract(data.blocks);')
for old in (
    "    if (document.getElementById('p74-app')) { diag.status='already_rendered'; return; }\n",
    "        if (document.getElementById('p74-app')) { diag.status='already_rendered'; return; }\n",
):
    one(old,'')
one('        receivePublished({detail:{blocks:[{\n',
    "        canonicalPublishedHome=data.config;\n        const activePayload=lastPayload&&typeof lastPayload==='object'?lastPayload:{};\n        receivePublished({detail:{...activePayload,blocks:[{\n")
js.write_text(s,encoding='utf-8')

h=html.read_text(encoding='utf-8')
for path in ('home.js','mm-uux-r5/mm-r5-home.css'):
    tail = 'p74/'+path
    rx = re.compile(r'(/miniapp/'+re.escape(tail)+r'\?v=)[^"\'\s<>]+')
    h, hits=rx.subn(lambda m:m.group(1)+'STEP34_CANONICAL_R2_20261120',h)
    if hits!=1: raise RuntimeError('EXPECTED_ONE_ASSET_REFERENCE: '+path+' got '+str(hits))
html.write_text(h,encoding='utf-8')

previous = Path(os.environ['ORIGINAL_CSS_BACKUP'])
if previous.is_file():
    old=previous.read_text(encoding='utf-8')
    now=css.read_text(encoding='utf-8')
    suffix=now[len(old):] if now.startswith(old) else ''
    if suffix.strip().startswith('/* MMTRADE_STEP34_LAYOUT_R1') and suffix.count('MMTRADE_STEP34_LAYOUT_R1')==1:
        css.write_text(old,encoding='utf-8')
        print('PRIOR_INEFFECTIVE_CSS_PATCH=REVERTED_IN_STAGE')
    elif 'MMTRADE_STEP34_LAYOUT_R1' in now:
        raise RuntimeError('CSS_HAS_UNEXPECTED_CHANGES: refusing unsafe revert')
    else: print('PRIOR_CSS_PATCH=ALREADY_ABSENT')
else:
    print('PRIOR_CSS_BACKUP_NOT_FOUND: preserving current CSS')
print('CANONICAL_HOME_PATCH=STAGED')
PY

node --check "$STAGE/public/miniapp/p74/home.js"
echo '===== REGRESSION TESTS ====='
(cd "$STAGE" && npm test > "$STAGE/STEP34_TEST.log" 2>&1)
grep -E '^# (tests|pass|fail|skipped)' "$STAGE/STEP34_TEST.log" | tail -4
echo '===== BUILD ====='
(cd "$STAGE" && npm run build > "$STAGE/STEP34_BUILD.log" 2>&1)
nginx -t

mkdir -p "$BACKUP/source" "$BACKUP/live"
for rel in "$JSREL" "$CSSREL" "$HTMLREL"; do
  mkdir -p "$BACKUP/source/$(dirname "$rel")" "$BACKUP/live/$(dirname "$rel")"
  cp -a "$ROOT/public/miniapp/$rel" "$BACKUP/source/$rel"
  cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done
STARTED=0
rollback() {
  code=$?
  if [[ "$STARTED" == 1 ]]; then
    echo '===== AUTOMATIC ROLLBACK ====='
    for rel in "$JSREL" "$CSSREL" "$HTMLREL"; do
      cp -a "$BACKUP/source/$rel" "$ROOT/public/miniapp/$rel"
      cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
    done
    echo 'ROLLBACK=PASS'
  fi
  exit "$code"
}
trap rollback ERR

echo '===== DEPLOY VERIFIED FILES ====='
STARTED=1
for rel in "$JSREL" "$CSSREL" "$HTMLREL"; do
  cp -a "$STAGE/public/miniapp/$rel" "$ROOT/public/miniapp/$rel"
  cp -a "$STAGE/public/miniapp/$rel" "$LIVE/$rel"
  cmp "$ROOT/public/miniapp/$rel" "$LIVE/$rel"
done
nginx -t
trap - ERR
printf '\nSTEP34_CANONICAL_DEPLOY=PASS\nBACKUP=%s\nFULL_TESTS=PASS\nBUILD=PASS\nDATABASE_WRITES=NONE\nSERVICES_RESTARTED=NONE\n' "$BACKUP"
