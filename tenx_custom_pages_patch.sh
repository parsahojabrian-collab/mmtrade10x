#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${TENX_ROOT:-/root/miniapp10x}"
cd "$ROOT"

if [[ ! -f apps/api/src/index.ts || ! -f apps/api/public/admin.html || ! -f public/miniapp/blocks.js ]]; then
  echo "ERROR: project files not found under $ROOT" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/custom-pages-manager-$TS"
mkdir -p "$BACKUP"
cp -a apps/api/src/index.ts "$BACKUP/index.ts"
cp -a apps/api/public/admin.html "$BACKUP/admin.html"
cp -a public/miniapp/blocks.js "$BACKUP/blocks.js"
if [[ -f .gitignore ]]; then cp -a .gitignore "$BACKUP/gitignore"; fi

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
api_path = root / 'apps/api/src/index.ts'
admin_path = root / 'apps/api/public/admin.html'
blocks_path = root / 'public/miniapp/blocks.js'
gitignore_path = root / '.gitignore'
api = api_path.read_text()
admin = admin_path.read_text()
blocks = blocks_path.read_text()


def once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'PATCH STOP: expected exactly one {label}; found {count}. No source files were written by this patch stage.')
    return source.replace(old, new, 1)

# ---------- API imports ----------
if (root / 'public/miniapp/custom.html').exists():
    raise SystemExit('PATCH STOP: public/miniapp/custom.html already exists; refusing to overwrite it.')

api = once(
    api,
    "import { join } from 'node:path';",
    "import { join } from 'node:path';\nimport { chmod as customFsChmod, mkdir as customFsMkdir, readFile as customFsReadFile, readdir as customFsReaddir, writeFile as customFsWriteFile } from 'node:fs/promises';\nimport { randomUUID as customPageRandomUUID } from 'node:crypto';",
    'API path import'
)

# ---------- Registry helpers (existing SystemSetting; no schema migration) ----------
marker = "const PAGE_SLUGS = ['index', 'academy', 'crypto', 'copy-trading', 'challenge', 'support', 'profile', 'mmtrade10x'] as const;"
registry_code = r'''

// TENX_CUSTOM_PAGES_V1: custom pages use existing ContentPage*, SystemSetting and ContentPageVersion tables.
// Public path is always /p/:publicSlug; built-in physical pages and their routes are not mutated.
const TENX_CUSTOM_PAGES_KEY = 'MM_CUSTOM_PAGES_V1';
type TenxCustomPageMeta = {
  slug: string;
  title: string;
  publicSlug: string;
  aliases: string[];
  sourceSlug: string | null;
  createdAt: string;
  updatedAt: string;
};
const tenxCustomSlugOk = (v: any): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,59}$/.test(v);
const tenxCustomPublicSlugOk = (v: any): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,47}$/.test(v) && !(PAGE_SLUGS as readonly string[]).includes(v);
const tenxCustomSlugSchema = z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]{1,59}$/);
const tenxCustomPublicSlugSchema = z.string().trim().min(2).max(48).regex(/^[a-z0-9][a-z0-9-]{1,47}$/).refine(v => !(PAGE_SLUGS as readonly string[]).includes(v), 'reserved_public_slug');
const tenxCustomBackupDir = () => join(process.cwd(), 'backups', 'deleted-pages');

async function tenxCustomPagesRead(db: any = prisma): Promise<TenxCustomPageMeta[]> {
  const row = await db.systemSetting.findUnique({ where: { key: TENX_CUSTOM_PAGES_KEY }, select: { value: true } });
  const raw: any = row?.value;
  const items = Array.isArray(raw?.pages) ? raw.pages : [];
  return items.filter((p: any) => p && tenxCustomSlugOk(p.slug) && tenxCustomPublicSlugOk(p.publicSlug))
    .filter((p: any) => !(PAGE_SLUGS as readonly string[]).includes(p.slug))
    .map((p: any) => ({
      slug: p.slug,
      title: typeof p.title === 'string' ? p.title : p.slug,
      publicSlug: p.publicSlug,
      aliases: Array.isArray(p.aliases) ? p.aliases.filter(tenxCustomPublicSlugOk).slice(-30) : [],
      sourceSlug: typeof p.sourceSlug === 'string' ? p.sourceSlug : null,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(0).toISOString(),
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date(0).toISOString()
    }));
}

async function tenxCustomPagesWrite(db: any, pages: TenxCustomPageMeta[]) {
  const value = { version: 1, pages } as Prisma.InputJsonValue;
  await db.systemSetting.upsert({
    where: { key: TENX_CUSTOM_PAGES_KEY },
    create: { key: TENX_CUSTOM_PAGES_KEY, value },
    update: { value }
  });
}

async function tenxCustomPageWriter(request: FastifyRequest, reply: FastifyReply, ownerOnly = false): Promise<boolean> {
  if (!(await adminGuard(request, reply))) return false;
  const role = (request as any).admin?.role;
  if (ownerOnly ? role !== 'SUPER_ADMIN' : !['SUPER_ADMIN', 'CONTENT_MANAGER'].includes(role)) {
    reply.code(403).send({ error: ownerOnly ? 'super_admin_required' : 'content_manager_required' });
    return false;
  }
  return true;
}

function tenxCustomBackupIdOk(v: any): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
'''
api = once(api, marker, marker + registry_code, 'PAGE_SLUGS declaration')

