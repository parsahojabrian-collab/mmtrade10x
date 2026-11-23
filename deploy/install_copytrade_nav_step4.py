#!/usr/bin/env python3
"""Surgically align MMTrade copy-trade bottom tab with P74 step-four /eplanet.

Usage: python3 install_copytrade_nav.py audit|install|verify
No dependencies beyond Python 3 and node for the syntax preflight.
"""
import os
import sys
import shutil
import hashlib
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime, timezone

FILES = ('shared/mm-bottom-nav.js', 'p74/mf-navigation.js')
ROOTS = (Path('/root/miniapp10x/public/miniapp'), Path('/srv/tenx-public/miniapp'))
BASE_DIR = Path('/root/MMTRADE_COPYTRADE_NAV_STEP4_BACKUPS')


def sub_one(src, old, new, tag):
    if new in src:
        return src
    count = src.count(old)
    if count != 1:
        raise ValueError(f'{tag}: expected one baseline occurrence, found {count}')
    return src.replace(old, new, 1)


def unified(src):
    src = sub_one(src, 'const routeIds={', '''// Keep the Copy Trade bottom tab aligned with the P74 Home step-four destination.
  const P74_STEP4_HREF='/eplanet';
  function isCopyTradingItem(item){
   const id=String(item?.id||'').toLowerCase();
   const label=String(item?.label||'').replace(/[\u200c\u200f]/g,' ').trim();
   return id==='copy-trading'||id==='copy_trading'||id==='copytrade'||
    /^(?:کپی\s*ترید(?:ینگ)?|copy[\s-]*trad(?:e|ing))$/i.test(label);
  }
  function targetHref(item){return isCopyTradingItem(item)?P74_STEP4_HREF:item.href;}
  const routeIds={''', 'unified-helper')
    src = sub_one(src,
        "const view=(q.get('view')||'').toLowerCase();",
        "const view=(q.get('view')||'').toLowerCase();\n  if(curr==='/miniapp/p74/eplanet/index.html'){\n   const copyItem=items.find(isCopyTradingItem);if(copyItem)return copyItem.id;\n  }",
        'unified-active')
    src = sub_one(src, 'safeHref(it.href)?.split(/[?#]/)[0]',
                  'safeHref(targetHref(it))?.split(/[?#]/)[0]', 'unified-active-link')
    src = sub_one(src, 'a.href=it.href;a.dataset.mmuId=it.id;',
                  'a.href=targetHref(it);a.dataset.mmuId=it.id;', 'unified-href')
    return src


def legacy(src):
    src = sub_one(src,
        "var STAGE1 = '/miniapp/index.html?view=mmtrade10x';",
        "var STAGE1 = '/miniapp/index.html?view=mmtrade10x';\n  // Match step four in P74 Home.\n  var P74_STEP4_HREF = '/eplanet';",
        'legacy-destination')
    src = sub_one(src,
        "{ id: 'copy-trading', label: 'آموزش کپی‌ترید', href: '/miniapp/p74/copytrade-academy/index.html', icon: 'chart', enabled: true, sort: 40 }",
        "{ id: 'copy-trading', label: 'آموزش کپی‌ترید', href: P74_STEP4_HREF, icon: 'chart', enabled: true, sort: 40 }",
        'legacy-fallback')
    src = sub_one(src, 'function makeItems(source) {', '''function isCopyTradingItem(item) {
    var id = String(item.id || '').toLowerCase();
    var label = String(item.label || '').replace(/[\u200c\u200f]/g, ' ').trim();
    return id === 'copy-trading' || id === 'copy_trading' || id === 'copytrade' ||
      /^(?:کپی\s*ترید(?:ینگ)?|copy[\s-]*trad(?:e|ing))$/i.test(label);
  }

  function makeItems(source) {''', 'legacy-helper')
    src = sub_one(src, 'href: item.href,',
                  'href: isCopyTradingItem(item) ? P74_STEP4_HREF : item.href,', 'legacy-managed')
    src = sub_one(src,
        "var view = new URLSearchParams(location.search).get('view');",
        "var view = new URLSearchParams(location.search).get('view');\n    if (path === '/miniapp/p74/eplanet/index.html') {\n      return items.find(isCopyTradingItem) || null;\n    }",
        'legacy-active')
    return src

