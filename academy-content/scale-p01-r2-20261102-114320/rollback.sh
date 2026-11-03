#!/bin/bash
set -euo pipefail
cp '/root/miniapp10x/academy-content/scale-p01-r2-20261102-114320/nginx.before' '/etc/nginx/sites-available/10x'
nginx -t
systemctl reload nginx
echo P01_R2_ROLLBACK=PASS