# ---------- Runtime public route; registered before fastifyStatic ----------
route_anchor = "await app.register(fastifyStatic, { root: join(process.cwd(), 'public'), prefix: '/' });"
custom_route = r'''// TENX_CUSTOM_PAGE_PUBLIC_ROUTE_V1
app.get('/p/:publicSlug', async (request, reply) => {
  const parsed = z.object({ publicSlug: tenxCustomPublicSlugSchema }).safeParse(request.params);
  if (!parsed.success) return reply.code(404).send({ error: 'page_not_found' });
  const pages = await tenxCustomPagesRead();
  const meta = pages.find(p => p.publicSlug === parsed.data.publicSlug || p.aliases.includes(parsed.data.publicSlug));
  if (!meta) return reply.code(404).send({ error: 'page_not_found' });
  if (meta.publicSlug !== parsed.data.publicSlug) return reply.redirect('/p/' + meta.publicSlug);
  const page = await prisma.contentPage.findUnique({ where: { slug: meta.slug }, select: { status: true } });
  if (!page || page.status !== 'PUBLISHED') return reply.code(404).send({ error: 'page_not_published' });
  reply.header('cache-control', 'no-store');
  return reply.sendFile('miniapp/custom.html');
});
// TENX_CUSTOM_PAGE_PUBLIC_ROUTE_V1_END

'''
api = once(api, route_anchor, custom_route + route_anchor, 'fastifyStatic registration anchor')

