#!/usr/bin/env bash
set -euo pipefail
python3 - <<'RB'
from pathlib import Path
import hashlib,sys
h=Path('/root/miniapp10x/public/miniapp/index.html')
j=Path('/root/miniapp10x/public/miniapp/tenx-full50-d12.js')
b=Path('/root/miniapp10x/academy-content/r13-d12-full50-20261102-111412/index.html.before')
sha=lambda x:hashlib.sha256(x).hexdigest()
if not (h.is_file() and j.is_file() and b.is_file()):sys.exit('ROLLBACK_BLOCKED_MISSING_FILE')
if sha(h.read_bytes())!='42ff140fe881873929c753677bef2c6cbffe8ec31f683420bda153f0e1f03e54' or sha(j.read_bytes())!='ea8aa2eae6536595f90155bb61278dffe8ad8b693c48cc4e574541015f2941c5':sys.exit('ROLLBACK_BLOCKED_FILE_CHANGED')
h.write_bytes(b.read_bytes());j.unlink();print('ROLLBACK=PASS')
RB
