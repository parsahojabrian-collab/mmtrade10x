#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/root/miniapp10x
SRC="$ROOT/public/miniapp"
LIVE=/srv/tenx-public/miniapp
TMP=$(mktemp -d /root/MMTRADE_ONBOARD_R2_STAGE_XXXXXXXX)
BACKUP="/root/MMTRADE_ONBOARD_R2_BACKUP_$(date +%Y%m%d_%H%M%S)"
FILES=(10x-onboarding.css index.html)

echo "===== SOURCE & LIVE PREFLIGHT ====="
for rel in "${FILES[@]}"; do
  test -s "$SRC/$rel" && test -s "$LIVE/$rel"
  cmp -s "$SRC/$rel" "$LIVE/$rel" || { echo "ABORT: SOURCE_LIVE_DIVERGED $rel"; exit 2; }
done
test -d "$ROOT/node_modules"
command -v rsync >/dev/null

echo "===== STAGING ONLY ====="
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude='*.log' "$ROOT/" "$TMP/"
ln -s "$ROOT/node_modules" "$TMP/node_modules"
export TMP
python3 - <<'PY'
from pathlib import Path
import os,re
base=Path(os.environ['TMP'])/'public/miniapp'
css=base/'10x-onboarding.css'
html=base/'index.html'
s=css.read_text(encoding='utf-8')
if 'MMTRADE_ONBOARD_PROFILE_R2' in s: raise RuntimeError('R2_ALREADY_INSTALLED')
required=['.tenx-onboard-backdrop', '.tenx-onboard-sheet', '.tenx-onboard-field', '.tenx-onboard-submit', '.tenx-onboard-level']
for item in required:
    if item not in s:raise RuntimeError('ONBOARD_CSS_STRUCTURE_CHANGED '+item)