# ---------- Admin custom-page APIs ----------
admin_api_anchor = "app.get('/admin/content/pages', async (request, reply) => {"
custom_api = r'''// TENX_CUSTOM_PAGE_ADMIN_API_V1
app.get('/admin/custom-pages', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const pages = await tenxCustomPagesRead();
  const items = await Promise.all(pages.map(async meta => {
    const [draft, published] = await Promise.all([
      prisma.contentPageDraft.findUnique({ where: { slug: meta.slug } }),
      prisma.contentPage.findUnique({ where: { slug: meta.slug } })
    ]);
    const source = draft ?? published;
    return {
      slug: meta.slug, title: source?.title ?? meta.title,
      status: published?.status ?? 'DRAFT',
      blocks: Array.isArray(source?.blocks) ? source.blocks : [],
      updatedAt: source?.updatedAt ?? null,
      isCustom: true, publicSlug: meta.publicSlug, publicPath: '/p/' + meta.publicSlug,
      aliases: meta.aliases.map(x => '/p/' + x)
    };
  }));
  return { items };
});

app.get('/admin/custom-pages/backups', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply, true))) return;
  const dir = tenxCustomBackupDir();
  let files: string[] = [];
  try { files = await customFsReaddir(dir); } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
  const items: any[] = [];
  for (const name of files.filter(x => /^[0-9a-f-]{36}\.json$/i.test(x)).slice(0, 200)) {
    try {
      const data = JSON.parse(await customFsReadFile(join(dir, name), 'utf8'));
      if (data?.format !== '10X_CUSTOM_PAGE_BACKUP_V1' || !tenxCustomBackupIdOk(data.backupId)) continue;
      items.push({ backupId: data.backupId, slug: data.customPage?.slug, title: data.customPage?.title,
        publicPath: data.customPage?.publicSlug ? '/p/' + data.customPage.publicSlug : null, createdAt: data.createdAt });
    } catch { /* Ignore an incomplete or invalid backup; never expose its contents. */ }
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  reply.header('cache-control', 'no-store');
  return { items };
});

app.post('/admin/custom-pages', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const parsed = z.object({
    slug: tenxCustomSlugSchema,
    title: z.string().trim().min(1).max(200),
    publicSlug: tenxCustomPublicSlugSchema,
    sourceSlug: z.string().trim().min(1).max(60).optional()
  }).strict().safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
  const { slug, title, publicSlug, sourceSlug } = parsed.data;
  if ((PAGE_SLUGS as readonly string[]).includes(slug)) return reply.code(409).send({ error: 'protected_page_slug' });
  const pages = await tenxCustomPagesRead();
  if (pages.some(p => p.slug === slug || p.publicSlug === publicSlug || p.aliases.includes(publicSlug)))
    return reply.code(409).send({ error: 'slug_or_public_path_in_use' });
  const [existingPage, existingDraft] = await Promise.all([
    prisma.contentPage.findUnique({ where: { slug } }),
    prisma.contentPageDraft.findUnique({ where: { slug } })
  ]);
  if (existingPage || existingDraft) return reply.code(409).send({ error: 'page_slug_already_exists' });

  let blocks: any[] = [];
  let copiedTitle: string | null = null;
  if (sourceSlug) {
    const isBuiltin = (PAGE_SLUGS as readonly string[]).includes(sourceSlug);
    const isCustom = pages.some(p => p.slug === sourceSlug);
    if (!isBuiltin && !isCustom) return reply.code(404).send({ error: 'source_page_not_found' });
    const [sourceDraft, sourcePublished] = await Promise.all([
      prisma.contentPageDraft.findUnique({ where: { slug: sourceSlug } }),
      prisma.contentPage.findUnique({ where: { slug: sourceSlug } })
    ]);
    const source = sourceDraft ?? sourcePublished;
    if (source) {
      blocks = Array.isArray(source.blocks) ? JSON.parse(JSON.stringify(source.blocks)) : [];
      copiedTitle = source.title ?? null;
    }
  }

  const now = new Date().toISOString();
  const meta: TenxCustomPageMeta = { slug, title, publicSlug, aliases: [], sourceSlug: sourceSlug ?? null, createdAt: now, updatedAt: now };
  const saved = await prisma.$transaction(async tx => {
    const draft = await tx.contentPageDraft.create({ data: { slug, title, blocks: blocks as Prisma.InputJsonValue } });
    await tx.contentPageVersion.create({ data: {
      pageSlug: slug, version: 1, title: draft.title, blocks: toInputJson(draft.blocks), status: 'DRAFT',
      createdByAdminId: adminIdOf(request)
    } });
    await tenxCustomPagesWrite(tx, [...pages, meta]);
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: sourceSlug ? 'CUSTOM_PAGE_DUPLICATED' : 'CUSTOM_PAGE_CREATED', entityType: 'ContentPage', entityId: slug,
      metadata: { sourceSlug: sourceSlug ?? null, publicPath: '/p/' + publicSlug, copiedTitle } } });
    return draft;
  });
  return { ok: true, slug, title, publicSlug, publicPath: '/p/' + publicSlug, updatedAt: saved.updatedAt };
});

app.get('/admin/custom-pages/:slug/editor', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  const meta = (await tenxCustomPagesRead()).find(x => x.slug === p.data.slug);
  if (!meta) return reply.code(404).send({ error: 'page_not_found' });
  const [draft, published] = await Promise.all([
    prisma.contentPageDraft.findUnique({ where: { slug: p.data.slug } }),
    prisma.contentPage.findUnique({ where: { slug: p.data.slug } })
  ]);
  const source = draft ?? published;
  return {
    slug: p.data.slug, title: source?.title ?? meta.title,
    blocks: Array.isArray(source?.blocks) ? source.blocks : [], hasDraft: Boolean(draft),
    draftUpdatedAt: draft?.updatedAt ?? null,
    isCustom: true, publicSlug: meta.publicSlug, publicPath: '/p/' + meta.publicSlug,
    published: { title: published?.title ?? null, blocks: Array.isArray(published?.blocks) ? published.blocks : [],
      status: published?.status ?? 'DRAFT', updatedAt: published?.updatedAt ?? null }
  };
});

app.put('/admin/custom-pages/:slug/draft', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  const b = z.object({ title: z.string().trim().max(200).nullable().optional(), blocks: z.array(blockSchema).max(40) }).strict().safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request', details: b.success ? undefined : b.error.flatten() });
  if (!(await tenxCustomPagesRead()).some(x => x.slug === p.data.slug)) return reply.code(404).send({ error: 'page_not_found' });
  const blocks = JSON.parse(JSON.stringify(b.data.blocks));
  const title = b.data.title ?? null;
  const saved = await prisma.$transaction(async tx => {
    const draft = await tx.contentPageDraft.upsert({ where: { slug: p.data.slug },
      create: { slug: p.data.slug, title, blocks }, update: { title, blocks } });
    const latest = await tx.contentPageVersion.aggregate({ where: { pageSlug: p.data.slug }, _max: { version: true } });
    await tx.contentPageVersion.create({ data: { pageSlug: p.data.slug, version: (latest._max.version ?? 0) + 1,
      title: draft.title, blocks: toInputJson(draft.blocks), status: 'DRAFT', createdByAdminId: adminIdOf(request) } });
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'CUSTOM_PAGE_DRAFT_SAVED', entityType: 'ContentPageDraft', entityId: p.data.slug } });
    return draft;
  });
  return { ok: true, updatedAt: saved.updatedAt };
});

app.post('/admin/custom-pages/:slug/publish', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  if (!(await tenxCustomPagesRead()).some(x => x.slug === p.data.slug)) return reply.code(404).send({ error: 'page_not_found' });
  const published = await prisma.$transaction(async tx => {
    const draft = await tx.contentPageDraft.findUnique({ where: { slug: p.data.slug } });
    if (!draft) return null;
    const page = await tx.contentPage.upsert({ where: { slug: p.data.slug },
      create: { slug: p.data.slug, title: draft.title, blocks: toInputJson(draft.blocks), status: 'PUBLISHED' },
      update: { title: draft.title, blocks: toInputJson(draft.blocks), status: 'PUBLISHED' } });
    const latest = await tx.contentPageVersion.aggregate({ where: { pageSlug: p.data.slug }, _max: { version: true } });
    await tx.contentPageVersion.create({ data: { pageSlug: p.data.slug, version: (latest._max.version ?? 0) + 1,
      title: page.title, blocks: toInputJson(page.blocks), status: 'PUBLISHED', createdByAdminId: adminIdOf(request) } });
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'CUSTOM_PAGE_PUBLISHED', entityType: 'ContentPage', entityId: p.data.slug,
      metadata: { status: 'PUBLISHED' } } });
    return page;
  });
  if (!published) return reply.code(409).send({ error: 'draft_not_found' });
  return { ok: true, status: published.status, updatedAt: published.updatedAt };
});

app.get('/admin/custom-pages/:slug/versions', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  if (!(await tenxCustomPagesRead()).some(x => x.slug === p.data.slug)) return reply.code(404).send({ error: 'page_not_found' });
  const items = await prisma.contentPageVersion.findMany({ where: { pageSlug: p.data.slug }, orderBy: { version: 'desc' }, take: 50,
    select: { id: true, version: true, title: true, status: true, createdAt: true, createdBy: { select: { email: true } } } });
  return { items };
});

app.post('/admin/custom-pages/:slug/rollback', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  const b = z.object({ versionId: z.string().min(1).max(64) }).strict().safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request' });
  if (!(await tenxCustomPagesRead()).some(x => x.slug === p.data.slug)) return reply.code(404).send({ error: 'page_not_found' });
  const result = await prisma.$transaction(async tx => {
    const target = await tx.contentPageVersion.findFirst({ where: { id: b.data.versionId, pageSlug: p.data.slug } });
    if (!target) return null;
    if (target.status === 'DRAFT') {
      await tx.contentPageDraft.upsert({ where: { slug: p.data.slug },
        create: { slug: p.data.slug, title: target.title, blocks: toInputJson(target.blocks) },
        update: { title: target.title, blocks: toInputJson(target.blocks) } });
    } else {
      await tx.contentPage.upsert({ where: { slug: p.data.slug },
        create: { slug: p.data.slug, title: target.title, blocks: toInputJson(target.blocks), status: 'PUBLISHED' },
        update: { title: target.title, blocks: toInputJson(target.blocks), status: 'PUBLISHED' } });
    }
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'CUSTOM_PAGE_ROLLED_BACK', entityType: 'ContentPage', entityId: p.data.slug,
      metadata: { sourceVersion: target.version, sourceStatus: target.status } } });
    return { ok: true, status: target.status };
  });
  if (!result) return reply.code(404).send({ error: 'version_not_found' });
  return result;
});

app.post('/admin/custom-pages/:slug/route', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply, true))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  const b = z.object({ publicSlug: tenxCustomPublicSlugSchema }).strict().safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_input' });
  const pages = await tenxCustomPagesRead();
  const index = pages.findIndex(x => x.slug === p.data.slug);
  if (index < 0) return reply.code(404).send({ error: 'page_not_found' });
  if (pages.some((x, i) => i !== index && (x.publicSlug === b.data.publicSlug || x.aliases.includes(b.data.publicSlug))))
    return reply.code(409).send({ error: 'public_path_in_use' });
  const old = pages[index].publicSlug;
  if (old === b.data.publicSlug) return { ok: true, publicPath: '/p/' + old, unchanged: true };
  const next = pages.slice();
  next[index] = { ...next[index], publicSlug: b.data.publicSlug,
    aliases: Array.from(new Set([...next[index].aliases, old])).filter(x => x !== b.data.publicSlug).slice(-30), updatedAt: new Date().toISOString() };
  await prisma.$transaction(async tx => {
    await tenxCustomPagesWrite(tx, next);
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'CUSTOM_PAGE_ROUTE_CHANGED', entityType: 'PageRoute', entityId: p.data.slug,
      metadata: { from: '/p/' + old, to: '/p/' + b.data.publicSlug } } });
  });
  return { ok: true, oldPath: '/p/' + old, publicPath: '/p/' + b.data.publicSlug, aliases: next[index].aliases.map(x => '/p/' + x) };
});

app.delete('/admin/custom-pages/:slug', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply, true))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  const pages = await tenxCustomPagesRead();
  const meta = pages.find(x => x.slug === p.data.slug);
  if (!meta) return reply.code(404).send({ error: 'page_not_found' });

  const [published, draft, versions, spatial] = await Promise.all([
    prisma.contentPage.findUnique({ where: { slug: meta.slug } }),
    prisma.contentPageDraft.findUnique({ where: { slug: meta.slug } }),
    prisma.contentPageVersion.findMany({ where: { pageSlug: meta.slug }, orderBy: { version: 'asc' } }),
    prisma.systemSetting.findUnique({ where: { key: 'MMVS_SPATIAL_R4_' + meta.slug } })
  ]);
  const backupId = customPageRandomUUID();
  const backup = { format: '10X_CUSTOM_PAGE_BACKUP_V1', version: 1, backupId, createdAt: new Date().toISOString(),
    customPage: meta, contentPage: published, contentPageDraft: draft, versions,
    spatialSetting: spatial ? { key: spatial.key, value: spatial.value } : null };
  const dir = tenxCustomBackupDir();
  const file = join(dir, backupId + '.json');
  try {
    await customFsMkdir(dir, { recursive: true, mode: 0o700 });
    await customFsChmod(dir, 0o700);
    await customFsWriteFile(file, JSON.stringify(backup), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await customFsChmod(file, 0o600);
    const check = JSON.parse(await customFsReadFile(file, 'utf8'));
    if (check.backupId !== backupId || check.customPage?.slug !== meta.slug || check.format !== '10X_CUSTOM_PAGE_BACKUP_V1')
      throw new Error('backup_verification_failed');
  } catch (error) {
    request.log.error({ err: error, slug: meta.slug }, 'custom page backup failed; delete cancelled');
    return reply.code(500).send({ error: 'backup_failed_delete_cancelled' });
  }

  try {
    await prisma.$transaction(async tx => {
      const current = await tenxCustomPagesRead(tx);
      if (!current.some(x => x.slug === meta.slug)) throw new Error('page_changed_during_delete');
      await tx.contentPageVersion.deleteMany({ where: { pageSlug: meta.slug } });
      await tx.contentPageDraft.deleteMany({ where: { slug: meta.slug } });
      await tx.contentPage.deleteMany({ where: { slug: meta.slug } });
      await tx.systemSetting.deleteMany({ where: { key: 'MMVS_SPATIAL_R4_' + meta.slug } });
      await tenxCustomPagesWrite(tx, current.filter(x => x.slug !== meta.slug));
      await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'CUSTOM_PAGE_DELETED_WITH_BACKUP', entityType: 'ContentPage', entityId: meta.slug,
        metadata: { backupId, backupFile: 'backups/deleted-pages/' + backupId + '.json', publicPath: '/p/' + meta.publicSlug } } });
    }, { timeout: 20000 });
  } catch (error) {
    request.log.error({ err: error, slug: meta.slug, backupId }, 'custom page delete failed after backup');
    return reply.code(500).send({ error: 'delete_failed_backup_preserved', backupId });
  }
  return { ok: true, deleted: true, backupId, backupPath: 'backups/deleted-pages/' + backupId + '.json' };
});

app.post('/admin/custom-pages/restore', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply, true))) return;
  const b = z.object({ backupId: z.string().uuid() }).strict().safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_backup_id' });
  let backup: any;
  try {
    backup = JSON.parse(await customFsReadFile(join(tenxCustomBackupDir(), b.data.backupId + '.json'), 'utf8'));
  } catch { return reply.code(404).send({ error: 'backup_not_found' }); }
  if (backup?.format !== '10X_CUSTOM_PAGE_BACKUP_V1' || backup.backupId !== b.data.backupId ||
      !tenxCustomSlugOk(backup.customPage?.slug) || !tenxCustomPublicSlugOk(backup.customPage?.publicSlug))
    return reply.code(400).send({ error: 'invalid_backup_file' });

  const meta: TenxCustomPageMeta = backup.customPage;
  if ((PAGE_SLUGS as readonly string[]).includes(meta.slug)) return reply.code(409).send({ error: 'protected_page_slug' });
  const current = await tenxCustomPagesRead();
  const restorePaths = [meta.publicSlug, ...(Array.isArray(meta.aliases) ? meta.aliases : [])];
  if (current.some(x => x.slug === meta.slug || [x.publicSlug, ...x.aliases].some(path => restorePaths.includes(path))))
    return reply.code(409).send({ error: 'page_or_public_path_in_use' });
  const [existingPage, existingDraft] = await Promise.all([
    prisma.contentPage.findUnique({ where: { slug: meta.slug } }),
    prisma.contentPageDraft.findUnique({ where: { slug: meta.slug } })
  ]);
  if (existingPage || existingDraft) return reply.code(409).send({ error: 'page_slug_already_exists' });

  try {
    await prisma.$transaction(async tx => {
      if (backup.contentPage) await tx.contentPage.create({ data: {
        slug: meta.slug, title: backup.contentPage.title ?? null, blocks: backup.contentPage.blocks as Prisma.InputJsonValue,
        status: backup.contentPage.status, ...(backup.contentPage.updatedAt ? { updatedAt: new Date(backup.contentPage.updatedAt) } : {})
      } });
      if (backup.contentPageDraft) await tx.contentPageDraft.create({ data: {
        slug: meta.slug, title: backup.contentPageDraft.title ?? null, blocks: backup.contentPageDraft.blocks as Prisma.InputJsonValue,
        ...(backup.contentPageDraft.updatedAt ? { updatedAt: new Date(backup.contentPageDraft.updatedAt) } : {})
      } });
      if (Array.isArray(backup.versions) && backup.versions.length) await tx.contentPageVersion.createMany({ data: backup.versions.map((v: any) => ({
        pageSlug: meta.slug, version: Number(v.version), title: v.title ?? null, blocks: v.blocks as Prisma.InputJsonValue,
        status: v.status, createdByAdminId: null, createdAt: new Date(v.createdAt)
      })) });
      if (backup.spatialSetting?.key === 'MMVS_SPATIAL_R4_' + meta.slug) await tx.systemSetting.upsert({
        where: { key: backup.spatialSetting.key }, create: { key: backup.spatialSetting.key, value: backup.spatialSetting.value as Prisma.InputJsonValue },
        update: { value: backup.spatialSetting.value as Prisma.InputJsonValue }
      });
      await tenxCustomPagesWrite(tx, [...current, meta]);
      await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'CUSTOM_PAGE_RESTORED_FROM_BACKUP', entityType: 'ContentPage', entityId: meta.slug,
        metadata: { backupId: b.data.backupId, publicPath: '/p/' + meta.publicSlug } } });
    }, { timeout: 20000 });
  } catch (error) {
    request.log.error({ err: error, backupId: b.data.backupId }, 'custom page restore failed');
    return reply.code(500).send({ error: 'restore_failed' });
  }
  return { ok: true, slug: meta.slug, publicPath: '/p/' + meta.publicSlug };
});
// TENX_CUSTOM_PAGE_ADMIN_API_V1_END

'''
api = once(api, admin_api_anchor, custom_api + admin_api_anchor, 'admin content pages route anchor')

