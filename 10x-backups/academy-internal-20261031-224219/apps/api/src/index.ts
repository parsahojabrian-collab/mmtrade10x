import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { validateTelegramInitData } from '../../../packages/shared/src/telegram-init-data.js';
import { ADMIN_ROLES, MIN_ADMIN_PASSWORD_LENGTH, SESSION_TTL_SECONDS, canAccess, hashPassword, passwordVersion, signSession, verifyPassword, verifySession } from '../../../packages/shared/src/admin-auth.js';
import { csvCellSafe } from '../../../packages/shared/src/csv.js';
import { canonicalPhone, phoneVariants } from '../../../packages/shared/src/phone.js';
import { validateProgressStages, calculateProgressSnapshot } from '../../../packages/shared/src/progress.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const prisma = new PrismaClient();
const app = Fastify({ trustProxy: ['127.0.0.1', '::1'], logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] }, bodyLimit: 1024 * 1024 });
const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const host = process.env.API_HOST || '0.0.0.0';

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim()), credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

// Custom Mini App page paths. Legacy /miniapp and /miniapp/*.html routes remain intact.
const customPageFiles: Record<string, string> = {
  index: 'miniapp/index.html',
  academy: 'miniapp/academy.html',
  crypto: 'miniapp/crypto.html',
  'copy-trading': 'miniapp/copy-trading.html',
  challenge: 'miniapp/challenge.html',
  support: 'miniapp/support.html',
  profile: 'miniapp/index.html'
};

const reservedPagePaths = new Set([
  '/admin', '/api', '/health', '/miniapp', '/content',
  '/auth', '/public', '/assets', '/favicon.ico'
]);

function validCustomPagePath(value: string): boolean {
  return /^\/[a-zA-Z0-9_-]{1,60}$/.test(value)
    && !reservedPagePaths.has(value.toLowerCase());
}

try {
  const pathRows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.keys(customPageFiles).map(slug => `PAGE_PATH_${slug}`) } }
  });
  const usedPaths = new Set<string>();

  for (const row of pathRows) {
    const slug = row.key.slice('PAGE_PATH_'.length);
    const path = String(row.value ?? '').trim();
    if (!customPageFiles[slug] || !validCustomPagePath(path)) continue;
    if (usedPaths.has(path.toLowerCase())) {
      app.log.error({ path, slug }, 'Duplicate custom Mini App path; skipped');
      continue;
    }
    usedPaths.add(path.toLowerCase());

    app.get(path, async (_request, reply) => {
      return reply.sendFile(customPageFiles[slug]);
    });
  }

  if (!usedPaths.has('/profile')) {
    app.get('/profile', async (_request, reply) => {
      return reply.sendFile('miniapp/index.html');
    });
  }
} catch (error) {
  app.log.error(error, 'Could not register custom Mini App paths');
}


await app.register(fastifyStatic, { root: join(process.cwd(), 'public'), prefix: '/' });

app.get('/health', async (_req, reply) => {
  try { await prisma.$queryRaw`SELECT 1`; return { status: 'ok', database: 'connected', timestamp: new Date().toISOString() }; }
  catch { return reply.code(503).send({ status: 'degraded', database: 'unavailable' }); }
});

app.post('/public/pre-register', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request, reply) => {
  const parsed = z.object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(7).max(20),
    privacyConsent: z.literal(true),
    smsConsent: z.boolean().optional().default(false),
    source: z.string().trim().max(80).optional().default('website')
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten().fieldErrors });
  const phone = canonicalPhone(parsed.data.phone);
  if (!/^\+?[0-9]{7,15}$/.test(phone)) return reply.code(400).send({ error: 'invalid_phone' });
  try {
    // Unverified website input must never modify an existing user or add consent records for them.
    const existing = await prisma.user.findFirst({ where: { phone: { in: phoneVariants(phone) } }, select: { id: true } });
    if (!existing) {
      await prisma.$transaction(async tx => {
        const saved = await tx.user.create({ data: { firstName: parsed.data.firstName, lastName: parsed.data.lastName, phone, registrationSource: parsed.data.source, registrationStatus: 'STARTED', registrationStage: 'STARTED' } });
        await tx.userConsent.create({ data: { userId: saved.id, type: 'PRIVACY_PROCESSING', channel: 'WEBSITE', granted: true, wordingVersion: 'website-pre-registration-v1', ipAddress: request.ip } });
        if (parsed.data.smsConsent) await tx.userConsent.create({ data: { userId: saved.id, type: 'SMS_MARKETING', channel: 'WEBSITE', granted: true, wordingVersion: 'website-sms-consent-v1', ipAddress: request.ip } });
        await tx.registrationStageEvent.create({ data: { userId: saved.id, stage: saved.registrationStage, detail: { source: parsed.data.source, preRegistration: true } } });
        await tx.auditLog.create({ data: { userId: saved.id, action: 'WEBSITE_PRE_REGISTRATION', entityType: 'User', entityId: saved.id, metadata: { smsConsent: parsed.data.smsConsent, existingUser: false } } });
      });
    }
    return reply.code(201).send({ ok: true, message: 'درخواست پیش‌ثبت‌نام ثبت شد.' });
  } catch (error) {
    request.log.error({ err: error }, 'pre-registration failed');
    return reply.code(500).send({ error: 'registration_save_failed' });
  }
});

app.post('/public/tickets', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request, reply) => {
  const parsed = z.object({ initData: z.string().min(1).max(10000), subject: z.string().trim().min(3).max(150), body: z.string().trim().min(5).max(3500) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return reply.code(503).send({ error: 'telegram_auth_not_configured' });
  const verified = validateTelegramInitData(parsed.data.initData, token, Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS || 86400));
  if (!verified.ok) return reply.code(401).send({ error: 'invalid_telegram_init_data' });
  const user = await prisma.user.findUnique({ where: { telegramId: String(verified.user.id) } });
  if (!user) return reply.code(404).send({ error: 'registration_required' });
  const ticket = await prisma.$transaction(async tx => {
    const created = await tx.supportTicket.create({ data: { userId: user.id, subject: parsed.data.subject, messages: { create: { senderType: 'USER', body: parsed.data.body } } } });
    await tx.auditLog.create({ data: { userId: user.id, action: 'SUPPORT_TICKET_CREATED', entityType: 'SupportTicket', entityId: created.id } });
    return created;
  });
  return reply.code(201).send({ ok: true, ticketId: ticket.id, status: ticket.status });
});


type AdminIdentity = { id: string | null; email: string; role: (typeof ADMIN_ROLES)[number]; legacy: boolean };
const DUMMY_PASSWORD_HASH = await hashPassword('dummy-' + Math.random().toString(36));
function adminSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_TOKEN;
  return secret && secret.length >= 32 ? secret : null;
}
function tokenMatches(supplied: string, expected: string | undefined): boolean {
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function adminIdOf(request: FastifyRequest): string | null {
  return ((request as unknown as { admin?: AdminIdentity }).admin?.id) ?? null;
}
async function adminGuard(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const secret = adminSecret();
  if (!secret) { reply.code(503).send({ error: 'admin_not_configured', message: 'Set ADMIN_API_TOKEN to a random secret of at least 32 characters.' }); return false; }
  const auth = request.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) { reply.code(401).send({ error: 'unauthorized' }); return false; }
  const supplied = auth.slice(7).trim();
  let identity: AdminIdentity | null = null;
  if (process.env.ADMIN_LEGACY_TOKEN_ENABLED !== 'false' && tokenMatches(supplied, process.env.ADMIN_API_TOKEN)) {
    identity = { id: null, email: 'legacy-token', role: 'SUPER_ADMIN', legacy: true };
  } else {
    const payload = verifySession(supplied, secret);
    if (payload) {
      const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (admin && admin.isActive && passwordVersion(admin.passwordHash) === payload.pv) identity = { id: admin.id, email: admin.email, role: admin.role, legacy: false };
    }
  }
  if (!identity) { reply.code(401).send({ error: 'unauthorized' }); return false; }
  const routeKey = `${request.method} ${request.routeOptions.url ?? request.url}`;
  if (!canAccess(identity.role, routeKey)) {
    await prisma.auditLog.create({ data: { adminUserId: identity.id, action: 'ADMIN_ACCESS_DENIED', entityType: 'AdminRoute', metadata: { route: routeKey, role: identity.role }, ipAddress: request.ip } }).catch(() => undefined);
    reply.code(403).send({ error: 'forbidden', message: 'نقش شما به این بخش دسترسی ندارد.' });
    return false;
  }
  (request as unknown as { admin: AdminIdentity }).admin = identity;
  return true;
}

app.post('/admin/auth/login', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (request, reply) => {
  const secret = adminSecret();
  if (!secret) return reply.code(503).send({ error: 'admin_not_configured' });
  const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
  const email = body.data.email.trim().toLowerCase();
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(body.data.password, admin ? admin.passwordHash : DUMMY_PASSWORD_HASH);
  if (!admin || !admin.isActive || !passwordOk) {
    await prisma.auditLog.create({ data: { action: 'ADMIN_LOGIN_FAILED', entityType: 'AdminUser', ipAddress: request.ip } }).catch(() => undefined);
    return reply.code(401).send({ error: 'invalid_credentials', message: 'ایمیل یا رمز عبور درست نیست.' });
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession({ sub: admin.id, role: admin.role, pv: passwordVersion(admin.passwordHash), exp }, secret);
  await prisma.auditLog.create({ data: { adminUserId: admin.id, action: 'ADMIN_LOGIN', entityType: 'AdminUser', entityId: admin.id, ipAddress: request.ip } });
  return { token, expiresAt: new Date(exp * 1000).toISOString(), admin: { email: admin.email, role: admin.role } };
});

app.get('/admin/auth/me', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const identity = (request as unknown as { admin: AdminIdentity }).admin;
  return { email: identity.email, role: identity.role, legacyToken: identity.legacy };
});

app.get('/admin/admins', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const items = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, email: true, role: true, isActive: true, createdAt: true } });
  return { items };
});

app.post('/admin/admins', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const body = z.object({ email: z.string().email().max(200), password: z.string().min(MIN_ADMIN_PASSWORD_LENGTH).max(200), role: z.enum(ADMIN_ROLES) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_body', message: `ایمیل معتبر، رمز حداقل ${MIN_ADMIN_PASSWORD_LENGTH} نویسه و نقش لازم است.` });
  const email = body.data.email.trim().toLowerCase();
  if (await prisma.adminUser.findUnique({ where: { email }, select: { id: true } })) return reply.code(409).send({ error: 'admin_exists', message: 'این ایمیل قبلاً ثبت شده است.' });
  const created = await prisma.adminUser.create({ data: { email, passwordHash: await hashPassword(body.data.password), role: body.data.role }, select: { id: true, email: true, role: true, isActive: true } });
  await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'ADMIN_CREATED', entityType: 'AdminUser', entityId: created.id, metadata: { role: created.role } } });
  return reply.code(201).send(created);
});

app.patch('/admin/admins/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const { id } = z.object({ id: z.string().min(1).max(100) }).parse(request.params);
  const body = z.object({ role: z.enum(ADMIN_ROLES).optional(), isActive: z.boolean().optional(), password: z.string().min(MIN_ADMIN_PASSWORD_LENGTH).max(200).optional() }).safeParse(request.body);
  if (!body.success || Object.keys(body.data).length === 0) return reply.code(400).send({ error: 'invalid_body' });
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) return reply.code(404).send({ error: 'not_found' });
  const losesSuper = target.role === 'SUPER_ADMIN' && target.isActive && ((body.data.role !== undefined && body.data.role !== 'SUPER_ADMIN') || body.data.isActive === false);
  if (losesSuper) {
    const otherSupers = await prisma.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } });
    if (otherSupers === 0) return reply.code(409).send({ error: 'last_super_admin', message: 'آخرین مدیر کل را نمی‌شود غیرفعال یا تنزل داد.' });
  }
  const data: { role?: (typeof ADMIN_ROLES)[number]; isActive?: boolean; passwordHash?: string } = {};
  if (body.data.role !== undefined) data.role = body.data.role;
  if (body.data.isActive !== undefined) data.isActive = body.data.isActive;
  if (body.data.password !== undefined) data.passwordHash = await hashPassword(body.data.password);
  const updated = await prisma.adminUser.update({ where: { id }, data, select: { id: true, email: true, role: true, isActive: true } });
  await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'ADMIN_UPDATED', entityType: 'AdminUser', entityId: id, metadata: { fields: Object.keys(body.data) } } });
  return updated;
});


app.get('/admin/panel', async (_request, reply) => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const file = [join(process.cwd(), 'apps/api/public/admin.html'), join(process.cwd(), 'public/admin.html')].find((p) => existsSync(p));
  if (!file) return reply.code(404).send({ error: 'panel_file_missing' });
  reply.header('content-security-policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
  reply.header('cache-control', 'no-store');
  return reply.type('text/html; charset=utf-8').send(readFileSync(file, 'utf-8'));
});



