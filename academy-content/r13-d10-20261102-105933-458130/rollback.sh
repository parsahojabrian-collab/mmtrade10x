#!/bin/bash
set -euo pipefail
HTML="/root/miniapp10x/public/miniapp/index.html"
CSS="/root/miniapp10x/public/miniapp/tenx-hybrid3d-premium.css"
test "$(sha256sum "$HTML" | cut -d" " -f1)" = "0a78aa459044769ddc6062be36b5b761a4e57e53657f6e278c3e4016a1fdc4c6" || { echo ROLLBACK_BLOCKED_HTML_CHANGED; exit 1; }
test "$(sha256sum "$CSS" | cut -d" " -f1)" = "09414f9d52de6bb7c045790f8c596d0103aa7f8fbe1494f4d9916cd1de8a7a10" || { echo ROLLBACK_BLOCKED_CSS_CHANGED; exit 1; }
cp "/root/miniapp10x/academy-content/r13-d10-20261102-105933-458130/index.html.before" "$HTML"
rm "$CSS"
echo R13_D10_ROLLBACK=PASS