# ---------- Public content API: resolve /p/:publicSlug to an internal custom slug ----------
public_anchor = "app.post('/content/page', async (request, reply) => {\n  const b = z.object({ initData: z.string().min(1).max(10000), slug: z.enum(PAGE_SLUGS) }).safeParse(request.body);\n  if (!b.success) return reply.code(400).send({ error: 'invalid_request' });"
public_replacement = """app.post('/content/page', async (request, reply) => {
  const b = z.object({ initData: z.string().min(1).max(10000), slug: tenxCustomPublicSlugSchema }).safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_request' });
  let contentSlug = b.data.slug;
  if (!(PAGE_SLUGS as readonly string[]).includes(contentSlug)) {
    const meta = (await tenxCustomPagesRead()).find(x => x.publicSlug === contentSlug);
    if (!meta) return reply.code(404).send({ error: 'page_not_found' });
    contentSlug = meta.slug;
    const published = await prisma.contentPage.findUnique({ where: { slug: contentSlug }, select: { status: true } });
    if (!published || published.status !== 'PUBLISHED') return reply.code(404).send({ error: 'page_not_published' });
  }"""
api = once(api, public_anchor, public_replacement, 'public content page request schema')
# Only change references within this public endpoint body.
public_start = api.index("app.post('/content/page', async (request, reply) => {")
public_end = api.index("app.post('/content/popup/:id/seen'", public_start)
public_region = api[public_start:public_end]
public_region = public_region.replace("where: { slug: b.data.slug }", "where: { slug: contentSlug }")
public_region = public_region.replace("pageSlug: b.data.slug", "pageSlug: contentSlug")
public_region = public_region.replace("organizerConfig?.pageSlug === b.data.slug", "organizerConfig?.pageSlug === contentSlug")
public_region = public_region.replace("b.data.slug === 'index'", "contentSlug === 'index'")
api = api[:public_start] + public_region + api[public_end:]