app.get('/admin/editor/:slug', async (request, reply) => {
  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  if (!p.success) return reply.code(404).send({ error: 'page_not_found' });

  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const file = [
    join(process.cwd(), 'apps/api/public/admin.html'),
    join(process.cwd(), 'public/admin.html')
  ].find((p) => existsSync(p));

  if (!file) return reply.code(404).send({ error: 'panel_file_missing' });

  reply.header('content-security-policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
  reply.header('cache-control', 'no-store');
  return reply.type('text/html; charset=utf-8').send(readFileSync(file, 'utf-8'));
});

// NEW_10X_DASHBOARD_V1

// SUPER_ADMIN_BOT_CONTROL_V1
const botControlGuard = async (request: any, reply: any) => {
  const result = await adminGuard(request, reply);
  if (reply.sent) return;
  const identity = (request as any).admin;
  if (!identity || identity.role !== 'SUPER_ADMIN') {
    return reply.code(403).send({ error: 'SUPER_ADMIN_REQUIRED' });
  }
  return result;
};

app.get('/admin/bot/status', { preHandler: botControlGuard }, async (_request: any, reply: any) => {
  const { execFile } = await import('node:child_process');
  return await new Promise((resolve) => {
    execFile('systemctl', ['is-active', '10x-bot.service'], { timeout: 5000 }, (error, stdout) => {
      resolve({ service: '10x-bot.service', status: stdout.trim() || (error ? 'unknown' : 'unknown') });
    });
  });
});

app.post('/admin/bot/:action', { preHandler: botControlGuard }, async (request: any, reply: any) => {
  const action = String(request.params.action || '');
  const allowed: Record<string, string> = {
    start: 'start',
    stop: 'stop',
    restart: 'restart'
  };
  const command = allowed[action];
  if (!command) return reply.code(400).send({ error: 'INVALID_ACTION' });

  const { execFile } = await import('node:child_process');
  return await new Promise((resolve) => {
    execFile('systemctl', [command, '10x-bot.service'], { timeout: 20000 }, async (error, _stdout, stderr) => {
      const success = !error;
      await prisma.auditLog.create({
        data: {
          adminUserId: adminIdOf(request),
          action: 'ADMIN_BOT_SERVICE_ACTION',
          entityType: 'BotService',
          entityId: '10x-bot.service',
          metadata: {
            action,
            success,
            error: success ? null : String(stderr || 'systemctl failed').slice(0, 300)
          }
        }
      }).catch((auditError: unknown) => {
        console.error('bot service audit log failed', auditError);
      });

      if (error) {
        resolve(reply.code(500).send({ error: 'SERVICE_ACTION_FAILED', detail: String(stderr || 'systemctl failed').slice(0, 300) }));
      } else {
        resolve({ ok: true, action, service: '10x-bot.service' });
      }
    });
  });
});

app.get('/admin/bot/logs', { preHandler: botControlGuard }, async (request: any, reply: any) => {
  const raw = Number((request.query as any)?.lines ?? 80);
  const lines = Number.isFinite(raw) ? Math.max(10, Math.min(200, Math.floor(raw))) : 80;
  const { execFile } = await import('node:child_process');
  return await new Promise((resolve) => {
    execFile('journalctl', ['-u', '10x-bot.service', '-n', String(lines), '--no-pager', '-o', 'short-iso'], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) resolve(reply.code(500).send({ error: 'LOG_READ_FAILED', detail: String(stderr || '').slice(0, 300) }));
      else resolve({ service: '10x-bot.service', lines: stdout });
    });
  });
});
// END SUPER_ADMIN_BOT_CONTROL_V1


// TENX_BOT_CONFIG_API_V1
const BOT_CONFIG_KEY = 'BOT_CONTROL_CONFIG';

const defaultBotConfig = {
  enabled: true,
  welcomeMessage: 'به ربات 10X خوش آمدی.',
  autoReplies: [],
  customMenu: [],
  builtInButtons: [
    { id: 'registration_status', label: '📝 وضعیت ثبت‌نام', enabled: true, order: 1 },
    { id: 'academy', label: '🎓 آکادمی', enabled: true, order: 2 },
    { id: 'challenge', label: '🏆 چالش 10X', enabled: true, order: 3 },
    { id: 'support', label: '💬 پشتیبانی', enabled: true, order: 4 },
    { id: 'miniapp', label: '🚀 ورود به 10X Mini App', enabled: true, order: 5 },
    { id: 'membership_check', label: '🔄 بررسی مجدد عضویت', enabled: true, order: 6 },
    { id: 'consent_yes', label: '✅ موافقم و ادامه می‌دهم', enabled: true, order: 7 },
    { id: 'consent_no', label: '❌ فعلاً ادامه نمی‌دهم', enabled: true, order: 8 },
    { id: 'share_phone', label: '📱 اشتراک‌گذاری شماره تلفن', enabled: true, order: 9 }
  ]
};

async function readBotConfig() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: BOT_CONFIG_KEY }
  });

  const value = row?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultBotConfig;
  }

  const saved = value as Record<string, unknown>;

  return {
    enabled: saved.enabled !== false,
    welcomeMessage: typeof saved.welcomeMessage === 'string'
      ? saved.welcomeMessage.slice(0, 2000)
      : defaultBotConfig.welcomeMessage,
    autoReplies: Array.isArray(saved.autoReplies)
      ? saved.autoReplies.slice(0, 50)
      : [],
    customMenu: Array.isArray(saved.customMenu)
      ? saved.customMenu.slice(0, 30)
      : [],
    builtInButtons: Array.isArray(saved.builtInButtons)
      ? saved.builtInButtons.slice(0, 20)
      : defaultBotConfig.builtInButtons
  };
}

app.get('/admin/bot/config', { preHandler: botControlGuard }, async () => {
  return { config: await readBotConfig() };
});

app.put('/admin/bot/config', { preHandler: botControlGuard }, async (request: any, reply: any) => {
  const parsed = z.object({
    enabled: z.boolean(),
    welcomeMessage: z.string().trim().min(1).max(2000),
    autoReplies: z.array(z.object({
      keyword: z.string().trim().min(1).max(100),
      response: z.string().trim().min(1).max(2000),
      enabled: z.boolean().default(true)
    }).strict()).max(50),
    customMenu: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      response: z.string().trim().min(1).max(2000),
      enabled: z.boolean().default(true)
    }).strict()).max(30),
    builtInButtons: z.array(z.object({
      id: z.enum([
        'registration_status', 'academy', 'challenge', 'support',
        'miniapp', 'membership_check', 'consent_yes', 'consent_no',
        'share_phone'
      ]),
      label: z.string().trim().min(1).max(60),
      enabled: z.boolean(),
      order: z.number().int().min(1).max(100)
    }).strict()).length(9)
  }).strict().safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      error: 'INVALID_BOT_CONFIG',
      details: parsed.error.flatten()
    });
  }

  const reserved = new Set([
    '🔄 بررسی مجدد عضویت',
    '✅ موافقم و ادامه می‌دهم',
    '❌ فعلاً ادامه نمی‌دهم',
    '📝 وضعیت ثبت‌نام',
    '🎓 آکادمی',
    '🏆 چالش 10X',
    '💬 پشتیبانی',
    '🚀 ورود به 10X Mini App',
    '📱 اشتراک‌گذاری شماره تلفن'
  ]);

  if (parsed.data.customMenu.some(item => reserved.has(item.label))) {
    return reply.code(400).send({
      error: 'PROTECTED_MENU_ITEM'
    });
  }

  const config = parsed.data;

  await prisma.systemSetting.upsert({
    where: { key: BOT_CONFIG_KEY },
    create: { key: BOT_CONFIG_KEY, value: config },
    update: { value: config }
  });

  await prisma.auditLog.create({
    data: {
      adminUserId: adminIdOf(request),
      action: 'ADMIN_BOT_CONFIG_UPDATED',
      entityType: 'SystemSetting',
      entityId: BOT_CONFIG_KEY,
      metadata: {
        autoReplyCount: config.autoReplies.length,
        menuCount: config.customMenu.length,
        enabled: config.enabled
      }
    }
  });

  return { ok: true, message: 'BOT_CONFIG_SAVED' };
});
// END TENX_BOT_CONFIG_API_V1


app.get('/miniapp', async (_request, reply) => reply.sendFile('miniapp/index.html'));

