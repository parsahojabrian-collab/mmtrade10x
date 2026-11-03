#!/bin/bash
set -euo pipefail
HTML=/root/miniapp10x/public/miniapp/index.html
JS=/root/miniapp10x/public/miniapp/tenx-hybrid3d-examples.js
test "$(sha256sum "$HTML" | cut -d' ' -f1)" = 1a6909b535855c67b2f707d7e3bc47385c5ecb14d4d4d8e28dfcdd2034775d10 || exit 1
test "$(sha256sum "$JS" | cut -d' ' -f1)" = ed6ca2a418556c0e87b6ac4c882ddb51916d22684cb5542849eaa15615d17e93 || exit 1
cp /root/miniapp10x/academy-content/r13-d3-20261102-104505-169464/index.html.before "$HTML"
rm "$JS"
echo R13_D3_ROLLBACK=PASS
