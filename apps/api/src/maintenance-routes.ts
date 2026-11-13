import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type OwnerGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
type JobMode = 'audit' | 'integrate' | 'optimize' | 'legacy';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = new Set<JobMode>(['audit', 'integrate', 'optimize', 'legacy']);
const root = process.cwd();
const store = join(root, '.mmtrade-maintenance');
const jobsDir = join(store, 'jobs');
const lockDir = join(store, 'active');
const workerFile = join(root, 'scripts', 'mmtrade-maintenance-worker.mjs');

async function getJob(id: string): Promise<any | null> {
  if (!ID.test(id)) return null;
  try {
    const raw = await readFile(join(jobsDir, id, 'status.json'), 'utf8');
    if (raw.length > 100_000) return null;
    const value = JSON.parse(raw);
    return value && value.id === id ? value : null;
  } catch { return null; }
}
async function activeJob(): Promise<any | null> {
  try {
    const id = (await readFile(join(lockDir, 'job-id'), 'utf8')).trim();
    return await getJob(id) ?? { id, state: 'preparing' };
  } catch { return null; }
}
async function acquireLock(): Promise<boolean> {
  try { await mkdir(lockDir); return true; }
  catch (error: any) {
    if (error?.code !== 'EEXIST') throw error;
    const age = Date.now() - (await stat(lockDir)).mtimeMs;
    if (age < 6 * 60 * 60 * 1000) return false;
    try {
      const pid = Number((await readFile(join(lockDir, 'pid'), 'utf8')).trim());
      if (Number.isSafeInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); return false; }
        catch (e: any) { if (e?.code !== 'ESRCH') return false; }
      }
      await rm(lockDir, { recursive: true, force: true });
      await mkdir(lockDir);
      return true;
    } catch { return false; }
  }
}

export function registerMaintenanceRoutes(app: FastifyInstance, ownerGuard: OwnerGuard): void {
  const permitted = async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    if (!(await ownerGuard(request, reply))) return false;
    // Legacy shared admin tokens cannot start code-running maintenance jobs.
    const identity = (request as any).admin;
    if (!identity || identity.role !== 'SUPER_ADMIN' || !identity.id || identity.legacy) {
      reply.code(403).send({ error: 'named_superadmin_required' });
      return false;
    }
    return true;
  };

  app.get('/admin/maintenance/status', async (request, reply) => {
    if (!(await permitted(request, reply))) return;
    let dirs: string[] = [];
    try { dirs = (await readdir(jobsDir)).filter(x => ID.test(x)); } catch { /* empty */ }
    const jobs = (await Promise.all(dirs.slice(-30).map(getJob))).filter(Boolean);
    jobs.sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { active: await activeJob(), jobs: jobs.slice(0, 15), modes: [...MODES] };
  });

  app.get('/admin/maintenance/jobs/:id', async (request, reply) => {
    if (!(await permitted(request, reply))) return;
    const id = String((request.params as any)?.id ?? '');
    const job = await getJob(id);
    if (!job) return reply.code(404).send({ error: 'job_not_found' });
    return job;
  });

  app.get('/admin/maintenance/jobs/:id/patch', async (request, reply) => {
    if (!(await permitted(request, reply))) return;
    const id = String((request.params as any)?.id ?? '');
    const job = await getJob(id);
    if (!job || !job.patchAvailable || !ID.test(id)) return reply.code(404).send({ error: 'patch_not_available' });
    const patch = await readFile(join(jobsDir, id, 'changes.patch'), 'utf8');
    if (patch.length > 500_000) return reply.code(413).send({ error: 'patch_too_large' });
    reply.header('content-type', 'text/plain; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="mmtrade-' + id + '.patch"');
    reply.header('cache-control', 'no-store');
    return reply.send(patch);
  });

  app.post('/admin/maintenance/jobs', async (request, reply) => {
    if (!(await permitted(request, reply))) return;
    const body = request.body as { mode?: unknown } | null;
    const mode = body?.mode;
    if (typeof mode !== 'string' || !MODES.has(mode as JobMode) || !body || Object.keys(body).length !== 1) {
      return reply.code(400).send({ error: 'invalid_mode' });
    }
    await mkdir(jobsDir, { recursive: true, mode: 0o700 });
    if (!(await acquireLock())) return reply.code(409).send({ error: 'job_already_running', active: await activeJob() });
    const id = randomUUID();
    try {
      const path = join(jobsDir, id);
      await mkdir(path, { mode: 0o700 });
      const job = { id, mode, state: 'queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: ['Job queued; production remains untouched.'], patchAvailable: false };
      await writeFile(join(path, 'status.json'), JSON.stringify(job, null, 2), { mode: 0o600 });
      await writeFile(join(lockDir, 'job-id'), id, { mode: 0o600 });
      const child = spawn(process.execPath, [workerFile, mode, id], {
        cwd: root, detached: true, stdio: 'ignore',
        env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp', LANG: 'C.UTF-8', CI: '1', MM_MAINTENANCE_DIR: store }
      });
      if (!child.pid) throw new Error('worker_not_started');
      await writeFile(join(lockDir, 'pid'), String(child.pid), { mode: 0o600 });
      child.unref();
      return reply.code(202).send({ id, mode, state: 'queued' });
    } catch (error: any) {
      await rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
      request.log.error({ err: error }, 'maintenance worker failed to start');
      return reply.code(500).send({ error: 'worker_start_failed' });
    }
  });
}