app.get('/admin', async (_request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پنل مدیریت 10X</title><style>
  :root{font-family:Tahoma,Arial,sans-serif;color:#e9edf5;background:#0b1020}*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:1100px;margin:auto}.card{background:#151d31;border:1px solid #2b3650;border-radius:16px;padding:18px;margin:14px 0}h1{margin:0 0 8px}p{color:#aab6cc}input,button{font:inherit;border-radius:9px;padding:11px;border:1px solid #35435f}input{background:#0d1426;color:#fff;min-width:260px}button{background:#e5b94b;color:#171717;cursor:pointer;font-weight:bold}button.secondary{background:#25314a;color:#fff}form{display:flex;gap:8px;flex-wrap:wrap} .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.stat{padding:14px;background:#0d1426;border-radius:12px}.num{font-size:28px;font-weight:bold;margin-top:8px}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:right;padding:12px;border-bottom:1px solid #2b3650;font-size:13px}.tablewrap{overflow:auto}.muted{color:#aab6cc}.error{color:#ff9c9c}.ok{color:#9fe0b2}@media(max-width:600px){body{padding:12px}input{min-width:100%}}
  </style></head><body><main><h1>پنل مدیریت 10X</h1><p>مرکز کنترل کامل: <a href='/admin/control' style='color:#e5b94b'>ورود به پنل عملیاتی 10X</a> — داشبورد ساده و خروجی CSV نیز در همین صفحه در دسترس است.</p><section class="card"><form id="auth"><input id="token" type="password" autocomplete="off" placeholder="ADMIN_API_TOKEN" required minlength="32"><button>اتصال امن</button><button class="secondary" type="button" id="clear">پاک‌کردن</button></form><p id="message" class="muted">توکن مدیر فقط در حافظه همین صفحه نگهداری می‌شود.</p></section><section class="card"><h2>خلاصه ثبت‌نام</h2><div id="stats" class="stats"><div class="stat">پس از اتصال، اطلاعات نمایش داده می‌شود.</div></div></section><section class="card"><h2>کاربران</h2><form id="search"><input id="q" placeholder="جست‌وجوی نام، نام کاربری یا شناسه تلگرام"><button>جست‌وجو</button><button class="secondary" type="button" id="export">خروجی ثبت‌نام ناقص CSV</button></form><div class="tablewrap"><table><thead><tr><th>نام</th><th>شناسه تلگرام</th><th>تلفن</th><th>مرحله</th><th>ثبت‌نام</th><th>آخرین فعالیت</th></tr></thead><tbody id="rows"><tr><td colspan="6">برای مشاهده، ابتدا متصل شوید.</td></tr></tbody></table></div></section></main><script>
  let token='';const $=id=>document.getElementById(id);const msg=(t,c='muted')=>{$('message').textContent=t;$('message').className=c};
  async function api(path){const r=await fetch(path,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw new Error((await r.json().catch(()=>({error:'request_failed'}))).error||'request_failed');return r;}
  async function load(){try{const [s,u]=await Promise.all([api('/admin/summary').then(r=>r.json()),api('/admin/users').then(r=>r.json())]);$('stats').replaceChildren();[['کل کاربران',s.totalUsers],['ثبت‌نام اولیه تکمیل',s.registeredUsers],['ثبت‌نام ناقص',s.incompleteRegistrations],['کاربران جدید ۲۴ ساعت اخیر',s.newLast24Hours]].forEach(([label,value])=>{const d=document.createElement('div');d.className='stat';const l=document.createElement('div');l.textContent=label;const n=document.createElement('div');n.className='num';n.textContent=value;d.append(l,n);$('stats').append(d)});render(u.items);msg('اتصال برقرار است.','ok')}catch(e){msg('خطا در دریافت اطلاعات: '+e.message,'error')}}
  function render(items){const body=$('rows');body.replaceChildren();if(!items.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='کاربری یافت نشد.';tr.append(td);body.append(tr);return}for(const u of items){const tr=document.createElement('tr');[((u.firstName||'')+' '+(u.lastName||'')).trim()||u.username||'—',u.telegramId||'—',u.phone||'—',u.registrationStage,u.registrationStatus,new Date(u.lastActivityAt).toLocaleString('fa-IR')].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});body.append(tr)}}
  $('auth').addEventListener('submit',async e=>{e.preventDefault();token=$('token').value;await load()});$('search').addEventListener('submit',async e=>{e.preventDefault();if(!token)return;try{const data=await api('/admin/users?q='+encodeURIComponent($('q').value)).then(r=>r.json());render(data.items)}catch(e){msg('خطا: '+e.message,'error')}});$('export').addEventListener('click',async()=>{try{const r=await api('/admin/registrations/incomplete.csv');const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='10x-incomplete-registrations.csv';a.click();URL.revokeObjectURL(url);msg('خروجی دریافت شد.','ok')}catch(e){msg('خطا در خروجی: '+e.message,'error')}});$('clear').addEventListener('click',()=>{token='';$('token').value='';$('stats').textContent='اطلاعات پس از اتصال نمایش داده می‌شود.';$('rows').textContent='برای مشاهده، ابتدا متصل شوید.';msg('توکن پاک شد.')});
  </script></body></html>`;
});


app.get('/admin/control', async (_request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مرکز کنترل 10X</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:20px;background:#0b1020;color:#edf2ff;font:14px Tahoma,Arial}main{max-width:1200px;margin:auto}.card{background:#151d31;border:1px solid #2b3650;border-radius:14px;padding:18px;margin:14px 0}h1,h2{margin-top:0}p,.muted{color:#aab6cc}input,select,textarea,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #394766;margin:4px}input,select,textarea{background:#0d1426;color:#fff;max-width:100%}button{background:#e5b94b;color:#111;font-weight:bold;cursor:pointer}button.secondary{background:#25314a;color:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.table{overflow:auto}table{width:100%;border-collapse:collapse;min-width:780px}td,th{text-align:right;padding:10px;border-bottom:1px solid #2b3650;font-size:12px}.status{color:#9fe0b2}.msg{min-height:24px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.row input{flex:1}.hide{display:none}
</style><body><main><h1>مرکز کنترل 10X</h1><p>مدیریت تنظیمات اجرایی، کاربران، پشتیبانی و گزارش فعالیت‌ها</p>
<section class="card"><h2>ورود مدیر</h2><div class="row"><input id="email" type="email" placeholder="ایمیل مدیر" autocomplete="username"><input id="password" type="password" placeholder="رمز عبور" autocomplete="current-password"><button id="login">ورود</button><button class="secondary" id="clear">خروج</button></div><details><summary class="muted">ورود اضطراری با ADMIN_API_TOKEN</summary><div class="row"><input id="token" type="password" placeholder="ADMIN_API_TOKEN" autocomplete="off"><button class="secondary" id="connect">اتصال با توکن</button></div></details><div id="msg" class="msg muted">با ایمیل و رمز مدیر وارد شو.</div></section>
<section class="card"><h2>وضعیت سامانه</h2><div id="stats" class="grid"><div>پس از اتصال بارگذاری می‌شود.</div></div><div class="row"><a href="/admin/automation" target="_blank" style="color:#e5b94b">رفتن به پنل اتوماسیون و پیام‌ها ↗</a></div></section>
<section class="card"><h2>تنظیمات اجرایی ربات</h2><p>این موارد در دیتابیس ذخیره می‌شوند و ربات در درخواست بعدی تنظیمات جدید را می‌خواند. توکن ربات و رمز دیتابیس از اینجا قابل مشاهده یا تغییر نیستند.</p><div class="grid"><label>آدرس Mini App<input id="mini" placeholder="https://example.com/miniapp"></label>
<label>مسیر صفحه اصلی<input id="path_index" placeholder="/home"></label>
<label>مسیر آکادمی<input id="path_academy" placeholder="/academy"></label>
<label>مسیر کریپتو<input id="path_crypto" placeholder="/crypto"></label>
<label>مسیر کپی‌تریدینگ<input id="path_copy-trading" placeholder="/copy-trading"></label>
<label>مسیر چالش<input id="path_challenge" placeholder="/challenge"></label>
<label>مسیر پشتیبانی<input id="path_support" placeholder="/support"></label>
<label>مسیر پروفایل<input id="path_profile" placeholder="/profile"></label>
<label>کانال‌های الزامی (با کاما جدا کن)<input id="channels" placeholder="@channel1,@channel2"></label><label>لینک کانال‌ها (با ; جدا کن)<input id="links" placeholder="https://t.me/channel1;https://t.me/channel2"></label><label><span>اجازه ادامه بدون کانال الزامی</span><select id="allow"><option value="false">خیر</option><option value="true">بله</option></select></label></div><button id="saveSettings">ذخیره تنظیمات</button></section>
<section class="card"><h2>مدیریت کاربران</h2><div class="row"><input id="query" placeholder="نام، نام کاربری یا شناسه تلگرام"><select id="stage"><option value="">همه مراحل</option><option>STARTED</option><option>CHANNELS_PENDING</option><option>CONSENT_PENDING</option><option>PHONE_PENDING</option><option>REGISTERED</option><option>MINI_APP_PENDING</option><option>COMPLETE</option></select><button id="search">جست‌وجو</button></div><div class="table"><table><thead><tr><th>شناسه داخلی</th><th>کاربر</th><th>تلگرام</th><th>تلفن</th><th>مرحله</th><th>وضعیت</th><th>ویرایش</th></tr></thead><tbody id="users"><tr><td colspan="7">ابتدا متصل شو.</td></tr></tbody></table></div><p class="muted">برای ویرایش، شناسه داخلی کاربر را وارد کن؛ سپس فیلدهای دلخواه را تغییر بده.</p><div class="grid"><label>User ID<input id="editId"></label><label>نام<input id="first"></label><label>نام خانوادگی<input id="last"></label><label>نام کاربری<input id="username"></label><label>تلفن<input id="phone"></label><label>مرحله ثبت‌نام<select id="editStage"><option>STARTED</option><option>CHANNELS_PENDING</option><option>CONSENT_PENDING</option><option>PHONE_PENDING</option><option>REGISTERED</option><option>MINI_APP_PENDING</option><option>COMPLETE</option></select></label><label>وضعیت ثبت‌نام<select id="editStatus"><option>STARTED</option><option>PHONE_PENDING</option><option>REGISTERED</option><option>COMPLETE</option></select></label></div><button id="saveUser">ذخیره تغییرات کاربر</button></section>
<section class="card"><h2>درخواست‌های پشتیبانی</h2><div class="table"><table><thead><tr><th>شناسه</th><th>کاربر</th><th>موضوع</th><th>وضعیت</th><th>تغییر وضعیت</th></tr></thead><tbody id="tickets"><tr><td colspan="5">ابتدا متصل شو.</td></tr></tbody></table></div><div class="row"><input id="ticketId" placeholder="شناسه تیکت"><select id="ticketStatus"><option>OPEN</option><option>IN_PROGRESS</option><option>WAITING_USER</option><option>RESOLVED</option><option>CLOSED</option></select><button id="saveTicket">ثبت وضعیت</button></div><div class="row"><input id="replyId" placeholder="شناسه تیکت برای پاسخ"><textarea id="replyBody" placeholder="متن پاسخ" maxlength="3500"></textarea><button id="sendReply">ثبت پاسخ</button></div></section>
<section class="card"><h2>گزارش فعالیت مدیران</h2><button id="loadLogs">بارگذاری گزارش‌ها</button><div class="table"><table><thead><tr><th>زمان</th><th>عملیات</th><th>بخش</th><th>شناسه</th><th>جزئیات</th></tr></thead><tbody id="logs"><tr><td colspan="5">هنوز بارگذاری نشده.</td></tr></tbody></table></div></section>
<section class="card hide" id="adminsCard"><h2>مدیران و نقش‌ها</h2><div class="table"><table><thead><tr><th>ایمیل</th><th>نقش</th><th>فعال</th><th>عملیات</th></tr></thead><tbody id="admins"></tbody></table></div><h3>افزودن مدیر</h3><div class="row"><input id="newEmail" type="email" placeholder="ایمیل"><input id="newPass" type="password" placeholder="رمز (حداقل ۱۲ نویسه)" autocomplete="new-password"><select id="newRole"><option>SUPER_ADMIN</option><option>USER_MANAGER</option><option>SUPPORT</option><option>CONTENT_MANAGER</option><option>ACADEMY_MANAGER</option><option>CHALLENGE_MANAGER</option><option>ANALYST</option><option>MARKETING_MANAGER</option></select><button id="addAdmin">افزودن</button></div></section>
</main><script>
let token='';const $=id=>document.getElementById(id);const msg=(s,ok=false)=>{$('msg').textContent=s;$('msg').className='msg '+(ok?'status':'muted')};
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{authorization:'Bearer '+token,'content-type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'request_failed');return d}
function cell(tr,v){const td=document.createElement('td');td.textContent=v??'—';tr.append(td)}
async function load(){const safe=p=>p.catch(()=>null);const [s,u,t,settings]=await Promise.all([api('/admin/summary'),safe(api('/admin/users?limit=50')),safe(api('/admin/tickets')),safe(api('/admin/settings'))]);$('stats').replaceChildren();[['کل کاربران',s.totalUsers],['ثبت‌نام تکمیل',s.registeredUsers],['ثبت‌نام ناقص',s.incompleteRegistrations],['کاربر جدید ۲۴ ساعت',s.newLast24Hours]].forEach(([k,v])=>{const d=document.createElement('div');d.className='card';d.textContent=k+' : '+v;$('stats').append(d)});if(u)renderUsers(u.items);if(t)renderTickets(t.items);if(settings){const x=settings.settings;$('mini').value=x.MINI_APP_URL||'';$('channels').value=x.REQUIRED_CHANNELS||'';$('links').value=x.REQUIRED_CHANNEL_LINKS||'';$('allow').value=String(Boolean(x.ALLOW_NO_REQUIRED_CHANNELS));
['index','academy','crypto','copy-trading','challenge','support','profile'].forEach(slug=>{$('path_'+slug).value=x['PAGE_PATH_'+slug]||''})}const me=await api('/admin/auth/me');msg('اتصال برقرار شد. نقش: '+me.role,true);await loadAdmins()}
function renderUsers(items){$('users').replaceChildren();for(const u of items){const tr=document.createElement('tr');cell(tr,u.id);cell(tr,[u.firstName,u.lastName].filter(Boolean).join(' ')||u.username);cell(tr,u.telegramId);cell(tr,u.phone);cell(tr,u.registrationStage);cell(tr,u.registrationStatus);const td=document.createElement('td');const b=document.createElement('button');b.textContent='انتخاب';b.onclick=()=>{$('editId').value=u.id;$('first').value=u.firstName||'';$('last').value=u.lastName||'';$('username').value=u.username||'';$('phone').value=u.phone||'';$('editStage').value=u.registrationStage;$('editStatus').value=u.registrationStatus};td.append(b);tr.append(td);$('users').append(tr)}if(!items.length){const tr=document.createElement('tr');cell(tr,'کاربری یافت نشد');$('users').append(tr)}}
function renderTickets(items){$('tickets').replaceChildren();for(const t of items){const tr=document.createElement('tr');cell(tr,t.id);cell(tr,t.user.username||t.user.telegramId||t.user.id);cell(tr,t.subject);cell(tr,t.status);const td=document.createElement('td'),b=document.createElement('button');b.textContent='انتخاب';b.onclick=()=>{$('ticketId').value=t.id;$('ticketStatus').value=t.status};td.append(b);tr.append(td);$('tickets').append(tr)}}
$('connect').onclick=async()=>{token=$('token').value;try{await load()}catch(e){msg('خطا: '+e.message)}};
$('login').onclick=async()=>{try{const r=await fetch('/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'login_failed');token=d.token;$('password').value='';try{sessionStorage.setItem('tenx_admin_token',token)}catch(e){}await load()}catch(e){msg('خطا: '+e.message)}};
async function loadAdmins(){try{const d=await api('/admin/admins');$('adminsCard').classList.remove('hide');$('admins').replaceChildren();for(const a of d.items){const tr=document.createElement('tr');cell(tr,a.email);cell(tr,a.role);cell(tr,a.isActive?'بله':'خیر');const td=document.createElement('td');const b=document.createElement('button');b.className='secondary';b.textContent=a.isActive?'غیرفعال‌سازی':'فعال‌سازی';b.onclick=async()=>{try{await api('/admin/admins/'+encodeURIComponent(a.id),{method:'PATCH',body:JSON.stringify({isActive:!a.isActive})});await loadAdmins()}catch(e){msg('خطا: '+e.message)}};td.append(b);tr.append(td);$('admins').append(tr)}}catch(e){$('adminsCard').classList.add('hide')}}
$('addAdmin').onclick=async()=>{try{await api('/admin/admins',{method:'POST',body:JSON.stringify({email:$('newEmail').value.trim(),password:$('newPass').value,role:$('newRole').value})});$('newEmail').value='';$('newPass').value='';msg('مدیر جدید اضافه شد.',true);await loadAdmins()}catch(e){msg('خطا: '+e.message)}};
$('clear').onclick=()=>{token='';$('token').value='';$('stats').textContent='';try{sessionStorage.removeItem('tenx_admin_token')}catch(e){}$('adminsCard').classList.add('hide');msg('خارج شدی.')};
$('search').onclick=async()=>{try{const params=new URLSearchParams({limit:'100',q:$('query').value});if($('stage').value)params.set('stage',$('stage').value);const d=await api('/admin/users?'+params.toString());renderUsers(d.items)}catch(e){msg('خطا: '+e.message)}};
$('saveSettings').onclick=async()=>{try{await api('/admin/settings',{method:'PUT',body:JSON.stringify({MINI_APP_URL:$('mini').value.trim(),REQUIRED_CHANNELS:$('channels').value.trim(),REQUIRED_CHANNEL_LINKS:$('links').value.trim(),ALLOW_NO_REQUIRED_CHANNELS:$('allow').value==='true',
PAGE_PATH_index:$('path_index').value.trim(),
PAGE_PATH_academy:$('path_academy').value.trim(),
PAGE_PATH_crypto:$('path_crypto').value.trim(),
'PAGE_PATH_copy-trading':$('path_copy-trading').value.trim(),
PAGE_PATH_challenge:$('path_challenge').value.trim(),
PAGE_PATH_support:$('path_support').value.trim(),
PAGE_PATH_profile:$('path_profile').value.trim()})});msg('تنظیمات ذخیره شد؛ ربات از این پس مقادیر جدید را می‌خواند.',true)}catch(e){msg('خطا: '+e.message)}};
$('saveUser').onclick=async()=>{try{const id=$('editId').value.trim();if(!id)throw new Error('شناسه کاربر را وارد کن');await api('/admin/users/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({firstName:$('first').value||null,lastName:$('last').value||null,username:$('username').value||null,phone:$('phone').value||null,registrationStage:$('editStage').value,registrationStatus:$('editStatus').value})});msg('اطلاعات کاربر به‌روزرسانی شد.',true);$('search').click()}catch(e){msg('خطا: '+e.message)}};
$('saveTicket').onclick=async()=>{try{await api('/admin/tickets/'+encodeURIComponent($('ticketId').value)+'/status',{method:'PATCH',body:JSON.stringify({status:$('ticketStatus').value})});msg('وضعیت تیکت به‌روزرسانی شد.',true);await load()}catch(e){msg('خطا: '+e.message)}};
$('sendReply').onclick=async()=>{try{await api('/admin/tickets/'+encodeURIComponent($('replyId').value)+'/reply',{method:'POST',body:JSON.stringify({body:$('replyBody').value.trim()})});$('replyBody').value='';msg('پاسخ ثبت شد.',true);await load()}catch(e){msg('خطا: '+e.message)}};
let auditCursor=null,auditFilters=null;
function auditSetup(){
  if(auditFilters)return;
  const table=$('logs').closest('table');
  if(!table)throw new Error('جدول گزارش فعالیت پیدا نشد');
  auditFilters=document.createElement('div');
  auditFilters.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:10px 0';
  const make=(placeholder,type='text')=>{const e=document.createElement('input');e.type=type;e.placeholder=placeholder;e.style.cssText='padding:9px;max-width:220px';return e};
  const q=make('جست‌وجو در گزارش‌ها'),action=make('نام عملیات'),admin=make('ایمیل مدیر');
  const from=make('از تاریخ','datetime-local'),to=make('تا تاریخ','datetime-local');
  const search=document.createElement('button');search.textContent='اعمال فیلتر';
  const more=document.createElement('button');more.textContent='بارگذاری بیشتر';more.className='secondary';
  const status=document.createElement('span');status.style.cssText='align-self:center;font-size:12px';
  auditFilters.append(q,action,admin,from,to,search,more,status);
  table.parentElement.insertBefore(auditFilters,table);
  async function load(reset=true){
    try{
      if(reset)auditCursor=null;
      const params=new URLSearchParams({limit:'50'});
      if(q.value.trim())params.set('q',q.value.trim());
      if(action.value.trim())params.set('action',action.value.trim());
      if(admin.value.trim())params.set('admin',admin.value.trim());
      if(from.value)params.set('from',new Date(from.value).toISOString());
      if(to.value)params.set('to',new Date(to.value).toISOString());
      if(auditCursor)params.set('cursor',auditCursor);
      const d=await api('/admin/audit-logs?'+params.toString());
      if(reset)$('logs').replaceChildren();
      for(const x of d.items){
        const tr=document.createElement('tr');
        cell(tr,new Date(x.createdAt).toLocaleString('fa-IR'));
        cell(tr,x.action);cell(tr,x.entityType);cell(tr,x.entityId);
        cell(tr,[x.adminUser&&x.adminUser.email,x.ipAddress,
          x.metadata?JSON.stringify(x.metadata):''].filter(Boolean).join(' | '));
        $('logs').append(tr);
      }
      auditCursor=d.nextCursor||null;
      more.disabled=!auditCursor;
      status.textContent='تعداد این صفحه: '+d.items.length;
      if(reset&&!d.items.length)status.textContent='گزارشی یافت نشد';
    }catch(e){msg('خطا در گزارش‌ها: '+e.message)}
  }
  search.onclick=()=>load(true);
  more.onclick=()=>load(false);
  q.addEventListener('keydown',e=>{if(e.key==='Enter')load(true)});
  load(true);
}
$('loadLogs').onclick=()=>{try{auditSetup();}catch(e){msg('خطا: '+e.message)}};
</script></body></html>`;
});