# ---------- Create dedicated generic Mini App shell ----------
custom_shell = r'''<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b1020">
  <title>10X</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0b1020;color:#f5f7fb;font-family:Tahoma,Arial,sans-serif}
    body{padding:16px;direction:rtl}.tenx-custom-page{width:100%;max-width:820px;margin:0 auto;padding-bottom:env(safe-area-inset-bottom)}
    .tenx-custom-page .card{background:#151f34;border:1px solid #2c3b59;border-radius:16px;padding:16px;margin:12px 0}
    .tenx-custom-page .muted{color:#b8c4d8}.tenx-custom-page .gold{color:#e8c77a}
    .tenx-custom-page h1,.tenx-custom-page h2,.tenx-custom-page h3{line-height:1.7}
    .tenx-custom-page a{overflow-wrap:anywhere}.tenx-custom-page img{max-width:100%;height:auto}
  </style>
</head>
<body>
  <main class="tenx-custom-page" id="tenx-custom-page" aria-live="polite"></main>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="/miniapp/safe-html.js?v=TENX_SAFE_CUSTOM_HTML_R1"></script>
  <script src="/miniapp/blocks.js?v=TENX_CUSTOM_PAGES_V1"></script>
</body>
</html>
'''
# ---------- Admin UI: load custom pages and their backups ----------
admin = once(
    admin,
    "async pages(){\n const[p,q]=await Promise.all([api('/content/pages'),api('/content/popups')]);\n const writable=['SUPER_ADMIN','CONTENT_MANAGER'].includes(me.role);\n const enabled=(p.items||[]).filter(x=>MF_P40_AVAILABLE.includes(x.slug));\n const missing=(p.items||[]).filter(x=>!MF_P40_AVAILABLE.includes(x.slug));",
    "async pages(){\n const[p,q,c,bk]=await Promise.all([api('/content/pages'),api('/content/popups'),api('/custom-pages'),api('/custom-pages/backups').catch(()=>({items:[]}))]);\n const writable=['SUPER_ADMIN','CONTENT_MANAGER'].includes(me.role);\n const core=(p.items||[]).filter(x=>!x.isCustom);\n const enabled=core.filter(x=>MF_P40_AVAILABLE.includes(x.slug));\n const missing=core.filter(x=>!MF_P40_AVAILABLE.includes(x.slug));\n const customPages=c.items||[];\n const pageBackups=bk.items||[];",
    'admin pages list header'
)

