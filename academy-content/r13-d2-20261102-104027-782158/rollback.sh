#!/bin/bash
set -euo pipefail
HTML='/root/miniapp10x/public/miniapp/index.html'
JS='/root/miniapp10x/public/miniapp/tenx-hybrid3d-scenes.js'
test "$(sha256sum "$HTML" | cut -d' ' -f1)" = '09c76f79ded2f0b6339ca66df72b5416540b80f737833abc3a9236915a1843d2' || { echo ROLLBACK_BLOCKED_HTML_CHANGED; exit 1; }
test "$(sha256sum "$JS" | cut -d' ' -f1)" = '0ec48d457cf7dda7655f5043c645ffa627b250dbd5291de60021562ada63607b' || { echo ROLLBACK_BLOCKED_JS_CHANGED; exit 1; }
cp '/root/miniapp10x/academy-content/r13-d2-20261102-104027-782158/index.html.before' "$HTML"
rm "$JS"
echo R13_D2_ROLLBACK=PASS