app.get('/admin/summary', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const [total, registered, incomplete, recent] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { registrationStatus: { in: ['REGISTERED', 'COMPLETE'] } } }),
    prisma.user.count({ where: { registrationStatus: { in: ['STARTED', 'PHONE_PENDING'] } } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  ]);
  return { totalUsers: total, registeredUsers: registered, incompleteRegistrations: incomplete, newLast24Hours: recent };
});

app.get('/admin/users', async (request, reply) => {
    if (!(await adminGuard(request, reply))) return;
    const parsed = z.object({
      q: z.string().max(100).optional(),
      stage: z.enum(['STARTED','CHANNELS_PENDING','CONSENT_PENDING','PHONE_PENDING','REGISTERED','MINI_APP_PENDING','COMPLETE']).optional(),
      status: z.string().max(40).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().optional()
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    const { q, stage, status, limit, cursor } = parsed.data;
    const where = {
      ...(stage ? { registrationStage: stage } : {}),
      ...(status ? { registrationStatus: status as any } : {}),
      ...(q ? { OR: [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { username: { contains: q } },
        { telegramId: { contains: q } },
        { phone: { contains: q } }
      ] } : {})
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, telegramId: true, username: true, firstName: true, lastName: true, phone: true, registrationStatus: true, registrationStage: true, registeredAt: true, lastActivityAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
      }),
      prisma.user.count({ where })
    ]);
    await prisma.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'ADMIN_USER_LIST_VIEW',
        entityType: 'User',
        metadata: { count: users.length, total, stage: stage ?? null, status: status ?? null, hasSearch: Boolean(q) }
      }
    });
    return { items: users, total, nextCursor: users.length === limit ? users[users.length - 1]?.id : null };
  });


// Operational settings are stored in the database; secrets remain in the server environment.
const pagePathSettingKeys = [
  'PAGE_PATH_index', 'PAGE_PATH_academy', 'PAGE_PATH_crypto',
  'PAGE_PATH_copy-trading', 'PAGE_PATH_challenge',
  'PAGE_PATH_support', 'PAGE_PATH_profile'
] as const;
const editableSettingKeys = [
  'MINI_APP_URL', 'REQUIRED_CHANNELS', 'REQUIRED_CHANNEL_LINKS',
  'ALLOW_NO_REQUIRED_CHANNELS', ...pagePathSettingKeys
] as const;
app.get('/admin/settings', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [...editableSettingKeys] } } });
  const saved = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return { settings: {
    MINI_APP_URL: saved.MINI_APP_URL ?? process.env.MINI_APP_URL ?? '',
    REQUIRED_CHANNELS: saved.REQUIRED_CHANNELS ?? process.env.REQUIRED_CHANNELS ?? '',
    REQUIRED_CHANNEL_LINKS: saved.REQUIRED_CHANNEL_LINKS ?? process.env.REQUIRED_CHANNEL_LINKS ?? '',
    ALLOW_NO_REQUIRED_CHANNELS: saved.ALLOW_NO_REQUIRED_CHANNELS ?? (process.env.ALLOW_NO_REQUIRED_CHANNELS === 'true'),
    ...Object.fromEntries(pagePathSettingKeys.map(key => [key, saved[key] ?? '']))
  } };
});
app.put('/admin/settings', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const parsed = z.object({
    MINI_APP_URL: z.string().trim().max(500).refine(v => !v || /^https:\/\/\S+$/i.test(v), 'https_url_required'),
    REQUIRED_CHANNELS: z.string().trim().max(2000),
    REQUIRED_CHANNEL_LINKS: z.string().trim().max(4000),
    ALLOW_NO_REQUIRED_CHANNELS: z.boolean(),
    PAGE_PATH_index: z.string().trim().max(64).optional(),
    PAGE_PATH_academy: z.string().trim().max(64).optional(),
    PAGE_PATH_crypto: z.string().trim().max(64).optional(),
    'PAGE_PATH_copy-trading': z.string().trim().max(64).optional(),
    PAGE_PATH_challenge: z.string().trim().max(64).optional(),
    PAGE_PATH_support: z.string().trim().max(64).optional(),
    PAGE_PATH_profile: z.string().trim().max(64).optional()
  }).strict().safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_settings', details: parsed.error.flatten() });
  const values = parsed.data;
  const pathEntries = Object.entries(values).filter(([key]) => key.startsWith('PAGE_PATH_'));
  const submittedPaths = pathEntries.map(([, value]) => String(value ?? '').trim()).filter(Boolean);

  for (const path of submittedPaths) {
    if (!/^\/[a-zA-Z0-9_-]{1,60}$/.test(path)
      || ['/admin','/api','/health','/miniapp','/content','/auth','/public','/assets'].includes(path.toLowerCase())) {
      return reply.code(400).send({ error: 'invalid_page_path', path });
    }
  }
  if (new Set(submittedPaths.map(path => path.toLowerCase())).size !== submittedPaths.length) {
    return reply.code(400).send({ error: 'duplicate_page_path' });
  }

  await prisma.$transaction(Object.entries(values).map(([key, value]) => prisma.systemSetting.upsert({
    where: { key }, create: { key, value }, update: { value }
  })));
  await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'ADMIN_SETTINGS_UPDATED', entityType: 'SystemSetting', metadata: { keys: Object.keys(values) } } });
  return { ok: true, message: 'settings_saved' };
});

app.patch('/admin/users/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const params = z.object({ id: z.string().min(1).max(64) }).safeParse(request.params);
  const body = z.object({
    firstName: z.string().trim().max(100).nullable().optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    username: z.string().trim().max(100).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    registrationStatus: z.enum(['STARTED','PHONE_PENDING','REGISTERED','COMPLETE']).optional(),
    registrationStage: z.enum(['STARTED','CHANNELS_PENDING','CONSENT_PENDING','PHONE_PENDING','REGISTERED','MINI_APP_PENDING','COMPLETE']).optional()
  }).strict().refine(v => Object.keys(v).length > 0).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
  try {
    const data = { ...body.data };
    if (typeof data.phone === 'string') data.phone = data.phone ? canonicalPhone(data.phone) : null;
    const updated = await prisma.user.update({ where: { id: params.data.id }, data });
    await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), userId: updated.id, action: 'ADMIN_USER_UPDATED', entityType: 'User', entityId: updated.id, metadata: { fields: Object.keys(body.data) } } });
    return { item: { id: updated.id, registrationStatus: updated.registrationStatus, registrationStage: updated.registrationStage } };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2025') return reply.code(404).send({ error: 'user_not_found' });
    if (code === 'P2002') return reply.code(409).send({ error: 'phone_already_used' });
    throw error;
  }
});

app.patch('/admin/tickets/:id/status', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const params = z.object({ id: z.string().min(1).max(64) }).safeParse(request.params);
  const body = z.object({ status: z.enum(['OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED']) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
  try {
    const item = await prisma.supportTicket.update({ where: { id: params.data.id }, data: { status: body.data.status } });
    await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), userId: item.userId, action: 'SUPPORT_TICKET_STATUS_UPDATED', entityType: 'SupportTicket', entityId: item.id, metadata: { status: item.status } } });
    return { item };
  } catch { return reply.code(404).send({ error: 'ticket_not_found' }); }
});

app.get('/admin/audit-logs', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const parsed = z.object({
    q: z.string().max(100).optional(),
    action: z.string().max(100).optional(),
    admin: z.string().max(160).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().optional()
  }).safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_query' });

  const { q, action, admin, from, to, limit, cursor } = parsed.data;
  if (from && to && new Date(from) > new Date(to))
    return reply.code(400).send({ error: 'invalid_date_range' });

  const items = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action: { contains: action } } : {}),
      ...(admin ? { adminUser: { is: { email: { contains: admin } } } } : {}),
      ...(from || to ? { createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {})
      } } : {}),
      ...(q ? { OR: [
        { action: { contains: q } },
        { entityType: { contains: q } },
        { entityId: { contains: q } },
        { userId: { contains: q } },
        { adminUser: { is: { email: { contains: q } } } }
      ] } : {})
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true, action: true, entityType: true, entityId: true,
      userId: true, metadata: true, ipAddress: true,
      adminUser: { select: { email: true } }, createdAt: true
    }
  });
  return {
    items,
    nextCursor: items.length === limit ? items[items.length - 1]?.id : null
  };
});

app.get('/admin/registrations/incomplete.csv', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const users = await prisma.user.findMany({ where: { registrationStatus: { in: ['STARTED', 'PHONE_PENDING'] } }, orderBy: { lastActivityAt: 'asc' }, take: 10000, select: { id: true, firstName: true, lastName: true, phone: true, telegramId: true, createdAt: true, registrationStage: true, lastActivityAt: true } });
  await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'INCOMPLETE_REGISTRATIONS_EXPORT', entityType: 'User', metadata: { count: users.length } } });
  const csvCell = (v: unknown) => csvCellSafe(v);
  const csv = ['id,first_name,last_name,phone,telegram_id,created_at,stage,last_activity_at', ...users.map(u => [u.id,u.firstName,u.lastName,u.phone,u.telegramId,u.createdAt.toISOString(),u.registrationStage,u.lastActivityAt.toISOString()].map(csvCell).join(','))].join('\r\n');
  return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="10x-incomplete-registrations.csv"').send('\uFEFF' + csv);
});

