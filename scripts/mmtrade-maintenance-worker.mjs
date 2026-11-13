/** MMTrade10X maintenance worker: all transformations happen in a disposable Git worktree. */
import { readFile, writeFile, mkdir, rm, symlink, stat, readdir, copyFile, lstat, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve, dirname, sep } from 'node:path';
import { reconcileLegacyPatches } from './mmtrade-legacy-patches.mjs';

const root = process.cwd();
const base = resolve(process.env.MM_MAINTENANCE_DIR || join(root, '.mmtrade-maintenance'));
const [mode, id] = process.argv.slice(2);
const allowed = new Set(['audit', 'integrate', 'optimize', 'legacy']);
if (!allowed.has(mode) || !/^[0-9a-f-]{36}$/.test(id || '')) process.exit(64);
const jobDir = join(base, 'jobs', id);
const statusFile = join(jobDir, 'status.json');
const workspace = join(base, 'worktrees', id);
const notes = [];
let state = { id, mode, state: 'queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes, patchAvailable: false };
let createdWorktree = false;
const now = () => new Date().toISOString();
async function save(fields = {}) {
  state = { ...state, ...fields, updatedAt: now(), notes: [...notes] };
  await writeFile(statusFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}
function run(cmd, args, cwd = root, timeoutMs = 120_000, maxChars = 20_000) {
  return new Promise(resolveJob => {
    const child = spawn(cmd, args, { cwd, env: {
      PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp',
      LANG: 'C.UTF-8', CI: '1', NODE_OPTIONS: '--max-old-space-size=640', npm_config_audit: 'false', npm_config_fund: 'false'
    }, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let truncated = false;
    const append = chunk => {
      if (output.length >= maxChars) { truncated = true; return; }
      const data = String(chunk);
      if (data.length > maxChars - output.length) truncated = true;
      output += data.slice(0, maxChars - output.length);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); }
      catch { child.kill('SIGTERM'); }
    }, timeoutMs);
    child.on('error', err => append(err.message));
    child.on('close', code => {
      clearTimeout(timer);
      resolveJob({ ok: code === 0 && !timedOut, exitCode: code, timedOut, output, truncated });
    });
  });
}

const paths = ['apps/api/public/admin.html', 'apps/api/src/index.ts', 'apps/bot/src/index.ts'];
const inventoryPath = 'docs/maintenance/patch-inventory.json';
const markerRx = /\b(?:MMTRADE|MMVS|TENX|P[0-9]{2})[_-][A-Z][A-Z0-9_-]{3,}/g;
async function inspect() {
  const files = [];
  const markers = new Map();
  for (const path of paths) {
    const content = await readFile(join(workspace, path), 'utf8');
    const matches = content.match(markerRx) || [];
    for (const marker of matches) {
      const entry = markers.get(marker) || { marker, occurrences: 0, files: [] };
      entry.occurrences += 1;
      if (!entry.files.includes(path)) entry.files.push(path);
      markers.set(marker, entry);
    }
    files.push({ file: path, lines: content.split('\n').length, bytes: Buffer.byteLength(content), patchMarkerOccurrences: matches.length });
  }
  return {
    files, markerCount: markers.size,
    repeatedMarkers: [...markers.values()].filter(x => x.occurrences > 1).sort((a, b) => b.occurrences - a.occurrences).slice(0, 100),
    markerInventory: [...markers.values()].sort((a, b) => a.marker.localeCompare(b.marker)).slice(0, 2500)
  };
}
async function dedupExactImports() {
  let modifiedFiles = 0, exactDuplicateImportsRemoved = 0;
  for (const path of ['apps/api/src/index.ts', 'apps/bot/src/index.ts']) {
    const before = await readFile(join(workspace, path), 'utf8');
    const seen = new Set(), nextLines = [];
    let inHeader = true;
    for (const line of before.split('\n')) {
      if (inHeader && /^\s*import\s.+;\s*$/.test(line)) {
        const key = line.trim();
        if (seen.has(key)) { exactDuplicateImportsRemoved++; continue; }
        seen.add(key);
      } else if (inHeader && /^\s*(?:\/\/.*|\/\*.*|\*.*|\*\/|)$/.test(line)) {
        // Comments and blank lines do not end the import header.
      } else inHeader = false;
      nextLines.push(line);
    }
    const after = nextLines.join('\n');
    if (after !== before) { await writeFile(join(workspace, path), after); modifiedFiles++; }
  }
  return { modifiedFiles, exactDuplicateImportsRemoved };
}

async function main() {
  await save({ state: 'running', startedAt: now() });
  await mkdir(join(base, 'worktrees'), { recursive: true, mode: 0o700 });
  const repo = await run('git', ['rev-parse', '--show-toplevel']);
  if (!repo.ok || resolve(repo.output.trim()) !== resolve(root)) throw Error('Git root differs from API service working directory.');
  const dirty = await run('git', ['status', '--porcelain', '--untracked-files=no']);
  if (!dirty.ok) throw Error('Unable to verify repository status.');
  const productionDirty = dirty.output.trim().length > 0;
  if (productionDirty) notes.push('تغییرات ثبت‌نشده روی سرور شناسایی شد؛ این تغییرات داخل HEAD نیستند.');
  const added = await run('git', ['worktree', 'add', '--detach', workspace, 'HEAD'], root, 90_000);
  if (!added.ok) throw Error('Could not create isolated worktree: ' + added.output.slice(-800));
  createdWorktree = true;

  // Preserve live edits byte-for-byte. git apply --index can reject dirty patches
  // under aggressive whitespace rules, even if the production sources are valid.
  // Only tracked changes and named maintenance companions enter the worktree.
  const changes = await run('git', ['diff', 'HEAD', '--name-only', '-z', '--', '.'], root, 45_000, 2 * 1024 * 1024);
  if (!changes.ok || changes.truncated) throw Error('cannot_enumerate_tracked_live_changes');
  const changedPaths = changes.output.split(String.fromCharCode(0)).filter(Boolean);
  if (changedPaths.length > 2000) throw Error('too_many_tracked_live_changes');
  const companions = [
    'apps/api/src/maintenance-routes.ts',
    'scripts/mmtrade-maintenance-worker.mjs',
    'scripts/mmtrade-legacy-patches.mjs',
    'scripts/mmtrade-legacy-zip-scan.py',
    'tests/maintenance-safety.test.mjs',
    'tests/maintenance-legacy.test.mjs'
  ];
  let importedBytes = 0;
  async function mirrorLivePath(path, optional = false) {
    if (!path || path.startsWith('/') || path.includes('\\') ||
        path.split('/').some(x => !x || x === '..' || x === '.' || x === '.git') ||
        path === 'node_modules' || path.startsWith('node_modules/') ||
        path === '.mmtrade-maintenance' || path.startsWith('.mmtrade-maintenance/')) {
      throw Error('unsafe_live_source_path');
    }
    const source = join(root, path), destination = join(workspace, path);
    let info;
    try { info = await lstat(source); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      if (!optional) await rm(destination, { force: true });
      return false;
    }
    if (!info.isFile()) throw Error('nonregular_live_source: ' + path);
    importedBytes += info.size;
    if (importedBytes > 90 * 1024 * 1024) throw Error('live_source_snapshot_too_large');
    const resolvedSource = await realpath(source);
    if (!resolvedSource.startsWith(root + sep)) throw Error('source_outside_repository: ' + path);
    await mkdir(dirname(destination), { recursive: true });
    const resolvedDir = await realpath(dirname(destination));
    if (resolvedDir !== workspace && !resolvedDir.startsWith(workspace + sep)) {
      throw Error('destination_outside_worktree: ' + path);
    }
    await copyFile(source, destination);
    return true;
  }
  for (const path of changedPaths) await mirrorLivePath(path);
  const stagedCompanions = [];
  for (const path of companions) {
    if (await mirrorLivePath(path, true)) stagedCompanions.push(path);
  }
  const stageTracked = await run('git', ['add', '-u'], workspace, 45_000);
  if (!stageTracked.ok) throw Error('cannot_stage_tracked_snapshot: ' + stageTracked.output.slice(-400));
  if (stagedCompanions.length) {
    const stageCompanions = await run('git', ['add', '--', ...stagedCompanions], workspace, 45_000);
    if (!stageCompanions.ok) throw Error('cannot_stage_companion_snapshot: ' + stageCompanions.output.slice(-400));
  }
  const staged = await run('git', ['diff', '--cached', '--quiet'], workspace, 45_000);
  if (staged.exitCode === 1) {
    const snapshot = await run('git', [
      '-c', 'user.name=MMTrade Maintenance', '-c', 'user.email=maintenance@localhost',
      '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      'commit', '--quiet', '-m', 'private temporary live-source snapshot'
    ], workspace, 45_000);
    if (!snapshot.ok) throw Error('cannot_commit_private_source_snapshot: ' + snapshot.output.slice(-600));
  } else if (!staged.ok) {
    throw Error('cannot_check_private_snapshot');
  }
  notes.push('اسنپ‌شات ایمن: ' + changedPaths.length + ' مسیر tracked و ' + stagedCompanions.length + ' فایل مجاز در Worktree موقت ثبت شد.');
  if (productionDirty) notes.push('تغییرات عملیاتی سرور دست‌نخورده باقی ماندند؛ سایر فایل‌های untracked کپی نمی‌شوند.');
  const baseline = await run('git', ['rev-parse', 'HEAD'], workspace);
  const report = await inspect();
  report.baselineCommit = baseline.output.trim();
  report.productionHasUncommittedTrackedChanges = productionDirty;
  // Old installers are never run. Reconciliation happens only in the detached worktree.
  if (mode === 'audit' || mode === 'integrate' || mode === 'legacy') {
    report.legacy = await reconcileLegacyPatches({ root, store: base, workspace, apply: mode !== 'audit' });
    if (report.legacy.truncated) notes.push('فهرست آرشیوهای قدیمی به سقف ایمنی رسید و بخشی از فایل‌ها بررسی نشدند.');
    if (report.legacy.conflicts || report.legacy.requiresReview || report.legacy.unsupported) {
      notes.push('برخی پچ‌های قدیمی به بررسی انسانی نیاز دارند؛ اجرای نصب‌کننده‌ها مجاز نیست.');
    }
  }

  if (mode !== 'audit') {
    report.safeTransformations = await dedupExactImports();
    if (mode === 'integrate') {
      await mkdir(join(workspace, 'docs', 'maintenance'), { recursive: true });
      await writeFile(join(workspace, inventoryPath),
        JSON.stringify({ version: 1, generatedAt: now(), baselineCommit: report.baselineCommit, files: report.files, patchMarkers: report.markerInventory }, null, 2) + '\n');
      notes.push('فهرست مرکزی پچ‌ها تولید شد؛ پچ‌های دارای رفتار متفاوت بدون بازبینی ادغام نمی‌شوند.');
      await run('git', ['add', '-N', '--', inventoryPath], workspace);
    }
    if (mode === 'optimize') notes.push('تنها حذف importهای دقیقاً یکسان انجام می‌شود؛ بهینه‌سازی رفتاری بدون تست مجاز نیست.');
  }
  delete report.markerInventory;
  const hasDeps = await stat(join(root, 'node_modules')).then(s => s.isDirectory(), () => false);
  let build = { ok: false, skipped: true, reason: 'node_modules_missing' };
  let tests = { ok: false, skipped: true, reason: 'node_modules_missing' };
  if (hasDeps) {
    await symlink(join(root, 'node_modules'), join(workspace, 'node_modules'), 'dir');
    build = await run('npm', ['run', 'build'], workspace, 180_000);
    // Serial test execution avoids 17+ parallel Node workers on the small production VPS.
    const testFiles = (await readdir(join(workspace, 'tests'))).filter(x => x.endsWith('.test.mjs')).sort().map(x => join('tests', x));
    tests = testFiles.length ? await run(process.execPath, ['--experimental-strip-types', '--test', '--test-concurrency=1', ...testFiles], workspace, 180_000) : { ok: false, skipped: true, reason: 'no_tests' };
  } else notes.push('وابستگی‌های Node نصب نیستند؛ build و test اجرا نشدند.');
  const diffCheck = await run('git', ['diff', '--check'], workspace);
  const files = await run('git', ['diff', '--name-only'], workspace);
  const diff = await run('git', ['diff', '--binary'], workspace, 30_000, 500_000);
  let patchAvailable = false;
  const validationPassed = build.ok && tests.ok && diffCheck.ok;
  if (mode !== 'audit' && diff.ok && !diff.truncated && diff.output.length && validationPassed) {
    await writeFile(join(jobDir, 'changes.patch'), diff.output, { mode: 0o600 });
    patchAvailable = true;
  }
  if (!validationPassed) notes.push('تا پیش از پاس شدن build و test، خروجی قابل اعمال تولید نمی‌شود.');
  if (mode === 'legacy' && report.legacy && report.legacy.candidateCount === 0) {
    notes.push('پچ قدیمیِ قابل تبدیل یافت نشد؛ فایل‌ها را در پوشه legacy-input قرار بده یا آرشیوهای سرور را بررسی کن.');
  }
  await save({
    state: validationPassed ? (patchAvailable ? 'needs_review' : 'passed') : 'validation_failed',
    finishedAt: now(), report,
    validation: { build: { ...build, output: build.output?.slice(-3000) }, tests: { ...tests, output: tests.output?.slice(-3000) }, diffCheck },
    changedFiles: files.output.trim().split('\n').filter(Boolean), patchAvailable
  });
}
try { await main(); }
catch (error) {
  notes.push('عملیات شکست خورد و سورس عملیاتی تغییر نکرد.');
  await save({ state: 'failed', finishedAt: now(), error: String(error?.message || error).slice(0, 800) }).catch(() => undefined);
}
finally {
  if (createdWorktree) await run('git', ['worktree', 'remove', '--force', workspace], root, 90_000);
  await rm(join(base, 'active'), { force: true, recursive: true }).catch(() => undefined);
}
