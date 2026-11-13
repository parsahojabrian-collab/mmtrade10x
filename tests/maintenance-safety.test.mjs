import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const worker = resolve('scripts/mmtrade-maintenance-worker.mjs');
const id = '11111111-1111-4111-8111-111111111111';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mmtrade-maintenance-test-'));
  const write = (name, value) => {
    const path = join(root, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, value);
  };
  write('apps/api/public/admin.html', '<!-- MMTRADE_PATCH_V1 -->\n');
  write('apps/api/src/index.ts', "import { a } from './a.js';\nimport { a } from './a.js';\n");
  write('apps/bot/src/index.ts', "console.log('fixture');\n");
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'apps'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Fixture', 'commit', '-qm', 'fixture'], { cwd: root });
  const store = join(root, '.mmtrade-maintenance');
  const jobPath = join(store, 'jobs', id);
  mkdirSync(jobPath, { recursive: true });
  writeFileSync(join(jobPath, 'status.json'), JSON.stringify({ id }));
  return { root, store, jobPath, write };
}
function invoke(f, mode) {
  execFileSync(process.execPath, [worker, mode, id], { cwd: f.root, timeout: 15_000, env: {
    PATH: process.env.PATH, HOME: process.env.HOME || '/tmp', MM_MAINTENANCE_DIR: f.store
  } });
  return JSON.parse(readFileSync(join(f.jobPath, 'status.json'), 'utf8'));
}

test('isolated audit inventories patches without changing source', () => {
  const f = fixture();
  try {
    const before = readFileSync(join(f.root, 'apps/api/src/index.ts'), 'utf8');
    const result = invoke(f, 'audit');
    assert.equal(result.state, 'validation_failed'); // No dependencies installed in fixture.
    assert.equal(result.report.markerCount, 1);
    assert.equal(result.patchAvailable, false);
    assert.equal(readFileSync(join(f.root, 'apps/api/src/index.ts'), 'utf8'), before);
    assert.equal(existsSync(join(f.store, 'worktrees', id)), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('integration snapshots uncommitted tracked code without modifying production', () => {
  const f = fixture();
  try {
    f.write('apps/api/src/index.ts', '// uncommitted change\n');
    const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim();
    const result = invoke(f, 'integrate');
    assert.equal(result.state, 'validation_failed'); // No dependencies installed in fixture.
    assert.equal(result.report.productionHasUncommittedTrackedChanges, true);
    assert.notEqual(result.report.baselineCommit, beforeHead);
    assert.equal(result.patchAvailable, false);
    assert.equal(readFileSync(join(f.root, 'apps/api/src/index.ts'), 'utf8'), '// uncommitted change\n');
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim(), beforeHead);
    assert.equal(existsSync(join(f.store, 'worktrees', id)), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('dirty trailing whitespace and a new maintenance module survive private snapshot', () => {
  const f = fixture();
  try {
    f.write('apps/api/src/index.ts', "const trailingWhitespace = true;  \n");
    f.write('apps/api/src/maintenance-routes.ts', "export const maintenanceReady = true;\n");
    const original = readFileSync(join(f.root, 'apps/api/src/index.ts'), 'utf8');
    const state = invoke(f, 'audit');
    assert.equal(state.state, 'validation_failed'); // Fixture has no dependencies.
    assert.equal(state.report.productionHasUncommittedTrackedChanges, true);
    assert.match(state.notes.join('\n'), /Worktree/);
    const snap = state.report.baselineCommit;
    assert.equal(execFileSync('git', ['show', snap + ':apps/api/src/index.ts'], {
      cwd: f.root, encoding: 'utf8'
    }), original);
    assert.equal(execFileSync('git', ['show', snap + ':apps/api/src/maintenance-routes.ts'], {
      cwd: f.root, encoding: 'utf8'
    }), "export const maintenanceReady = true;\n");
    assert.equal(readFileSync(join(f.root, 'apps/api/src/index.ts'), 'utf8'), original);
    assert.equal(existsSync(join(f.store, 'worktrees', id)), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