app.get('/admin/automation', async (_request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اتوماسیون 10X</title><style>body{font:15px Tahoma,Arial;background:#0b1020;color:#edf2ff;margin:0;padding:20px}main{max-width:1000px;margin:auto}.card{background:#151d31;border:1px solid #2b3650;border-radius:14px;padding:18px;margin:14px 0}input,textarea,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #394766;margin:4px}input,textarea{background:#0d1426;color:#fff;max-width:100%;width:320px}button{background:#e5b94b;color:#111;font-weight:bold;cursor:pointer}table{width:100%;border-collapse:collapse}td,th{text-align:right;border-bottom:1px solid #2b3650;padding:9px;font-size:13px}.wrap{overflow:auto}.muted{color:#aab6cc}</style></head><body><main><h1>اتوماسیون 10X</h1><p class="muted">یادآورهای ثبت‌نام، پیام‌های تلگرام و پیگیری پشتیبانی. توکن در حافظه صفحه نگهداری می‌شود.</p><section class="card"><input id="token" type="password" placeholder="ADMIN_API_TOKEN (حداقل ۳۲ کاراکتر)" autocomplete="off"><button id="connect">اتصال و بارگذاری</button><p id="msg" class="muted">ابتدا توکن مدیر را وارد کن.</p></section><section class="card"><h2>زمان‌بندی یادآور ثبت‌نام</h2><form id="follow"><input id="uid" placeholder="شناسه داخلی کاربر (User ID)" required><input id="due" type="datetime-local" required><button>ثبت یادآور</button></form></section><section class="card"><h2>ارسال پیام تلگرام</h2><form id="notify"><input id="nuid" placeholder="شناسه داخلی کاربر (User ID)" required><input id="title" placeholder="عنوان پیام" required maxlength="120"><textarea id="body" placeholder="متن پیام" required maxlength="3500"></textarea><button>قرار دادن در صف ارسال</button></form></section><section class="card"><h2>آخرین یادآورها</h2><div class="wrap"><table><thead><tr><th>کاربر</th><th>زمان</th><th>وضعیت</th><th>تلاش</th><th>خطا</th></tr></thead><tbody id="jobs"><tr><td colspan="5">هنوز بارگذاری نشده</td></tr></tbody></table></div></section><section class="card"><h2>آخرین پیام‌ها</h2><div class="wrap"><table><thead><tr><th>کاربر</th><th>عنوان</th><th>وضعیت</th><th>ایجاد</th></tr></thead><tbody id="notes"><tr><td colspan="4">هنوز بارگذاری نشده</td></tr></tbody></table></div></section><section class="card"><h2>درخواست‌های پشتیبانی</h2><form id="reply"><input id="tid" placeholder="شناسه تیکت" required><textarea id="replybody" placeholder="پاسخ مدیر" required maxlength="3500"></textarea><button>ثبت پاسخ و ارسال به تلگرام</button></form><div class="wrap"><table><thead><tr><th>تیکت</th><th>کاربر</th><th>موضوع</th><th>وضعیت</th><th>آخرین پیام</th></tr></thead><tbody id="tickets"><tr><td colspan="5">هنوز بارگذاری نشده</td></tr></tbody></table></div></section></main><script>let token='';const $=id=>document.getElementById(id);try{const s=sessionStorage.getItem('tenx_admin_token');if(s)$('token').value=s}catch(e){}function message(t){$('msg').textContent=t}async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{'content-type':'application/json',authorization:'Bearer '+token,...opts.headers}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'request_failed');return d}function row(body,values){const tr=document.createElement('tr');values.forEach(v=>{const td=document.createElement('td');td.textContent=v??'—';tr.append(td)});body.append(tr)}async function load(){const [j,n,t]=await Promise.all([api('/admin/followups'),api('/admin/notifications'),api('/admin/tickets')]);$('jobs').replaceChildren();j.items.forEach(x=>row($('jobs'),[x.userId,new Date(x.dueAt).toLocaleString('fa-IR'),x.status,x.attempts,x.lastError]));if(!j.items.length)row($('jobs'),['—','—','موردی نیست','—','—']);$('notes').replaceChildren();n.items.forEach(x=>row($('notes'),[x.userId,x.title,x.status,new Date(x.createdAt).toLocaleString('fa-IR')]));if(!n.items.length)row($('notes'),['—','—','موردی نیست','—']);$('tickets').replaceChildren();t.items.forEach(x=>row($('tickets'),[x.id,x.user.username||x.user.telegramId||x.user.id,x.subject,x.status,x.messages.length?x.messages[x.messages.length-1].body:'—']));if(!t.items.length)row($('tickets'),['—','—','موردی نیست','—','—']);message('اتصال برقرار شد.')}$('connect').addEventListener('click',async()=>{token=$('token').value;try{await load()}catch(e){message('خطا: '+e.message)}});$('follow').addEventListener('submit',async e=>{e.preventDefault();try{await api('/admin/followups',{method:'POST',body:JSON.stringify({userId:$('uid').value.trim(),dueAt:new Date($('due').value).toISOString()})});await load();message('یادآور ثبت شد.')}catch(e){message('خطا: '+e.message)}});$('notify').addEventListener('submit',async e=>{e.preventDefault();try{await api('/admin/notifications',{method:'POST',body:JSON.stringify({userId:$('nuid').value.trim(),title:$('title').value.trim(),body:$('body').value.trim()})});await load();message('پیام در صف ارسال قرار گرفت.')}catch(e){message('خطا: '+e.message)}});$('reply').addEventListener('submit',async e=>{e.preventDefault();try{await api('/admin/tickets/'+encodeURIComponent($('tid').value.trim())+'/reply',{method:'POST',body:JSON.stringify({body:$('replybody').value.trim()})});$('replybody').value='';await load();message('پاسخ ثبت شد و در صورت وجود حساب تلگرام در صف ارسال قرار گرفت.')}catch(e){message('خطا: '+e.message)}});</script></body></html>`;
});

app.get('/admin/followups', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const jobs = await prisma.followUpJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, userId: true, dueAt: true, status: true, attempts: true, lastError: true, createdAt: true } });
  return { items: jobs };
});

app.post('/admin/followups', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const parsed = z.object({ userId: z.string().min(1).max(64), dueAt: z.string().datetime() }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, include: { telegramAccount: true } });
  if (!user || !user.telegramAccount) return reply.code(404).send({ error: 'telegram_user_not_found' });
  const job = await prisma.followUpJob.create({ data: { userId: user.id, dueAt: new Date(parsed.data.dueAt), status: 'PENDING' } });
  await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'FOLLOWUP_SCHEDULED', entityType: 'FollowUpJob', entityId: job.id, userId: user.id, metadata: { dueAt: job.dueAt.toISOString() } } });
  return reply.code(201).send({ item: job });
});

app.get('/admin/notifications', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const items = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, userId: true, channel: true, title: true, body: true, status: true, sentAt: true, createdAt: true } });
  return { items };
});

app.post('/admin/notifications', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const parsed = z.object({ userId: z.string().min(1).max(64), title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(3500) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, include: { telegramAccount: true } });
  if (!user || !user.telegramAccount) return reply.code(404).send({ error: 'telegram_user_not_found' });
  const item = await prisma.notification.create({ data: { userId: user.id, channel: 'TELEGRAM', title: parsed.data.title, body: parsed.data.body, status: 'PENDING' } });
  await prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'TELEGRAM_NOTIFICATION_QUEUED', entityType: 'Notification', entityId: item.id, userId: user.id, metadata: { channel: 'TELEGRAM' } } });
  return reply.code(201).send({ item });
});

app.post('/admin/notifications/:id/retry', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const params = z.object({ id: z.string().min(1).max(64) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
  const result = await prisma.notification.updateMany({ where: { id: params.data.id, status: 'FAILED' }, data: { status: 'PENDING' } });
  if (!result.count) return reply.code(404).send({ error: 'failed_notification_not_found' });
  return { ok: true };
});

app.get('/admin/tickets', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const items = await prisma.supportTicket.findMany({ orderBy: { updatedAt: 'desc' }, take: 100, include: { user: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 20, select: { id: true, senderType: true, body: true, createdAt: true } } } });
  return { items };
});

app.post('/admin/tickets/:id/reply', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const params = z.object({ id: z.string().min(1).max(64) }).safeParse(request.params);
  const body = z.object({ body: z.string().trim().min(1).max(3500) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.data.id }, include: { user: { include: { telegramAccount: true } } } });
  if (!ticket) return reply.code(404).send({ error: 'ticket_not_found' });
  const result = await prisma.$transaction(async tx => {
    const message = await tx.supportMessage.create({ data: { ticketId: ticket.id, senderType: 'ADMIN', body: body.data.body } });
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: 'WAITING_USER' } });
    if (ticket.user.telegramAccount) await tx.notification.create({ data: { userId: ticket.userId, channel: 'TELEGRAM', title: 'پاسخ پشتیبانی 10X', body: body.data.body, status: 'PENDING' } });
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), userId: ticket.userId, action: 'SUPPORT_REPLY_CREATED', entityType: 'SupportTicket', entityId: ticket.id, metadata: { telegramNotificationQueued: Boolean(ticket.user.telegramAccount) } } });
    return message;
  });
  return reply.code(201).send({ item: result, notificationQueued: Boolean(ticket.user.telegramAccount) });
});

app.post('/auth/telegram', async (request, reply) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return reply.code(503).send({ error: 'telegram_auth_not_configured' });
  const body = z.object({ initData: z.string().min(1).max(10000) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
  const age = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS || 86400);
  const result = validateTelegramInitData(body.data.initData, token, age);
  if (!result.ok) return reply.code(401).send({ error: 'invalid_telegram_init_data', reason: result.reason });
  const telegramId = String(result.user.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true, firstName: true, lastName: true, username: true, phone: true, registeredAt: true, createdAt: true, registrationStatus: true, registrationStage: true } });
  if (!user) return reply.code(404).send({ error: 'registration_required' });
  await prisma.user.update({ where: { id: user.id }, data: { lastActivityAt: new Date() } });
  // Phase 1 returns a validated profile only; session issuance is added with the full auth/RBAC phase.
  return { authenticated: true, user };
});

// ---- Academy (admin + Mini App) ----
const nz = (v: string | null | undefined) => (v === '' ? null : v);
const pick = <K extends string, V>(k: K, v: V | undefined) => (v === undefined ? {} : { [k]: v }) as { [P in K]?: V };
const academyIdParam = z.object({ id: z.string().min(1).max(64) });
const academyStatus = z.enum(['DRAFT', 'PUBLISHED']);
const academyUrl = z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'https_url_required').nullable().optional();
const courseInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  status: academyStatus.optional()
}).strict();
const lessonInput = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).nullable().optional(),
  body: z.string().trim().max(20000).nullable().optional(),
  videoUrl: academyUrl,
  sortOrder: z.number().int().min(0).max(100000).optional(),
  status: academyStatus.optional()
}).strict();
const academyAudit = (request: FastifyRequest, action: string, entityId: string) =>
  prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action, entityType: 'Academy', entityId } });

app.get('/admin/academy/courses', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const courses = await prisma.course.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { lessons: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } });
  const done = await prisma.lessonProgress.groupBy({ by: ['lessonId'], where: { completedAt: { not: null } }, _count: { _all: true } });
  const doneMap = new Map(done.map((d) => [d.lessonId, d._count._all]));
  return { items: courses.map((c) => ({ ...c, lessons: c.lessons.map((l) => ({ ...l, completed: doneMap.get(l.id) ?? 0 })) })) };
});

app.post('/admin/academy/courses', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const b = courseInput.safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_body', details: b.error.flatten() });
  const created = await prisma.course.create({ data: { title: b.data.title, ...pick('description', nz(b.data.description)), ...pick('sortOrder', b.data.sortOrder), ...pick('status', b.data.status) } });
  await academyAudit(request, 'ACADEMY_COURSE_CREATED', created.id);
  return reply.code(201).send(created);
});

app.patch('/admin/academy/courses/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = academyIdParam.safeParse(request.params);
  const b = courseInput.partial().safeParse(request.body);
  if (!p.success || !b.success || Object.keys(b.data).length === 0) return reply.code(400).send({ error: 'invalid_request' });
  if (!(await prisma.course.findUnique({ where: { id: p.data.id }, select: { id: true } }))) return reply.code(404).send({ error: 'not_found' });
  const updated = await prisma.course.update({ where: { id: p.data.id }, data: { ...pick('title', b.data.title), ...pick('description', nz(b.data.description)), ...pick('sortOrder', b.data.sortOrder), ...pick('status', b.data.status) } });
  await academyAudit(request, 'ACADEMY_COURSE_UPDATED', updated.id);
  return updated;
});

app.delete('/admin/academy/courses/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = academyIdParam.safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  const lessons = await prisma.lesson.findMany({ where: { courseId: p.data.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.lessonProgress.deleteMany({ where: { lessonId: { in: lessons.map((l) => l.id) } } }),
    prisma.course.deleteMany({ where: { id: p.data.id } })
  ]);
  await academyAudit(request, 'ACADEMY_COURSE_DELETED', p.data.id);
  return { ok: true };
});

app.post('/admin/academy/courses/:id/lessons', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = academyIdParam.safeParse(request.params);
  const b = lessonInput.safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request', details: b.success ? undefined : b.error.flatten() });
  if (!(await prisma.course.findUnique({ where: { id: p.data.id }, select: { id: true } }))) return reply.code(404).send({ error: 'course_not_found' });
  const created = await prisma.lesson.create({ data: { courseId: p.data.id, title: b.data.title, ...pick('summary', nz(b.data.summary)), ...pick('body', nz(b.data.body)), ...pick('videoUrl', nz(b.data.videoUrl)), ...pick('sortOrder', b.data.sortOrder), ...pick('status', b.data.status) } });
  await academyAudit(request, 'ACADEMY_LESSON_CREATED', created.id);
  return reply.code(201).send(created);
});

app.patch('/admin/academy/lessons/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = academyIdParam.safeParse(request.params);
  const b = lessonInput.partial().safeParse(request.body);
  if (!p.success || !b.success || Object.keys(b.data).length === 0) return reply.code(400).send({ error: 'invalid_request' });
  if (!(await prisma.lesson.findUnique({ where: { id: p.data.id }, select: { id: true } }))) return reply.code(404).send({ error: 'not_found' });
  const updated = await prisma.lesson.update({ where: { id: p.data.id }, data: { ...pick('title', b.data.title), ...pick('summary', nz(b.data.summary)), ...pick('body', nz(b.data.body)), ...pick('videoUrl', nz(b.data.videoUrl)), ...pick('sortOrder', b.data.sortOrder), ...pick('status', b.data.status) } });
  await academyAudit(request, 'ACADEMY_LESSON_UPDATED', updated.id);
  return updated;
});

app.delete('/admin/academy/lessons/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = academyIdParam.safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  await prisma.$transaction([
    prisma.lessonProgress.deleteMany({ where: { lessonId: p.data.id } }),
    prisma.lesson.deleteMany({ where: { id: p.data.id } })
  ]);
  await academyAudit(request, 'ACADEMY_LESSON_DELETED', p.data.id);
  return { ok: true };
});

async function miniUser(initData: string, requireRegistered = true): Promise<{ id: string } | { code: number; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { code: 503, error: 'telegram_auth_not_configured' };
  const r = validateTelegramInitData(initData, token, Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS || 86400));
  if (!r.ok) return { code: 401, error: 'invalid_telegram_init_data' };
  const u = await prisma.user.findUnique({ where: { telegramId: String(r.user.id) }, select: { id: true, registrationStatus: true } });
  if (!u) return { code: 404, error: 'registration_required' };
  if (requireRegistered && !['REGISTERED', 'COMPLETE'].includes(u.registrationStatus)) return { code: 403, error: 'registration_incomplete' };
  return { id: u.id };
}
const miniBody = z.object({ initData: z.string().min(1).max(10000), completed: z.boolean().optional() });

