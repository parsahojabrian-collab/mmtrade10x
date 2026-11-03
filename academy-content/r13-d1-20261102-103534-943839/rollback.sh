#!/bin/bash
set -euo pipefail
HTML='/root/miniapp10x/public/miniapp/index.html'
JS='/root/miniapp10x/public/miniapp/tenx-hybrid3d.js'
test "$(sha256sum "$HTML" | cut -d' ' -f1)" = '29c3ae9217925137810870a32ff0f1b6f3154a2c73c13ab749518c47c8e86ac8' || exit 1
test "$(sha256sum "$JS" | cut -d' ' -f1)" = 'e3cfd3f98cd7e65628ac942e55504bcc39ba4f5c55e3113612e5206bdecb4310' || exit 1
cp '/root/miniapp10x/academy-content/r13-d1-20261102-103534-943839/index.html.before' "$HTML"
rm "$JS"
echo R13_D1_ROLLBACK=PASS
