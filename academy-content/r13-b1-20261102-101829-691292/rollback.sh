#!/bin/bash
set -euo pipefail
test "$(sha256sum '/root/miniapp10x/public/miniapp/index.html' | cut -d' ' -f1)" = '39f671046f2bd3d17041cd68a15c3406b8cff85c2d2db02d43670b4547805155' || { echo 'BLOCKED_HTML_CHANGED'; exit 1; }
test "$(sha256sum '/root/miniapp10x/public/miniapp/tenx-lesson-renderer.js' | cut -d' ' -f1)" = '35d6304004f94972cb0fb622091137d19fab049b892815d614fc7f10da483776' || { echo 'BLOCKED_JS_CHANGED'; exit 1; }
cp '/root/miniapp10x/academy-content/r13-b1-20261102-101829-691292/index.html.before' '/root/miniapp10x/public/miniapp/index.html'
rm '/root/miniapp10x/public/miniapp/tenx-lesson-renderer.js'
echo 'R13_B1_ROLLBACK=PASS'
