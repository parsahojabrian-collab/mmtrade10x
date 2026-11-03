#!/bin/bash
set -euo pipefail
cp '/root/miniapp10x/academy-content/scale-p01-activate-20261102-113749/nginx.before' '/etc/nginx/sites-available/10x'
nginx -t
systemctl reload nginx
echo P01_ACTIVATE_ROLLBACK=PASS
