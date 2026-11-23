#!/usr/bin/env bash
# Read-only source + service health audit for MMTRADE 10X.
# No npm install, migrations, git pull, restart, or update to live files.
set -uo pipefail

ROOT="/root/miniapp10x"
if [[ $# -ge 1 ]]; then ROOT="$1"; fi
if [[ ! -d "$ROOT" || ! -f "$ROOT/package.json" ]]; then
  printf 'ERROR=PROJECT_NOT_FOUND ROOT=%s\n' "$ROOT" >&2
  exit 2
fi
cd "$ROOT" || exit 2
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="/root/MMTRADE_SOURCE_AUDIT_$STAMP.log"
umask 077
exec > >(tee "$LOG") 2>&1
failed=0

check() {
  local tag="$1"; shift
  printf '\n=== %s ===\n' "$tag"
  if "$@"; then printf '%s=PASS\n' "$tag"
  else printf '%s=FAIL\n' "$tag"; failed=$((failed+1)); fi
}
printf 'AUDIT_MODE=READ_ONLY ROOT=%s LOG=%s\n' "$ROOT" "$LOG"
printf 'START_UTC=%s\n' "$(date -u +%FT%TZ)"
node --version || true
npm --version || true
git rev-parse --short HEAD 2>/dev/null || true
git status --short --untracked-files=no 2>/dev/null | head -n 25 || true

if [[ -x "./node_modules/.bin/tsc" ]]; then
  check TYPECHECK timeout 180s env NODE_OPTIONS="--max-old-space-size=1024" ./node_modules/.bin/tsc --noEmit -p tsconfig.json
else
  printf 'TYPECHECK=SKIPPED_MISSING_LOCAL_DEPENDENCIES\n'
  failed=$((failed+1))
fi

if [[ -d "node_modules" ]]; then
  check TESTS timeout 240s env NODE_OPTIONS="--max-old-space-size=1024" \
    node --experimental-strip-types --test --test-concurrency=2 tests/*.test.mjs
else
  printf 'TESTS=SKIPPED_MISSING_LOCAL_DEPENDENCIES\n'
  failed=$((failed+1))
fi

printf '\n=== JAVASCRIPT_SYNTAX ===\n'
js_total=0
js_fail=0
while IFS= read -r -d '' file; do
  js_total=$((js_total+1))
  if ! node --check "$file" >/dev/null 2>&1; then
    printf 'JS_SYNTAX_FAIL=%s\n' "$file"
    js_fail=$((js_fail+1))
  fi
done < <(find public/miniapp apps/api/public -type f -name '*.js' -print0 2>/dev/null)
printf 'JS_FILES=%s JS_ERRORS=%s\n' "$js_total" "$js_fail"
if (( js_fail > 0 )); then failed=$((failed+1)); fi

printf '\n=== SOURCE_LIVE_PARITY (informational) ===\n'
AUDIT_SOURCE="$ROOT/public/miniapp" python3 - <<'PY'
from pathlib import Path
import hashlib, os
source=Path(os.environ['AUDIT_SOURCE'])
live=Path('/srv/tenx-public/miniapp')
if not live.exists():
    print('SOURCE_LIVE=SKIPPED_LIVE_NOT_FOUND')
else:
    total=0
    changed=[]
    missing=[]
    for src in source.rglob('*'):
        if not src.is_file() or src.suffix.lower() not in ('.html','.css','.js'):
            continue
        total+=1
        dest=live/src.relative_to(source)
        if not dest.is_file():
            missing.append(str(src.relative_to(source)))
        elif hashlib.sha256(src.read_bytes()).digest()!=hashlib.sha256(dest.read_bytes()).digest():
            changed.append(str(src.relative_to(source)))
    print(f'FILES_CHECKED={total} SOURCE_LIVE_DIFFERENT={len(changed)} SOURCE_LIVE_MISSING={len(missing)}')
    for entry in changed[:20]: print('DIFFERENT='+entry)
    for entry in missing[:20]: print('MISSING='+entry)
    print('DIFFERENCES_NEED_DEPLOY_MANIFEST_REVIEW=YES' if changed or missing else 'SOURCE_LIVE_PARITY=PASS')
PY

printf '\n=== SERVICE_STATES (no logs or secrets) ===\n'
for unit in 10x-bot.service 10x-api.service; do
  printf '%s=' "$unit"
  systemctl is-active "$unit" 2>/dev/null || true
done
printf '\nFINISH_UTC=%s\n' "$(date -u +%FT%TZ)"
printf 'AUDIT_FAILED_STAGES=%s\n' "$failed"
printf 'LOG_PATH=%s\n' "$LOG"
exit $((failed>0 ? 1 : 0))
