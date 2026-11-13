/** MMTrade10X maintenance worker: all transformations happen in a disposable Git worktree. */
import { readFile, writeFile, mkdir, rm, symlink, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = process.cwd();
const base = resolve(process.env.MM_MAINTENANCE_DIR || join(root, '.mmtrade-maintenance'));
const [mode, id] = process.argv.slice(2);
const allowed = new Set(['audit', 'integrate', 'optimize']);
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
      LANG: 'C.UTF-8', CI: '1', npm_config_audit: 'false', npm_config_fund: 'false'
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
  if (productionDirty && mode !== 'audit') {
    await save({ state: 'blocked', finishedAt: now(), report: { reason: 'dirty_production_tree' } });
    return;
  }
  const added = await run('git', ['worktree', 'add', '--detach', workspace, 'HEAD'], root, 90_000);
  if (!added.ok) throw Error('Could not create isolated worktree: ' + added.output.slice(-800));
  createdWorktree = true;
  const baseline = await run('git', ['rev-parse', 'HEAD'], workspace);
  const report = await inspect();
  report.baselineCommit = baseline.output.trim();
  report.productionHasUncommittedTrackedChanges = productionDirty;

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
    tests = await run('npm', ['test'], workspace, 180_000);
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
