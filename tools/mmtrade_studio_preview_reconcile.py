#!/usr/bin/env python3
"""Reconcile published Home preview controls into existing Visual Studio sources.

Direct source integration, not an injected CSS/JS overlay. Existing custom changes
are preserved through 3-way merges; conflicts abort without changing live files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time

BASE_DEFAULT = 'a3d9018fe8d182240e1a23b331bb93a2c3fd424f'
REMOTE_BRANCH = 'refs/heads/design/uupm-r5-source-integrated'
FILES = (
    'public/miniapp/p74/studio/index.html',
    'public/miniapp/p74/studio/studio.js',
    'public/miniapp/p74/studio/spatial.js',
)
TOKEN = b'PUBLISHED_HOME_PARITY_RECONCILED_20261119'


def run(args, cwd=None, check=True):
    p = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode:
        raise RuntimeError(f"COMMAND_FAILED({p.returncode}): {' '.join(map(str, args))}\n{p.stderr.decode(errors='replace')[-1200:]}")
    return p


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_show(repo: Path, commit: str, path: str) -> bytes:
    return run(['git', 'show', f'{commit}:{path}'], cwd=repo).stdout


def script_version(html: bytes, name: str) -> bytes:
    # Change only cache keys of existing runtime scripts; preserve every other byte.
    pattern = re.compile(rb'(\bsrc\s*=\s*["\'](?:\./|/miniapp/p74/studio/)' + name.encode() + rb'\?v=)[^"\']+(["\'])')
    out, count = pattern.subn(lambda m: m.group(1) + TOKEN + m.group(2), html)
    if count != 1:
        raise RuntimeError(f'HTML_SCRIPT_REFERENCE_INVALID: {name}, matches={count}')
    return out


def three_way(local: bytes, base: bytes, target: bytes, path: str, stage: Path) -> bytes:
    if local == target:
        return local
    if local == base:
        return target
    tmp = stage / 'mergetmp' / path.replace('/', '__')
    tmp.mkdir(parents=True, exist_ok=True)
    for name, payload in [('local', local), ('base', base), ('target', target)]:
        (tmp / name).write_bytes(payload)
    p = run(['git', 'merge-file', '-p', str(tmp / 'local'), str(tmp / 'base'), str(tmp / 'target')], check=False)
    if p.returncode != 0:
        conflict = stage / 'conflicts' / path
        conflict.parent.mkdir(parents=True, exist_ok=True)
        conflict.write_bytes(p.stdout)
        raise RuntimeError(f'THREE_WAY_MERGE_CONFLICT: {path}\nReview: {conflict}\nLOCAL_SHA256={sha(local)}\nBASE_SHA256={sha(base)}\nTARGET_SHA256={sha(target)}')
    return p.stdout


def validate(path: str, content: bytes, stage_file: Path) -> None:
    if path.endswith('index.html'):
        for name in ('studio.js', 'spatial.js'):
            if content.count(name.encode() + b'?v=' + TOKEN) != 1:
                raise RuntimeError(f'SCRIPT_REFERENCE_NOT_UNIQUE: {path}, {name}')
    elif path.endswith('studio.js'):
        for marker in (b'function startEditingFromPublishedHome()',
                       b'edit.addEventListener(\'click\',startEditingFromPublishedHome)',
                       b'usePublishedAsWorkingCopy()'):
            if content.count(marker) != 1:
                raise RuntimeError(f'STUDIO_PARITY_MISSING_OR_DUPLICATED: {marker.decode()}, {path}')
    elif path.endswith('spatial.js'):
        if content.count(b'function usePublishedAsWorkingCopy()') != 1:
            raise RuntimeError('SPATIAL_PARITY_MISSING_OR_DUPLICATED')
        if b'restoreLocal,review:' not in content or b'usePublishedAsWorkingCopy,getDraftLayout:' not in content:
            raise RuntimeError('SPATIAL_PARITY_EXPORT_MISSING')
    if path.endswith('.js'):
        run(['node', '--check', str(stage_file)])


def save_atomic(path: Path, data: bytes, previous_stat) -> None:
    fd, temp = tempfile.mkstemp(prefix=f'.{path.name}.parity.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as w:
            w.write(data)
            w.flush()
            os.fsync(w.fileno())
        os.chmod(temp, stat.S_IMODE(previous_stat.st_mode))
        os.chown(temp, previous_stat.st_uid, previous_stat.st_gid)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def check_http(host: str, live: Path, rel: str) -> None:
    url = f'https://{host}/miniapp/{rel}?parity_verify={int(time.time())}'
    p = run(['curl', '--noproxy', '*', '--fail', '--silent', '--show-error', '--max-time', '12',
             '--resolve', f'{host}:443:127.0.0.1', url])
    actual = p.stdout
    expected = (live / rel).read_bytes()
    if sha(actual) != sha(expected):
        raise RuntimeError(f'HTTP_PARITY_FAILED: {url}, HTTP_SHA256={sha(actual)}, LIVE_SHA256={sha(expected)}')
    print(f'HTTP_PARITY=PASS {rel}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['audit', 'install'])
    parser.add_argument('--root', type=Path, default=Path('/root/miniapp10x'))
    parser.add_argument('--live', type=Path, default=Path('/srv/tenx-public/miniapp'))
    parser.add_argument('--base', default=BASE_DEFAULT)
    parser.add_argument('--target', default='FETCH_HEAD')
    parser.add_argument('--backup-dir', type=Path, default=Path('/root'))
    parser.add_argument('--no-fetch', action='store_true', help='Test fixture only; use pinned local --target')
    parser.add_argument('--skip-http', action='store_true', help='Test fixtures only')
    parser.add_argument('--host', default='mmtrade10x.ir')
    ns = parser.parse_args()
    repo = ns.root.resolve(strict=True)
    live = ns.live.resolve(strict=True)
    if not ns.no_fetch:
        print('FETCHING_REMOTE_SOURCE=YES', flush=True)
        run(['git', '-c', 'pack.threads=1', 'fetch', '--no-tags', 'origin', REMOTE_BRANCH], cwd=repo)
    target = run(['git', 'rev-parse', '--verify', ns.target + '^{commit}'], cwd=repo).stdout.decode().strip()
    base = run(['git', 'rev-parse', '--verify', ns.base + '^{commit}'], cwd=repo).stdout.decode().strip()
    print('BASE=' + base, 'TARGET=' + target, flush=True)
    if base == target:
        raise RuntimeError('BASE_EQUALS_TARGET: new preview source changes not available')
    stage = Path(tempfile.mkdtemp(prefix='MMTRADE_STUDIO_PARITY_RECONCILE_', dir=ns.backup_dir))
    os.chmod(stage, 0o700)
    print('STAGE=' + str(stage), flush=True)
    candidates = []
    manifest = {'base': base, 'target': target, 'mode': ns.mode, 'files': [], 'stage': str(stage)}

    # Stage and verify the full transaction before touching either active tree.
    try:
        for item in FILES:
            rel = item.split('public/miniapp/', 1)[1]
            baseline, incoming = git_show(repo, base, item), git_show(repo, target, item)
            for label, location in [('source', repo / item), ('live', live / rel)]:
                if location.is_symlink() or not location.is_file():
                    raise RuntimeError(f'MISSING_OR_SYMLINK: {location}')
                original = location.read_bytes()
                backup = stage / 'before' / label / rel
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(location, backup, follow_symlinks=False)
                if item.endswith('index.html'):
                    next_content = script_version(script_version(original, 'studio.js'), 'spatial.js')
                    strategy = 'PRESERVE_HTML_AND_REFRESH_SCRIPT_REFERENCES'
                else:
                    next_content = three_way(original, baseline, incoming, item, stage)
                    strategy = 'THREE_WAY_SOURCE_MERGE'
                candidate = stage / 'candidate' / label / rel
                candidate.parent.mkdir(parents=True, exist_ok=True)
                candidate.write_bytes(next_content)
                validate(item, next_content, candidate)
                candidates.append((label, rel, location, backup, candidate, sha(original)))
                manifest['files'].append({'scope': label, 'path': rel, 'strategy': strategy,
                                          'before': sha(original), 'after': sha(next_content),
                                          'changed': original != next_content})
                print(f'STAGED={label}/{rel} BEFORE={sha(original)[:12]} AFTER={sha(next_content)[:12]}', flush=True)
        (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        print('STAGE=PASS', 'LIVE_WRITES=NO', flush=True)
        if ns.mode == 'audit':
            print('AUDIT=PASS; run install mode to apply the staged merge to the live editor.')
            return 0

        # Confirm files have not drifted while the merge was being prepared.
        for _, _, location, _, _, initial_hash in candidates:
            if sha(location.read_bytes()) != initial_hash:
                raise RuntimeError(f'CONCURRENT_MODIFICATION: {location}')
        installed = []
        try:
            for _, _, location, backup, candidate, _ in candidates:
                original_stat = location.stat()
                save_atomic(location, candidate.read_bytes(), original_stat)
                installed.append((location, backup))
            for _, _, location, _, candidate, _ in candidates:
                if sha(location.read_bytes()) != sha(candidate.read_bytes()):
                    raise RuntimeError(f'POST_INSTALL_FILE_MISMATCH: {location}')
            if not ns.skip_http:
                for item in FILES:
                    rel = item.split('public/miniapp/', 1)[1]
                    check_http(ns.host, live, rel)
            print('INSTALL=PASS', 'LIVE_AND_SOURCE=VERIFIED', 'BACKUP=' + str(stage), flush=True)
            return 0
        except BaseException:
            print('INSTALL_FAILURE; restoring exact original files...', file=sys.stderr, flush=True)
            for location, backup in reversed(installed):
                original_stat = backup.stat()
                save_atomic(location, backup.read_bytes(), original_stat)
            print('ROLLBACK=PASS', 'BACKUP=' + str(stage), file=sys.stderr, flush=True)
            raise
    except BaseException:
        print('ABORTED; if STAGE=PASS was not shown, NO LIVE WRITES occurred.', file=sys.stderr, flush=True)
        print('DIAGNOSTICS=' + str(stage), file=sys.stderr, flush=True)
        raise


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('ERROR=' + str(exc), file=sys.stderr, flush=True)
        sys.exit(1)
