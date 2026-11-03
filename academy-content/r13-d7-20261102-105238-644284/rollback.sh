#!/bin/bash
set -euo pipefail
HTML="/root/miniapp10x/public/miniapp/index.html"
JS="/root/miniapp10x/public/miniapp/tenx-hybrid3d-examples.js"
test "$(sha256sum "$HTML" | cut -d' ' -f1)" = "f49c22739f914baccc5799f0da9b7cd327a63ea1efcc46b6e70b7c7a03b337b5" || exit 1
test "$(sha256sum "$JS" | cut -d' ' -f1)" = "bf347cae7b7df8ca73fad92dc37357dd67f261499fc84cdfbf8f8fb104de0834" || exit 1
cp "/root/miniapp10x/academy-content/r13-d7-20261102-105238-644284/index.html.before" "$HTML"
cp "/root/miniapp10x/academy-content/r13-d7-20261102-105238-644284/examples.js.before" "$JS"
echo R13_D7_ROLLBACK=PASS
