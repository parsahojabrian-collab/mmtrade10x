#!/usr/bin/env bash
set -euo pipefail
cd /root/miniapp10x
out=/root/miniapp10x/academy-content/MMTRADE10X_SOURCE.zip
files=(public/miniapp/index.html apps/api/src/index.ts packages/db/prisma/schema.prisma)
for f in "${files[@]}"; do test -f "$f" || { echo "MISSING=$f"; exit 1; }; done
zip -q -FS "$out" "${files[@]}"
echo 'MMTRADE10X_COLLECTION=PASS'
ls -lh "$out"
echo 'NO_ENV_OR_DATABASE_EXPORTED=YES'