app.post('/academy/courses', async (request, reply) => {
  const b = miniBody.safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  const courses = await prisma.course.findMany({ where: { status: 'PUBLISHED' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { lessons: { where: { status: 'PUBLISHED' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, summary: true } } } });
  const progress = await prisma.lessonProgress.findMany({ where: { userId: who.id, completedAt: { not: null } }, select: { lessonId: true } });
  const done = new Set(progress.map((x) => x.lessonId));
  return { items: courses.map((c) => ({ id: c.id, title: c.title, description: c.description, lessons: c.lessons.map((l) => ({ ...l, done: done.has(l.id) })) })) };
});

app.post('/academy/lessons/:id', async (request, reply) => {
  const p = academyIdParam.safeParse(request.params);
  const b = miniBody.safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  const lesson = await prisma.lesson.findFirst({ where: { id: p.data.id, status: 'PUBLISHED', course: { status: 'PUBLISHED' } }, select: { id: true, title: true, summary: true, body: true, videoUrl: true } });
  if (!lesson) return reply.code(404).send({ error: 'not_found' });
  const pr = await prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: who.id, lessonId: lesson.id } }, select: { completedAt: true } });
  return { ...lesson, done: Boolean(pr?.completedAt) };
});

app.post('/academy/lessons/:id/progress', async (request, reply) => {
  const p = academyIdParam.safeParse(request.params);
  const b = miniBody.safeParse(request.body);
  if (!p.success || !b.success || typeof b.data.completed !== 'boolean') return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  const lesson = await prisma.lesson.findFirst({ where: { id: p.data.id, status: 'PUBLISHED', course: { status: 'PUBLISHED' } }, select: { id: true } });
  if (!lesson) return reply.code(404).send({ error: 'not_found' });
  const completedAt = b.data.completed ? new Date() : null;
  const progressPct = b.data.completed ? 100 : 0;
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: who.id, lessonId: lesson.id } },
    create: { userId: who.id, lessonId: lesson.id, completedAt, progressPct },
    update: { completedAt, progressPct }
  });
  return { ok: true, done: b.data.completed };
});

// ---- Page builder + popups ----
const PAGE_SLUGS = ['index', 'academy', 'crypto', 'copy-trading', 'challenge', 'support', 'profile'] as const;
const REG_ORDER = ['STARTED', 'CHANNELS_PENDING', 'CONSENT_PENDING', 'PHONE_PENDING', 'REGISTERED', 'MINI_APP_PENDING', 'COMPLETE'];
const safeLink = z.string().trim().max(500).refine((v) => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v), 'https_or_internal_path');
const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(3000) }),
  z.object({ type: z.literal('image'), url: safeLink, alt: z.string().trim().max(200).optional() }),
  z.object({ type: z.literal('button'), text: z.string().trim().min(1).max(80), url: safeLink }),
  z.object({ type: z.literal('banner'), title: z.string().trim().min(1).max(200), text: z.string().trim().max(1000).optional(), url: safeLink.optional() }),
  z.object({ type: z.literal('progress'), kind: z.enum(['registration', 'academy']), title: z.string().trim().max(120).optional() }),
  z.object({ type: z.literal('divider') }),
  z.object({
    type: z.literal('element'),
    selector: z.string().trim().min(1).max(500),
    deleted: z.boolean().optional(),
    text: z.string().max(3000).optional(),
    href: safeLink.optional(),
    src: safeLink.optional(),
    alt: z.string().max(200).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    fontSize: z.number().min(8).max(96).optional(),
    fontWeight: z.enum(['300','400','500','600','700','800','900']).optional(),
    borderRadius: z.number().min(0).max(80).optional(),
    padding: z.number().min(0).max(100).optional(),
    margin: z.number().min(0).max(100).optional(),
    opacity: z.number().min(0).max(1).optional(),
    lineHeight: z.number().min(0.8).max(3).optional(),
    letterSpacing: z.number().min(-2).max(20).optional(),
    textAlign: z.enum(['left','right','center','justify']).optional(),
    width: z.number().min(0).max(1200).optional(),
    maxWidth: z.number().min(0).max(1200).optional(),
    minHeight: z.number().min(0).max(1200).optional(),
    borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    borderWidth: z.number().min(0).max(20).optional(),
    shadow: z.enum(['none','soft','medium','strong']).optional()
  })
]);
const popupInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  imageUrl: safeLink.nullable().optional(),
  buttonText: z.string().trim().min(1).max(80).nullable().optional(),
  buttonUrl: safeLink.nullable().optional(),
  pageSlug: z.enum(PAGE_SLUGS),
  frequency: z.enum(['ONCE', 'EVERY_VISIT']),
  status: z.enum(['DRAFT', 'PUBLISHED'])
}).strict();
const toInputJson = (value: Prisma.JsonValue) =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

const contentAudit = (request: FastifyRequest, action: string, entityId: string) =>
  prisma.auditLog.create({ data: { adminUserId: adminIdOf(request), action, entityType: 'Content', entityId } });

app.get('/admin/content/pages', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const rows = await prisma.contentPage.findMany();
  const map = new Map(rows.map((r) => [r.slug, r]));
  return { items: PAGE_SLUGS.map((slug) => { const r = map.get(slug); return { slug, title: r?.title ?? null, status: r?.status ?? 'DRAFT', blocks: Array.isArray(r?.blocks) ? r.blocks : [], updatedAt: r?.updatedAt ?? null }; }) };
});


app.get('/admin/content/pages/:slug/editor', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });

  const [draft, published] = await Promise.all([
    prisma.contentPageDraft.findUnique({ where: { slug: p.data.slug } }),
    prisma.contentPage.findUnique({ where: { slug: p.data.slug } })
  ]);

  const source = draft ?? published;

  return {
    slug: p.data.slug,
    title: source?.title ?? null,
    blocks: Array.isArray(source?.blocks) ? source.blocks : [],
    hasDraft: Boolean(draft),
    draftUpdatedAt: draft?.updatedAt ?? null,
    published: {
      title: published?.title ?? null,
      blocks: Array.isArray(published?.blocks) ? published.blocks : [],
      status: published?.status ?? 'DRAFT',
      updatedAt: published?.updatedAt ?? null
    }
  };
});

app.put('/admin/content/pages/:slug/draft', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  const b = z.object({
    title: z.string().trim().max(200).nullable().optional(),
    blocks: z.array(blockSchema).max(40)
  }).strict().safeParse(request.body);

  if (!p.success || !b.success) {
    return reply.code(400).send({
      error: 'invalid_request',
      details: b.success ? undefined : b.error.flatten()
    });
  }

  const blocks = JSON.parse(JSON.stringify(b.data.blocks));
  const title = b.data.title ?? null;

  const saved = await prisma.$transaction(async (tx) => {
    const draft = await tx.contentPageDraft.upsert({
      where: { slug: p.data.slug },
      create: { slug: p.data.slug, title, blocks },
      update: { title, blocks }
    });

    const latest = await tx.contentPageVersion.aggregate({
      where: { pageSlug: p.data.slug },
      _max: { version: true }
    });

    await tx.contentPageVersion.create({
      data: {
        pageSlug: p.data.slug,
        version: (latest._max.version ?? 0) + 1,
        title: draft.title,
        blocks: toInputJson(draft.blocks),
        status: 'DRAFT',
        createdByAdminId: adminIdOf(request)
      }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'CONTENT_PAGE_DRAFT_SAVED',
        entityType: 'ContentPageDraft',
        entityId: p.data.slug
      }
    });

    return draft;
  });

  return { ok: true, updatedAt: saved.updatedAt };
});

app.post('/admin/content/pages/:slug/publish', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });

  const published = await prisma.$transaction(async (tx) => {
    const draft = await tx.contentPageDraft.findUnique({
      where: { slug: p.data.slug }
    });

    if (!draft) return null;

    const page = await tx.contentPage.upsert({
      where: { slug: p.data.slug },
      create: {
        slug: p.data.slug,
        title: draft.title,
        blocks: toInputJson(draft.blocks),
        status: 'PUBLISHED'
      },
      update: {
        title: draft.title,
        blocks: toInputJson(draft.blocks),
        status: 'PUBLISHED'
      }
    });

    const latest = await tx.contentPageVersion.aggregate({
      where: { pageSlug: p.data.slug },
      _max: { version: true }
    });

    await tx.contentPageVersion.create({
      data: {
        pageSlug: p.data.slug,
        version: (latest._max.version ?? 0) + 1,
        title: page.title,
        blocks: toInputJson(page.blocks),
        status: 'PUBLISHED',
        createdByAdminId: adminIdOf(request)
      }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'CONTENT_PAGE_PUBLISHED',
        entityType: 'ContentPage',
        entityId: p.data.slug,
        metadata: { status: 'PUBLISHED' }
      }
    });

    return page;
  });

  if (!published) {
    return reply.code(409).send({ error: 'draft_not_found' });
  }

  return { ok: true, status: published.status, updatedAt: published.updatedAt };
});

app.put('/admin/content/pages/:slug', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  const b = z.object({ title: z.string().trim().max(200).nullable().optional(), status: z.enum(['DRAFT', 'PUBLISHED']), blocks: z.array(blockSchema).max(40) }).strict().safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request', details: b.success ? undefined : b.error.flatten() });
  const blocks = JSON.parse(JSON.stringify(b.data.blocks));
  const saved = await prisma.$transaction(async (tx) => {
    const page = await tx.contentPage.upsert({
      where: { slug: p.data.slug },
      create: { slug: p.data.slug, status: b.data.status, blocks, ...pick('title', b.data.title) },
      update: { status: b.data.status, blocks, ...pick('title', b.data.title) }
    });
    const latest = await tx.contentPageVersion.aggregate({ where: { pageSlug: page.slug }, _max: { version: true } });
    await tx.contentPageVersion.create({ data: {
      pageSlug: page.slug, version: (latest._max.version ?? 0) + 1,
      title: page.title, blocks: toInputJson(page.blocks), status: page.status,
      createdByAdminId: adminIdOf(request)
    } });
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: page.status === 'PUBLISHED' ? 'CONTENT_PAGE_PUBLISHED' : 'CONTENT_PAGE_DRAFT_SAVED', entityType: 'ContentPage', entityId: page.slug, metadata: { status: page.status } } });
    return page;
  });
  return { ok: true, updatedAt: saved.updatedAt };
});

app.get('/admin/content/pages/:slug/versions', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  const items = await prisma.contentPageVersion.findMany({
    where: { pageSlug: p.data.slug }, orderBy: { version: 'desc' }, take: 50,
    select: { id: true, version: true, title: true, status: true, createdAt: true, createdBy: { select: { email: true } } }
  });
  return { items };
});

app.post('/admin/content/pages/:slug/rollback', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  const b = z.object({ versionId: z.string().min(1).max(64) }).strict().safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request' });

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.contentPageVersion.findFirst({
      where: { id: b.data.versionId, pageSlug: p.data.slug }
    });
    if (!target) return null;

    let restoredStatus = target.status;

    if (target.status === 'DRAFT') {
      const restored = await tx.contentPageDraft.upsert({
        where: { slug: p.data.slug },
        create: {
          slug: p.data.slug,
          title: target.title,
          blocks: toInputJson(target.blocks)
        },
        update: {
          title: target.title,
          blocks: toInputJson(target.blocks)
        }
      });
      await tx.auditLog.create({
        data: {
          adminUserId: adminIdOf(request),
          action: 'CONTENT_PAGE_DRAFT_ROLLED_BACK',
          entityType: 'ContentPageDraft',
          entityId: p.data.slug,
          metadata: { sourceVersion: target.version }
        }
      });
      restoredStatus = 'DRAFT';
    } else {
      const restored = await tx.contentPage.upsert({
        where: { slug: p.data.slug },
        create: {
          slug: p.data.slug,
          title: target.title,
          blocks: toInputJson(target.blocks),
          status: 'PUBLISHED'
        },
        update: {
          title: target.title,
          blocks: toInputJson(target.blocks),
          status: 'PUBLISHED'
        }
      });

      // Keep the editor draft aligned with the version just restored live.
      await tx.contentPageDraft.upsert({
        where: { slug: p.data.slug },
        create: {
          slug: p.data.slug,
          title: restored.title,
          blocks: toInputJson(restored.blocks)
        },
        update: {
          title: restored.title,
          blocks: toInputJson(restored.blocks)
        }
      });
    }

    const latest = await tx.contentPageVersion.aggregate({
      where: { pageSlug: p.data.slug },
      _max: { version: true }
    });

    const version = await tx.contentPageVersion.create({
      data: {
        pageSlug: p.data.slug,
        version: (latest._max.version ?? 0) + 1,
        title: target.title,
        blocks: toInputJson(target.blocks),
        status: restoredStatus,
        createdByAdminId: adminIdOf(request)
      }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'CONTENT_PAGE_ROLLED_BACK',
        entityType: 'ContentPage',
        entityId: p.data.slug,
        metadata: {
          sourceVersion: target.version,
          createdVersion: version.version,
          restoredStatus
        }
      }
    });

    return { version: version.version, status: restoredStatus };
  });

  if (!result) return reply.code(404).send({ error: 'version_not_found' });
  return { ok: true, ...result };
});

app.get('/admin/content/popups', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  return { items: await prisma.popup.findMany({ orderBy: { createdAt: 'asc' } }) };
});