# Add a duplicate button to the built-in page rows.
admin = once(
    admin,
    "writable&&h('button',{class:'sec',onclick:()=>location.assign('/admin/editor/'+encodeURIComponent(r.slug))},'ویرایش دیداری'),\n      h('button',{class:'sec',onclick:()=>pageHistory(r.slug)},'نسخه‌ها'),",
    "writable&&h('button',{class:'sec',onclick:()=>location.assign('/admin/editor/'+encodeURIComponent(r.slug))},'ویرایش دیداری'),\n      writable&&h('button',{class:'sec',onclick:()=>tenxDuplicateCustomPage(r)},'کپی مستقل'),\n      h('button',{class:'sec',onclick:()=>pageHistory(r.slug)},'نسخه‌ها'),",
    'built-in duplicate action'
)

# Insert custom page management and backup restore cards before popup management.
popup_anchor = " box.append(h('div',{class:'card',style:'margin-bottom:12px'},\n  h('div',{class:'row',style:'justify-content:space-between'},h('h3',{},'پاپ‌آپ‌های متصل به صفحه'),"
custom_ui = r''' const customCard=h('div',{class:'card',style:'margin:12px 0;border:1px solid #41634d'},
   h('div',{class:'row',style:'justify-content:space-between;align-items:center'},
     h('h3',{},'صفحات سفارشی و کپی‌های مستقل · '+customPages.length),
     writable&&h('button',{onclick:()=>tenxCreateCustomPage(null)},'+ صفحه جدید')),
   h('p',{class:'mut'},'این صفحات پوسته مستقل Mini App دارند و محتوای بلوک‌ها و تاریخچه‌شان از صفحه اصلی جداست. لینک عمومی با الگوی /p/نامک منتشر می‌شود.'));
 if(customPages.length){
   customCard.append(table([
     ['عنوان',r=>h('div',{},h('b',{},r.title||r.slug),h('div',{class:'mut'},r.slug))],
     ['لینک انتشار',r=>h('a',{href:r.publicPath,target:'_blank',rel:'noopener noreferrer'},r.publicPath)],
     ['وضعیت',r=>h('span',{class:'tag '+(r.status==='PUBLISHED'?'ok':'warn')},r.status)],
     ['عملیات',r=>h('div',{class:'row'},
       writable&&h('button',{class:'sec',onclick:()=>location.assign('/admin/editor/'+encodeURIComponent(r.slug))},'ویرایش'),
       writable&&h('button',{class:'sec',onclick:()=>tenxDuplicateCustomPage(r)},'Duplicate'),
       me?.role==='SUPER_ADMIN'&&h('button',{class:'sec',onclick:()=>tenxChangeCustomPageRoute(r)},'تغییر لینک'),
       me?.role==='SUPER_ADMIN'&&h('button',{class:'bad',onclick:()=>tenxDeleteCustomPage(r)},'حذف کامل'))]
   ],customPages));
 }else customCard.append(h('p',{class:'mut'},'هنوز صفحه سفارشی ساخته نشده است.'));
 box.append(customCard);
 if(me?.role==='SUPER_ADMIN'){
   const backupCard=h('div',{class:'card',style:'margin:12px 0'},h('h3',{},'بکاپ صفحات حذف‌شده · '+pageBackups.length),
     h('p',{class:'mut'},'بکاپ‌ها در پوشه خصوصی backups/deleted-pages نگهداری می‌شوند و از مسیر عمومی وب قابل دریافت نیستند.'));
   if(pageBackups.length)backupCard.append(table([
     ['صفحه',b=>h('div',{},h('b',{},b.title||b.slug),h('div',{class:'mut'},b.slug))],
     ['لینک قبلی',b=>b.publicPath||'—'],['زمان بکاپ',b=>b.createdAt?fa(b.createdAt):'—'],
     ['عملیات',b=>h('button',{class:'sec',onclick:()=>tenxRestoreCustomPage(b)},'بازیابی')]
   ],pageBackups));
   else backupCard.append(h('p',{class:'mut'},'بکاپ حذف‌شده‌ای ثبت نشده است.'));
   box.append(backupCard);
 }

'''
admin = once(admin, popup_anchor, custom_ui + popup_anchor, 'popup card anchor for custom page manager')

