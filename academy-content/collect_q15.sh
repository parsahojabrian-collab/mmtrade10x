#!/usr/bin/env bash
set -euo pipefail
cd /root/miniapp10x
out=/root/miniapp10x/academy-content/Q15_SOURCE_INPUT.zip
for f in apps/api/src/index.ts packages/db/prisma/schema.prisma public/miniapp/index.html public/miniapp/tenx-quiz-ui.js; do
  if [[ ! -f "$f" ]]; then echo "MISSING=$f"; exit 1; fi
done
if ! grep -q 'TENX_Q14' public/miniapp/index.html; then echo 'Q14_BASELINE_MARKER_NOT_FOUND'; exit 1; fi
zip -q -FS "$out" apps/api/src/index.ts packages/db/prisma/schema.prisma public/miniapp/index.html public/miniapp/tenx-quiz-ui.js
unzip -tqq "$out"
echo "Q15_SOURCE_COLLECTION=PASS"
ls -lh "$out"
echo 'NO_DATABASE_OR_ENV_EXPORTED=YES'