app.post('/admin/content/popups', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const b = popupInput.safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_body', details: b.error.flatten() });
  const created = await prisma.popup.create({ data: { title: b.data.title, body: b.data.body, pageSlug: b.data.pageSlug, frequency: b.data.frequency, status: b.data.status, ...pick('imageUrl', b.data.imageUrl), ...pick('buttonText', b.data.buttonText), ...pick('buttonUrl', b.data.buttonUrl) } });
  await contentAudit(request, 'CONTENT_POPUP_CREATED', created.id);
  return reply.code(201).send(created);
});

app.patch('/admin/content/popups/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = academyIdParam.safeParse(request.params);
  const b = popupInput.partial().safeParse(request.body);
  if (!p.success || !b.success || Object.keys(b.data).length === 0) return reply.code(400).send({ error: 'invalid_request' });
  if (!(await prisma.popup.findUnique({ where: { id: p.data.id }, select: { id: true } }))) return reply.code(404).send({ error: 'not_found' });
  const d = b.data;
  const updated = await prisma.popup.update({ where: { id: p.data.id }, data: { ...pick('title', d.title), ...pick('body', d.body), ...pick('pageSlug', d.pageSlug), ...pick('frequency', d.frequency), ...pick('status', d.status), ...pick('imageUrl', d.imageUrl), ...pick('buttonText', d.buttonText), ...pick('buttonUrl', d.buttonUrl) } });
  await contentAudit(request, 'CONTENT_POPUP_UPDATED', updated.id);
  return updated;
});

app.delete('/admin/content/popups/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = academyIdParam.safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  await prisma.$transaction([prisma.popupView.deleteMany({ where: { popupId: p.data.id } }), prisma.popup.deleteMany({ where: { id: p.data.id } })]);
  await contentAudit(request, 'CONTENT_POPUP_DELETED', p.data.id);
  return { ok: true };
});


// ---- HOME_LINKS_V1 ----
const HOME_LINK_DEFAULTS = {
  'home.logo': '/miniapp',
  'home.profile': '/profile',
  'home.hero.cta': '/profile',
  'home.academy': '/academy',
  'home.challenge': '/challenge',
  'home.crypto': '/crypto',
  'home.copy-trading': '/copy-trading',
  'home.support': '/support'
};

function normalizeHomeLinks(value: unknown): Record<string, string> {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return Object.fromEntries(
    Object.entries(HOME_LINK_DEFAULTS).map(([key, fallback]) => {
      const candidate = source[key];
      const valid = typeof candidate === 'string'
        && /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(candidate);
      return [key, valid ? candidate : fallback];
    })
  );
}

const homeLinkInput = z.object({
  'home.logo': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v)),
  'home.profile': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v)),
  'home.hero.cta': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v)),
  'home.academy': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v)),
  'home.challenge': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v)),
  'home.crypto': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v)),
  'home.copy-trading': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v)),
  'home.support': z.string().trim().max(500).refine(v => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(v))
}).strict();

app.get('/admin/home-links', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'HOME_LINKS_V1' }
  });
  return { links: normalizeHomeLinks(row?.value) };
});

app.put('/admin/home-links', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const parsed = homeLinkInput.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'invalid_home_links',
      details: parsed.error.flatten()
    });
  }

  const links = parsed.data;

  await prisma.systemSetting.upsert({
    where: { key: 'HOME_LINKS_V1' },
    create: { key: 'HOME_LINKS_V1', value: links },
    update: { value: links }
  });

  await prisma.auditLog.create({
    data: {
      adminUserId: adminIdOf(request),
      action: 'ADMIN_HOME_LINKS_UPDATED',
      entityType: 'SystemSetting',
      metadata: { keys: Object.keys(links) }
    }
  });

  return { ok: true, links };
});

app.post('/content/page', async (request, reply) => {
  const b = z.object({ initData: z.string().min(1).max(10000), slug: z.enum(PAGE_SLUGS) }).safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData, false);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  const [user, page, lessons, popups] = await Promise.all([
    prisma.user.findUnique({ where: { id: who.id }, select: { registrationStage: true } }),
    prisma.contentPage.findUnique({ where: { slug: b.data.slug } }),
    prisma.lesson.findMany({ where: { status: 'PUBLISHED', course: { status: 'PUBLISHED' } }, select: { id: true } }),
    prisma.popup.findMany({ where: { status: 'PUBLISHED', pageSlug: b.data.slug }, orderBy: { createdAt: 'asc' } })
  ]);
  const lessonIds = lessons.map((l) => l.id);
  const done = lessonIds.length ? await prisma.lessonProgress.count({ where: { userId: who.id, completedAt: { not: null }, lessonId: { in: lessonIds } } }) : 0;
  const seenRows = popups.length ? await prisma.popupView.findMany({ where: { userId: who.id, popupId: { in: popups.map((x) => x.id) } }, select: { popupId: true } }) : [];
  const seen = new Set(seenRows.map((x) => x.popupId));
  const popup = popups.find((x) => x.frequency === 'EVERY_VISIT' || !seen.has(x.id)) ?? null;
  const homeLinksRow = b.data.slug === 'index'
    ? await prisma.systemSetting.findUnique({ where: { key: 'HOME_LINKS_V1' } })
    : null;
  const homeLinks = b.data.slug === 'index'
    ? normalizeHomeLinks(homeLinksRow?.value)
    : undefined;
  const stage = user?.registrationStage ?? 'STARTED';
  const idx = Math.max(0, REG_ORDER.indexOf(stage));
  return {
    blocks: page && page.status === 'PUBLISHED' && Array.isArray(page.blocks) ? page.blocks : [],
    ...(homeLinks ? { homeLinks } : {}),
    progress: { registration: { stage, pct: Math.round((idx / (REG_ORDER.length - 1)) * 100) }, academy: { done, total: lessonIds.length, pct: lessonIds.length ? Math.round((done / lessonIds.length) * 100) : 0 } },
    popup: popup ? { id: popup.id, title: popup.title, body: popup.body, imageUrl: popup.imageUrl, buttonText: popup.buttonText, buttonUrl: popup.buttonUrl } : null
  };
});

app.post('/content/popup/:id/seen', async (request, reply) => {
  const p = academyIdParam.safeParse(request.params);
  const b = miniBody.safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  await prisma.popupView.upsert({ where: { userId_popupId: { userId: who.id, popupId: p.data.id } }, create: { userId: who.id, popupId: p.data.id }, update: { seenAt: new Date() } });
  return { ok: true };
});


// ---- PROGRESS_API_V1 ----
const progressDraftInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional()
}).strict();

app.get('/admin/progress', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const versions = await prisma.progressPathVersion.findMany({
    orderBy: { version: 'desc' },
    include: {
      stages: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      _count: { select: { assignments: true } }
    }
  });

  return { items: versions };
});

app.post('/admin/progress/draft', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const parsed = progressDraftInput.safeParse(request.body ?? {});
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });

  const existing = await prisma.progressPathVersion.findFirst({
    where: { status: 'DRAFT' },
    orderBy: { version: 'desc' },
    include: { stages: { orderBy: { sortOrder: 'asc' } } }
  });

  if (existing) return { ok: true, reused: true, item: existing };

  const latest = await prisma.progressPathVersion.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { version: 'desc' }
  });

  const max = await prisma.progressPathVersion.aggregate({
    _max: { version: true }
  });

  try {
    const created = await prisma.progressPathVersion.create({
      data: {
        version: (max._max.version ?? 0) + 1,
        title: parsed.data.title ?? latest?.title ?? 'مسیر پیشرفت 10X',
        description: parsed.data.description ?? latest?.description ?? null,
        status: 'DRAFT'
      },
      include: { stages: true }
    });

    await prisma.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'PROGRESS_DRAFT_CREATED',
        entityType: 'ProgressPathVersion',
        entityId: created.id,
        metadata: { version: created.version }
      }
    });

    return reply.code(201).send({ ok: true, reused: false, item: created });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const draft = await prisma.progressPathVersion.findFirst({
        where: { status: 'DRAFT' },
        orderBy: { version: 'desc' },
        include: { stages: true }
      });
      if (draft) return { ok: true, reused: true, item: draft };
    }
    throw error;
  }
});

// ---- PROGRESS_STAGES_API_V1 ----
const progressStageCreateInput = z.object({
  pathVersionId: z.string().min(1).max(100),
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000).nullable().optional(),
  weight: z.number().int().min(0).max(100),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isVisible: z.boolean().optional(),
  completionType: z.enum(['MANUAL', 'REGISTRATION_STAGE']),
  completionConfig: z.record(z.string(), z.unknown()).optional(),
  prerequisiteIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  actionType: z.string().max(20).nullable().optional(),
  actionTarget: z.string().max(500).nullable().optional()
}).strict();

const progressStageUpdateInput = progressStageCreateInput
  .omit({ pathVersionId: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0);

async function validProgressPrerequisites(
  pathVersionId: string,
  ids: string[],
  currentId?: string
): Promise<boolean> {
  if (new Set(ids).size !== ids.length) return false;
  if (currentId && ids.includes(currentId)) return false;
  if (ids.length === 0) return true;

  const found = await prisma.progressStage.findMany({
    where: {
      id: { in: ids },
      pathVersionId,
      isActive: true
    },
    select: { id: true }
  });

  return found.length === ids.length;
}

app.post('/admin/progress/stages', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const parsed = progressStageCreateInput.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });

  const input = parsed.data;
  const version = await prisma.progressPathVersion.findUnique({
    where: { id: input.pathVersionId },
    select: { id: true, status: true }
  });

  if (!version) return reply.code(404).send({ error: 'progress_version_not_found' });
  if (version.status !== 'DRAFT') {
    return reply.code(409).send({ error: 'progress_version_not_draft' });
  }

  const prerequisites = input.prerequisiteIds ?? [];
  if (!(await validProgressPrerequisites(version.id, prerequisites))) {
    return reply.code(400).send({ error: 'invalid_progress_prerequisites' });
  }

  try {
    const created = await prisma.$transaction(async tx => {
      const stage = await tx.progressStage.create({
        data: {
          pathVersionId: version.id,
          key: input.key,
          title: input.title,
          description: input.description,
          weight: input.weight,
          sortOrder: input.sortOrder ?? 0,
          isVisible: input.isVisible ?? true,
          completionType: input.completionType,
          completionConfig: input.completionConfig as Prisma.InputJsonValue | undefined,
          prerequisiteIds: prerequisites as Prisma.InputJsonValue,
          actionType: input.actionType,
          actionTarget: input.actionTarget
        }
      });

      await tx.auditLog.create({
        data: {
          adminUserId: adminIdOf(request),
          action: 'PROGRESS_STAGE_CREATED',
          entityType: 'ProgressStage',
          entityId: stage.id,
          metadata: { versionId: version.id, key: stage.key }
        }
      });

      return stage;
    });

    return reply.code(201).send({ ok: true, item: created });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return reply.code(409).send({ error: 'progress_stage_key_exists' });
    }
    throw error;
  }
});

app.patch('/admin/progress/stages/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const params = z.object({ id: z.string().min(1).max(100) }).safeParse(request.params);
  const parsed = progressStageUpdateInput.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const existing = await prisma.progressStage.findUnique({
    where: { id: params.data.id },
    include: { pathVersion: { select: { status: true } } }
  });

  if (!existing) return reply.code(404).send({ error: 'progress_stage_not_found' });
  if (existing.pathVersion.status !== 'DRAFT') {
    return reply.code(409).send({ error: 'progress_version_not_draft' });
  }
  if (!existing.isActive) {
    return reply.code(409).send({ error: 'progress_stage_archived' });
  }

  const input = parsed.data;
  if (input.prerequisiteIds !== undefined) {
    if (!(await validProgressPrerequisites(
      existing.pathVersionId,
      input.prerequisiteIds,
      existing.id
    ))) {
      return reply.code(400).send({ error: 'invalid_progress_prerequisites' });
    }
  }

  const data: Prisma.ProgressStageUpdateInput = {};
  if (input.key !== undefined) data.key = input.key;
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.weight !== undefined) data.weight = input.weight;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isVisible !== undefined) data.isVisible = input.isVisible;
  if (input.completionType !== undefined) data.completionType = input.completionType;
  if (input.completionConfig !== undefined) {
    data.completionConfig = input.completionConfig as Prisma.InputJsonValue;
  }
  if (input.prerequisiteIds !== undefined) {
    data.prerequisiteIds = input.prerequisiteIds as Prisma.InputJsonValue;
  }
  if (input.actionType !== undefined) data.actionType = input.actionType;
  if (input.actionTarget !== undefined) data.actionTarget = input.actionTarget;

  try {
    const updated = await prisma.$transaction(async tx => {
      const stage = await tx.progressStage.update({
        where: { id: existing.id },
        data
      });

      await tx.auditLog.create({
        data: {
          adminUserId: adminIdOf(request),
          action: 'PROGRESS_STAGE_UPDATED',
          entityType: 'ProgressStage',
          entityId: stage.id,
          metadata: { fields: Object.keys(input) }
        }
      });

      return stage;
    });

    return { ok: true, item: updated };
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return reply.code(409).send({ error: 'progress_stage_key_exists' });
    }
    throw error;
  }
});

app.delete('/admin/progress/stages/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const params = z.object({ id: z.string().min(1).max(100) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_request' });

  const existing = await prisma.progressStage.findUnique({
    where: { id: params.data.id },
    include: { pathVersion: { select: { status: true } } }
  });

  if (!existing) return reply.code(404).send({ error: 'progress_stage_not_found' });
  if (existing.pathVersion.status !== 'DRAFT') {
    return reply.code(409).send({ error: 'progress_version_not_draft' });
  }
  if (!existing.isActive) {
    return reply.code(409).send({ error: 'progress_stage_archived' });
  }

  const archived = await prisma.$transaction(async tx => {
    const stage = await tx.progressStage.update({
      where: { id: existing.id },
      data: { isActive: false, archivedAt: new Date() }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'PROGRESS_STAGE_ARCHIVED',
        entityType: 'ProgressStage',
        entityId: stage.id,
        metadata: { versionId: stage.pathVersionId, key: stage.key }
      }
    });

    return stage;
  });

  return { ok: true, item: archived };
});
// ---- END PROGRESS_STAGES_API_V1 ----