# Add page-management action helpers before pageHistory().
helper_anchor = "async function pageHistory(slug){"
admin_helpers = r'''async function tenxCreateCustomPage(source){
  const suggested=source?'copy-'+String(source.slug||'page').replace(/[^a-z0-9-]/g,'-'):'new-page';
  const slug=prompt('شناسه داخلی صفحه (فقط حروف کوچک انگلیسی، عدد و خط تیره):',suggested);
  if(!slug)return;
  const title=prompt('عنوان صفحه:',source?(source.title||source.slug)+' - کپی':'صفحه جدید 10X');
  if(!title)return;
  const publicSlug=prompt('نامک لینک انتشار (آدرس نهایی /p/نامک):',slug);
  if(!publicSlug)return;
  try{
    await api('/custom-pages',{method:'POST',body:JSON.stringify({slug:slug.trim(),title:title.trim(),publicSlug:publicSlug.trim(),...(source?{sourceSlug:source.slug}:{})})});
    toast('صفحه مستقل ساخته شد. محتوای صفحه مبدأ تغییر نمی‌کند.');
    location.assign('/admin/editor/'+encodeURIComponent(slug.trim()));
  }catch(e){toast('خطا در ساخت صفحه: '+e.message)}
}
async function tenxDuplicateCustomPage(source){return tenxCreateCustomPage(source)}
async function tenxChangeCustomPageRoute(row){
  const publicSlug=prompt('نامک جدید لینک انتشار را وارد کن. لینک قبلی به لینک جدید هدایت می‌شود:',row.publicSlug||'');
  if(!publicSlug||publicSlug===row.publicSlug)return;
  try{const r=await api('/custom-pages/'+encodeURIComponent(row.slug)+'/route',{method:'POST',body:JSON.stringify({publicSlug:publicSlug.trim()})});toast('لینک انتشار تغییر کرد: '+r.publicPath);await show('pages')}
  catch(e){toast('خطا در تغییر لینک: '+e.message)}
}
async function tenxDeleteCustomPage(row){
  const typed=prompt('برای حذف کامل صفحه و تمام نسخه‌های آن، شناسه زیر را عیناً وارد کن. ابتدا بکاپ خصوصی و قابل‌بازیابی ساخته می‌شود:\n'+row.slug,'');
  if(typed!==row.slug)return;
  try{const result=await api('/custom-pages/'+encodeURIComponent(row.slug),{method:'DELETE'});toast('حذف کامل شد. بکاپ: '+result.backupId);await show('pages')}
  catch(e){toast('حذف انجام نشد: '+e.message)}
}
async function tenxRestoreCustomPage(backup){
  if(!confirm('صفحه «'+(backup.title||backup.slug)+'» با داده‌ها و تاریخچه موجود در بکاپ بازیابی شود؟'))return;
  try{const result=await api('/custom-pages/restore',{method:'POST',body:JSON.stringify({backupId:backup.backupId})});toast('صفحه بازیابی شد: '+result.publicPath);await show('pages')}
  catch(e){toast('بازیابی انجام نشد: '+e.message)}
}

'''
admin = once(admin, helper_anchor, admin_helpers + "async function pageHistory(slug,isCustom=false){", 'pageHistory function anchor')