s += """
/* MMTRADE_ONBOARD_PROFILE_R2
   First-time name/family-name sheet + trading-level step.
   Isolated from Home and Visual Studio; no API/registration change. */
.tenx-onboard-backdrop {
  z-index:2147483640!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:flex-end!important;
  width:100%!important;
  height:100dvh!important;
  padding:0!important;
  overflow:hidden!important;
  background:rgba(2,12,11,.82)!important;
  -webkit-backdrop-filter:blur(12px)!important;
  backdrop-filter:blur(12px)!important;
  direction:rtl!important;
}
.tenx-onboard-backdrop,
.tenx-onboard-backdrop * {box-sizing:border-box!important}
.tenx-onboard-backdrop .tenx-onboard-sheet {
  position:relative!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:0!important;
  flex:none!important;
  width:min(100%,490px)!important;
  min-width:0!important;
  max-width:100%!important;
  max-height:min(92dvh,780px)!important;
  margin:0 auto!important;
  padding:22px clamp(18px,5vw,28px) calc(24px + env(safe-area-inset-bottom,0px))!important;
  overflow-y:auto!important;
  overflow-x:hidden!important;
  overscroll-behavior:contain!important;
  -webkit-overflow-scrolling:touch!important;
  border-radius:24px 24px 0 0!important;
  border:1px solid rgba(105,223,179,.36)!important;
  border-bottom:0!important;
  background:linear-gradient(170deg,#15362e,#0a201b 55%,#061611)!important;
  box-shadow:0 -18px 65px rgba(0,0,0,.55)!important;
  color:#f5f8f4!important;
  text-align:right!important;
  font-family:MM-Peyda-P74,Tahoma,Arial,sans-serif!important;
}
.tenx-onboard-backdrop .tenx-onboard-brand {
  margin:0!important;
  font-size:10px!important;
  letter-spacing:2px!important;
  line-height:1.4!important;
  color:#72e9bc!important;
}
.tenx-onboard-backdrop .tenx-onboard-symbol {
  width:46px!important;
  height:46px!important;
  min-height:46px!important;
  margin:9px auto 11px!important;
  border-radius:14px!important;
  font:800 19px/1 Tahoma,Arial,sans-serif!important;
}
.tenx-onboard-backdrop .tenx-onboard-sheet h2 {
  margin:0 0 7px!important;
  font-size:clamp(17px,4.6vw,22px)!important;
  line-height:1.42!important;
  font-weight:800!important;
  text-align:center!important;
  text-wrap:balance!important;
  color:#fff!important;
}
.tenx-onboard-backdrop .tenx-onboard-subtitle {
  margin:0 0 17px!important;
  font-size:clamp(12px,3.2vw,14px)!important;
  line-height:1.65!important;
  color:#c0d5cc!important;
  text-align:center!important;
  text-wrap:pretty!important;
}
.tenx-onboard-backdrop .tenx-onboard-sheet > div:not(.tenx-onboard-brand):not(.tenx-onboard-symbol) {
  width:100%!important;
  min-width:0!important;
}
.tenx-onboard-backdrop .tenx-onboard-field {
  display:block!important;
  width:100%!important;
  margin:0 0 13px!important;
  font-size:13px!important;
  font-weight:700!important;
  line-height:1.6!important;
  color:#e4f3e9!important;
  text-align:right!important;
}
.tenx-onboard-backdrop .tenx-onboard-field input {
  display:block!important;
  width:100%!important;
  min-width:0!important;
  height:48px!important;
  margin:6px 0 0!important;
  padding:10px 14px!important;
  font-size:16px!important;
  font-weight:500!important;
  line-height:1.45!important;
  text-align:right!important;
  direction:rtl!important;
  border:1px solid #446b5a!important;
  border-radius:12px!important;
  outline:none!important;
  background:#071c17!important;
  color:#fff!important;
  box-shadow:none!important;
  appearance:none!important;
}
.tenx-onboard-backdrop .tenx-onboard-field input:focus {
  border-color:#70f0bc!important;
  box-shadow:0 0 0 3px rgba(87,240,179,.18)!important;
}
.tenx-onboard-backdrop .tenx-onboard-level {
  display:flex!important;
  flex-direction:row!important;
  align-items:center!important;
  gap:12px!important;
  width:100%!important;
  min-width:0!important;
  min-height:62px!important;
  margin:0 0 9px!important;
  padding:11px 13px!important;
  border-radius:13px!important;
  border:1px solid #3d6052!important;
  background:#0c271e!important;
  text-align:right!important;
  color:#f5faf8!important;
  font-family:inherit!important;
}
.tenx-onboard-backdrop .tenx-onboard-level[aria-pressed="true"] {
  border-color:#76eaba!important;
  background:#174c36!important;
  box-shadow:inset 0 0 0 1px #67e7af33!important;
}
.tenx-onboard-backdrop .tenx-onboard-level > span:not(.tenx-onboard-level-icon) {
  display:block!important;
  flex:1!important;
  min-width:0!important;
}
.tenx-onboard-backdrop .tenx-onboard-level strong {
  display:block!important;
  margin:0!important;
  font-size:14px!important;
  line-height:1.4!important;
  color:#fff!important;
}
.tenx-onboard-backdrop .tenx-onboard-level small {
  display:block!important;
  margin-top:2px!important;
  font-size:11px!important;
  line-height:1.5!important;
  color:#b8cbc3!important;
}
.tenx-onboard-backdrop .tenx-onboard-level-icon {
  display:grid!important;
  place-items:center!important;
  flex:none!important;
  width:33px!important;
  font-size:21px!important;
}
.tenx-onboard-backdrop .tenx-onboard-error {
  min-height:0!important;
  margin:0!important;
  font-size:12px!important;
  line-height:1.5!important;
  color:#ffb4ac!important;
  text-align:center!important;
}
.tenx-onboard-backdrop .tenx-onboard-error:not(:empty) {
  margin:4px 0 8px!important;
}
.tenx-onboard-backdrop .tenx-onboard-submit {
  display:block!important;
  width:100%!;
  min-height:49px!important;
  margin:13px 0 0!important;
  padding:11px 16px!important;
  border-radius:13px!important;
  border:0!important;
  background:linear-gradient(110deg,#82f4bd,#34ce92)!important;
  color:#062018!important;
  font-family:inherit!important;
  font-size:15px!important;
  line-height:1.55!important;
  font-weight:800!important;
  text-align:center!important;
}
.tenx-onboard-backdrop .tenx-onboard-secondary {
  display:block!important;
  align-self:center!important;
  margin:4px auto 0!important;
  padding:7px 14px!important;
  color:#c4d8cd!important;
  font-family:inherit!important;
  font-size:13px!important;
  line-height:1.7!important;
}
.tenx-onboard-backdrop button:focus-visible {
  outline:2px solid #b9ffe0!important;
  outline-offset:3px!important;
}
@media(min-width:600px) {
  .tenx-onboard-backdrop {justify-content:center!important;padding:16px!important}
  .tenx-onboard-backdrop .tenx-onboard-sheet {
    border:1px solid rgba(105,223,179,.36)!important;
    border-radius:24px!important;
    padding-bottom:24px!important;
  }
}
@media(max-height:570px) {
  .tenx-onboard-backdrop .tenx-onboard-sheet {max-height:97dvh!important;padding-top:12px!important}
  .tenx-onboard-backdrop .tenx-onboard-symbol {margin:4px auto 6px!important;width:36px!important;height:36px!important;min-height:36px!important}
  .tenx-onboard-backdrop .tenx-onboard-subtitle {margin-bottom:10px!important}
}
@media(prefers-reduced-motion:reduce) {
  .tenx-onboard-backdrop .tenx-onboard-sheet {animation:none!important}
}
"""
# Correct one invalid value before deploying.
s=s.replace('width:100%!;','width:100%!important;')
css.write_text(s,encoding='utf-8')
h=html.read_text(encoding='utf-8')
pattern=re.compile(r'(/miniapp/10x-onboarding\.css\?v=)[^"\'\s<>]+')
h,n=pattern.subn(r'\g<1>MMTRADE_ONBOARD_PROFILE_R2_20261121',h)
if n!=1: raise RuntimeError('HTML_ONBOARD_CSS_LINK_COUNT='+str(n))
html.write_text(h,encoding='utf-8')
print('ONBOARD_R2_STAGED=PASS')
PY