// ---- PROGRESS_PUBLISH_API_V1 ----
const progressPublishInput = z.object({
  versionId: z.string().trim().min(1).max(100)
}).strict();

app.post('/admin/progress/publish', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const parsed = progressPublishInput.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });

  const draft = await prisma.progressPathVersion.findUnique({
    where: { id: parsed.data.versionId },
    include: { stages: true }
  });

  if (!draft) return reply.code(404).send({ error: 'progress_version_not_found' });
  if (draft.status !== 'DRAFT') {
    return reply.code(409).send({ error: 'progress_version_not_draft' });
  }

  const stages = draft.stages.filter(stage => stage.isActive);

  for (const stage of stages) {
    if (stage.actionTarget) {
      const validTarget = safeLink.safeParse(stage.actionTarget);
      if (!validTarget.success) {
        return reply.code(400).send({
          error: 'invalid_progress_action_target',
          stageId: stage.id
        });
      }
    }
  }

  const validation = validateProgressStages(stages, REG_ORDER);
  if (!validation.ok) {
    return reply.code(400).send({
      error: validation.error,
      ...(validation.stageId ? { stageId: validation.stageId } : {}),
      ...('totalWeight' in validation ? { totalWeight: validation.totalWeight } : {})
    });
  }

  const totalWeight = validation.totalWeight;

  const publishedAt = new Date();

  const result = await prisma.$transaction(async tx => {
    const changed = await tx.progressPathVersion.updateMany({
      where: { id: draft.id, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt }
    });

    if (changed.count !== 1) return false;

    await tx.progressPathVersion.updateMany({
      where: {
        status: 'PUBLISHED',
        id: { not: draft.id }
      },
      data: { status: 'ARCHIVED' }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'PROGRESS_VERSION_PUBLISHED',
        entityType: 'ProgressPathVersion',
        entityId: draft.id,
        metadata: {
          version: draft.version,
          stageCount: stages.length,
          totalWeight
        }
      }
    });

    return true;
  });

  if (!result) {
    return reply.code(409).send({ error: 'progress_version_not_draft' });
  }

  return {
    ok: true,
    versionId: draft.id,
    version: draft.version,
    stageCount: stages.length,
    totalWeight,
    publishedAt
  };
});
// ---- END PROGRESS_PUBLISH_API_V1 ----


// ---- PROGRESS_USER_ACTIONS_API_V1 ----
const progressUserStageActionInput = z.object({
  reason: z.string().trim().min(3).max(500)
}).strict();

async function applyProgressAdminEvent(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  stageId: string,
  eventType: 'COMPLETED' | 'REVOKED',
  reason: string
) {
  const adminId = adminIdOf(request);
  if (!adminId) {
    return reply.code(403).send({ error: 'admin_identity_required' });
  }

  const result = await prisma.$transaction(async tx => {
    const assignment = await tx.userProgressAssignment.findUnique({
      where: { userId },
      include: {
        pathVersion: {
          include: {
            stages: true
          }
        }
      }
    });

    if (!assignment) return { error: 'progress_assignment_not_found' as const };

    const stage = assignment.pathVersion.stages.find(
      item => item.id === stageId && item.isActive
    );

    if (!stage) return { error: 'progress_stage_not_found' as const };

    if (stage.completionType !== 'MANUAL') {
      return { error: 'progress_stage_not_manual' as const };
    }

    const events = await tx.userProgressEvent.findMany({
      where: {
        userId,
        pathVersionId: assignment.pathVersionId
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    const latestByStage = new Map<string, typeof events[number]>();
    for (const event of events) {
      if (!latestByStage.has(event.stageId)) {
        latestByStage.set(event.stageId, event);
      }
    }

    const latest = latestByStage.get(stageId);

    if (eventType === 'COMPLETED') {
      if (latest?.eventType === 'COMPLETED') {
        return { reused: true as const };
      }

      const rawPrerequisites: unknown = stage.prerequisiteIds ?? [];
      if (
        !Array.isArray(rawPrerequisites) ||
        rawPrerequisites.some((id: unknown) => typeof id !== 'string')
      ) {
        return { error: 'invalid_progress_prerequisites' as const };
      }

      const prerequisites = rawPrerequisites as string[];
      const activeIds = new Set(
        assignment.pathVersion.stages
          .filter(item => item.isActive)
          .map(item => item.id)
      );

      if (prerequisites.some(id => !activeIds.has(id))) {
        return { error: 'invalid_progress_prerequisites' as const };
      }

      if (prerequisites.some(id => latestByStage.get(id)?.eventType !== 'COMPLETED')) {
        return { error: 'progress_prerequisites_incomplete' as const };
      }
    } else {
      if (latest?.eventType !== 'COMPLETED') {
        return { error: 'progress_stage_not_completed' as const };
      }

      const activeStages = assignment.pathVersion.stages.filter(item => item.isActive);
      const prerequisiteMap = new Map<string, string[]>();

      for (const item of activeStages) {
        const raw: unknown = item.prerequisiteIds ?? [];
        if (
          !Array.isArray(raw) ||
          raw.some((id: unknown) => typeof id !== 'string')
        ) {
          return { error: 'invalid_progress_prerequisites' as const };
        }
        prerequisiteMap.set(item.id, raw as string[]);
      }

      const dependsOn = (candidateId: string, targetId: string, seen = new Set<string>()): boolean => {
        if (seen.has(candidateId)) return false;
        seen.add(candidateId);

        for (const prerequisiteId of prerequisiteMap.get(candidateId) ?? []) {
          if (prerequisiteId === targetId) return true;
          if (dependsOn(prerequisiteId, targetId, seen)) return true;
        }
        return false;
      };

      const hasCompletedDependent = activeStages.some(item =>
        item.id !== stageId &&
        latestByStage.get(item.id)?.eventType === 'COMPLETED' &&
        dependsOn(item.id, stageId)
      );

      if (hasCompletedDependent) {
        return { error: 'progress_stage_has_completed_dependents' as const };
      }
    }

    await tx.userProgressEvent.create({
      data: {
        userId,
        pathVersionId: assignment.pathVersionId,
        stageId: stage.id,
        stageKey: stage.key,
        eventType,
        source: 'ADMIN',
        reason,
        verifiedByAdminId: adminId,
        proof: { method: 'admin_manual', adminId } as Prisma.InputJsonValue
      }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: adminId,
        userId,
        action: eventType === 'COMPLETED'
          ? 'PROGRESS_STAGE_MANUALLY_COMPLETED'
          : 'PROGRESS_STAGE_COMPLETION_REVOKED',
        entityType: 'UserProgressEvent',
        entityId: stage.id,
        metadata: {
          pathVersionId: assignment.pathVersionId,
          stageKey: stage.key,
          reason
        }
      }
    });

    return { ok: true as const };
  });

  if ('error' in result) {
    const status =
      result.error === 'progress_assignment_not_found' ||
      result.error === 'progress_stage_not_found' ? 404 :
      result.error === 'progress_stage_not_completed' ||
      result.error === 'progress_stage_has_completed_dependents' ? 409 : 400;

    return reply.code(status).send({ error: result.error });
  }

  return { ok: true, reused: 'reused' in result ? result.reused : false };
}

app.post('/admin/progress/users/:userId/stages/:stageId/complete', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const params = z.object({
    userId: z.string().trim().min(1).max(100),
    stageId: z.string().trim().min(1).max(100)
  }).safeParse(request.params);
  const body = progressUserStageActionInput.safeParse(request.body);

  if (!params.success || !body.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  return applyProgressAdminEvent(
    request,
    reply,
    params.data.userId,
    params.data.stageId,
    'COMPLETED',
    body.data.reason
  );
});

app.post('/admin/progress/users/:userId/stages/:stageId/revoke', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const params = z.object({
    userId: z.string().trim().min(1).max(100),
    stageId: z.string().trim().min(1).max(100)
  }).safeParse(request.params);
  const body = progressUserStageActionInput.safeParse(request.body);

  if (!params.success || !body.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  return applyProgressAdminEvent(
    request,
    reply,
    params.data.userId,
    params.data.stageId,
    'REVOKED',
    body.data.reason
  );
});
// ---- END PROGRESS_USER_ACTIONS_API_V1 ----


// ---- PUBLIC_PROGRESS_PATH_API_V1 ----
function readProgressPrerequisites(value: unknown): string[] | null {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.some((id: unknown) => typeof id !== 'string') ||
    new Set(value).size !== value.length
  ) return null;
  return value as string[];
}

app.post('/progress/path', async (request, reply) => {
  const body = miniBody.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_request' });

  const who = await miniUser(body.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });

  const user = await prisma.user.findUnique({
    where: { id: who.id },
    select: { registrationStage: true }
  });

  if (!user) return reply.code(404).send({ error: 'user_not_found' });

  const assignmentInclude = {
    pathVersion: {
      include: {
        stages: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }]
        }
      }
    }
  };

  let assignment = await prisma.userProgressAssignment.findUnique({
    where: { userId: who.id },
    include: assignmentInclude
  });

  if (!assignment) {
    const latestPublished = await prisma.progressPathVersion.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { version: 'desc' }
    });

    if (!latestPublished) {
      return {
        hasPath: false,
        message: 'مسیر پیشرفت هنوز منتشر نشده است.',
        progress: {
          percentage: 0,
          completedWeight: 0,
          totalWeight: 0,
          completedStages: 0,
          totalStages: 0,
          isComplete: false
        },
        stages: [],
        nextStep: null
      };
    }

    try {
      assignment = await prisma.userProgressAssignment.create({
        data: {
          userId: who.id,
          pathVersionId: latestPublished.id
        },
        include: assignmentInclude
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;

      assignment = await prisma.userProgressAssignment.findUnique({
        where: { userId: who.id },
        include: assignmentInclude
      });

      if (!assignment) throw error;
    }
  }

  const stages = assignment.pathVersion.stages;
  const events = await prisma.userProgressEvent.findMany({
    where: {
      userId: who.id,
      pathVersionId: assignment.pathVersionId
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  });

  const latestByStage = new Map<string, typeof events[number]>();
  for (const event of events) {
    if (!latestByStage.has(event.stageId)) {
      latestByStage.set(event.stageId, event);
    }
  }

  const registrationIndex = REG_ORDER.indexOf(user.registrationStage);
  const completedById = new Map<string, boolean>();

  for (const stage of stages) {
    let completed = false;

    if (stage.completionType === 'REGISTRATION_STAGE') {
      const config = stage.completionConfig;
      const target = config && typeof config === 'object' && !Array.isArray(config)
        ? (config as Record<string, unknown>).targetStage
        : undefined;

      const targetIndex = typeof target === 'string'
        ? REG_ORDER.indexOf(target)
        : -1;

      completed = targetIndex >= 0 && registrationIndex >= targetIndex;
    } else if (stage.completionType === 'MANUAL') {
      completed = latestByStage.get(stage.id)?.eventType === 'COMPLETED';
    }

    completedById.set(stage.id, completed);
  }

  const snapshot = calculateProgressSnapshot(
    stages.map(stage => ({
      id: stage.id,
      isVisible: stage.isVisible,
      weight: stage.weight,
      prerequisiteIds: stage.prerequisiteIds
    })),
    new Set(
      [...completedById]
        .filter(([, completed]) => completed)
        .map(([id]) => id)
    )
  );

  const visibleStages = snapshot.stages.map(snapshotStage => {
    const stage = stages.find(item => item.id === snapshotStage.id)!;

    return {
      id: stage.id,
      key: stage.key,
      title: stage.title,
      description: stage.description,
      weight: stage.weight,
      sortOrder: stage.sortOrder,
      completionType: stage.completionType,
      actionType: stage.actionType,
      actionTarget: stage.actionTarget,
      isCompleted: snapshotStage.isCompleted,
      isLocked: snapshotStage.isLocked,
      status: snapshotStage.status
    };
  });

  const nextStep = visibleStages.find(
    stage => !stage.isCompleted && !stage.isLocked
  ) ?? null;

  const {
    percentage,
    completedWeight,
    totalWeight,
    completedStages,
    totalStages,
    isComplete
  } = snapshot;

  return {
    hasPath: true,
    version: {
      id: assignment.pathVersion.id,
      version: assignment.pathVersion.version,
      title: assignment.pathVersion.title,
      description: assignment.pathVersion.description,
      assignedAt: assignment.assignedAt
    },
    progress: {
      percentage,
      completedWeight,
      totalWeight,
      completedStages,
      totalStages,
      isComplete
    },
    stages: visibleStages,
    nextStep
  };
});
// ---- END PUBLIC_PROGRESS_PATH_API_V1 ----

// ---- END PROGRESS_API_V1 ----

app.setErrorHandler((error: any, request, reply) => {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_request' });
  const status = Number(error?.statusCode);
  if (status >= 400 && status < 500) {
    return reply.code(status).send({ error: error.code || 'bad_request', message: status === 429 ? 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کن.' : error.message });
  }
  request.log.error({ err: error, path: request.url }, 'request failed');
  return reply.code(500).send({ error: 'internal_error', message: 'An unexpected error occurred.' });
});

const shutdown = async () => { await app.close(); await prisma.$disconnect(); process.exit(0); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
try { await app.listen({ port, host }); app.log.info(`10X API listening on ${host}:${port}`); }
catch (error) { app.log.error(error); await prisma.$disconnect(); process.exit(1); }