# Route version history according to page type.
admin = once(
    admin,
    "async function pageHistory(slug,isCustom=false){try{const d=await api('/content/pages/'+encodeURIComponent(slug)+'/versions');",
    "async function pageHistory(slug,isCustom=false){try{const base=isCustom?'/custom-pages/':'/content/pages/';const d=await api(base+encodeURIComponent(slug)+'/versions');",
    'pageHistory read URL'
)
admin = once(
    admin,
    "await api('/content/pages/'+encodeURIComponent(slug)+'/rollback',{method:'POST',body:JSON.stringify({versionId:v.id})});",
    "await api(base+encodeURIComponent(slug)+'/rollback',{method:'POST',body:JSON.stringify({versionId:v.id})});",
    'pageHistory rollback URL'
)

# Editor chooses custom endpoints while built-in pages keep their existing endpoints.
admin = once(
    admin,
    "function editPage(r){\n  const isStandalone = location.pathname.startsWith('/admin/editor/');",
    "function editPage(r){\n  const isStandalone = location.pathname.startsWith('/admin/editor/');\n  const pageApiBase = r.isCustom ? '/custom-pages/' : '/content/pages/';",
    'editPage API base'
)
admin = once(admin, "historyBtn.onclick = () => pageHistory(r.slug);", "historyBtn.onclick = () => pageHistory(r.slug,!!r.isCustom);", 'editor history action')
admin = once(admin, "await api('/content/pages/'+encodeURIComponent(r.slug)+'/draft',{", "await api(pageApiBase+encodeURIComponent(r.slug)+'/draft',{", 'editor draft save URL')
admin = once(admin, "const result=await api('/content/pages/'+encodeURIComponent(r.slug)+'/publish',{", "const result=await api(pageApiBase+encodeURIComponent(r.slug)+'/publish',{", 'editor publish URL')

# Permit custom slug in standalone editor; API endpoint itself validates registry membership.
admin = once(
    admin,
    "  if(!MF_P40_AVAILABLE.includes(slug)){\n    $('#view').textContent='صفحه نامعتبر است.';\n    return;\n  }\n",
    "  const isCustomEditorPage=!MF_P40_AVAILABLE.includes(slug);\n",
    'standalone fixed-slug guard'
)
admin = once(
    admin,
    "   const data=await api('/content/pages/'+encodeURIComponent(slug)+'/editor');\n   editPage(data);",
    "   const data=await api((isCustomEditorPage?'/custom-pages/':'/content/pages/')+encodeURIComponent(slug)+'/editor');\n   if(isCustomEditorPage)data.isCustom=true;\n   editPage(data);",
    'standalone editor API URL'
)

# ---------- Write all patched source only after every exact-anchor check passed ----------
api_path.write_text(api)
admin_path.write_text(admin)
(root / 'public/miniapp/custom.html').write_text(custom_shell)

# ---------- .gitignore: deleted-page JSON contains complete page data ----------
ignore = gitignore_path.read_text() if gitignore_path.exists() else ''
line = '/backups/deleted-pages/'
if line not in ignore.splitlines():
    gitignore_path.write_text(ignore.rstrip() + ('\n' if ignore.strip() else '') + line + '\n')

print('PATCHED: API custom-page registry, create/duplicate, draft/publish, route aliases, backup/delete/restore, public route, admin UI, and gitignore.')
PY

# ---------- Dedicated public shell ----------
if [[ ! -f public/miniapp/custom.html ]]; then
  echo "ERROR: public/miniapp/custom.html was not created" >&2
  exit 1
fi

# ---------- Sanity checks ----------
echo "========== PATCH MARKERS =========="
echo "Source backup: $BACKUP"
grep -nE 'TENX_CUSTOM_PAGE_(PUBLIC_ROUTE|ADMIN_API)_V1|MM_CUSTOM_PAGES_V1' apps/api/src/index.ts
grep -nE 'tenxCreateCustomPage|tenxDeleteCustomPage|pageApiBase|isCustomEditorPage' apps/api/public/admin.html

echo "========== DIFF CHECK =========="
git diff --check

echo "========== TEST SUITE =========="
npm test

echo "========== TYPESCRIPT BUILD =========="
npm run build

echo "========== RESULT =========="
echo "Patch and tests/build completed. No database migration, deployment, service restart, or git commit was run."
echo "Source backup: $BACKUP"