echo "===== VALIDATE ====="
python3 - "$TMP/public/miniapp/10x-onboarding.css" "$TMP/public/miniapp/index.html" <<'PY'
from pathlib import Path
import sys
css=Path(sys.argv[1]).read_text()
html=Path(sys.argv[2]).read_text()
assert css.count('MMTRADE_ONBOARD_PROFILE_R2')==1
assert 'z-index:2147483640!important' in css
assert 'font-family:inherit!important' in css
assert 'width:100%!;' not in css
assert '/miniapp/10x-onboarding.css?v=MMTRADE_ONBOARD_PROFILE_R2_20261121' in html
assert css.count('{')==css.count('}')
print('ONBOARD_R2_STRUCTURE=PASS')
PY
(cd "$TMP" && npm test > "$TMP/onboard-tests.log" 2>&1)
grep -E '^# (tests|pass|fail|skipped)' "$TMP/onboard-tests.log" | tail -4
(cd "$TMP" && npm run build > "$TMP/onboard-build.log" 2>&1)
nginx -t
echo 'VALIDATION=PASS'

mkdir -p "$BACKUP/source" "$BACKUP/live"
for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP/source/$(dirname "$rel")" "$BACKUP/live/$(dirname "$rel")"
  cp -a "$SRC/$rel" "$BACKUP/source/$rel"
  cp -a "$LIVE/$rel" "$BACKUP/live/$rel"
done
started=0
rollback(){
  rc=$?
  trap - ERR
  if [[ "$started" == 1 ]]; then
    for rel in "${FILES[@]}"; do
      cp -a "$BACKUP/source/$rel" "$SRC/$rel"
      cp -a "$BACKUP/live/$rel" "$LIVE/$rel"
    done
    echo 'ROLLBACK=COMPLETE'
  fi
  exit "$rc"
}
trap rollback ERR
started=1
for rel in "${FILES[@]}"; do
  cp -a "$TMP/public/miniapp/$rel" "$SRC/$rel"
  cp -a "$TMP/public/miniapp/$rel" "$LIVE/$rel"
  cmp "$SRC/$rel" "$LIVE/$rel"
done
nginx -t
trap - ERR
echo "MMTRADE_ONBOARD_R2_INSTALL=PASS"
echo "BACKUP=$BACKUP"
echo "ONBOARD_JS_CHANGED=NO"
echo "DATABASE_WRITES=NONE"