TRANSFORMS = {'shared/mm-bottom-nav.js': unified, 'p74/mf-navigation.js': legacy}
MARKERS = {
    'shared/mm-bottom-nav.js': ('const P74_STEP4_HREF=', 'a.href=targetHref(it)', "curr==='/miniapp/p74/eplanet/index.html'"),
    'p74/mf-navigation.js': ('var P74_STEP4_HREF', 'href: isCopyTradingItem(item) ? P74_STEP4_HREF : item.href', "path === '/miniapp/p74/eplanet/index.html'"),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()[:16]


def check_js(code, name):
    proc = subprocess.run(['node', '--check'], input=code.encode('utf-8'),
                          capture_output=True, check=False)
    if proc.returncode:
        # node --check may not accept stdin on older Node versions; use a temp file.
        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', encoding='utf-8', delete=False) as tmp:
            tmp.write(code)
            filename = tmp.name
        try:
            proc = subprocess.run(['node', '--check', filename], capture_output=True, text=True, check=False)
            if proc.returncode:
                raise RuntimeError(f'{name}: JS syntax failed: {proc.stderr[:350]}')
        finally:
            os.unlink(filename)


def scan():
    staged = []
    for root in ROOTS:
        for rel in FILES:
            file = root / rel
            if not file.is_file():
                raise FileNotFoundError(f'MISSING: {file}')
            old = file.read_text(encoding='utf-8')
            new = TRANSFORMS[rel](old)
            for marker in MARKERS[rel]:
                if marker not in new:
                    raise RuntimeError(f'MISSING_TARGET_MARKER: {file}: {marker}')
            check_js(new, str(file))
            staged.append((file, old, new))
    return staged


def run(mode):
    if mode not in ('audit', 'install', 'verify'):
        raise ValueError('Usage: install_copytrade_nav.py audit|install|verify')
    stages = scan()
    changed = [(p, o, n) for p, o, n in stages if o != n]
    for p, o, n in stages:
        print(f'{mode.upper()} {p} BEFORE={sha(o.encode())} AFTER={sha(n.encode())} '+
              ('UNCHANGED' if o == n else 'READY'))
    if mode == 'verify':
        if changed:
            raise RuntimeError('VERIFY_FAILED: at least one target is not installed')
        print('VERIFY=PASS FILES=4')
        return
    if mode == 'audit':
        print(f'AUDIT=PASS CHANGED={len(changed)} NO_WRITES=YES')
        return
    if not changed:
        print('INSTALL=ALREADY_APPLIED NO_WRITES=YES')
        return
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = BASE_DIR / stamp
    if backup.exists():
        raise RuntimeError(f'BACKUP_ALREADY_EXISTS: {backup}')
    backup.mkdir(parents=True, exist_ok=False)
    saved = []
    for p, _o, _n in changed:
        relative_root = 'source' if p.is_relative_to(ROOTS[0]) else 'live'
        destination = backup / relative_root / p.relative_to(ROOTS[0] if relative_root == 'source' else ROOTS[1])
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, destination)
        saved.append((p, destination))
    replaced = []
    try:
        for p, _old, new in changed:
            fd, temp = tempfile.mkstemp(prefix=f'.{p.name}.step4-', dir=p.parent)
            try:
                with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                    stream.write(new)
                    stream.flush()
                    os.fsync(stream.fileno())
                shutil.copymode(p, temp)
                os.replace(temp, p)
                replaced.append(p)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)
        if any(TRANSFORMS[p.relative_to(ROOTS[0] if p.is_relative_to(ROOTS[0]) else ROOTS[1]).as_posix()](p.read_text()) != p.read_text() for p in replaced):
            raise RuntimeError('POST_INSTALL_VERIFY_FAILED')
        print(f'INSTALL=PASS FILES={len(changed)} BACKUP={backup}')
    except BaseException:
        for p, saved_path in saved:
            if p in replaced:
                shutil.copy2(saved_path, p)
        raise


if __name__ == '__main__':
    try:
        run(sys.argv[1] if len(sys.argv) == 2 else '')
    except Exception as exc:
        print(f'ERROR={exc}', file=sys.stderr)
        sys.exit(1)
