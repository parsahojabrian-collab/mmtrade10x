#!/bin/bash
set -euo pipefail
test -f '/root/miniapp10x/academy-content/scale-p01-20261102-113617/manifest.json'
test -d '/srv/tenx-public/miniapp'
rm -rf -- '/srv/tenx-public/miniapp'
echo R13_SCALE_P01_STAGE_ROLLBACK=PASS
