import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { reconcileLegacyPatches } from '../scripts/mmtrade-legacy-patches.mjs';

const sum = text => createHash('sha256').update(text).digest('hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mmtrade-legacy-'));
  const store = join(root, '.mmtrade-maintenance');
  const dir = join(store, 'legacy-input');
  mkdirSync(dir, { recursive: true });
  const write = (path, text) => {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  write('apps/api/src/index.ts', 'export const apiVersion = 1;\n');
  write('apps/bot/src/index.ts', 'export const botVersion = 1;\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'apps'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=test@localhost', 'commit', '-qm', 'start'], { cwd: root });
  return { root, store, dir, write, read: path => readFileSync(join(root, path), 'utf8') };
}

test('reconciling old diff and content-addressed ZIP STAGED payload does not execute installers', async () => {
  const f = fixture();
  try {
    f.write('apps/api/src/index.ts', 'export const apiVersion = 2;\n');
    const diff = execFileSync('git', ['diff', '--', 'apps/api/src/index.ts'], { cwd: f.root, encoding: 'utf8' });
    assert.match(diff, /^diff --git/m);
    f.write('apps/api/src/index.ts', 'export const apiVersion = 1;\n');
    writeFileSync(join(f.dir, 'MMTRADE_R1.patch'), diff);

    const oldSource = 'export const botVersion = 1;\n';
    const newSource = 'export const botVersion = 2;\n';
    const plan = { entries: { BOT: {
      path: '/root/miniapp10x/apps/bot/src/index.ts', old_sha256: sum(oldSource), new_sha256: sum(newSource)
    } } };
    const archive = join(f.dir, 'MMTRADE_R2.zip');
    // This archive contains a fake executable installer; it must never be run.
    const python = "import sys,zipfile\np=sys.argv[1]\nwith zipfile.ZipFile(p,'w') as z:\n z.writestr('STAGED/plan.json',sys.argv[2])\n z.writestr('STAGED/BOT',sys.argv[3])\n z.writestr('install.py',\"open('/tmp/mmtrade-unsafe-test-marker','w').write('executed')\")\n";
    execFileSync('python3', ['-c', python, archive, JSON.stringify(plan), newSource]);

    const preview = await reconcileLegacyPatches({ root: f.root, store: f.store, workspace: f.root, apply: false });
    assert.equal(preview.convertible, 2);
    assert.equal(f.read('apps/api/src/index.ts'), 'export const apiVersion = 1;\n');
    assert.equal(f.read('apps/bot/src/index.ts'), oldSource);
    const converted = await reconcileLegacyPatches({ root: f.root, store: f.store, workspace: f.root, apply: true });
    assert.equal(converted.converted, 2);
    assert.equal(converted.requiresReview, 1); // installer.py recognized, not run.
    assert.equal(f.read('apps/api/src/index.ts'), 'export const apiVersion = 2;\n');
    assert.equal(f.read('apps/bot/src/index.ts'), newSource);
    assert.equal(existsSync('/tmp/mmtrade-unsafe-test-marker'), false);
    const again = await reconcileLegacyPatches({ root: f.root, store: f.store, workspace: f.root, apply: true });
    assert.equal(again.alreadyIntegrated, 2);
    assert.equal(again.converted, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('malicious or non-Git patch paths are excluded before applying', async () => {
  const f = fixture();
  try {
    const invalid = 'diff --git a/.git/config b/.git/config\n--- a/.git/config\n+++ b/.git/config\n@@ -1 +1 @@\n-safe\n-unsafe\n';
    writeFileSync(join(f.dir, 'P74_EVIL.patch'), invalid);
    const res = await reconcileLegacyPatches({ root: f.root, store: f.store, workspace: f.root, apply: true });
    assert.equal(res.converted, 0);
    assert.equal(res.unsupported, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
