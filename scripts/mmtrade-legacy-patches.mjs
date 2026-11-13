/**
 * Deterministic, non-executing legacy patch converter.
 *
 * Accepts Git-style .patch/.diff files and such files inside ZIPs. Also accepts
 * content-addressed STAGED/plan.json snapshots when BOTH hashes and the exact
 * replacement bytes are present in the archive. Python/Bash installers are
 * inventoried but NEVER executed. All changes are made in a disposable worktree.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';

const MAX_SOURCE_FILES = 80;
const MAX_TOTAL_SOURCE_BYTES = 90 * 1024 * 1024;
const MAX_ARCHIVE = 24 * 1024 * 1024;
const MAX_PATCH = 2 * 1024 * 1024;
const VALID_NAME = /^[A-Za-z0-9_.\/-]+$/;
const SUPPORTED = /\.(?:ts|tsx|js|mjs|cjs|html|css|json|md|svg)$/i;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function normalizePath(value) {
  if (typeof value !== 'string' || !value) return null;
  let path = value.replace(/\\/g, '/');
  // Historical installer plans refer to the installed project by absolute path.
  const prefix = '/root/miniapp10x/';
  if (path.startsWith(prefix)) path = path.slice(prefix.length);
  if (!VALID_NAME.test(path) || path.length > 250 || isAbsolute(path)) return null;
  const parts = path.split('/');
  if (parts.includes('..') || parts.includes('.') || parts.includes('') || parts.some(x => x.startsWith('.'))) return null;
  if (!/^(?:apps|packages|public|docs)\//.test(path)) return null;
  if (!SUPPORTED.test(path) || /(?:^|\/)(?:node_modules|dist|coverage|uploads|backups)(?:\/|$)/.test(path)) return null;
  if (/(?:^|\/)(?:\.env|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)/.test(path)) return null;
  return path;
}
function affectedPaths(patch) {
  if (typeof patch !== 'string' || !patch || Buffer.byteLength(patch) > MAX_PATCH) return null;
  if (/\b(?:GIT binary patch|Binary files .* differ)\b/.test(patch)) return null;
  const matches = [...patch.matchAll(/^diff --git a\/([^\r\n]+) b\/([^\r\n]+)\s*$/gm)];
  if (!matches.length || matches.length > 80) return null;
  const paths = [];
  for (const match of matches) {
    const from = normalizePath(match[1]), to = normalizePath(match[2]);
    if (!from || !to || from !== to) return null;
    if (!paths.includes(to)) paths.push(to);
  }
  return paths;
}
function execute(command, args, cwd, timeout = 20000, limit = 9 * 1024 * 1024) {
  return new Promise(resolveResult => {
    let stdout = '', stderr = '', oversized = false, timedOut = false;
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: {
      PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp',
      LANG: 'C.UTF-8', CI: '1'
    } });
    function append(stream, chunk) {
      const value = String(chunk);
      if (stream === 'out') {
        if (stdout.length + value.length > limit) oversized = true;
        stdout += value.slice(0, Math.max(0, limit - stdout.length));
      } else stderr += value.slice(0, Math.max(0, 2000 - stderr.length));
      if (oversized) child.kill('SIGTERM');
    }
    child.stdout.on('data', c => append('out', c));
    child.stderr.on('data', c => append('err', c));
    child.on('error', e => { stderr = String(e.message); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    child.on('close', code => { clearTimeout(timer); resolveResult({ ok: code === 0 && !oversized && !timedOut, stdout, stderr, code, oversized, timedOut }); });
  });
}
function resultLine(source, kind, state, detail = '', paths = []) {
  return { source: String(source).slice(0, 150), kind, state, detail: String(detail).slice(0, 190), paths: paths.slice(0, 12) };
}

async function collectSources(root, store) {
  const directories = [{ dir: join(store, 'legacy-input'), permissive: true }];
  // Server archives from the original MMTrade installations live in /root.
  if (resolve(root).startsWith('/root/')) directories.push({ dir: '/root', permissive: false });
  const sources = [];
  let bytes = 0, truncated = false;
  for (const { dir, permissive } of directories) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile()) continue; // No symlinks or recursive traversal.
      const filename = entry.name;
      const trustedName = /^(?:MMTRADE|MMVS|TENX|P[0-9]+|R[0-9]+|10X|Q[0-9]+)[A-Za-z0-9_.-]*\.(?:zip|patch|diff|py|sh)$/i.test(filename);
      if (!permissive && !trustedName) continue;
      if (!/\.(?:zip|patch|diff|py|sh)$/i.test(filename)) continue;
      const full = join(dir, filename);
      let metadata;
      try { metadata = await lstat(full); } catch { continue; }
      if (!metadata.isFile() || metadata.size > MAX_ARCHIVE || metadata.size <= 0) { truncated = true; continue; }
      sources.push({ full, name: filename, bytes: metadata.size, modified: metadata.mtimeMs });
    }
  }
  sources.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
  const selected = [];
  for (const source of sources) {
    if (selected.length >= MAX_SOURCE_FILES || bytes + source.bytes > MAX_TOTAL_SOURCE_BYTES) { truncated = true; continue; }
    bytes += source.bytes;
    selected.push(source);
  }
  return { sources: selected, truncated, bytes };
}

async function readArchive(root, source) {
  const scanner = join(root, 'scripts', 'mmtrade-legacy-zip-scan.py');
  const read = await execute('python3', ['-I', scanner, source.full], root, 18000);
  if (!read.ok) return { error: ('zip_scanner_failed: ' + read.stderr).slice(0, 130) };
  try { return JSON.parse(read.stdout); }
  catch { return { error: 'invalid_zip_scanner_output' }; }
}
async function prepareCandidates(root, store) {
  const selection = await collectSources(root, store);
  const candidates = [], metadata = [], fingerprints = new Set();
  for (const source of selection.sources) {
    const ext = source.name.split('.').pop().toLowerCase();
    if (ext === 'sh' || ext === 'py') {
      metadata.push(resultLine(source.name, 'installer', 'requires_review', 'اسکریپت نصب فقط شناسایی شد و اجرا نمی‌شود.'));
      continue;
    }
    let parsed = { patches: [], snapshots: [], scripts: [], unmatched: [], warnings: [] };
    if (ext === 'patch' || ext === 'diff') {
      if (source.bytes > MAX_PATCH) {
        metadata.push(resultLine(source.name, 'patch', 'unsupported', 'patch_too_large'));
        continue;
      }
      try { parsed.patches = [{ member: basename(source.full), content: await readFile(source.full, 'utf8') }]; }
      catch { metadata.push(resultLine(source.name, 'patch', 'unsupported', 'read_error')); continue; }
    } else {
      parsed = await readArchive(root, source);
      if (parsed.error) { metadata.push(resultLine(source.name, 'archive', 'unsupported', parsed.error)); continue; }
      if (parsed.scripts?.length) metadata.push(resultLine(source.name, 'installer', 'requires_review',
        'installer scripts present: ' + parsed.scripts.slice(0, 3).join(', ')));
      if (parsed.unmatched?.length) metadata.push(resultLine(source.name, 'snapshot', 'requires_review',
        parsed.unmatched.length + ' staged manifest entries have no content-addressed payload'));
      if (parsed.warnings?.length) metadata.push(resultLine(source.name, 'archive', 'requires_review',
        parsed.warnings.slice(0, 3).join(', ')));
    }
    let discovered = 0;
    for (const file of parsed.patches || []) {
      const affected = affectedPaths(file.content);
      if (!affected) {
        metadata.push(resultLine(source.name, 'patch', 'unsupported', 'invalid_or_unsafe_diff: ' + String(file.member).slice(0, 100)));
        continue;
      }
      const fingerprint = 'patch:' + sha256(file.content);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      candidates.push({ kind: 'patch', source: source.name + '/' + file.member, patch: file.content, paths: affected });
      discovered++;
    }
    for (const snapshot of parsed.snapshots || []) {
      const path = normalizePath(snapshot.path);
      if (!path || !/^[0-9a-f]{64}$/.test(snapshot.oldSha) || !/^[0-9a-f]{64}$/.test(snapshot.newSha)
        || sha256(snapshot.content) !== snapshot.newSha || Buffer.byteLength(snapshot.content) > MAX_PATCH) {
        metadata.push(resultLine(source.name, 'snapshot', 'unsupported', 'unsafe_or_invalid_snapshot: ' + String(snapshot.entry).slice(0, 100)));
        continue;
      }
      const fingerprint = 'snapshot:' + path + ':' + snapshot.oldSha + ':' + snapshot.newSha;
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      candidates.push({ kind: 'snapshot', source: source.name + '/' + snapshot.entry,
        path, paths: [path], oldSha: snapshot.oldSha, newSha: snapshot.newSha, content: snapshot.content });
      discovered++;
    }
    if (!discovered && !parsed.scripts?.length && !parsed.unmatched?.length) {
      metadata.push(resultLine(source.name, 'archive', 'requires_review', 'No supported Git diff or verified staged snapshot found'));
    }
  }
  return { candidates, metadata, selection };
}

async function assessPatch(candidate, workspace, apply) {
  const paths = candidate.paths;
  const backwards = await execute('git', ['apply', '--reverse', '--check', '--', candidateFileName(candidate)], workspace);
  if (backwards.ok) return 'already_integrated';
  const forwards = await execute('git', ['apply', '--check', '--whitespace=error', '--', candidateFileName(candidate)], workspace);
  if (!forwards.ok) return 'conflict';
  if (!apply) return 'convertible';
  const applied = await execute('git', ['apply', '--whitespace=error', '--', candidateFileName(candidate)], workspace);
  if (!applied.ok) return 'conflict';
  // Intent-to-add makes new files visible in git diff, without committing them.
  for (const path of paths) {
    const tracked = await execute('git', ['ls-files', '--error-unmatch', '--', path], workspace);
    if (!tracked.ok) await execute('git', ['add', '-N', '--', path], workspace);
  }
  return 'converted';
}

function candidateFileName(candidate) { return candidate.tmpFile; }
async function assessSnapshot(candidate, workspace, apply) {
  const target = join(workspace, candidate.path);
  let canonical;
  try { canonical = await realpath(target); } catch { return 'conflict'; }
  if (!canonical.startsWith(resolve(workspace) + sep)) return 'unsupported';
  let original;
  try { original = await readFile(canonical); } catch { return 'conflict'; }
  const hash = sha256(original);
  if (hash === candidate.newSha) return 'already_integrated';
  if (hash !== candidate.oldSha) return 'conflict';
  if (!apply) return 'convertible';
  await writeFile(canonical, candidate.content);
  return 'converted';
}

/** @param {{root:string,store:string,workspace:string,apply:boolean}} config */
export async function reconcileLegacyPatches(config) {
  const { root, store, workspace, apply } = config;
  const { candidates, metadata, selection } = await prepareCandidates(root, store);
  const results = [...metadata], pending = [...candidates];
  // Only plaintext diffs are stored in the disposable worktree; never execute archives/installers.
  const temporary = join(workspace, '.mmtrade-legacy-temporary');
  // Worktrees are disposable and this temporary folder is removed in finally.
  await import('node:fs/promises').then(fs => fs.mkdir(temporary, { recursive: true }));
  try {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.kind === 'patch') {
        const path = join(temporary, i + '.patch');
        await writeFile(path, candidate.patch, { mode: 0o600 });
        candidate.tmpFile = path;
      }
    }
    // Snapshot chains may require multiple passes (R1 -> R2 -> R8).
    for (let pass = 0; pass < Math.min(8, candidates.length + 1) && pending.length; pass++) {
      let progressed = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const candidate = pending[i];
        const outcome = candidate.kind === 'patch'
          ? await assessPatch(candidate, workspace, apply)
          : await assessSnapshot(candidate, workspace, apply);
        if (outcome === 'conflict') continue;
        pending.splice(i, 1);
        results.push(resultLine(candidate.source, candidate.kind, outcome, '', candidate.paths));
        if (outcome === 'converted') progressed = true;
      }
      if (!progressed) break;
    }
    for (const item of pending) results.push(resultLine(item.source, item.kind, 'conflict',
      'Current source differs from both patch base and expected replacement', item.paths));
  } finally {
    await import('node:fs/promises').then(fs => fs.rm(temporary, { recursive: true, force: true }));
  }
  const count = state => results.filter(row => row.state === state).length;
  return {
    scannedSources: selection.sources.length, scannedBytes: selection.bytes,
    truncated: selection.truncated, candidateCount: candidates.length,
    converted: count('converted'), convertible: count('convertible'),
    alreadyIntegrated: count('already_integrated'), conflicts: count('conflict'),
    requiresReview: count('requires_review'), unsupported: count('unsupported'),
    // Summaries only: never send original patch contents to the web frontend.
    entries: results.slice(0, 150)
  };
}
