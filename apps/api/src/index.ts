import { recordStudioRelease, studioReleaseKey } from './studio-releases.js';
import { contentRevision, assertContentRevision, withContentLock, ContentConflict } from './content-workflow.js';
import { authenticateTeamAdmin } from './team-auth-p37.js';
import { randomInt as quizCryptoRandomInt } from 'node:crypto';
import 'dotenv/config';
import { timingSafeEqual, createHash as mmChallengeHash } from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { chmod as customFsChmod, mkdir as customFsMkdir, readFile as customFsReadFile, readdir as customFsReaddir, writeFile as customFsWriteFile } from 'node:fs/promises';
import { randomUUID as customPageRandomUUID } from 'node:crypto';
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
// MMTRADE_R102_PAGE_HOOK_BEGIN
// Reuse the existing /p/:slug route without a duplicate GET registration.
// Registered BEFORE existing routes, so Fastify will run this hook for them.
app.addHook('onRequest', async (request, reply) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return;
  const pathname = (request.raw.url || '').split('?')[0];
  const match = /^\/p\/([a-z][a-z0-9-]{2,39})\/?$/.exec(pathname);
  if (!match) return;
  const slug = match[1];
  const state = await r10Read();
  const page = state.custom.find(p => p.slug === slug);
  if (!page) return; // Preserve all pre-existing /p/... behaviour.
  if (page.status === 'ARCHIVED') {
    const routes = await rm6State(prisma, true);
    const active = r10Entries(state, routes).find(x => x.slug === state.start && x.status === 'PUBLISHED');
    return reply.redirect(active?.path || '/miniapp/index.html');
  }
  if (page.status !== 'PUBLISHED') return reply.code(404).send({error:'page_unpublished'});
  const published = await prisma.contentPage.findUnique({where:{slug},select:{status:true}});
  if (!published || published.status !== 'PUBLISHED') return reply.code(404).send({error:'page_unpublished'});
  reply.header('Cache-Control', 'no-store');
  return reply.sendFile('miniapp/p74/studio/page-runtime.html');
});
// MMTRADE_R102_PAGE_HOOK_END

const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const host = process.env.API_HOST || '0.0.0.0';

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim()), credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

// MMTRADE_ROUTE_MANAGER_R6_EARLY_HOOK_BEGIN
// Register before any legacy fixed GET route, so a changed address works without an API restart.
app.addHook('onRequest',async(request,reply)=>{
  if(request.method!=='GET'&&request.method!=='HEAD')return;
  const raw=request.raw.url||'';
  const path=raw.split('?')[0];
  if(!/^\/[a-zA-Z0-9_-]{1,60}$/.test(path)||rm6Protected.has(path.toLowerCase()))return;
  let state:any;
  try{state=await rm6State()}catch{return;} // preserve existing routing if DB temporarily unavailable
  for(const row of rm6RouteEntries(state)){
    if(path===row.path){
      const extra=raw.includes('?')?'?'+raw.split('?').slice(1).join('?'):'';
      return reply.code(302).header('Location',row.target+(row.target.includes('?')?'&'+extra.slice(1):extra)).send();
    }
    if(row.aliases.some((p:string)=>p===path)){
      const extra=raw.includes('?')?'?'+raw.split('?').slice(1).join('?'):'';
      return reply.code(302).header('Location',row.path+extra).send();
    }
  }
});
// MMTRADE_ROUTE_MANAGER_R6_EARLY_HOOK_END

// Custom Mini App page paths. Legacy /miniapp and /miniapp/*.html routes remain intact.
const customPageFiles: Record<string, string> = {
  index: 'miniapp/index.html',
  academy: 'miniapp/index.html',
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
      if (slug === 'academy') {
        return reply.redirect('/miniapp/p74/learning/academy-home.html');
      }
      return reply.sendFile(customPageFiles[slug]);
    });
  }

  if (!usedPaths.has('/profile')) {
    app.get('/profile', async (_request, reply) => {
      return reply.sendFile('miniapp/index.html');
    });
  }

  if (!usedPaths.has('/academy')) {
    app.get('/academy', async (_request, reply) => {
      return reply.redirect('/miniapp/p74/learning/academy-home.html');
    });
  }
} catch (error) {
  app.log.error(error, 'Could not register custom Mini App paths');
}


// TENX_CUSTOM_PAGE_PUBLIC_ROUTE_V1
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
  if (!(await p60CanAccess(identity, routeKey))) {
    await prisma.auditLog.create({ data: { adminUserId: identity.id, action: 'ADMIN_ACCESS_DENIED', entityType: 'AdminRoute', metadata: { route: routeKey, role: identity.role }, ipAddress: request.ip } }).catch(() => undefined);
    reply.code(403).send({ error: 'forbidden', message: 'نقش شما به این بخش دسترسی ندارد.' });
    return false;
  }
  const p60SessionScope=await p60ScopedAdmin(identity.id);
  if(p60SessionScope)(request as unknown as {p60Scopes:P60ScopeRecord}).p60Scopes=p60SessionScope.scopes;
  (request as unknown as { admin: AdminIdentity }).admin = identity;
  return true;
}

// === TENX_P60_SECTION_RBAC_V1 ===
// Granular section permissions for the existing Mini App management panel.
// Storage: SystemSetting JSON, never a new database table.
type P60SectionName='users'|'marketing'|'academy';
type P60Level='none'|'read'|'write';
type P60ScopeRecord=Record<P60SectionName,P60Level>;
const p60ScopeKey='TENX_P60_ADMIN_SCOPE_';
const p60TgPrefix='P38_ADMIN_TG_'; // existing signed Telegram Mini App login mapping
const p60TgPattern=z.string().regex(/^[1-9]\d{4,15}$/);
const p60EmptyScopes=():P60ScopeRecord=>({users:'none',marketing:'none',academy:'none'});
const p60ScopeSchema=z.object({
  users:z.enum(['none','read','write']),
  marketing:z.enum(['none','read','write']),
  academy:z.enum(['none','read','write'])
}).strict();
function p60Normalized(raw:unknown):P60ScopeRecord{
  const result=p60ScopeSchema.safeParse(raw);
  return result.success ? result.data : p60EmptyScopes();
}
async function p60ScopedAdmin(id:string|null):Promise<{scopes:P60ScopeRecord}|null>{
  if(!id)return null;
  const setting=await prisma.systemSetting.findUnique({where:{key:p60ScopeKey+id}});
  if(!setting)return null;
  const value=setting.value as any;
  // A malformed scoped record must never fall back to legacy role grants.
  return {scopes:p60Normalized(value?.scopes)};
}
function p60RouteSection(routeKey:string):P60SectionName|null{
  const path=routeKey.slice(routeKey.indexOf(' ')+1).split('?')[0];
  if(/^\/admin\/(users(?:\/|$)|tickets(?:\/|$)|followups(?:\/|$)|notifications(?:\/|$)|incomplete(?:\/|$)|registrations(?:\/|$))/.test(path))return 'users';
  if(/^\/admin\/growth\/(?:users|messages|export\.xlsx)(?:\/|$)/.test(path))return 'users';
  if(/^\/admin\/growth(?:\/|$)/.test(path))return 'marketing';
  if(/^\/admin\/(academy(?:\/|$)|progress(?:\/|$)|challenges?(?:\/|$))/.test(path))return 'academy';
  return null;
}
async function p60CanAccess(identity:AdminIdentity,routeKey:string):Promise<boolean>{
  if(identity.role==='SUPER_ADMIN')return true;
  const assigned=await p60ScopedAdmin(identity.id);
  if(assigned){
    if(routeKey==='GET /admin/auth/me')return true;
    const section=p60RouteSection(routeKey);
    if(!section)return false;
    const level=assigned.scopes[section];
    return routeKey.startsWith('GET ') ? level==='read'||level==='write' : level==='write';
  }
  // P60_FALLBACK_PLACEHOLDER: replaced by the installer for the live auth stack.
  return canAccess(identity.role,routeKey);
}
const p60OwnerOnly=async(request:FastifyRequest,reply:FastifyReply)=>{
  if(!(await adminGuard(request,reply)))return false;
  const who=(request as unknown as {admin?:AdminIdentity}).admin;
  if(who?.role!=='SUPER_ADMIN'){
    reply.code(403).send({error:'super_admin_required'});return false;
  }
  return true;
};
app.get('/admin/p60/section-admins',async(request,reply)=>{
  if(!(await p60OwnerOnly(request,reply)))return;
  const accounts=await prisma.adminUser.findMany({orderBy:{createdAt:'asc'},select:{id:true,email:true,role:true,isActive:true,createdAt:true}});
  const settings=await prisma.systemSetting.findMany({where:{key:{startsWith:p60ScopeKey}},select:{key:true,value:true}});
  const telegramMappings=await prisma.systemSetting.findMany({where:{key:{startsWith:p60TgPrefix}},select:{key:true,value:true}});
  const byTg=new Map<string,string>();
  for(const row of telegramMappings){const adminId=(row.value as any)?.adminId;if(typeof adminId==='string')byTg.set(adminId,row.key.slice(p60TgPrefix.length));}
  const byId=new Map(settings.map(x=>[x.key.slice(p60ScopeKey.length),p60Normalized((x.value as any)?.scopes)]));
  reply.header('cache-control','no-store');
  return {items:accounts.map(a=>({...a,telegramId:byTg.get(a.id)||null,scopes:byId.get(a.id)||null,sectionScoped:byId.has(a.id)}))};
});
app.post('/admin/p60/section-admins',{config:{rateLimit:{max:10,timeWindow:'10 minutes'}}},async(request,reply)=>{
  if(!(await p60OwnerOnly(request,reply)))return;
  const parsed=z.object({email:z.string().trim().email().max(200),
    password:z.string().min(MIN_ADMIN_PASSWORD_LENGTH).max(200),
    telegramId:p60TgPattern.optional(),
    scopes:p60ScopeSchema}).strict().safeParse(request.body);
  if(!parsed.success)return reply.code(400).send({error:'invalid_scope_admin'});
  if(Object.values(parsed.data.scopes).every(x=>x==='none'))return reply.code(400).send({error:'one_section_required'});
  const email=parsed.data.email.trim().toLowerCase();
  const taken=await prisma.adminUser.findUnique({where:{email},select:{id:true}});
  if(taken)return reply.code(409).send({error:'email_exists'});
  if(parsed.data.telegramId && await prisma.systemSetting.findUnique({where:{key:p60TgPrefix+parsed.data.telegramId}}))
    return reply.code(409).send({error:'telegram_id_already_assigned'});
  const hash=await hashPassword(parsed.data.password);
  const actor=adminIdOf(request);
  try{
    const created=await prisma.$transaction(async tx=>{
      const admin=await tx.adminUser.create({data:{email,passwordHash:hash,role:'USER_MANAGER',isActive:true}});
      await tx.systemSetting.create({data:{key:p60ScopeKey+admin.id,value:{version:1,scopes:parsed.data.scopes,createdAt:new Date().toISOString()} as any}});
      if(parsed.data.telegramId)await tx.systemSetting.create({data:{key:p60TgPrefix+parsed.data.telegramId,value:{adminId:admin.id} as any}});
      await tx.auditLog.create({data:{adminUserId:actor,action:'P60_SECTION_ADMIN_CREATED',entityType:'AdminUser',entityId:admin.id,
        metadata:{scopes:parsed.data.scopes}}});
      return {id:admin.id,email:admin.email,scopes:parsed.data.scopes};
    });
    return reply.code(201).send({ok:true,item:created});
  }catch(e){
    if((e as {code?:string}).code==='P2002')return reply.code(409).send({error:'email_exists'});
    throw e;
  }
});
app.patch('/admin/p60/section-admins/:id',async(request,reply)=>{
  if(!(await p60OwnerOnly(request,reply)))return;
  const params=z.object({id:z.string().min(1).max(100)}).safeParse(request.params);
  const body=z.object({scopes:p60ScopeSchema,isActive:z.boolean(),telegramId:p60TgPattern.nullable().optional()}).strict().safeParse(request.body);
  if(!params.success||!body.success)return reply.code(400).send({error:'invalid_request'});
  const admin=await prisma.adminUser.findUnique({where:{id:params.data.id},select:{id:true,email:true,role:true}});
  if(!admin)return reply.code(404).send({error:'admin_not_found'});
  if(admin.role==='SUPER_ADMIN')return reply.code(403).send({error:'owner_is_immutable'});
  const before=await p60ScopedAdmin(admin.id);
  if(body.data.telegramId){
    const existing=await prisma.systemSetting.findUnique({where:{key:p60TgPrefix+body.data.telegramId}});
    if(existing && (existing.value as any)?.adminId!==admin.id)return reply.code(409).send({error:'telegram_id_already_assigned'});
  }
  await prisma.$transaction(async tx=>{
    if(body.data.telegramId!==undefined){
      const mapped=await tx.systemSetting.findMany({where:{key:{startsWith:p60TgPrefix}},select:{key:true,value:true}});
      for(const row of mapped)if((row.value as any)?.adminId===admin.id && row.key!==p60TgPrefix+body.data.telegramId)
        await tx.systemSetting.delete({where:{key:row.key}});
      if(body.data.telegramId)await tx.systemSetting.upsert({where:{key:p60TgPrefix+body.data.telegramId},
        create:{key:p60TgPrefix+body.data.telegramId,value:{adminId:admin.id} as any},
        update:{value:{adminId:admin.id} as any}});
    }
    await tx.systemSetting.upsert({where:{key:p60ScopeKey+admin.id},
      create:{key:p60ScopeKey+admin.id,value:{version:1,scopes:body.data.scopes,updatedAt:new Date().toISOString()} as any},
      update:{value:{version:1,scopes:body.data.scopes,updatedAt:new Date().toISOString()} as any}});
    await tx.adminUser.update({where:{id:admin.id},data:{isActive:body.data.isActive}});
    await tx.auditLog.create({data:{adminUserId:adminIdOf(request),action:'P60_SECTION_ADMIN_UPDATED',entityType:'AdminUser',entityId:admin.id,
      metadata:{before:before?.scopes||null,after:body.data.scopes,isActive:body.data.isActive}}});
  });
  return {ok:true};
});
// === END TENX_P60_SECTION_RBAC_V1 ===

// === TENX_P61_MINIAPP_PROFILE_ADMIN_AUTH_V1 ===
// A signed Telegram WebApp identity is mandatory. No query-string Telegram IDs or client-side role claims.
// P60 section grants and all per-route API authorization remain authoritative.
app.post('/admin/p61/auth/telegram', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (request, reply) => {
  reply.header('cache-control', 'no-store');
  const b = z.object({ initData: z.string().min(1).max(10000) }).strict().safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_input' });
  const signingSecret = adminSecret();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!signingSecret || !botToken) return reply.code(503).send({ error: 'admin_login_unavailable' });
  // A short verification window limits replay risk; reopen the Mini App for a fresh initData if expired.
  const proof = validateTelegramInitData(b.data.initData, botToken, 3600);
  if (!proof.ok) return reply.code(401).send({ error: 'invalid_or_expired_telegram_session' });
  const telegramId = String(proof.user.id);
  const mapping = await prisma.systemSetting.findUnique({ where: { key: 'P38_ADMIN_TG_' + telegramId } });
  const mappedAdminId = (mapping?.value && typeof mapping.value === 'object' && !Array.isArray(mapping.value))
    ? (mapping.value as { adminId?: unknown }).adminId : null;
  if (typeof mappedAdminId !== 'string') return reply.code(403).send({ error: 'telegram_admin_not_linked' });
  const account = await prisma.adminUser.findUnique({ where: { id: mappedAdminId },
    select: { id: true, email: true, role: true, isActive: true, passwordHash: true } });
  if (!account || !account.isActive) return reply.code(403).send({ error: 'admin_inactive' });
  const row = account.role === 'SUPER_ADMIN' ? null :
    await prisma.systemSetting.findUnique({ where: { key: 'TENX_P60_ADMIN_SCOPE_' + account.id } });
  const scopes = account.role === 'SUPER_ADMIN'
    ? { users: 'write', marketing: 'write', academy: 'write' }
    : p60Normalized((row?.value as { scopes?: unknown } | null)?.scopes);
  // Accounts without explicit P60 grants cannot access the Mini App admin interface.
  if (!Object.values(scopes).some(level => level === 'read' || level === 'write'))
    return reply.code(403).send({ error: 'no_admin_sections_assigned' });
  const expires = Math.floor(Date.now() / 1000) + 1800;
  const token = signSession({ sub: account.id, role: account.role,
    pv: passwordVersion(account.passwordHash), exp: expires }, signingSecret);
  await prisma.auditLog.create({data:{adminUserId:account.id,action:'P61_TELEGRAM_MINIAPP_ADMIN_LOGIN',entityType:'AdminUser',entityId:account.id,
    metadata:{telegramId,scopes},ipAddress:request.ip}});
  return { token, admin: { email: account.email, role: account.role }, scopes,
    expiresAt: new Date(expires * 1000).toISOString() };
});
// === END TENX_P61_MINIAPP_PROFILE_ADMIN_AUTH_V1 ===

// TENX_P62_HOME_STUDIO_API_V1 -- existing adminGuard & Prisma, no schema migration.
const p62fs = await import('node:fs');
const p62path = await import('node:path');
const p62crypto = await import('node:crypto');
const p62Root = process.cwd();
const p62Key = 'TENX_P62_HOME_STUDIO_V1';
const p62Logo = '/uploads/challenge-organizers/mmtrade-logo-custom-p45.png';
const p62MediaDir = p62path.join(p62Root, 'public', 'uploads', 'home-studio');
const p62TempDir = p62path.join(p62Root, '.p62-home-studio', 'uploads');
const p62Route = '/admin/home-studio';
const p62T = z.enum(['1','2','3']);
const p62Path = z.string().max(1200).refine((v) => v === '' || v === '#video' ||
  (/^\/(?!\/)[a-zA-Z0-9_./?=&%#-]*$/.test(v)) ||
  (/^https:\/\/[a-zA-Z0-9.-]+(?::\d{2,5})?(?:\/[a-zA-Z0-9~!$&'()*+,;=:@%/?#.-]*)?$/.test(v)), 'invalid_url');
const p62Style = z.object({
  color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bg:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  radius:z.number().min(0).max(80).optional(),
  padding:z.number().min(0).max(80).optional(),
  opacity:z.number().min(0.05).max(1).optional(),
  parallax:z.number().min(0).max(60).optional(),
  align:z.enum(['left','right','center']).optional(),
  variant:z.enum(['filled','outline']).optional()
}).strict();
const p62Step = z.object({
  id:z.string().min(1).max(70),title:z.string().max(140),
  subtitle:z.string().max(300).optional(),icon:z.string().max(30).optional(),
  url:p62Path.optional()
}).strict();
const p62Block = z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/),
  type:z.enum(['video','headline','steps','button','features','progress','sculpture','image','text','divider','spacer']),
  title:z.string().max(300).optional(), subtitle:z.string().max(500).optional(),
  text:z.string().max(3500).optional(), url:p62Path.optional(),
  media:p62Path.optional(),poster:p62Path.optional(),icon:z.string().max(30).optional(),
  visible:z.boolean().optional(),style:p62Style.optional(),
  steps:z.array(p62Step).max(12).optional()
}).strict();
const p62Draft = z.object({
  logo:z.literal(p62Logo),
  blocks:z.array(p62Block).max(35)
}).strict().superRefine((d,ctx)=>{
  const ids=d.blocks.map(b=>b.id);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'duplicate_block_id'});
});
function p62Defaults():any{
  return JSON.parse(p62fs.readFileSync(p62path.join(p62Root,'public','miniapp','p62','presets.json'),'utf8'));
}
async function p62State():Promise<any>{
  const r=await prisma.systemSetting.findUnique({where:{key:p62Key},select:{value:true}});
  const base=p62Defaults();
  if(!r||!r.value||typeof r.value!=='object'||Array.isArray(r.value))return base;
  const x=r.value as any;
  if(!x.drafts?.['1']||!x.drafts?.['2']||!x.drafts?.['3'])return base;
  return JSON.parse(JSON.stringify(x));
}
async function p62Save(state:any,actor:string|null,action:string,metadata:any={}){
  await prisma.$transaction(async tx=>{
    await tx.systemSetting.upsert({
      where:{key:p62Key},
      create:{key:p62Key,value:state as Prisma.InputJsonValue},
      update:{value:state as Prisma.InputJsonValue}
    });
    await tx.auditLog.create({data:{adminUserId:actor,action,entityType:'HomeStudio',metadata}});
  });
}
async function p62Owner(request:FastifyRequest,reply:FastifyReply):Promise<boolean>{
  if(!(await adminGuard(request,reply)))return false;
  const identity=(request as unknown as {admin?:{id:string|null;role:string}}).admin;
  if(identity?.role!=='SUPER_ADMIN'){reply.code(403).send({error:'super_admin_required'});return false;}
  return true;
}
// MM_P74_ENTRY_R103_API_BEGIN
// Public read-only access to *only* the published P74 Home config.
// No private blocks, user information or draft data are returned.
app.get('/public/p74-home-config', async (_request, reply) => {
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  const row = await prisma.contentPage.findUnique({
    where: { slug: 'index' },
    select: { status: true, blocks: true, updatedAt: true }
  });
  if (!row || row.status !== 'PUBLISHED') return { enabled: false, reason: 'not_published' };
  const block = Array.isArray(row.blocks) ? row.blocks.find((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const b = entry as Record<string, unknown>;
    return b.type === 'element' && b.selector === '#p74-home-config' && typeof b.text === 'string';
  }) : null;
  if (!block) return { enabled: false, reason: 'published_marker_absent' };
  let config: unknown;
  try { config = JSON.parse((block as { text: string }).text); }
  catch { return { enabled: false, reason: 'invalid_published_marker' }; }
  if (!config || typeof config !== 'object' || Array.isArray(config))
    return { enabled: false, reason: 'invalid_config' };
  const home = config as Record<string, unknown>;
  if (home.version !== 74 || home.enabled === false ||
      !Number.isInteger(Number(home.stepCount)) || Number(home.stepCount) < 3 || Number(home.stepCount) > 8)
    return { enabled: false, reason: 'not_active_p74' };
  return { enabled: true, version: 74, config: home, updatedAt: row.updatedAt.toISOString() };
});
// MM_P74_ENTRY_R103_API_END

app.get('/public/home-studio',async(_request,reply)=>{
  const s=await p62State();
  reply.header('Cache-Control','no-store');
  return {active:s.active||null,published:s.published||null,revision:s.revision||0};
});
app.get(p62Route,async(request,reply)=>{
  if(!(await p62Owner(request,reply)))return;
  reply.header('Cache-Control','no-store');
  return await p62State();
});
app.put('/admin/home-studio/draft/:theme',async(request,reply)=>{
  if(!(await p62Owner(request,reply)))return;
  const params=z.object({theme:p62T}).safeParse(request.params);
  const body=z.object({draft:p62Draft}).strict().safeParse(request.body);
  if(!params.success||!body.success)return reply.code(400).send({error:'invalid_draft',message:'المان یا لینک نامعتبر است.'});
  const s=await p62State();
  s.drafts[params.data.theme]=body.data.draft;
  const actor=(request as any).admin;
  await p62Save(s,actor.id,'P62_HOME_DRAFT_SAVED',{theme:params.data.theme,blocks:body.data.draft.blocks.length});
  return {ok:true,draft:body.data.draft,revision:s.revision};
});
app.post('/admin/home-studio/publish',async(request,reply)=>{
  if(!(await p62Owner(request,reply)))return;
  const b=z.object({theme:p62T}).strict().safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_theme'});
  const state=await p62State();
  const draft=p62Draft.safeParse(state.drafts[b.data.theme]);
  if(!draft.success)return reply.code(409).send({error:'invalid_saved_draft'});
  state.active=b.data.theme;
  state.published=JSON.parse(JSON.stringify(draft.data));
  state.revision=Number(state.revision||0)+1;
  state.history=(Array.isArray(state.history)?state.history:[]).concat([{
    revision:state.revision,theme:b.data.theme,at:new Date().toISOString(),draft:state.published
  }]).slice(-25);
  const actor=(request as any).admin;
  await p62Save(state,actor.id,'P62_HOME_PUBLISHED',{theme:state.active,revision:state.revision});
  return {ok:true,active:state.active,revision:state.revision,history:state.history};
});
app.post('/admin/home-studio/restore',async(request,reply)=>{
  if(!(await p62Owner(request,reply)))return;
  const b=z.object({revision:z.number().int().positive()}).strict().safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_revision'});
  const state=await p62State();
  const snap=(Array.isArray(state.history)?state.history:[]).find((x:any)=>x.revision===b.data.revision);
  if(!snap)return reply.code(404).send({error:'revision_not_found'});
  const d=p62Draft.safeParse(snap.draft);
  if(!d.success)return reply.code(409).send({error:'snapshot_invalid'});
  state.active=snap.theme;state.published=JSON.parse(JSON.stringify(d.data));
  state.revision=Number(state.revision||0)+1;
  state.history=state.history.concat([{
    revision:state.revision,theme:state.active,at:new Date().toISOString(),draft:state.published
  }]).slice(-25);
  const actor=(request as any).admin;
  await p62Save(state,actor.id,'P62_HOME_RESTORED',{sourceRevision:b.data.revision,revision:state.revision});
  return {ok:true,active:state.active,revision:state.revision,history:state.history};
});
// Read binary payloads as small buffers; large videos are uploaded in 192 KiB chunks.
app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:384*1024},(_req,body,done)=>done(null,body));
const p62UploadId=z.string().regex(/^[a-f0-9]{32}$/);
const p62UploadMeta=z.object({id:p62UploadId,kind:z.enum(['video','image']),name:z.string(),size:z.number(),received:z.number(),next:z.number(),createdAt:z.number()});
function p62UploadPaths(id:string){return {
  part:p62path.join(p62TempDir,id+'.part'),
  meta:p62path.join(p62TempDir,id+'.json')
};}
function p62ReadUpload(id:string){
  const p=p62UploadPaths(id);
  if(!p62fs.existsSync(p.meta))return null;
  try{return p62UploadMeta.parse(JSON.parse(p62fs.readFileSync(p.meta,'utf8')))}catch{return null;}
}
app.post('/admin/home-studio/media/begin',async(request,reply)=>{
  if(!(await p62Owner(request,reply)))return;
  const b=z.object({
    name:z.string().min(1).max(180),kind:z.enum(['video','image']),
    size:z.number().int().min(1).max(180*1024*1024),
    type:z.string().max(100).optional()
  }).strict().safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_file'});
  if(b.data.kind==='image'&&b.data.size>12*1024*1024)return reply.code(413).send({error:'image_too_large'});
  p62fs.mkdirSync(p62TempDir,{recursive:true,mode:0o700});
  const id=p62crypto.randomBytes(16).toString('hex');const paths=p62UploadPaths(id);
  p62fs.writeFileSync(paths.part,Buffer.alloc(0),{flag:'wx',mode:0o600});
  const meta={id,name:b.data.name,kind:b.data.kind,size:b.data.size,received:0,next:0,createdAt:Date.now()};
  p62fs.writeFileSync(paths.meta,JSON.stringify(meta),{flag:'wx',mode:0o600});
  return {ok:true,uploadId:id,chunkSize:192*1024};
});
app.post('/admin/home-studio/media/:uploadId/:index',{
  bodyLimit:384*1024,config:{rateLimit:{max:1800,timeWindow:'10 minutes'}}
},async(request,reply)=>{
  if(!(await p62Owner(request,reply)))return;
  const p=z.object({uploadId:p62UploadId,index:z.coerce.number().int().min(0).max(5000)}).safeParse(request.params);
  if(!p.success)return reply.code(400).send({error:'invalid_upload_id'});
  const current=p62ReadUpload(p.data.uploadId);if(!current)return reply.code(404).send({error:'upload_not_found'});
  if(Date.now()-current.createdAt>24*3600000)return reply.code(410).send({error:'upload_expired'});
  if(p.data.index!==current.next)return reply.code(409).send({error:'invalid_chunk_order'});
  const bytes=request.body;
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>192*1024)return reply.code(400).send({error:'invalid_chunk'});
  if(current.received+bytes.length>current.size)return reply.code(413).send({error:'upload_oversize'});
  const paths=p62UploadPaths(current.id);
  p62fs.appendFileSync(paths.part,bytes);
  current.received+=bytes.length;current.next+=1;
  p62fs.writeFileSync(paths.meta,JSON.stringify(current));
  return {ok:true,received:current.received,remaining:current.size-current.received};
});
app.post('/admin/home-studio/media/:uploadId/finish',async(request,reply)=>{
  if(!(await p62Owner(request,reply)))return;
  const p=z.object({uploadId:p62UploadId}).safeParse(request.params);
  if(!p.success)return reply.code(400).send({error:'invalid_upload_id'});
  const info=p62ReadUpload(p.data.uploadId);if(!info)return reply.code(404).send({error:'upload_not_found'});
  if(info.received!==info.size)return reply.code(409).send({error:'upload_incomplete'});
  const paths=p62UploadPaths(info.id);
  const signature=Buffer.alloc(16);const fd=p62fs.openSync(paths.part,'r');
  try{p62fs.readSync(fd,signature,0,16,0)}finally{p62fs.closeSync(fd)}
  let ext='';
  if(info.kind==='video'){
    if(signature.subarray(4,8).toString('ascii')==='ftyp')ext='mp4';
    else if(signature.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))ext='webm';
  }else{
    if(signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
    else if(signature.subarray(0,3).equals(Buffer.from([255,216,255])))ext='jpg';
    else if(signature.subarray(0,4).toString('ascii')==='RIFF'&&signature.subarray(8,12).toString('ascii')==='WEBP')ext='webp';
  }
  if(!ext)return reply.code(415).send({error:'unsupported_file_content'});
  p62fs.mkdirSync(p62MediaDir,{recursive:true});
  const basename='p62-'+p62crypto.randomBytes(16).toString('hex')+'.'+ext;
  p62fs.renameSync(paths.part,p62path.join(p62MediaDir,basename));
  p62fs.unlinkSync(paths.meta);
  const actor=(request as any).admin;
  await prisma.auditLog.create({data:{adminUserId:actor.id,action:'P62_HOME_MEDIA_UPLOADED',entityType:'HomeStudioMedia',metadata:{name:basename,size:info.size,kind:info.kind}}});
  return {ok:true,url:'/uploads/home-studio/'+basename,bytes:info.size};
});
// END TENX_P62_HOME_STUDIO_API_V1

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
  return { email: identity.email, role: identity.role, legacyToken: identity.legacy, p60Scopes: (await p60ScopedAdmin(identity.id))?.scopes ?? null };
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



// TENX_TEAM_ADMIN_P36
const teamSteps = [
  'ACCOUNT_CREATED',
  'DEPOSIT_COMPLETED',
  'COPY_CONNECTED',
  'CHALLENGE_PARTICIPANT'
] as const;

const teamAccessKey = 'TEAM_P36_ADMINS';
const teamUserKey = (id: string) => 'TEAM_P36_USER_' + id;

async function teamAuth(request: FastifyRequest, reply: FastifyReply, superOnly = false) {
  const secret = adminSecret();
  const header = request.headers.authorization;

  if (!secret || !header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  const token = header.slice(7).trim();
  let actor: { id: string | null; role: string; email: string } | null = null;

  if (
    process.env.ADMIN_LEGACY_TOKEN_ENABLED !== 'false' &&
    tokenMatches(token, process.env.ADMIN_API_TOKEN)
  ) {
    actor = { id: null, role: 'SUPER_ADMIN', email: 'legacy-token' };
  } else {
    const session = verifySession(token, secret);
    if (session) {
      const admin = await prisma.adminUser.findUnique({
        where: { id: session.sub }
      });
      if (
        admin?.isActive &&
        passwordVersion(admin.passwordHash) === session.pv
      ) {
        actor = { id: admin.id, role: admin.role, email: admin.email };
      }
    }
  }

  if (!actor) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  if (actor.role === 'SUPER_ADMIN') return actor;

  if (superOnly) {
    reply.code(403).send({ error: 'super_admin_required' });
    return null;
  }

  const setting = await prisma.systemSetting.findUnique({
    where: { key: teamAccessKey }
  });

  const ids = Array.isArray(setting?.value) ? setting.value : [];

  if (!actor.id || !ids.includes(actor.id)) {
    reply.code(403).send({ error: 'team_access_denied' });
    return null;
  }

  return actor;
}


// TENX_P37_SUPER_SESSION_ONLY
async function p37SuperSession(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const secret = adminSecret();
  const header = request.headers.authorization;

  if (!secret || !header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  const token = header.slice(7).trim();
  const session = verifySession(token, secret);
  if (!session) {
    reply.code(401).send({ error: 'session_required' });
    return null;
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.sub }
  });

  if (!admin?.isActive ||
      passwordVersion(admin.passwordHash) !== session.pv) {
    reply.code(401).send({ error: 'invalid_session' });
    return null;
  }

  if (admin.role !== 'SUPER_ADMIN') {
    reply.code(403).send({ error: 'super_admin_required' });
    return null;
  }

  return admin;
}
// END TENX_P37_SUPER_SESSION_ONLY

// TENX_P37_SUPER_APPROVAL

// TENX_P37_SHARED_WORKFLOW_TX
async function p37ChangeWorkflow(
 userId: string,
 d: {
  step: typeof teamSteps[number];
  approved: boolean;
  version: number;
  accountId?: string;
  note?: string;
 },
 actor: { adminUserId?: string; telegramAdminId?: string }
) {
 const fields = [
  'accountCreated','depositCompleted',
  'copyConnected','challengeParticipant'
 ] as const;
 const index = teamSteps.indexOf(d.step);
 const field = fields[index];

 return prisma.$transaction(async tx => {
  const user = await tx.user.findUnique({
   where:{id:userId},select:{id:true}
  });
  if(!user) return {error:'user_not_found',status:404};

  let current = await tx.eplanetUserWorkflow.findUnique({
   where:{userId}
  });
  if(!current) {
   if(d.version!==0)
    return {error:'version_conflict',status:409};
   if(d.step!=='ACCOUNT_CREATED' || !d.approved)
    return {error:'previous_step_not_approved',status:409};
   if(!d.accountId?.trim())
    return {error:'account_id_required',status:400};
   await tx.eplanetUserWorkflow.createMany({
    data:[{userId}],skipDuplicates:true
   });
   current = await tx.eplanetUserWorkflow.findUnique({
    where:{userId}
   });
  }
  if(!current) throw new Error('workflow_create_failed');
  if(current.version!==d.version)
   return {error:'version_conflict',status:409};
  if(current[field]===d.approved)
   return {error:'step_already_in_requested_state',status:409};
  if(d.approved && fields.slice(0,index).some(f=>!current![f]))
   return {error:'previous_step_not_approved',status:409};
  if(!d.approved && fields.slice(index+1).some(f=>current![f]))
   return {error:'revoke_later_steps_first',status:409};

  const accountId=d.accountId||current.accountId;
  if(d.step==='ACCOUNT_CREATED' && d.approved && !accountId)
   return {error:'account_id_required',status:400};

  const changed=await tx.eplanetUserWorkflow.updateMany({
   where:{userId,version:d.version,[field]:!d.approved},
   data:{
    [field]:d.approved,
    ...(d.step==='ACCOUNT_CREATED'?{accountId}:{}),
    ...(d.note!==undefined?{note:d.note}:{}),
    version:{increment:1}
   }
  });
  if(changed.count!==1)
   return {error:'version_conflict',status:409};

  await tx.auditLog.create({
   data:{
    ...(actor.adminUserId?{adminUserId:actor.adminUserId}:{}),
    userId,
    action:'EPLANET_STEP_UPDATED',
    entityType:'EplanetUserWorkflow',
    entityId:current.id,
    metadata:{
     source:actor.adminUserId?'SUPER_ADMIN':'TELEGRAM_TEAM',
     ...(actor.telegramAdminId?{telegramAdminId:actor.telegramAdminId}:{}),
     step:d.step,approved:d.approved,
     previousVersion:d.version
    }
   }
  });
  const workflow=await tx.eplanetUserWorkflow.findUnique({
   where:{userId}
  });
  return {ok:true,workflow};
 });
}
// END TENX_P37_SHARED_WORKFLOW_TX

app.put('/admin/team/workflow/:id/step', async (request, reply) => {
  const actor = await p37SuperSession(request, reply);
  if (!actor) return;

  const params = z.object({
    id: z.string().min(1).max(100)
  }).safeParse(request.params);

  const parsed = z.object({
    step: z.enum(teamSteps),
    approved: z.boolean(),
    version: z.number().int().min(0),
    accountId: z.string().trim().max(100).optional(),
    note: z.string().trim().max(500).optional()
  }).strict().safeParse(request.body);

  if (!params.success || !parsed.success)
    return reply.code(400).send({ error: 'invalid_request' });

  const d = parsed.data;
  const userId = params.data.id;
  const fields = [
    'accountCreated', 'depositCompleted',
    'copyConnected', 'challengeParticipant'
  ] as const;
  const index = teamSteps.indexOf(d.step);
  const field = fields[index];

  const result = await p37ChangeWorkflow(
    userId, d, {adminUserId:actor.id}
  );
  if ('error' in result)
    return reply.code(result.status ?? 409).send({error:result.error});
  return result;
});
// END TENX_P37_SUPER_APPROVAL


app.get('/admin/team/access', async (request, reply) => {
  const actor = await teamAuth(request, reply);
  if (!actor) return;
  return {
    ok: true,
    email: actor.email,
    superAdmin: actor.role === 'SUPER_ADMIN'
  };
});

app.get('/admin/team/admins', async (request, reply) => {
  if (!(await teamAuth(request, reply, true))) return;

  const setting = await prisma.systemSetting.findUnique({
    where: { key: teamAccessKey }
  });
  const ids = Array.isArray(setting?.value) ? setting.value : [];

  const admins = await prisma.adminUser.findMany({
    where: { isActive: true },
    select: { id: true, email: true, role: true }
  });

  return {
    items: admins.map(a => ({
      ...a,
      teamEnabled: ids.includes(a.id)
    }))
  };
});

app.put('/admin/team/admins', async (request, reply) => {
  const actor = await teamAuth(request, reply, true);
  if (!actor) return;

  const parsed = z.object({
    ids: z.array(z.string().min(1).max(100)).max(100)
  }).strict().safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const ids = parsed.data.ids;

  if (new Set(ids).size !== ids.length) {
    return reply.code(400).send({ error: 'duplicate_ids' });
  }

  const admins = await prisma.adminUser.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, role: true }
  });

  if (
    admins.length !== ids.length ||
    admins.some(a => a.role === 'SUPER_ADMIN')
  ) {
    return reply.code(400).send({ error: 'invalid_admin_selection' });
  }

  await prisma.$transaction(async tx => {
    await tx.systemSetting.upsert({
      where: { key: teamAccessKey },
      create: { key: teamAccessKey, value: ids },
      update: { value: ids }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: actor.id,
        action: 'TEAM_ACCESS_UPDATED',
        entityType: 'TeamAdmin',
        metadata: { adminIds: ids }
      }
    });
  });

  return { ok: true };
});

app.get('/admin/team/users', async (request, reply) => {
  if (!(await teamAuth(request, reply))) return;

  const parsed = z.object({
    q: z.string().max(100).optional(),
    cursor: z.string().optional()
  }).safeParse(request.query);

  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_query' });
  }

  const q = parsed.data.q?.trim();

  const where = q ? {
    OR: [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { username: { contains: q } },
      { telegramId: { contains: q } },
      { phone: { contains: q } }
    ]
  } : {};

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      telegramId: true,
      username: true,
      firstName: true,
      lastName: true,
      phone: true,
      registrationStage: true,
      registrationSource: true,
      createdAt: true,
      eplanetWorkflow: true
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(parsed.data.cursor ? {
      skip: 1,
      cursor: { id: parsed.data.cursor }
    } : {})
  });

  const hasMore = users.length > 50;
  const page = users.slice(0, 50);
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // TENX_P37_UNIFIED_READ
  return {
    items: page.map(u => ({
      ...u,
      team: {
        ACCOUNT_CREATED: {
          approved: u.eplanetWorkflow?.accountCreated || false,
          accountId: u.eplanetWorkflow?.accountId || ''
        },
        DEPOSIT_COMPLETED: {
          approved: u.eplanetWorkflow?.depositCompleted || false
        },
        COPY_CONNECTED: {
          approved: u.eplanetWorkflow?.copyConnected || false
        },
        CHALLENGE_PARTICIPANT: {
          approved: u.eplanetWorkflow?.challengeParticipant || false
        }
      }
    })),
    nextCursor: users.length === 50 ? users[49].id : null
  };
});

// TENX_P37_LEGACY_WRITE_DISABLED
app.put('/admin/team/users/:id/step', async (request, reply) => {
  const actor = await teamAuth(request, reply);
  if (!actor) return;

  return reply.code(410).send({
    error: 'legacy_workflow_disabled',
    message: 'Use the P37 ePlanet workflow'
  });
});

app.get('/admin/team/panel', async (_request, reply) => {
  const fs = await import('node:fs');
  reply.header('cache-control', 'no-store');
  return reply.type('text/html; charset=utf-8').send(
    fs.readFileSync(
      join(process.cwd(), 'apps/api/public/team.html'),
      'utf8'
    )
  );
});
// END TENX_TEAM_ADMIN_P36


// TENX_P37_TEAM_API
app.post('/miniapp/team/me', async (request, reply) => {
  const body = z.object({
    initData: z.string().min(1).max(10000)
  }).strict().safeParse(request.body);
  if (!body.success)
    return reply.code(400).send({ error: 'invalid_request' });

  const result = await authenticateTeamAdmin(
    prisma, body.data.initData,
    process.env.TELEGRAM_BOT_TOKEN || ''
  );
  if (!result.ok)
    return reply.code(
      result.error === 'team_access_denied' ? 403 : 401
    ).send({ error: result.error });

  return { admin: result.admin };
});

app.post('/miniapp/team/users', async (request, reply) => {
  const body = z.object({
    initData: z.string().min(1).max(10000),
    q: z.string().max(100).optional(),
    cursor: z.string().optional()
  }).strict().safeParse(request.body);
  if (!body.success)
    return reply.code(400).send({ error: 'invalid_request' });

  const actor = await authenticateTeamAdmin(
    prisma, body.data.initData,
    process.env.TELEGRAM_BOT_TOKEN || ''
  );
  if (!actor.ok)
    return reply.code(
      actor.error === 'team_access_denied' ? 403 : 401
    ).send({ error: actor.error });

  const q = body.data.q?.trim();
  const items = await prisma.user.findMany({
    where: q ? { OR: [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { username: { contains: q } },
      { telegramId: { contains: q } },
      { phone: { contains: q } }
    ] } : {},
    select: {
      id: true, telegramId: true, username: true,
      firstName: true, lastName: true, phone: true,
      registrationStage: true, createdAt: true,
      eplanetWorkflow: true
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    ...(body.data.cursor ? {
      skip: 1, cursor: { id: body.data.cursor }
    } : {})
  });

  return {
    items,
    nextCursor: items.length === 50 ? items[49].id : null
  };
});
// END TENX_P37_TEAM_API

// TENX_P37_EPLANET_APPROVAL
app.post('/miniapp/team/approve', async (request, reply) => {
  const parsed = z.object({
    initData: z.string().min(1).max(10000),
    userId: z.string().min(1).max(100),
    step: z.enum(teamSteps),
    approved: z.boolean(),
    version: z.number().int().min(0),
    accountId: z.string().trim().max(100).optional(),
    note: z.string().trim().max(500).optional()
  }).strict().safeParse(request.body);

  if (!parsed.success)
    return reply.code(400).send({ error: 'invalid_request' });

  const d = parsed.data;
  const auth = await authenticateTeamAdmin(
    prisma, d.initData,
    process.env.TELEGRAM_BOT_TOKEN || ''
  );
  if (!auth.ok)
    return reply.code(403).send({ error: auth.error });

  if (!['USER_MANAGER', 'CHALLENGE_MANAGER'].includes(auth.admin.role))
    return reply.code(403).send({ error: 'approval_permission_required' });

  const result = await p37ChangeWorkflow(
    d.userId, d, {telegramAdminId:auth.admin.id}
  );
  if ('error' in result)
    return reply.code(result.status ?? 409).send({error:result.error});
  return result;
});
// END TENX_P37_EPLANET_APPROVAL

// TENX_P37_TELEGRAM_ADMINS
app.get('/admin/team/telegram-admins', async (request, reply) => {
  const actor = await p37SuperSession(request, reply);
  if (!actor) return;

  const items = await prisma.telegramTeamAdmin.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  return { ok: true, items };
});

app.put('/admin/team/telegram-admins', async (request, reply) => {
  const actor = await p37SuperSession(request, reply);
  if (!actor) return;

  const parsed = z.object({
    telegramId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    displayName: z.string().trim().min(1).max(100),
    role: z.enum([
      'USER_MANAGER', 'CHALLENGE_MANAGER',
      'SUPPORT', 'ANALYST'
    ]),
    isActive: z.boolean()
  }).strict().safeParse(request.body);

  if (!parsed.success)
    return reply.code(400).send({ error: 'invalid_request' });

  const d = parsed.data;

  const result = await prisma.$transaction(async tx => {
    const admin = await tx.telegramTeamAdmin.upsert({
      where: { telegramId: d.telegramId },
      create: d,
      update: {
        displayName: d.displayName,
        role: d.role,
        isActive: d.isActive
      }
    });

    await tx.auditLog.create({
      data: {
        adminUserId: actor.id,
        action: 'TELEGRAM_TEAM_ADMIN_UPDATED',
        entityType: 'TelegramTeamAdmin',
        entityId: admin.id,
        metadata: {
          telegramId: d.telegramId,
          role: d.role,
          isActive: d.isActive
        }
      }
    });

    return admin;
  });

  return { ok: true, admin: result };
});
// END TENX_P37_TELEGRAM_ADMINS




app.get('/admin/panel', async (_request, reply) => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const file = [join(process.cwd(), 'apps/api/public/admin.html'), join(process.cwd(), 'public/admin.html')].find((p) => existsSync(p));
  if (!file) return reply.code(404).send({ error: 'panel_file_missing' });
  reply.header('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
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

  reply.header('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
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
  challengeLessonId: null,
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
    challengeLessonId: typeof saved.challengeLessonId === 'string'
      ? saved.challengeLessonId.slice(0, 128) : null,
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
    challengeLessonId: z.string().max(128).nullable().optional(),
    customMenu: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      response: z.string().trim().max(2000).optional().default(''),
      enabled: z.boolean().default(true),
      action: z.enum(['reply', 'url', 'web_app', 'academy_lesson']).optional().default('reply'),
      url: z.string().url().max(1000).optional(),
      lessonId: z.string().max(128).optional(),
      blocks: z.array(z.object({
        type: z.enum(['text', 'image', 'video', 'link', 'separator']),
        text: z.string().max(2000).optional(),
        url: z.string().url().max(1000).optional(),
        caption: z.string().max(500).optional()
      }).strict()).max(20).optional().default([])
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

  if (config.challengeLessonId) {
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: config.challengeLessonId,
        status: 'PUBLISHED',
        course: { status: 'PUBLISHED' }
      },
      select: { id: true }
    });
    if (!lesson) {
      return reply.code(400).send({ error: 'CHALLENGE_LESSON_NOT_PUBLISHED' });
    }
  }

  for (const item of config.customMenu) {
    if ((item.action === 'url' || item.action === 'web_app') &&
        (!item.url || !item.url.startsWith('https://'))) {
      return reply.code(400).send({ error: 'INVALID_MENU_URL' });
    }
    if (item.action === 'academy_lesson' && !item.lessonId) {
      return reply.code(400).send({ error: 'MENU_LESSON_REQUIRED' });
    }
    if (item.lessonId) {
      const lesson = await prisma.lesson.findFirst({
        where: {
          id: item.lessonId,
          status: 'PUBLISHED',
          course: { status: 'PUBLISHED' }
        },
        select: { id: true }
      });
      if (!lesson) return reply.code(400).send({ error: 'MENU_LESSON_NOT_PUBLISHED' });
    }
    for (const block of item.blocks || []) {
      if (['image', 'video', 'link'].includes(block.type) &&
          (!block.url || !block.url.startsWith('https://'))) {
        return reply.code(400).send({ error: 'INVALID_MENU_BLOCK_URL' });
      }
    }
  }

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


app.get('/miniapp', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); return reply.redirect('/miniapp/index.html?entry=P74_R103', 302); });

app.get('/admin', async (_request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پنل مدیریت 10X</title><style>
  :root{font-family:Tahoma,Arial,sans-serif;color:#e9edf5;background:#0b1020}*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:1100px;margin:auto}.card{background:#151d31;border:1px solid #2b3650;border-radius:16px;padding:18px;margin:14px 0}h1{margin:0 0 8px}p{color:#aab6cc}input,button{font:inherit;border-radius:9px;padding:11px;border:1px solid #35435f}input{background:#0d1426;color:#fff;min-width:260px}button{background:#e5b94b;color:#171717;cursor:pointer;font-weight:bold}button.secondary{background:#25314a;color:#fff}form{display:flex;gap:8px;flex-wrap:wrap} .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.stat{padding:14px;background:#0d1426;border-radius:12px}.num{font-size:28px;font-weight:bold;margin-top:8px}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:right;padding:12px;border-bottom:1px solid #2b3650;font-size:13px}.tablewrap{overflow:auto}.muted{color:#aab6cc}.error{color:#ff9c9c}.ok{color:#9fe0b2}@media(max-width:600px){body{padding:12px}input{min-width:100%}}


/* TENX_P54_EXECUTIVE_UI_V1 -- Shared administrative visual language */
@font-face{font-family:DoranFaNum;src:url('/miniapp/fonts/doran/DoranFaNum-Regular.woff2') format('woff2');font-display:swap;font-style:normal;font-weight:400 900}
:root{color-scheme:dark;--p54-deep:#07120d;--p54-card:#13281c;--p54-jade:#51d59a;--p54-copper:#d2a977;--p54-line:#315842}
html{color-scheme:dark;scrollbar-color:#37644b #06140d}
body{
 background:radial-gradient(ellipse 75% 50% at 100% 0%,rgba(36,118,77,.23),transparent 70%),
 radial-gradient(ellipse 60% 48% at 0% 100%,rgba(149,95,52,.14),transparent 73%),
 linear-gradient(150deg,#06110c,#0b1b12 64%,#07140e)!important;
 color:#edf8f0!important;font:14px/1.85 "DoranFaNum","Doran",Vazirmatn,Tahoma,Arial,sans-serif!important;
 min-height:100vh;overflow-x:hidden;
}
main{position:relative;max-width:1240px;padding:clamp(15px,2.3vw,34px)!important}
main>h1{
 position:relative;overflow:hidden;color:#f3fff4!important;
 font-size:clamp(22px,3vw,32px)!important;line-height:1.6;
 padding:22px 24px 27px;margin:7px 0 18px!important;
 border:1px solid rgba(211,167,103,.4);border-radius:22px;
 background:linear-gradient(113deg,#173824,#0d2519 70%,#262a1c);
 box-shadow:0 18px 45px #0005;
}
main>h1::after{
 content:'MATIN FUTURE  /  EXECUTIVE CONTROL';display:block;margin-top:5px;
 color:#d3ae7d;font:600 10px/1.4 system-ui,sans-serif;letter-spacing:1.4px;
 direction:ltr;text-align:right;
}
.card,section.card{
 background:linear-gradient(151deg,rgba(20,44,30,.99),rgba(11,28,19,.99))!important;
 border:1px solid rgba(122,181,138,.28)!important;border-radius:19px!important;
 box-shadow:0 15px 39px #0005,inset 0 1px 0 rgba(255,255,255,.04)!important;
 padding:clamp(16px,2vw,23px)!important;margin:14px 0!important;
}
.card h2,.card h3{color:#efdfbf;font-weight:800;border-bottom:1px solid rgba(196,158,107,.28);padding-bottom:10px}
p,.muted,.mut{color:#a5c1ae!important}
label{color:#cde6d4}
input:not([type=checkbox]):not([type=radio]),textarea,select{
 background:#0a1d13!important;border:1px solid #3a684f!important;
 color:#f2fff6!important;border-radius:12px!important;min-height:44px!important;
 padding:10px 13px!important;box-shadow:inset 0 2px 8px #0003;
}
input::placeholder,textarea::placeholder{color:#8fa996;opacity:1}
input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{
 outline:2px solid #d9b27b!important;outline-offset:2px!important;
}
button{
 background:linear-gradient(135deg,#248156,#155b3e)!important;
 border:1px solid rgba(103,222,157,.51)!important;
 border-radius:12px!important;padding:10px 16px!important;min-height:44px;
 font-weight:750!important;color:#f8fff9!important;cursor:pointer;
 box-shadow:0 6px 17px #0005,inset 0 1px 0 rgba(255,255,255,.12)!important;
 transition:transform .18s,filter .18s;
}
button:not(:disabled):hover{filter:brightness(1.12);transform:translateY(-1px)}
button.secondary,button.sec{background:#1d3327!important;border-color:#456c50!important;color:#e4f3e8!important}
button:disabled{opacity:.5;cursor:not-allowed}
.row{gap:11px!important}
.wrap,.table,.tablewrap{overflow-x:auto;max-width:100%;border:1px solid #31543d;border-radius:15px}
table{border-collapse:separate;border-spacing:0;width:100%}
th{background:linear-gradient(90deg,#193b2a,#123022)!important;color:#e2be87!important;font-weight:700}
th,td{padding:13px!important;border-bottom:1px solid #31503b!important}
tbody tr:hover{background:rgba(42,112,73,.23)}
.ok,.status{color:#67e8a4!important}.bad,.error{color:#ff969b!important}
#stats .stat{border:1px solid rgba(105,170,122,.35);border-radius:15px;background:#173625;padding:15px;box-shadow:inset 0 1px 0 #fff1}
.num{color:#e6c695;font-size:30px!important}
summary{cursor:pointer;color:#ddc199}
@media(max-width:720px){
 body{padding:0!important}main{padding:14px!important}
 main>h1{padding:16px 17px 22px!important;border-radius:16px}
 .card{border-radius:15px!important;padding:14px!important}
 input:not([type=checkbox]):not([type=radio]),textarea,select{max-width:100%!important;min-width:0!important}
 .row{align-items:stretch;gap:8px!important}
 .row>*{max-width:100%}
 th,td{padding:10px!important}
}
@media(prefers-reduced-motion:reduce){button{transition:none!important;transform:none!important}}
/* END TENX_P54_EXECUTIVE_UI_V1 */



/* TENX_P55_IMPERIAL_RESERVE_V1 -- legacy and team admin shared theme */
@font-face{font-family:DoranFaNum;src:url('/miniapp/fonts/doran/DoranFaNum-Regular.woff2') format('woff2');font-display:swap;font-style:normal;font-weight:400 900}
:root{color-scheme:dark;--ir-bg:#070f0c;--ir-card:#12261b;--ir-copper:#bf9678;--ir-ivory:#f0eadd;--ir-line:#3b4c3f}
html{color-scheme:dark;scrollbar-color:#425a47 #08130c}
body{
 background:radial-gradient(ellipse at 100% 0%,rgba(43,93,63,.19),transparent 65%),
 linear-gradient(155deg,#07110d,#0b1b13 60%,#08140e)!important;
 color:var(--ir-ivory)!important;
 font:14px/1.85 "DoranFaNum","Doran",Vazirmatn,Tahoma,Arial,sans-serif!important;
 min-height:100vh;overflow-x:hidden;
}
main{max-width:1240px;padding:clamp(15px,2.3vw,32px)!important}
main>h1{
 position:relative;padding:25px 25px 28px;margin:5px 0 18px!important;
 background:linear-gradient(125deg,#1a3426,#12241b)!important;
 border:1px solid rgba(194,151,116,.46)!important;
 border-radius:18px!important;color:#f0e8d9!important;
 box-shadow:0 17px 44px #0006!important;
 font-size:clamp(22px,2.7vw,31px)!important;
}
main>h1::after{
 content:'MATIN FUTURE / IMPERIAL RESERVE';display:block;margin-top:9px;
 color:#bf9678;font:600 10px/1.5 system-ui,sans-serif;letter-spacing:2px;
 direction:ltr;text-align:right;
}
.card,section.card{
 background:linear-gradient(152deg,#152d21,#0e2017)!important;
 border:1px solid rgba(180,152,116,.27)!important;
 border-radius:17px!important;
 box-shadow:0 13px 34px #0004,inset 0 1px rgba(252,235,197,.035)!important;
 padding:clamp(16px,2vw,24px)!important;margin:15px 0!important;
}
.card h2,.card h3{
 color:#ead3b7!important;border-bottom:1px solid rgba(194,154,118,.25)!important;
 padding-bottom:12px;font-weight:800!important;
}
p,.muted,.mut{color:#adbead!important}
label{color:#d4dcca!important}
input:not([type=checkbox]):not([type=radio]),select,textarea{
 background:#0a1b12!important;color:#f7f1e6!important;
 border:1px solid #415747!important;border-radius:11px!important;
 min-height:44px!important;padding:10px 13px!important;
 box-shadow:inset 0 1px 5px #0003!important;
}
input::placeholder,textarea::placeholder{color:#8fa293!important;opacity:1}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{
 outline:2px solid #c59b78!important;outline-offset:2px!important;
}
button{
 background:linear-gradient(120deg,#2c6048,#214635)!important;
 color:#f9f4eb!important;border:1px solid rgba(166,173,133,.52)!important;
 border-radius:11px!important;padding:10px 16px!important;
 min-height:44px!important;font-weight:750!important;
 box-shadow:inset 0 1px rgba(255,255,255,.07),0 5px 16px #0003!important;
 transition:filter .18s,transform .18s;
}
button.secondary,button.sec{background:#1b3426!important;border-color:#796b58!important;color:#e1e4d7!important}
button:disabled{opacity:.5;cursor:not-allowed}
.row{gap:11px!important}
.wrap,.table,.tablewrap{max-width:100%;overflow-x:auto;border:1px solid #3d5441!important;border-radius:14px!important}
table{border-collapse:separate;border-spacing:0;width:100%}
th{
 background:#1b3427!important;color:#e3bd9b!important;
 border-bottom:1px solid rgba(193,154,111,.43)!important;font-weight:750!important;
}
th,td{padding:13px!important;border-bottom:1px solid rgba(161,178,142,.17)!important}
tbody tr:hover{background:rgba(53,91,66,.28)!important}
.ok,.status{color:#a4d4b4!important}.bad,.error{color:#e1a09a!important}
#stats .stat{background:#1b3527!important;border:1px solid #52644c!important;border-radius:13px!important;padding:17px!important}
.num{color:#e7d0b3!important;font-size:31px!important}
summary{color:#d9b99a!important;cursor:pointer}
@media(max-width:720px){
 body{padding:0!important}main{padding:14px!important}
 main>h1{padding:18px!important;border-radius:15px!important}
 .card{border-radius:14px!important;padding:15px!important}
 input:not([type=checkbox]):not([type=radio]),select,textarea{min-width:0!important;max-width:100%!important}
 .row{align-items:stretch;gap:8px!important}
 .row>*{max-width:100%}
 th,td{padding:10px!important}
}
@media(prefers-reduced-motion:reduce){button{transition:none!important;transform:none!important}}
/* END TENX_P55_IMPERIAL_RESERVE_V1 */

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


/* TENX_P54_EXECUTIVE_UI_V1 -- Shared administrative visual language */
@font-face{font-family:DoranFaNum;src:url('/miniapp/fonts/doran/DoranFaNum-Regular.woff2') format('woff2');font-display:swap;font-style:normal;font-weight:400 900}
:root{color-scheme:dark;--p54-deep:#07120d;--p54-card:#13281c;--p54-jade:#51d59a;--p54-copper:#d2a977;--p54-line:#315842}
html{color-scheme:dark;scrollbar-color:#37644b #06140d}
body{
 background:radial-gradient(ellipse 75% 50% at 100% 0%,rgba(36,118,77,.23),transparent 70%),
 radial-gradient(ellipse 60% 48% at 0% 100%,rgba(149,95,52,.14),transparent 73%),
 linear-gradient(150deg,#06110c,#0b1b12 64%,#07140e)!important;
 color:#edf8f0!important;font:14px/1.85 "DoranFaNum","Doran",Vazirmatn,Tahoma,Arial,sans-serif!important;
 min-height:100vh;overflow-x:hidden;
}
main{position:relative;max-width:1240px;padding:clamp(15px,2.3vw,34px)!important}
main>h1{
 position:relative;overflow:hidden;color:#f3fff4!important;
 font-size:clamp(22px,3vw,32px)!important;line-height:1.6;
 padding:22px 24px 27px;margin:7px 0 18px!important;
 border:1px solid rgba(211,167,103,.4);border-radius:22px;
 background:linear-gradient(113deg,#173824,#0d2519 70%,#262a1c);
 box-shadow:0 18px 45px #0005;
}
main>h1::after{
 content:'MATIN FUTURE  /  EXECUTIVE CONTROL';display:block;margin-top:5px;
 color:#d3ae7d;font:600 10px/1.4 system-ui,sans-serif;letter-spacing:1.4px;
 direction:ltr;text-align:right;
}
.card,section.card{
 background:linear-gradient(151deg,rgba(20,44,30,.99),rgba(11,28,19,.99))!important;
 border:1px solid rgba(122,181,138,.28)!important;border-radius:19px!important;
 box-shadow:0 15px 39px #0005,inset 0 1px 0 rgba(255,255,255,.04)!important;
 padding:clamp(16px,2vw,23px)!important;margin:14px 0!important;
}
.card h2,.card h3{color:#efdfbf;font-weight:800;border-bottom:1px solid rgba(196,158,107,.28);padding-bottom:10px}
p,.muted,.mut{color:#a5c1ae!important}
label{color:#cde6d4}
input:not([type=checkbox]):not([type=radio]),textarea,select{
 background:#0a1d13!important;border:1px solid #3a684f!important;
 color:#f2fff6!important;border-radius:12px!important;min-height:44px!important;
 padding:10px 13px!important;box-shadow:inset 0 2px 8px #0003;
}
input::placeholder,textarea::placeholder{color:#8fa996;opacity:1}
input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{
 outline:2px solid #d9b27b!important;outline-offset:2px!important;
}
button{
 background:linear-gradient(135deg,#248156,#155b3e)!important;
 border:1px solid rgba(103,222,157,.51)!important;
 border-radius:12px!important;padding:10px 16px!important;min-height:44px;
 font-weight:750!important;color:#f8fff9!important;cursor:pointer;
 box-shadow:0 6px 17px #0005,inset 0 1px 0 rgba(255,255,255,.12)!important;
 transition:transform .18s,filter .18s;
}
button:not(:disabled):hover{filter:brightness(1.12);transform:translateY(-1px)}
button.secondary,button.sec{background:#1d3327!important;border-color:#456c50!important;color:#e4f3e8!important}
button:disabled{opacity:.5;cursor:not-allowed}
.row{gap:11px!important}
.wrap,.table,.tablewrap{overflow-x:auto;max-width:100%;border:1px solid #31543d;border-radius:15px}
table{border-collapse:separate;border-spacing:0;width:100%}
th{background:linear-gradient(90deg,#193b2a,#123022)!important;color:#e2be87!important;font-weight:700}
th,td{padding:13px!important;border-bottom:1px solid #31503b!important}
tbody tr:hover{background:rgba(42,112,73,.23)}
.ok,.status{color:#67e8a4!important}.bad,.error{color:#ff969b!important}
#stats .stat{border:1px solid rgba(105,170,122,.35);border-radius:15px;background:#173625;padding:15px;box-shadow:inset 0 1px 0 #fff1}
.num{color:#e6c695;font-size:30px!important}
summary{cursor:pointer;color:#ddc199}
@media(max-width:720px){
 body{padding:0!important}main{padding:14px!important}
 main>h1{padding:16px 17px 22px!important;border-radius:16px}
 .card{border-radius:15px!important;padding:14px!important}
 input:not([type=checkbox]):not([type=radio]),textarea,select{max-width:100%!important;min-width:0!important}
 .row{align-items:stretch;gap:8px!important}
 .row>*{max-width:100%}
 th,td{padding:10px!important}
}
@media(prefers-reduced-motion:reduce){button{transition:none!important;transform:none!important}}
/* END TENX_P54_EXECUTIVE_UI_V1 */



/* TENX_P55_IMPERIAL_RESERVE_V1 -- legacy and team admin shared theme */
@font-face{font-family:DoranFaNum;src:url('/miniapp/fonts/doran/DoranFaNum-Regular.woff2') format('woff2');font-display:swap;font-style:normal;font-weight:400 900}
:root{color-scheme:dark;--ir-bg:#070f0c;--ir-card:#12261b;--ir-copper:#bf9678;--ir-ivory:#f0eadd;--ir-line:#3b4c3f}
html{color-scheme:dark;scrollbar-color:#425a47 #08130c}
body{
 background:radial-gradient(ellipse at 100% 0%,rgba(43,93,63,.19),transparent 65%),
 linear-gradient(155deg,#07110d,#0b1b13 60%,#08140e)!important;
 color:var(--ir-ivory)!important;
 font:14px/1.85 "DoranFaNum","Doran",Vazirmatn,Tahoma,Arial,sans-serif!important;
 min-height:100vh;overflow-x:hidden;
}
main{max-width:1240px;padding:clamp(15px,2.3vw,32px)!important}
main>h1{
 position:relative;padding:25px 25px 28px;margin:5px 0 18px!important;
 background:linear-gradient(125deg,#1a3426,#12241b)!important;
 border:1px solid rgba(194,151,116,.46)!important;
 border-radius:18px!important;color:#f0e8d9!important;
 box-shadow:0 17px 44px #0006!important;
 font-size:clamp(22px,2.7vw,31px)!important;
}
main>h1::after{
 content:'MATIN FUTURE / IMPERIAL RESERVE';display:block;margin-top:9px;
 color:#bf9678;font:600 10px/1.5 system-ui,sans-serif;letter-spacing:2px;
 direction:ltr;text-align:right;
}
.card,section.card{
 background:linear-gradient(152deg,#152d21,#0e2017)!important;
 border:1px solid rgba(180,152,116,.27)!important;
 border-radius:17px!important;
 box-shadow:0 13px 34px #0004,inset 0 1px rgba(252,235,197,.035)!important;
 padding:clamp(16px,2vw,24px)!important;margin:15px 0!important;
}
.card h2,.card h3{
 color:#ead3b7!important;border-bottom:1px solid rgba(194,154,118,.25)!important;
 padding-bottom:12px;font-weight:800!important;
}
p,.muted,.mut{color:#adbead!important}
label{color:#d4dcca!important}
input:not([type=checkbox]):not([type=radio]),select,textarea{
 background:#0a1b12!important;color:#f7f1e6!important;
 border:1px solid #415747!important;border-radius:11px!important;
 min-height:44px!important;padding:10px 13px!important;
 box-shadow:inset 0 1px 5px #0003!important;
}
input::placeholder,textarea::placeholder{color:#8fa293!important;opacity:1}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{
 outline:2px solid #c59b78!important;outline-offset:2px!important;
}
button{
 background:linear-gradient(120deg,#2c6048,#214635)!important;
 color:#f9f4eb!important;border:1px solid rgba(166,173,133,.52)!important;
 border-radius:11px!important;padding:10px 16px!important;
 min-height:44px!important;font-weight:750!important;
 box-shadow:inset 0 1px rgba(255,255,255,.07),0 5px 16px #0003!important;
 transition:filter .18s,transform .18s;
}
button.secondary,button.sec{background:#1b3426!important;border-color:#796b58!important;color:#e1e4d7!important}
button:disabled{opacity:.5;cursor:not-allowed}
.row{gap:11px!important}
.wrap,.table,.tablewrap{max-width:100%;overflow-x:auto;border:1px solid #3d5441!important;border-radius:14px!important}
table{border-collapse:separate;border-spacing:0;width:100%}
th{
 background:#1b3427!important;color:#e3bd9b!important;
 border-bottom:1px solid rgba(193,154,111,.43)!important;font-weight:750!important;
}
th,td{padding:13px!important;border-bottom:1px solid rgba(161,178,142,.17)!important}
tbody tr:hover{background:rgba(53,91,66,.28)!important}
.ok,.status{color:#a4d4b4!important}.bad,.error{color:#e1a09a!important}
#stats .stat{background:#1b3527!important;border:1px solid #52644c!important;border-radius:13px!important;padding:17px!important}
.num{color:#e7d0b3!important;font-size:31px!important}
summary{color:#d9b99a!important;cursor:pointer}
@media(max-width:720px){
 body{padding:0!important}main{padding:14px!important}
 main>h1{padding:18px!important;border-radius:15px!important}
 .card{border-radius:14px!important;padding:15px!important}
 input:not([type=checkbox]):not([type=radio]),select,textarea{min-width:0!important;max-width:100%!important}
 .row{align-items:stretch;gap:8px!important}
 .row>*{max-width:100%}
 th,td{padding:10px!important}
}
@media(prefers-reduced-motion:reduce){button{transition:none!important;transform:none!important}}
/* END TENX_P55_IMPERIAL_RESERVE_V1 */

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

// === TENX_P50_GROWTH_TRACKING_V1_START ===
const growthDefaultCampaigns = [
  {code:'campaign01',name:'Campaign 01',kind:'CAMPAIGN',active:true},
  {code:'blogger01',name:'Blogger 01',kind:'BLOGGER',active:true},
  {code:'telegram01',name:'Telegram Channel 01',kind:'TELEGRAM_CHANNEL',active:true},
  {code:'instagram01',name:'Instagram 01',kind:'INSTAGRAM',active:true},
  {code:'matin_channel',name:'Matin Channel',kind:'TELEGRAM_CHANNEL',active:true},
  {code:'mohammadjavad_channel',name:'Mohammadjavad Channel',kind:'TELEGRAM_CHANNEL',active:true}
];
const growthCampaignKey='TENX_GROWTH_CAMPAIGNS_V1';
const growthInactivePrefix='TENX_GROWTH_INACTIVE_';
const growthKinds=['CAMPAIGN','BLOGGER','TELEGRAM_CHANNEL','INSTAGRAM','OTHER'] as const;
const growthStatusKeys=['REGISTERED','ACCOUNT_CREATED','DEPOSIT_COMPLETED','COPY_CONNECTED','CHALLENGE_PARTICIPANT'] as const;
const growthCanWrite=(request:FastifyRequest, roles:string[]) => {
  const role=(request as unknown as {admin?:{role?:string}}).admin?.role;
  const scoped=(request as unknown as {p60Scopes?:P60ScopeRecord}).p60Scopes;
  if(scoped){const routeSection=p60RouteSection(`${request.method} ${request.routeOptions.url??request.url}`);
    return scoped[routeSection==='users'?'users':'marketing']==='write';}
  return role==='SUPER_ADMIN'||(Boolean(role)&&roles.includes(role!));
};
// TENX_P58_CAMPAIGN_LIFECYCLE_V1
async function growthCampaigns(){
  const r=await prisma.systemSetting.findUnique({where:{key:growthCampaignKey}});
  const items=(!r || !Array.isArray(r.value))?growthDefaultCampaigns:(r.value as any[]);
  return items.filter((x:any)=>x&&typeof x.code==='string'&&typeof x.name==='string')
    .slice(0,200).map((x:any)=>({code:String(x.code),name:String(x.name),kind:String(x.kind||'OTHER'),active:x.active!==false,
      expiresAt:typeof x.expiresAt==='string'?x.expiresAt:null,
      archivedAt:typeof x.archivedAt==='string'?x.archivedAt:null}));
}
function growthCampaignState(c:any):'ACTIVE'|'PAUSED'|'EXPIRED'|'ARCHIVED'{
  if(c.archivedAt)return 'ARCHIVED';
  if(c.expiresAt && (!Number.isFinite(Date.parse(String(c.expiresAt))) || Date.parse(String(c.expiresAt))<=Date.now()))return 'EXPIRED';
  return c.active===false?'PAUSED':'ACTIVE';
}
// TENX_P57_DIRECT_BOT_LINKS_V1: user-confirmed bot identity, verified against getMe when available.
async function growthBotIdentity():Promise<{username:string|null,verification:'VERIFIED'|'MISMATCH'|'UNVERIFIED'}>{
  const expected='ChallangeMMTrade10X_bot';
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)return {username:expected,verification:'UNVERIFIED'};
  try{
    const response=await fetch('https://api.telegram.org/bot'+token+'/getMe',{signal:AbortSignal.timeout(3500)});
    const data=await response.json() as any;
    const actual=data?.result?.username;
    if(data?.ok&&typeof actual==='string'&&/^[a-zA-Z0-9_]{5,32}$/.test(actual)){
      if(actual.toLowerCase()!==expected.toLowerCase()){
        return {username:null,verification:'MISMATCH'};
      }
      return {username:actual,verification:'VERIFIED'};
    }
  }catch{ /* API/Telegram may be temporarily unreachable; keep links available, visibly unverified. */ }
  return {username:expected,verification:'UNVERIFIED'};
}
async function growthInactiveIds():Promise<string[]>{
  const rows=await prisma.systemSetting.findMany({where:{key:{startsWith:growthInactivePrefix}},select:{key:true,value:true}});
  return rows.filter(r=>(r.value as any)?.inactive===true).map(r=>r.key.slice(growthInactivePrefix.length));
}
function growthCutoff(){return new Date(Date.now()-30*86400000);}
function growthTodayRange(){
  // Iran uses UTC+03:30 year-round in 2026; database datetimes are stored in UTC.
  const offset=210*60000;
  const now=Date.now();
  const beginning=Math.floor((now+offset)/86400000)*86400000-offset;
  return {gte:new Date(beginning),lt:new Date(beginning+86400000)};
}
function growthUserWhere(query:Record<string,any>,inactive:string[]):any {
  const and:any[]=[];
  const q=String(query.q||'').trim().slice(0,100);
  if(q)and.push({OR:[
    {telegramId:{contains:q}},{username:{contains:q}},{firstName:{contains:q}},
    {lastName:{contains:q}},{phone:{contains:q}},
    {eplanetWorkflow:{is:{accountId:{contains:q}}}}
  ]});
  const source=String(query.source||'').trim();
  if(source && /^[a-z0-9_-]{3,32}$/.test(source))and.push({registrationSource:'campaign:'+source});
  const st=String(query.status||'');
  if(st==='REGISTERED')and.push({registrationStatus:{in:['REGISTERED','COMPLETE']}});
  else if(st==='ACCOUNT_CREATED')and.push({eplanetWorkflow:{is:{accountCreated:true}}});
  else if(st==='DEPOSIT_COMPLETED')and.push({eplanetWorkflow:{is:{depositCompleted:true}}});
  else if(st==='COPY_CONNECTED')and.push({eplanetWorkflow:{is:{copyConnected:true}}});
  else if(st==='CHALLENGE_PARTICIPANT')and.push({eplanetWorkflow:{is:{challengeParticipant:true}}});
  else if(st==='INACTIVE')and.push({OR:[{lastActivityAt:{lt:growthCutoff()}},...(inactive.length?[{id:{in:inactive}}]:[])]});
  else if(st==='ACTIVE')and.push({lastActivityAt:{gte:growthCutoff()},...(inactive.length?{id:{notIn:inactive}}:{})});
  return and.length?{AND:and}:{};
}
const growthUserSelect={
  id:true,telegramId:true,username:true,firstName:true,lastName:true,phone:true,
  registrationStatus:true,registrationStage:true,registrationSource:true,
  registeredAt:true,createdAt:true,lastActivityAt:true,
  eplanetWorkflow:{select:{accountId:true,accountCreated:true,depositCompleted:true,copyConnected:true,challengeParticipant:true,note:true,updatedAt:true}},
  telegramAccount:{select:{chatId:true}}
} as const;
function growthSafeUser(u:any,inactiveIds:string[]){
  return {...u,manualInactive:inactiveIds.includes(u.id),
    isInactive:inactiveIds.includes(u.id)||new Date(u.lastActivityAt).getTime()<growthCutoff().getTime(),
    canMessage:Boolean(u.telegramAccount?.chatId)};
}
async function growthLog(request:FastifyRequest,action:string,userId:string|null,metadata:object){
  await prisma.auditLog.create({data:{adminUserId:adminIdOf(request),userId:userId||undefined,action,
    entityType:'Growth',entityId:userId||undefined,metadata:metadata as any}});
}
// === TENX_P59_IMPERIAL_ANALYTICS_V1 ===
// Cohort analytics: arrival timestamp (User.createdAt) determines the period;
// stage flags describe their CURRENT state, not the date each stage happened.
const p59TzShift = 210 * 60000; // Asia/Tehran UTC+03:30 (2026)
const p59DateRegex = /^\d{4}-\d{2}-\d{2}$/;
const p59Day = 86400000;
function p59DayStr(ms:number){return new Date(ms).toISOString().slice(0,10);}
function p59ValidDate(s:string){return p59DateRegex.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && p59DayStr(Date.parse(s+'T00:00:00Z'))===s;}
function p59Bucket(ms:number, granularity:'day'|'week'|'month'){
  const local=new Date(ms+p59TzShift);
  const label=local.toISOString().slice(0,10);
  if(granularity==='day')return label;
  if(granularity==='month')return label.slice(0,7);
  const weekday=local.getUTCDay(); // Iran's week starts Saturday
  return p59DayStr(local.getTime()-((weekday+1)%7)*p59Day);
}
function p59Range(raw:unknown){
  const q=z.object({from:z.string().optional(),to:z.string().optional(),
    granularity:z.enum(['day','week','month']).optional(),
    source:z.string().regex(/^[a-z0-9_-]{3,32}$/).optional()}).strict().safeParse(raw);
  if(!q.success)return null;
  const iranNow=Date.now()+p59TzShift;
  const today=p59DayStr(iranNow);
  const to=q.data.to||today;
  if(!p59ValidDate(to))return null;
  const from=q.data.from||p59DayStr(Date.parse(to+'T00:00:00Z')-29*p59Day);
  if(!p59ValidDate(from)||!p59ValidDate(to))return null;
  const start=Date.parse(from+'T00:00:00Z');
  const end=Date.parse(to+'T00:00:00Z');
  const days=Math.round((end-start)/p59Day)+1;
  if(days<1||days>366||end>Date.parse(today+'T00:00:00Z'))return null;
  const granularity=q.data.granularity|| (days<=45?'day':days<=150?'week':'month');
  const startAt=new Date(start-p59TzShift);
  const endExclusive=new Date(end+p59Day-p59TzShift);
  return {from,to,days,granularity,source:q.data.source||'',startAt,endExclusive};
}
function p59Rates(x:{arrivals:number,registered:number,accounts:number,deposits:number,copies:number,participants:number}){
  const stages=[['ورود به ربات',x.arrivals],['ثبت‌نام اولیه',x.registered],['افتتاح حساب',x.accounts],
    ['شارژ حساب',x.deposits],['اتصال Copy Trading',x.copies],['شرکت‌کننده رسمی',x.participants]] as const;
  return stages.map(([name,count],i)=>({name,count,
    fromPrevious:i? (stages[i-1]![1]? Math.round(count/stages[i-1]![1]*1000)/10:null):100,
    fromArrival:x.arrivals?Math.round(count/x.arrivals*1000)/10:null}));
}
const p59Empty=()=>({arrivals:0,registered:0,accounts:0,deposits:0,copies:0,participants:0});
function p59Step(c:any,u:any){
  c.arrivals++;
  if(u.registrationStatus==='REGISTERED'||u.registrationStatus==='COMPLETE')c.registered++;
  if(u.eplanetWorkflow?.accountCreated)c.accounts++;
  if(u.eplanetWorkflow?.depositCompleted)c.deposits++;
  if(u.eplanetWorkflow?.copyConnected)c.copies++;
  if(u.eplanetWorkflow?.challengeParticipant)c.participants++;
}
async function p59Data(q:ReturnType<typeof p59Range>){
  if(!q)throw new Error('invalid_range');
  const where:any={createdAt:{gte:q.startAt,lt:q.endExclusive},telegramId:{not:null}};
  if(q.source)where.registrationSource='campaign:'+q.source;
  const count=await prisma.user.count({where});
  if(count>20000)return {error:'cohort_too_large' as const, count};
  const users=await prisma.user.findMany({where,orderBy:{createdAt:'asc'},take:20000,
    select:{createdAt:true,registrationStatus:true,registrationSource:true,
      eplanetWorkflow:{select:{accountCreated:true,depositCompleted:true,copyConnected:true,challengeParticipant:true}}}});
  const all=p59Empty(),groups=new Map<string,ReturnType<typeof p59Empty>>();
  const points=new Map<string,ReturnType<typeof p59Empty>>();
  const heatmap=Array.from({length:7},(_,weekday)=>({weekday,count:0}));
  let dayIndex=Date.parse(q.from+'T00:00:00Z');
  const endIndex=Date.parse(q.to+'T00:00:00Z');
  for(;dayIndex<=endIndex;dayIndex+=p59Day){const bucket=p59Bucket(dayIndex-p59TzShift,q.granularity);if(!points.has(bucket))points.set(bucket,p59Empty());}
  for(const u of users){
    p59Step(all,u);
    const src=String(u.registrationSource||'');
    const code=src.startsWith('campaign:')?src.slice('campaign:'.length):'__organic__';
    if(!groups.has(code))groups.set(code,p59Empty());
    p59Step(groups.get(code)!,u);
    const bucket=p59Bucket(u.createdAt.getTime(),q.granularity);
    if(!points.has(bucket))points.set(bucket,p59Empty());
    p59Step(points.get(bucket)!,u);
    const wd=new Date(u.createdAt.getTime()+p59TzShift).getUTCDay();
    heatmap[(wd+1)%7]!.count++;
  }
  const catalog=await growthCampaigns();
  const identities=new Map(catalog.map(c=>[c.code,c]));
  if(!q.source){for(const c of catalog)if(!groups.has(c.code))groups.set(c.code,p59Empty());}
  const campaigns=[...groups.entries()].filter(([code])=>code!=='__organic__')
    .map(([code,counts])=>{const cat=identities.get(code);return {code,name:cat?.name||code,
      kind:cat?.kind||'UNKNOWN',status:cat?growthCampaignState(cat):'UNKNOWN',...counts,
      registrationRate:counts.arrivals?Math.round(counts.registered/counts.arrivals*1000)/10:null,
      copyRate:counts.arrivals?Math.round(counts.copies/counts.arrivals*1000)/10:null};})
    .sort((a,b)=>b.arrivals-a.arrivals||a.code.localeCompare(b.code));
  const organic=groups.get('__organic__')||p59Empty();
  return {range:{from:q.from,to:q.to,granularity:q.granularity,days:q.days,source:q.source||null,timezone:'Asia/Tehran',
    definition:'کاربران جدید ربات در بازه بر اساس createdAt؛ وضعیت مراحل، وضعیت فعلی همین گروه از کاربران است.'},
    totals:all,organic,cohortFunnel:p59Rates(all),
    trend:[...points.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,counts])=>({date,...counts})),
    weekdayHeatmap:heatmap,campaigns,campaignOptions:catalog.map(c=>({code:c.code,name:c.name,status:growthCampaignState(c)})),asOf:new Date().toISOString(),
    note:'نمودار ورود بر اساس تاریخ ثبت کاربر در ربات است. مرحله‌های ePlanet تاریخچه روزانه ندارند و به شکل وضعیت فعلی کوهورت نشان داده می‌شوند. تعداد کلیک خام لینک در دسترس نیست.'};
}
app.get('/admin/growth/analytics',async(request:FastifyRequest,reply:FastifyReply)=>{
  if(!(await adminGuard(request,reply)))return;
  const q=p59Range(request.query);
  if(!q)return reply.code(400).send({error:'invalid_range',message:'بازه معتبر نیست؛ حداکثر ۳۶۶ روز تا امروز.'});
  const data=await p59Data(q);
  if('error'in data)return reply.code(413).send({error:data.error,message:'بازه شامل بیش از ۲۰٬۰۰۰ کاربر است؛ تاریخ را محدود کنید.'});
  reply.header('cache-control','no-store');return data;
});
app.get('/admin/growth/analytics.xlsx',async(request:FastifyRequest,reply:FastifyReply)=>{
  if(!(await adminGuard(request,reply)))return;
  const q=p59Range(request.query);
  if(!q)return reply.code(400).send({error:'invalid_range'});
  const data=await p59Data(q);
  if('error'in data)return reply.code(413).send({error:data.error,message:'بازه را محدود کنید.'});
  const rows:string[][]=[['گزارش تحلیل کمپین‌ها / MATIN FUTURE'],
    ['از',data.range.from,'تا',data.range.to,'دانه‌بندی',data.range.granularity],
    ['نوع گزارش','کوهورت ورودی ربات؛ وضعیت مراحل در زمان خروجی'],
    [],['آمار کلی','تعداد'],
    ...data.cohortFunnel.map(r=>[r.name,String(r.count)]),[],
    ['روند دوره‌ای','ورودی','ثبت‌نام‌شده','افتتاح حساب','شارژ حساب','Copy Trading','عضویت رسمی'],
    ...data.trend.map(r=>[r.date,String(r.arrivals),String(r.registered),String(r.accounts),String(r.deposits),String(r.copies),String(r.participants)]),[],
    ['نام کمپین','کد','وضعیت','ورودی','ثبت‌نام','افتتاح حساب','شارژ','کپی','شرکت‌کننده','نرخ کپی از ورود'],
    ...data.campaigns.map(c=>[c.name,c.code,c.status,String(c.arrivals),String(c.registered),String(c.accounts),String(c.deposits),String(c.copies),String(c.participants),c.copyRate===null?'':String(c.copyRate)+'%']),
    [],['منبع ارگانیک و بدون کمپین',String(data.organic.arrivals)],
    ['یادداشت',data.note]];
  const file=growthXlsx(rows);
  await growthLog(request,'GROWTH_ANALYTICS_EXCEL_EXPORTED',null,{from:q.from,to:q.to,source:q.source||null,total:data.totals.arrivals});
  reply.header('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('content-disposition','attachment; filename="10x-imperial-analytics.xlsx"');
  reply.header('cache-control','no-store');return reply.send(file);
});
// === END TENX_P59_IMPERIAL_ANALYTICS_V1 ===

app.get('/admin/growth/summary',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  const inactive=await growthInactiveIds();
  const cutoff=growthCutoff();
  const today=growthTodayRange();
  const [total,registeredToday,registered,accounts,deposits,copies,participants,recent,manuallyInactive]=await Promise.all([
    prisma.user.count(),prisma.user.count({where:{registeredAt:today}}),
    prisma.user.count({where:{registrationStatus:{in:['REGISTERED','COMPLETE']}}}),
    prisma.eplanetUserWorkflow.count({where:{accountCreated:true}}),
    prisma.eplanetUserWorkflow.count({where:{depositCompleted:true}}),
    prisma.eplanetUserWorkflow.count({where:{copyConnected:true}}),
    prisma.eplanetUserWorkflow.count({where:{challengeParticipant:true}}),
    prisma.user.count({where:{lastActivityAt:{gte:cutoff},...(inactive.length?{id:{notIn:inactive}}:{})}}),
    inactive.length?prisma.user.count({where:{id:{in:inactive}}}):Promise.resolve(0)
  ]);
  const p57BotIdentity=await growthBotIdentity();
  const botUsername=p57BotIdentity.username;
  const campaigns=await growthCampaigns();
  const details=[];
  for(const c of campaigns){
    const where:any={registrationSource:'campaign:'+c.code};
    const [arrivals,registeredCount,accountCount,depositCount,copyCount,participantCount]=await Promise.all([
      prisma.user.count({where}),
      prisma.user.count({where:{...where,registrationStatus:{in:['REGISTERED','COMPLETE']}}}),
      prisma.eplanetUserWorkflow.count({where:{user:where,accountCreated:true}}),
      prisma.eplanetUserWorkflow.count({where:{user:where,depositCompleted:true}}),
      prisma.eplanetUserWorkflow.count({where:{user:where,copyConnected:true}}),
      prisma.eplanetUserWorkflow.count({where:{user:where,challengeParticipant:true}})
    ]);
    const lifecycle=growthCampaignState(c);
    details.push({...c,arrivals,registered:registeredCount,accounts:accountCount,deposits:depositCount,
      copies:copyCount,participants:participantCount,status:lifecycle,active:lifecycle==='ACTIVE',
      link:botUsername&&lifecycle==='ACTIVE'?'https://t.me/'+botUsername+'?start=c_'+c.code:null});
  }
  return {stats:{total,registeredToday,registered,accounts,deposits,copies,participants,
    active:recent,inactive:total-recent,manuallyInactive},
    // Registered -> account -> deposit -> copy -> participant; denominator explicitly displayed.
    funnel:[
      {label:'ثبت‌نام‌شده',count:registered},
      {label:'افتتاح حساب',count:accounts},
      {label:'شارژ حساب',count:deposits},
      {label:'اتصال Copy Trading',count:copies},
      {label:'شرکت‌کننده رسمی',count:participants}
    ].map((x,i,a)=>({...x,conversion:i?((a[i-1]!.count>0)?Math.round(1000*x.count/a[i-1]!.count)/10:null):100})),
    campaigns:details,botUsername,botVerification:p57BotIdentity.verification,asOf:new Date().toISOString(),
    note:'ورودی کمپین = کاربران یکتایی که از لینک /start ربات وارد شده‌اند؛ کلیک خام نیست. وضعیت فعال = فعالیت طی ۳۰ روز گذشته، به‌جز غیرفعال‌شده‌های دستی.'};
});
app.post('/admin/growth/campaigns',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if(!growthCanWrite(request,['MARKETING_MANAGER']))return reply.code(403).send({error:'forbidden'});
  const b=z.object({name:z.string().trim().min(2).max(80),kind:z.enum(growthKinds),
    code:z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/)}).strict().safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_campaign',details:b.error.flatten()});
  const campaigns=await growthCampaigns();
  if(campaigns.some(c=>c.code===b.data.code))return reply.code(409).send({error:'campaign_code_exists'});
  if(campaigns.length>=200)return reply.code(400).send({error:'campaign_limit'});
  campaigns.push({...b.data,active:true,expiresAt:null,archivedAt:null});
  await prisma.systemSetting.upsert({where:{key:growthCampaignKey},create:{key:growthCampaignKey,value:campaigns},update:{value:campaigns}});
  await growthLog(request,'GROWTH_CAMPAIGN_CREATED',null,{code:b.data.code,name:b.data.name});
  return {ok:true};
});
app.patch('/admin/growth/campaigns/:code',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if(!growthCanWrite(request,['MARKETING_MANAGER']))return reply.code(403).send({error:'forbidden'});
  const p=z.object({code:z.string().regex(/^[a-z0-9_-]{3,32}$/)}).safeParse(request.params);
  const b=z.object({active:z.boolean()}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  const all=await growthCampaigns();const item=all.find(x=>x.code===p.data.code);
  if(!item)return reply.code(404).send({error:'not_found'});
  if(b.data.active && (item.archivedAt || (item.expiresAt && Date.parse(item.expiresAt)<=Date.now())))
    return reply.code(409).send({error:'archived_or_expired'});
  item.active=b.data.active;
  await prisma.systemSetting.upsert({where:{key:growthCampaignKey},create:{key:growthCampaignKey,value:all},update:{value:all}});
  await growthLog(request,'GROWTH_CAMPAIGN_STATE',null,{code:item.code,active:item.active});
  return {ok:true};
});
// TENX_P58_CAMPAIGN_LIFECYCLE_V1 — mutates metadata, never deletes campaign history or user attribution.
app.post('/admin/growth/campaigns/:code/lifecycle',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if(!growthCanWrite(request,['MARKETING_MANAGER']))return reply.code(403).send({error:'forbidden'});
  const p=z.object({code:z.string().regex(/^[a-z0-9_-]{3,32}$/)}).safeParse(request.params);
  const b=z.object({action:z.enum(['archive','restore','expire','pause','activate','setExpiry']),
    expiresAt:z.string().datetime({offset:true}).nullable().optional()}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  const all=await growthCampaigns(),item=all.find(c=>c.code===p.data.code);
  if(!item)return reply.code(404).send({error:'campaign_not_found'});
  const before=growthCampaignState(item),now=new Date().toISOString();
  switch(b.data.action){
    case 'archive': if(before==='ARCHIVED')return reply.code(409).send({error:'already_archived'});item.archivedAt=now;item.active=false;break;
    case 'restore': if(before!=='ARCHIVED')return reply.code(409).send({error:'not_archived'});item.archivedAt=null;item.active=false;break;
    case 'expire': if(before==='ARCHIVED')return reply.code(409).send({error:'archived_campaign'});item.expiresAt=now;item.active=false;break;
    case 'pause': if(before==='ARCHIVED')return reply.code(409).send({error:'archived_campaign'});item.active=false;break;
    case 'activate':
      if(item.archivedAt || (item.expiresAt&&Date.parse(item.expiresAt)<=Date.now()))
        return reply.code(409).send({error:'archived_or_expired'});
      item.active=true;break;
    case 'setExpiry':
      if(item.archivedAt)return reply.code(409).send({error:'archived_campaign'});
      if(b.data.expiresAt===undefined)return reply.code(400).send({error:'expiry_required'});
      if(b.data.expiresAt!==null && Date.parse(b.data.expiresAt)<=Date.now())
        return reply.code(400).send({error:'expiry_must_be_future'});
      item.expiresAt=b.data.expiresAt;break;
  }
  await prisma.systemSetting.upsert({where:{key:growthCampaignKey},
    create:{key:growthCampaignKey,value:all},update:{value:all}});
  await growthLog(request,'GROWTH_CAMPAIGN_LIFECYCLE',null,{code:item.code,action:b.data.action,before,after:growthCampaignState(item),expiresAt:item.expiresAt,archivedAt:item.archivedAt});
  return {ok:true,item:{code:item.code,status:growthCampaignState(item),expiresAt:item.expiresAt,archivedAt:item.archivedAt}};
});

app.get('/admin/growth/users',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  const b=z.object({q:z.string().max(100).optional(),source:z.string().regex(/^[a-z0-9_-]{3,32}$/).optional(),
    status:z.string().max(50).optional(),cursor:z.string().max(64).optional(),
    limit:z.coerce.number().int().min(1).max(100).default(50)}).safeParse(request.query);
  if(!b.success)return reply.code(400).send({error:'invalid_query'});
  const inactive=await growthInactiveIds();const where=growthUserWhere(b.data,inactive);
  const [items,total]=await Promise.all([
    prisma.user.findMany({where,select:growthUserSelect,orderBy:{createdAt:'desc'},take:b.data.limit,
      ...(b.data.cursor?{cursor:{id:b.data.cursor},skip:1}:{})}),
    prisma.user.count({where})
  ]);
  return {items:items.map(x=>growthSafeUser(x,inactive)),total,
    nextCursor:items.length===b.data.limit?items[items.length-1]?.id:null};
});
app.get('/admin/growth/users/:id',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  const p=z.object({id:z.string().min(1).max(64)}).safeParse(request.params);
  if(!p.success)return reply.code(400).send({error:'invalid_id'});
  const user=await prisma.user.findUnique({where:{id:p.data.id},select:growthUserSelect});
  if(!user)return reply.code(404).send({error:'not_found'});
  const history=await prisma.registrationStageEvent.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:30,
    select:{stage:true,createdAt:true,detail:true}});
  return {item:growthSafeUser(user,await growthInactiveIds()),history};
});
app.patch('/admin/growth/users/:id/workflow',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if(!growthCanWrite(request,['USER_MANAGER']))return reply.code(403).send({error:'forbidden'});
  const p=z.object({id:z.string().min(1).max(64)}).safeParse(request.params);
  const b=z.object({status:z.enum(growthStatusKeys),accountId:z.string().trim().max(100).nullable().optional(),
    note:z.string().trim().max(500).nullable().optional(),confirmReset:z.boolean().optional()}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  const user=await prisma.user.findUnique({where:{id:p.data.id},include:{eplanetWorkflow:true}});
  if(!user)return reply.code(404).send({error:'not_found'});
  const level=growthStatusKeys.indexOf(b.data.status);
  const existing=user.eplanetWorkflow;
  const oldLevel=existing?.challengeParticipant?4:existing?.copyConnected?3:existing?.depositCompleted?2:existing?.accountCreated?1:0;
  if(level<oldLevel&&!b.data.confirmReset)return reply.code(409).send({error:'confirm_regression_required'});
  const accountId=(b.data.accountId===undefined?existing?.accountId:b.data.accountId)??null;
  if(level>=1&&!accountId)return reply.code(400).send({error:'account_id_required'});
  if(accountId){
    const conflict=await prisma.eplanetUserWorkflow.findFirst({where:{accountId,userId:{not:user.id}},select:{userId:true}});
    if(conflict)return reply.code(409).send({error:'account_id_already_assigned'});
  }
  if(user.registrationStatus==='STARTED'||user.registrationStatus==='PHONE_PENDING'){
    await prisma.user.update({where:{id:user.id},data:{registrationStatus:'REGISTERED',registrationStage:'REGISTERED',registeredAt:user.registeredAt??new Date()}});
  }
  const updated=await prisma.eplanetUserWorkflow.upsert({where:{userId:user.id},
    create:{userId:user.id,accountId,accountCreated:level>=1,depositCompleted:level>=2,
      copyConnected:level>=3,challengeParticipant:level>=4,note:b.data.note??null},
    update:{accountId,accountCreated:level>=1,depositCompleted:level>=2,
      copyConnected:level>=3,challengeParticipant:level>=4,
      ...(b.data.note!==undefined?{note:b.data.note}:{})}});
  await growthLog(request,'GROWTH_WORKFLOW_CHANGED',user.id,{previous:oldLevel,status:b.data.status,accountIdChanged:b.data.accountId!==undefined});
  return {item:updated};
});
app.patch('/admin/growth/users/:id/activity',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if(!growthCanWrite(request,['USER_MANAGER']))return reply.code(403).send({error:'forbidden'});
  const p=z.object({id:z.string().min(1).max(64)}).safeParse(request.params);
  const b=z.object({inactive:z.boolean()}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  const exists=await prisma.user.findUnique({where:{id:p.data.id},select:{id:true}});
  if(!exists)return reply.code(404).send({error:'not_found'});
  const key=growthInactivePrefix+p.data.id;
  await prisma.systemSetting.upsert({where:{key},create:{key,value:{inactive:b.data.inactive}},update:{value:{inactive:b.data.inactive}}});
  await growthLog(request,'GROWTH_ACTIVITY_OVERRIDE',p.data.id,{inactive:b.data.inactive});
  return {ok:true};
});
async function growthSendTelegram(chatId:string,body:string){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)throw new Error('telegram_bot_not_configured');
  const res=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text:body,disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)
  });
  const obj=await res.json() as any;
  if(!res.ok||!obj?.ok)throw new Error('telegram_send_failed_'+String(obj?.error_code||res.status));
  return obj.result?.message_id||null;
}
app.post('/admin/growth/messages/direct',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if(!growthCanWrite(request,['USER_MANAGER','MARKETING_MANAGER']))return reply.code(403).send({error:'forbidden'});
  const b=z.object({userId:z.string().min(1).max(64),text:z.string().trim().min(1).max(3500)}).strict().safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_request'});
  const u=await prisma.user.findUnique({where:{id:b.data.userId},include:{telegramAccount:true}});
  if(!u)return reply.code(404).send({error:'user_not_found'});
  if(!u.telegramAccount)return reply.code(409).send({error:'user_no_telegram_chat'});
  try{
    const messageId=await growthSendTelegram(u.telegramAccount.chatId,b.data.text);
    await prisma.notification.create({data:{userId:u.id,channel:'TELEGRAM',title:'پیام مدیریت 10X',body:b.data.text,status:'SENT',sentAt:new Date()}});
    await growthLog(request,'GROWTH_DIRECT_MESSAGE',u.id,{telegramMessageId:messageId});
    return {ok:true};
  }catch(e){return reply.code(502).send({error:(e as Error).message});}
});
app.post('/admin/growth/messages/bulk',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if(!growthCanWrite(request,['MARKETING_MANAGER']))return reply.code(403).send({error:'forbidden'});
  const b=z.object({text:z.string().trim().min(1).max(3500),status:z.string().max(50).optional(),
    source:z.string().regex(/^[a-z0-9_-]{3,32}$/).optional(),purpose:z.literal('SERVICE'),confirmed:z.literal(true),limit:z.number().int().min(1).max(100).default(30)}).strict().safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_request'});
  const where=growthUserWhere(b.data,await growthInactiveIds());
  const recipients=await prisma.user.findMany({where,select:{id:true,telegramAccount:{select:{chatId:true}}},
    orderBy:{createdAt:'desc'},take:b.data.limit});
  let sent=0,failed=0,skipped=0;
  for(const u of recipients){
    if(!u.telegramAccount?.chatId){skipped++;continue;}
    try{
      await growthSendTelegram(u.telegramAccount.chatId,b.data.text);
      await prisma.notification.create({data:{userId:u.id,channel:'TELEGRAM',title:'پیام گروهی مدیریت 10X',body:b.data.text,status:'SENT',sentAt:new Date()}});
      sent++;
    }catch{failed++;}
    // Throttle broadcasts to protect the bot against Telegram rate limits.
    await new Promise(resolve=>setTimeout(resolve,160));
  }
  await growthLog(request,'GROWTH_BULK_MESSAGE',null,{sent,failed,skipped,limit:b.data.limit,status:b.data.status||null,source:b.data.source||null});
  return {sent,failed,skipped,processed:recipients.length};
});
// Generate a real .xlsx file using ZIP stored entries, without adding npm dependencies.
function growthXlsx(rows:string[][]){
  const xml=(s:string)=>String(s??'').replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const letters=(n:number)=>{let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  const sheet='<?xml version="1.0" encoding="utf-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
    rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,i)=>'<c r="'+letters(i)+(ri+1)+'" t="inlineStr"><is><t>'+xml(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
  const entries:[string,string][]=[
    ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<?xml version="1.0" encoding="utf-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Users" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml',sheet]
  ];
  const crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xEDB88320^(n>>>1):n>>>1;return n>>>0;});
  const crc=(d:Buffer)=>{let c=0xFFFFFFFF;for(const v of d)c=crcTable[(c^v)&255]!^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
  for(const [name,payload] of entries){
    const nameBuf=Buffer.from(name),body=Buffer.from(payload,'utf8'),checksum=crc(body);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt32LE(checksum,14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(body.length,22);h.writeUInt16LE(nameBuf.length,26);
    local.push(h,nameBuf,body);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(checksum,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(nameBuf.length,28);c.writeUInt32LE(offset,42);
    central.push(c,nameBuf);offset+=h.length+nameBuf.length+body.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,cd,end]);
}
app.get('/admin/growth/export.xlsx',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  const b=z.object({q:z.string().max(100).optional(),status:z.string().max(50).optional(),source:z.string().regex(/^[a-z0-9_-]{3,32}$/).optional()}).safeParse(request.query);
  if(!b.success)return reply.code(400).send({error:'invalid_query'});
  const inactive=await growthInactiveIds(),where=growthUserWhere(b.data,inactive);
  const count=await prisma.user.count({where});
  if(count>20000)return reply.code(413).send({error:'export_too_large',message:'خروجی بیش از ۲۰٬۰۰۰ رکورد است؛ لطفاً فیلتر کنید.'});
  const people=await prisma.user.findMany({where,select:growthUserSelect,orderBy:{createdAt:'desc'},take:20000});
  const rows=[['User ID','Telegram ID','Username','First Name','Last Name','Phone','Registration Status','Registration Stage','Source','Registered At','Last Activity','Account ID','Account Created','Deposit Completed','Copy Connected','Challenge Participant','Inactive']];
  for(const u of people){const w=u.eplanetWorkflow;rows.push([
    u.id,u.telegramId||'',u.username||'',u.firstName||'',u.lastName||'',u.phone||'',
    u.registrationStatus,u.registrationStage,u.registrationSource||'',u.registeredAt?.toISOString()||'',
    u.lastActivityAt.toISOString(),w?.accountId||'',String(Boolean(w?.accountCreated)),String(Boolean(w?.depositCompleted)),
    String(Boolean(w?.copyConnected)),String(Boolean(w?.challengeParticipant)),String(growthSafeUser(u,inactive).isInactive)
  ]);}
  const file=growthXlsx(rows);
  await growthLog(request,'GROWTH_EXCEL_EXPORTED',null,{count:people.length,filtered:Boolean(b.data.q||b.data.status||b.data.source)});
  reply.header('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('content-disposition','attachment; filename="10x-growth-users.xlsx"');
  reply.header('cache-control','no-store');
  return reply.send(file);
});
// === TENX_P50_GROWTH_TRACKING_V1_END ===


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



// Dynamic Mini App bottom navigation.
const bottomNavDefaults = {
  items: [
    { id: 'home', label: 'خانه', href: '/miniapp', icon: 'home', enabled: true, sort: 10 },
    { id: 'academy', label: 'آکادمی', href: '/academy', icon: 'academy', enabled: true, sort: 20 },
    { id: 'support', label: 'پشتیبانی', href: '/support', icon: 'support', enabled: true, sort: 30 }
  ]
};

const bottomNavSchema = z.object({
  items: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    label: z.string().trim().min(1).max(24),
    href: z.string().trim().min(2).max(120)
      .refine(v => /^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(v) && !v.includes('..'), 'invalid_internal_path'),
    icon: z.enum(['home','academy','support','chart','trophy','user','book','star']),
    enabled: z.boolean(),
    sort: z.number().int().min(0).max(10000)
  })).min(1).max(8)
}).strict();

function normalizeBottomNav(value: unknown) {
  const parsed = bottomNavSchema.safeParse(value);
  if (!parsed.success) return bottomNavDefaults;
  const ids = parsed.data.items.map(item => item.id);
  if (new Set(ids).size !== ids.length) return bottomNavDefaults;
  return {
    items: parsed.data.items
      .slice()
      .sort((a, b) => a.sort - b.sort)
  };
}

app.get('/public/bottom-nav', async (_request, reply) => {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'BOTTOM_NAV_V1' },
    select: { value: true }
  });
  const config = normalizeBottomNav(row?.value ?? bottomNavDefaults);
  return reply.send(config);
});

app.get('/admin/bottom-nav', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'BOTTOM_NAV_V1' },
    select: { value: true }
  });
  return { ...normalizeBottomNav(row?.value ?? bottomNavDefaults) };
});

app.put('/admin/bottom-nav', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const parsed = bottomNavSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'invalid_bottom_nav',
      details: parsed.error.flatten()
    });
  }

  const ids = parsed.data.items.map(item => item.id);
  if (new Set(ids).size !== ids.length) {
    return reply.code(400).send({ error: 'duplicate_item_id' });
  }

  const config = {
    items: parsed.data.items.slice().sort((a, b) => a.sort - b.sort)
  };

  await prisma.systemSetting.upsert({
    where: { key: 'BOTTOM_NAV_V1' },
    create: { key: 'BOTTOM_NAV_V1', value: config },
    update: { value: config }
  });

  await prisma.auditLog.create({
    data: {
      adminUserId: adminIdOf(request),
      action: 'BOTTOM_NAV_UPDATED',
      entityType: 'SystemSetting',
      metadata: {
        itemCount: config.items.length,
        enabledCount: config.items.filter(item => item.enabled).length
      }
    }
  });

  return { ok: true, ...config };
});


// MMU_R6_APPEARANCE_API_BEGIN — independent of BOTTOM_NAV_V1 item configuration.
const mmuR6AppearanceKey = 'BOTTOM_NAV_APPEARANCE_V1';
const mmuR6AppearanceDefaults = {
  preset: 'light' as const,
  tintOpacity: 14,
  activeOpacity: 16,
  blur: 25,
  glow: 18,
  rim: 82,
  autoHide: true,
  scrollThreshold: 14,
  idleRevealMs: 950,
  animationMs: 310
};
const mmuR6AppearanceSchema = z.object({
  preset: z.enum(['light', 'reference', 'crystal', 'minimal', 'solid']),
  tintOpacity: z.number().int().min(0).max(90),
  activeOpacity: z.number().int().min(0).max(90),
  blur: z.number().int().min(0).max(55),
  glow: z.number().int().min(0).max(100),
  rim: z.number().int().min(0).max(100),
  autoHide: z.boolean(),
  scrollThreshold: z.number().int().min(6).max(90),
  idleRevealMs: z.number().int().min(350).max(3000),
  animationMs: z.number().int().min(150).max(700)
}).strict();
function mmuR6NormalizeAppearance(value: unknown) {
  const parsed = mmuR6AppearanceSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...mmuR6AppearanceDefaults };
}
app.get('/public/bottom-nav-appearance', async (_request, reply) => {
  const row = await prisma.systemSetting.findUnique({
    where: { key: mmuR6AppearanceKey }, select: { value: true }
  });
  reply.header('Cache-Control', 'no-store');
  return { version: 1, ...mmuR6NormalizeAppearance(row?.value) };
});
app.get('/admin/bottom-nav-appearance', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const row = await prisma.systemSetting.findUnique({
    where: { key: mmuR6AppearanceKey }, select: { value: true }
  });
  reply.header('Cache-Control', 'no-store');
  return { version: 1, ...mmuR6NormalizeAppearance(row?.value) };
});
app.put('/admin/bottom-nav-appearance', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const parsed = mmuR6AppearanceSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({
    error: 'invalid_bottom_nav_appearance', details: parsed.error.flatten()
  });
  const next = parsed.data;
  await prisma.$transaction(async tx => {
    await tx.systemSetting.upsert({
      where: { key: mmuR6AppearanceKey },
      create: { key: mmuR6AppearanceKey, value: next },
      update: { value: next }
    });
    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'BOTTOM_NAV_APPEARANCE_UPDATED',
        entityType: 'SystemSetting',
        metadata: { preset: next.preset, autoHide: next.autoHide,
                    tintOpacity: next.tintOpacity, animationMs: next.animationMs }
      }
    });
  });
  return { ok: true, version: 1, ...next };
});
// MMU_R6_APPEARANCE_API_END

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
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اتوماسیون 10X</title><style>body{font:15px Tahoma,Arial;background:#0b1020;color:#edf2ff;margin:0;padding:20px}main{max-width:1000px;margin:auto}.card{background:#151d31;border:1px solid #2b3650;border-radius:14px;padding:18px;margin:14px 0}input,textarea,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #394766;margin:4px}input,textarea{background:#0d1426;color:#fff;max-width:100%;width:320px}button{background:#e5b94b;color:#111;font-weight:bold;cursor:pointer}table{width:100%;border-collapse:collapse}td,th{text-align:right;border-bottom:1px solid #2b3650;padding:9px;font-size:13px}.wrap{overflow:auto}.muted{color:#aab6cc}

/* TENX_P54_EXECUTIVE_UI_V1 -- Shared administrative visual language */
@font-face{font-family:DoranFaNum;src:url('/miniapp/fonts/doran/DoranFaNum-Regular.woff2') format('woff2');font-display:swap;font-style:normal;font-weight:400 900}
:root{color-scheme:dark;--p54-deep:#07120d;--p54-card:#13281c;--p54-jade:#51d59a;--p54-copper:#d2a977;--p54-line:#315842}
html{color-scheme:dark;scrollbar-color:#37644b #06140d}
body{
 background:radial-gradient(ellipse 75% 50% at 100% 0%,rgba(36,118,77,.23),transparent 70%),
 radial-gradient(ellipse 60% 48% at 0% 100%,rgba(149,95,52,.14),transparent 73%),
 linear-gradient(150deg,#06110c,#0b1b12 64%,#07140e)!important;
 color:#edf8f0!important;font:14px/1.85 "DoranFaNum","Doran",Vazirmatn,Tahoma,Arial,sans-serif!important;
 min-height:100vh;overflow-x:hidden;
}
main{position:relative;max-width:1240px;padding:clamp(15px,2.3vw,34px)!important}
main>h1{
 position:relative;overflow:hidden;color:#f3fff4!important;
 font-size:clamp(22px,3vw,32px)!important;line-height:1.6;
 padding:22px 24px 27px;margin:7px 0 18px!important;
 border:1px solid rgba(211,167,103,.4);border-radius:22px;
 background:linear-gradient(113deg,#173824,#0d2519 70%,#262a1c);
 box-shadow:0 18px 45px #0005;
}
main>h1::after{
 content:'MATIN FUTURE  /  EXECUTIVE CONTROL';display:block;margin-top:5px;
 color:#d3ae7d;font:600 10px/1.4 system-ui,sans-serif;letter-spacing:1.4px;
 direction:ltr;text-align:right;
}
.card,section.card{
 background:linear-gradient(151deg,rgba(20,44,30,.99),rgba(11,28,19,.99))!important;
 border:1px solid rgba(122,181,138,.28)!important;border-radius:19px!important;
 box-shadow:0 15px 39px #0005,inset 0 1px 0 rgba(255,255,255,.04)!important;
 padding:clamp(16px,2vw,23px)!important;margin:14px 0!important;
}
.card h2,.card h3{color:#efdfbf;font-weight:800;border-bottom:1px solid rgba(196,158,107,.28);padding-bottom:10px}
p,.muted,.mut{color:#a5c1ae!important}
label{color:#cde6d4}
input:not([type=checkbox]):not([type=radio]),textarea,select{
 background:#0a1d13!important;border:1px solid #3a684f!important;
 color:#f2fff6!important;border-radius:12px!important;min-height:44px!important;
 padding:10px 13px!important;box-shadow:inset 0 2px 8px #0003;
}
input::placeholder,textarea::placeholder{color:#8fa996;opacity:1}
input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{
 outline:2px solid #d9b27b!important;outline-offset:2px!important;
}
button{
 background:linear-gradient(135deg,#248156,#155b3e)!important;
 border:1px solid rgba(103,222,157,.51)!important;
 border-radius:12px!important;padding:10px 16px!important;min-height:44px;
 font-weight:750!important;color:#f8fff9!important;cursor:pointer;
 box-shadow:0 6px 17px #0005,inset 0 1px 0 rgba(255,255,255,.12)!important;
 transition:transform .18s,filter .18s;
}
button:not(:disabled):hover{filter:brightness(1.12);transform:translateY(-1px)}
button.secondary,button.sec{background:#1d3327!important;border-color:#456c50!important;color:#e4f3e8!important}
button:disabled{opacity:.5;cursor:not-allowed}
.row{gap:11px!important}
.wrap,.table,.tablewrap{overflow-x:auto;max-width:100%;border:1px solid #31543d;border-radius:15px}
table{border-collapse:separate;border-spacing:0;width:100%}
th{background:linear-gradient(90deg,#193b2a,#123022)!important;color:#e2be87!important;font-weight:700}
th,td{padding:13px!important;border-bottom:1px solid #31503b!important}
tbody tr:hover{background:rgba(42,112,73,.23)}
.ok,.status{color:#67e8a4!important}.bad,.error{color:#ff969b!important}
#stats .stat{border:1px solid rgba(105,170,122,.35);border-radius:15px;background:#173625;padding:15px;box-shadow:inset 0 1px 0 #fff1}
.num{color:#e6c695;font-size:30px!important}
summary{cursor:pointer;color:#ddc199}
@media(max-width:720px){
 body{padding:0!important}main{padding:14px!important}
 main>h1{padding:16px 17px 22px!important;border-radius:16px}
 .card{border-radius:15px!important;padding:14px!important}
 input:not([type=checkbox]):not([type=radio]),textarea,select{max-width:100%!important;min-width:0!important}
 .row{align-items:stretch;gap:8px!important}
 .row>*{max-width:100%}
 th,td{padding:10px!important}
}
@media(prefers-reduced-motion:reduce){button{transition:none!important;transform:none!important}}
/* END TENX_P54_EXECUTIVE_UI_V1 */



/* TENX_P55_IMPERIAL_RESERVE_V1 -- legacy and team admin shared theme */
@font-face{font-family:DoranFaNum;src:url('/miniapp/fonts/doran/DoranFaNum-Regular.woff2') format('woff2');font-display:swap;font-style:normal;font-weight:400 900}
:root{color-scheme:dark;--ir-bg:#070f0c;--ir-card:#12261b;--ir-copper:#bf9678;--ir-ivory:#f0eadd;--ir-line:#3b4c3f}
html{color-scheme:dark;scrollbar-color:#425a47 #08130c}
body{
 background:radial-gradient(ellipse at 100% 0%,rgba(43,93,63,.19),transparent 65%),
 linear-gradient(155deg,#07110d,#0b1b13 60%,#08140e)!important;
 color:var(--ir-ivory)!important;
 font:14px/1.85 "DoranFaNum","Doran",Vazirmatn,Tahoma,Arial,sans-serif!important;
 min-height:100vh;overflow-x:hidden;
}
main{max-width:1240px;padding:clamp(15px,2.3vw,32px)!important}
main>h1{
 position:relative;padding:25px 25px 28px;margin:5px 0 18px!important;
 background:linear-gradient(125deg,#1a3426,#12241b)!important;
 border:1px solid rgba(194,151,116,.46)!important;
 border-radius:18px!important;color:#f0e8d9!important;
 box-shadow:0 17px 44px #0006!important;
 font-size:clamp(22px,2.7vw,31px)!important;
}
main>h1::after{
 content:'MATIN FUTURE / IMPERIAL RESERVE';display:block;margin-top:9px;
 color:#bf9678;font:600 10px/1.5 system-ui,sans-serif;letter-spacing:2px;
 direction:ltr;text-align:right;
}
.card,section.card{
 background:linear-gradient(152deg,#152d21,#0e2017)!important;
 border:1px solid rgba(180,152,116,.27)!important;
 border-radius:17px!important;
 box-shadow:0 13px 34px #0004,inset 0 1px rgba(252,235,197,.035)!important;
 padding:clamp(16px,2vw,24px)!important;margin:15px 0!important;
}
.card h2,.card h3{
 color:#ead3b7!important;border-bottom:1px solid rgba(194,154,118,.25)!important;
 padding-bottom:12px;font-weight:800!important;
}
p,.muted,.mut{color:#adbead!important}
label{color:#d4dcca!important}
input:not([type=checkbox]):not([type=radio]),select,textarea{
 background:#0a1b12!important;color:#f7f1e6!important;
 border:1px solid #415747!important;border-radius:11px!important;
 min-height:44px!important;padding:10px 13px!important;
 box-shadow:inset 0 1px 5px #0003!important;
}
input::placeholder,textarea::placeholder{color:#8fa293!important;opacity:1}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{
 outline:2px solid #c59b78!important;outline-offset:2px!important;
}
button{
 background:linear-gradient(120deg,#2c6048,#214635)!important;
 color:#f9f4eb!important;border:1px solid rgba(166,173,133,.52)!important;
 border-radius:11px!important;padding:10px 16px!important;
 min-height:44px!important;font-weight:750!important;
 box-shadow:inset 0 1px rgba(255,255,255,.07),0 5px 16px #0003!important;
 transition:filter .18s,transform .18s;
}
button.secondary,button.sec{background:#1b3426!important;border-color:#796b58!important;color:#e1e4d7!important}
button:disabled{opacity:.5;cursor:not-allowed}
.row{gap:11px!important}
.wrap,.table,.tablewrap{max-width:100%;overflow-x:auto;border:1px solid #3d5441!important;border-radius:14px!important}
table{border-collapse:separate;border-spacing:0;width:100%}
th{
 background:#1b3427!important;color:#e3bd9b!important;
 border-bottom:1px solid rgba(193,154,111,.43)!important;font-weight:750!important;
}
th,td{padding:13px!important;border-bottom:1px solid rgba(161,178,142,.17)!important}
tbody tr:hover{background:rgba(53,91,66,.28)!important}
.ok,.status{color:#a4d4b4!important}.bad,.error{color:#e1a09a!important}
#stats .stat{background:#1b3527!important;border:1px solid #52644c!important;border-radius:13px!important;padding:17px!important}
.num{color:#e7d0b3!important;font-size:31px!important}
summary{color:#d9b99a!important;cursor:pointer}
@media(max-width:720px){
 body{padding:0!important}main{padding:14px!important}
 main>h1{padding:18px!important;border-radius:15px!important}
 .card{border-radius:14px!important;padding:15px!important}
 input:not([type=checkbox]):not([type=radio]),select,textarea{min-width:0!important;max-width:100%!important}
 .row{align-items:stretch;gap:8px!important}
 .row>*{max-width:100%}
 th,td{padding:10px!important}
}
@media(prefers-reduced-motion:reduce){button{transition:none!important;transform:none!important}}
/* END TENX_P55_IMPERIAL_RESERVE_V1 */

</style></head><body><main><h1>اتوماسیون 10X</h1><p class="muted">یادآورهای ثبت‌نام، پیام‌های تلگرام و پیگیری پشتیبانی. توکن در حافظه صفحه نگهداری می‌شود.</p><section class="card"><input id="token" type="password" placeholder="ADMIN_API_TOKEN (حداقل ۳۲ کاراکتر)" autocomplete="off"><button id="connect">اتصال و بارگذاری</button><p id="msg" class="muted">ابتدا توکن مدیر را وارد کن.</p></section><section class="card"><h2>زمان‌بندی یادآور ثبت‌نام</h2><form id="follow"><input id="uid" placeholder="شناسه داخلی کاربر (User ID)" required><input id="due" type="datetime-local" required><button>ثبت یادآور</button></form></section><section class="card"><h2>ارسال پیام تلگرام</h2><form id="notify"><input id="nuid" placeholder="شناسه داخلی کاربر (User ID)" required><input id="title" placeholder="عنوان پیام" required maxlength="120"><textarea id="body" placeholder="متن پیام" required maxlength="3500"></textarea><button>قرار دادن در صف ارسال</button></form></section><section class="card"><h2>آخرین یادآورها</h2><div class="wrap"><table><thead><tr><th>کاربر</th><th>زمان</th><th>وضعیت</th><th>تلاش</th><th>خطا</th></tr></thead><tbody id="jobs"><tr><td colspan="5">هنوز بارگذاری نشده</td></tr></tbody></table></div></section><section class="card"><h2>آخرین پیام‌ها</h2><div class="wrap"><table><thead><tr><th>کاربر</th><th>عنوان</th><th>وضعیت</th><th>ایجاد</th></tr></thead><tbody id="notes"><tr><td colspan="4">هنوز بارگذاری نشده</td></tr></tbody></table></div></section><section class="card"><h2>درخواست‌های پشتیبانی</h2><form id="reply"><input id="tid" placeholder="شناسه تیکت" required><textarea id="replybody" placeholder="پاسخ مدیر" required maxlength="3500"></textarea><button>ثبت پاسخ و ارسال به تلگرام</button></form><div class="wrap"><table><thead><tr><th>تیکت</th><th>کاربر</th><th>موضوع</th><th>وضعیت</th><th>آخرین پیام</th></tr></thead><tbody id="tickets"><tr><td colspan="5">هنوز بارگذاری نشده</td></tr></tbody></table></div></section></main><script>let token='';const $=id=>document.getElementById(id);try{const s=sessionStorage.getItem('tenx_admin_token');if(s)$('token').value=s}catch(e){}function message(t){$('msg').textContent=t}async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{'content-type':'application/json',authorization:'Bearer '+token,...opts.headers}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'request_failed');return d}function row(body,values){const tr=document.createElement('tr');values.forEach(v=>{const td=document.createElement('td');td.textContent=v??'—';tr.append(td)});body.append(tr)}async function load(){const [j,n,t]=await Promise.all([api('/admin/followups'),api('/admin/notifications'),api('/admin/tickets')]);$('jobs').replaceChildren();j.items.forEach(x=>row($('jobs'),[x.userId,new Date(x.dueAt).toLocaleString('fa-IR'),x.status,x.attempts,x.lastError]));if(!j.items.length)row($('jobs'),['—','—','موردی نیست','—','—']);$('notes').replaceChildren();n.items.forEach(x=>row($('notes'),[x.userId,x.title,x.status,new Date(x.createdAt).toLocaleString('fa-IR')]));if(!n.items.length)row($('notes'),['—','—','موردی نیست','—']);$('tickets').replaceChildren();t.items.forEach(x=>row($('tickets'),[x.id,x.user.username||x.user.telegramId||x.user.id,x.subject,x.status,x.messages.length?x.messages[x.messages.length-1].body:'—']));if(!t.items.length)row($('tickets'),['—','—','موردی نیست','—','—']);message('اتصال برقرار شد.')}$('connect').addEventListener('click',async()=>{token=$('token').value;try{await load()}catch(e){message('خطا: '+e.message)}});$('follow').addEventListener('submit',async e=>{e.preventDefault();try{await api('/admin/followups',{method:'POST',body:JSON.stringify({userId:$('uid').value.trim(),dueAt:new Date($('due').value).toISOString()})});await load();message('یادآور ثبت شد.')}catch(e){message('خطا: '+e.message)}});$('notify').addEventListener('submit',async e=>{e.preventDefault();try{await api('/admin/notifications',{method:'POST',body:JSON.stringify({userId:$('nuid').value.trim(),title:$('title').value.trim(),body:$('body').value.trim()})});await load();message('پیام در صف ارسال قرار گرفت.')}catch(e){message('خطا: '+e.message)}});$('reply').addEventListener('submit',async e=>{e.preventDefault();try{await api('/admin/tickets/'+encodeURIComponent($('tid').value.trim())+'/reply',{method:'POST',body:JSON.stringify({body:$('replybody').value.trim()})});$('replybody').value='';await load();message('پاسخ ثبت شد و در صورت وجود حساب تلگرام در صف ارسال قرار گرفت.')}catch(e){message('خطا: '+e.message)}});</script></body></html>`;
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
  if (!result.ok) {
    request.log.warn({ reason: result.reason }, 'Telegram initData validation failed');
    return reply.code(401).send({ error: 'invalid_telegram_init_data', reason: result.reason });
  }
  const telegramId = String(result.user.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true, firstName: true, lastName: true, username: true, phone: true, registeredAt: true, createdAt: true, registrationStatus: true, registrationStage: true, tradingLevel: true, profileCompletedAt: true } });
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


// Midnight Emerald P01: authenticated Mini App profile.

// P85R3_PROFILE_LIVE
app.post('/miniapp/profile/p85', async (request, reply) => {
  reply.header('Cache-Control', 'no-store');

  const parsed = z.object({
    initData: z.string().min(1).max(10000)
  }).safeParse(request.body);

  if (!parsed.success)
    return reply.code(400).send({error:'invalid_request'});

  const who = await miniUser(parsed.data.initData, false);
  if ('code' in who)
    return reply.code(who.code).send({error:who.error});

  const user = await prisma.user.findUnique({
    where:{id:who.id},
    select:{
      telegramId:true,
      firstName:true,
      lastName:true,
      username:true,
      createdAt:true,
      registeredAt:true,
      registrationStatus:true,
      registrationStage:true,
      eplanetWorkflow:{
        select:{
          accountCreated:true,
          depositCompleted:true,
          copyConnected:true,
          challengeParticipant:true
        }
      }
    }
  });

  if (!user)
    return reply.code(404).send({error:'user_not_found'});

  const start = user.registeredAt ?? user.createdAt;
  const days = Math.max(
    1,
    Math.floor((Date.now()-start.getTime())/86400000)+1
  );

  const workflow = user.eplanetWorkflow;
  const plan = workflow?.challengeParticipant
    ? 'شرکت‌کننده چالش 10X'
    : workflow?.copyConnected
    ? 'متصل به کپی‌ترید'
    : workflow?.depositCompleted
    ? 'حساب شارژ شده'
    : workflow?.accountCreated
    ? 'حساب ePlanet افتتاح شده'
    : '';

  let photoUrl = '';
  const telegramApiRoot = (process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org').replace(new RegExp('/+$'), '');

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token && user.telegramId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);

      try {
        const response = await fetch(
          telegramApiRoot + '/bot' + token +
          '/getUserProfilePhotos?user_id=' +
          encodeURIComponent(user.telegramId) + '&limit=1',
          {signal:controller.signal}
        );

        if (response.ok) {
          const photos = await response.json() as any;
          const sizes = photos?.result?.photos?.[0];

          if (photos.ok && Array.isArray(sizes) && sizes.length) {
            const candidate = [...sizes].reverse().find(
              (s:any) => Number(s.file_size||0) <= 180000
            ) ?? sizes[0];

            const fileResponse = await fetch(
              telegramApiRoot + '/bot' + token +
              '/getFile?file_id=' +
              encodeURIComponent(candidate.file_id),
              {signal:controller.signal}
            );

            if (fileResponse.ok) {
              const file = await fileResponse.json() as any;
              const filePath = file?.result?.file_path;

              if (file.ok &&
                  typeof filePath === 'string' &&
                  /^photos\/[A-Za-z0-9_./-]+\.jpg$/.test(filePath)) {
                const imageResponse = await fetch(
                  telegramApiRoot + '/file/bot' +
                  token + '/' + filePath,
                  {signal:controller.signal}
                );

                if (imageResponse.ok) {
                  const length = Number(
                    imageResponse.headers.get('content-length')||0
                  );

                  if (length <= 250000) {
                    const reader = imageResponse.body?.getReader();
                    const chunks: Uint8Array[] = [];
                    let total = 0;

                    if (!reader) throw Error('no_image_body');

                    while (true) {
                      const part = await reader.read();
                      if (part.done) break;
                      total += part.value.byteLength;
                      if (total > 250000) {
                        await reader.cancel();
                        throw Error('image_too_large');
                      }
                      chunks.push(part.value);
                    }

                    const bytes = Buffer.concat(
                      chunks.map(c => Buffer.from(c))
                    );

                    if (bytes.length <= 250000 &&
                        bytes[0] === 0xff &&
                        bytes[1] === 0xd8) {
                      photoUrl = 'data:image/jpeg;base64,' +
                        bytes.toString('base64');
                    }
                  }
                }
              }
            }
          }
        }
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (_) {}

  return {
    ok:true,
    displayName:[user.firstName,user.lastName]
      .filter(Boolean).join(' ') || 'کاربر MMTrade',
    username:user.username||'',
    photoUrl,
    activeDays:days,
    daysMeaning:'membership',
    active:['REGISTERED','COMPLETE'].includes(
      user.registrationStatus
    ),
    verified:workflow?.challengeParticipant===true,
    plan,
    accountStatus:workflow?.challengeParticipant
      ? 'شرکت‌کننده چالش'
      : workflow?.copyConnected
      ? 'کپی‌ترید متصل'
      : workflow?.depositCompleted
      ? 'واریز ثبت‌شده'
      : workflow?.accountCreated
      ? 'حساب افتتاح‌شده'
      : 'حساب معاملاتی تأیید نشده'
  };
});
// END_P85R3_PROFILE_LIVE

app.post('/miniapp/profile/save', async (request, reply) => {
  const parsed = z.object({
    initData: z.string().min(1).max(10000),
    firstName: z.string().trim().min(2).max(80).optional(),
    lastName: z.string().trim().min(2).max(80).optional(),
    tradingLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'PROFESSIONAL'])
  }).strict().safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_profile_data' });
  }

  const who = await miniUser(parsed.data.initData, true);
  if ('code' in who) {
    return reply.code(who.code).send({ error: who.error });
  }

  const current = await prisma.user.findUnique({
    where: { id: who.id },
    select: {
      id: true,
      phone: true,
      registrationStatus: true,
      profileCompletedAt: true
    }
  });

  if (!current ||
      !current.phone ||
      !['REGISTERED', 'COMPLETE'].includes(current.registrationStatus)) {
    return reply.code(403).send({ error: 'phone_registration_required' });
  }

  const firstTime = !current.profileCompletedAt;

  if (firstTime && (!parsed.data.firstName || !parsed.data.lastName)) {
    return reply.code(400).send({ error: 'full_name_required' });
  }

  const data: Prisma.UserUpdateInput = {
    tradingLevel: parsed.data.tradingLevel,
    lastActivityAt: new Date()
  };

  if (firstTime) {
    data.firstName = parsed.data.firstName!;
    data.lastName = parsed.data.lastName!;
    data.profileCompletedAt = new Date();
  }

  const updated = await prisma.user.update({
    where: { id: who.id },
    data,
    select: {
      firstName: true,
      lastName: true,
      tradingLevel: true,
      profileCompletedAt: true
    }
  });

  return { ok: true, user: updated };
});

// Mini App support chat: authenticated ticket listing and replies.
app.post('/support/tickets/list', async (request, reply) => {
  const query = z.object({ initData: z.string().min(1).max(10000) }).safeParse(request.body);
  if (!query.success) return reply.code(400).send({ error: 'invalid_request' });

  const who = await miniUser(query.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });

  const items = await prisma.supportTicket.findMany({
    where: { userId: who.id },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, senderType: true, body: true, createdAt: true }
      }
    }
  });

  return {
    items: items.map(ticket => ({
      ...ticket,
      messages: ticket.messages.reverse()
    }))
  };
});

app.post('/support/tickets/:id/messages', async (request, reply) => {
  const params = z.object({ id: z.string().min(1).max(64) }).safeParse(request.params);
  const body = z.object({
    initData: z.string().min(1).max(10000),
    body: z.string().trim().min(1).max(3500)
  }).safeParse(request.body);

  if (!params.success || !body.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const who = await miniUser(body.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.data.id, userId: who.id },
    select: { id: true, status: true }
  });

  if (!ticket) return reply.code(404).send({ error: 'ticket_not_found' });

  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
    return reply.code(409).send({ error: 'ticket_not_active' });
  }

  const result = await prisma.$transaction(async tx => {
    const message = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'USER',
        body: body.data.body
      },
      select: { id: true, senderType: true, body: true, createdAt: true }
    });

    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'IN_PROGRESS' }
    });

    await tx.auditLog.create({
      data: {
        userId: who.id,
        action: 'SUPPORT_USER_MESSAGE_CREATED',
        entityType: 'SupportTicket',
        entityId: ticket.id
      }
    });

    return message;
  });

  return reply.code(201).send({ item: result });
});

const miniBody = z.object({ initData: z.string().min(1).max(10000), completed: z.boolean().optional() });
const lessonProgressBody = z.object({
  initData: z.string().min(1).max(10000),
  completed: z.boolean().optional(),
  videoProgressPct: z.number().int().min(0).max(100).optional(),
  contentProgressPct: z.number().int().min(0).max(100).optional()
}).refine(
  value => typeof value.completed === 'boolean' ||
    typeof value.videoProgressPct === 'number' ||
    typeof value.contentProgressPct === 'number',
  'progress_required'
);

function lessonCombinedProgress(
  body: string | null | undefined,
  videoUrl: string | null | undefined,
  videoPct: number,
  contentPct: number
) {
  const hasVideo = Boolean(videoUrl && videoUrl.trim());
  const hasContent = Boolean(body && body.trim());
  if (hasVideo && hasContent) return Math.round((videoPct + contentPct) / 2);
  if (hasVideo) return videoPct;
  if (hasContent) return contentPct;
  return 100;
}


// TENX_QUIZ_Q07_R1
const quizQuestionBase = z.object({
  lessonId: z.string().min(1).max(64).nullable().optional(),
  courseId: z.string().min(1).max(64).nullable().optional(),
  prompt: z.string().trim().min(5).max(5000),
  options: z.array(z.string().trim().min(1).max(1000))
    .length(4)
    .refine(a => new Set(a.map(x => x.toLocaleLowerCase())).size === 4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(5000).nullable().optional(),
  isActive: z.boolean().optional()
}).strict();

const quizQuestionCreate = quizQuestionBase.refine(
  x => Boolean(x.lessonId) !== Boolean(x.courseId),
  'exactly_one_target_required'
);

const quizQuestionEdit = quizQuestionBase.omit({
  lessonId: true,
  courseId: true
}).partial();

const quizRandom = <T>(input: T[]): T[] => {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) {
    const j = quizCryptoRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const quizScope = z.object({
  lessonId: z.string().min(1).max(64).optional(),
  courseId: z.string().min(1).max(64).optional()
}).strict().refine(
  x => Boolean(x.lessonId) !== Boolean(x.courseId)
);

async function quizScopeExists(
  lessonId?: string | null,
  courseId?: string | null,
  published = false
) {
  if (lessonId) {
    return Boolean(await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        ...(published ? {
          status: 'PUBLISHED',
          course: { status: 'PUBLISHED' }
        } : {})
      },
      select: { id: true }
    }));
  }
  if (courseId) {
    return Boolean(await prisma.course.findFirst({
      where: {
        id: courseId,
        ...(published ? { status: 'PUBLISHED' } : {})
      },
      select: { id: true }
    }));
  }
  return false;
}

app.get('/admin/academy/questions', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const q = z.object({
    lessonId: z.string().min(1).max(64).optional(),
    courseId: z.string().min(1).max(64).optional()
  }).strict().safeParse(request.query);

  if (!q.success || (q.data.lessonId && q.data.courseId)) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  return {
    items: await prisma.academyQuestion.findMany({
      where: q.data,
      orderBy: { createdAt: 'asc' },
      take: 500
    })
  };
});

app.post('/admin/academy/questions', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const b = quizQuestionCreate.safeParse(request.body);
  if (!b.success) {
    return reply.code(400).send({ error: 'invalid_question' });
  }

  const d = b.data;

  if (!(await quizScopeExists(d.lessonId, d.courseId))) {
    return reply.code(404).send({ error: 'target_not_found' });
  }

  const created = await prisma.academyQuestion.create({
    data: {
      lessonId: d.lessonId ?? null,
      courseId: d.courseId ?? null,
      prompt: d.prompt,
      options: d.options,
      correctIndex: d.correctIndex,
      explanation: d.explanation ?? null,
      isActive: d.isActive ?? false
    }
  });

  await academyAudit(request, 'ACADEMY_QUESTION_CREATED', created.id);
  return reply.code(201).send(created);
});

app.patch('/admin/academy/questions/:id', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const p = academyIdParam.safeParse(request.params);
  const b = quizQuestionEdit.safeParse(request.body);

  if (!p.success || !b.success || !Object.keys(b.data).length) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const old = await prisma.academyQuestion.findUnique({
    where: { id: p.data.id }
  });

  if (!old) return reply.code(404).send({ error: 'not_found' });

  const validation = quizQuestionCreate.safeParse({
    lessonId: old.lessonId,
    courseId: old.courseId,
    prompt: b.data.prompt ?? old.prompt,
    options: b.data.options ?? old.options,
    correctIndex: b.data.correctIndex ?? old.correctIndex,
    explanation: b.data.explanation === undefined
      ? old.explanation : b.data.explanation,
    isActive: b.data.isActive ?? old.isActive
  });

  if (!validation.success) {
    return reply.code(400).send({ error: 'invalid_question' });
  }

  const updated = await prisma.academyQuestion.update({
    where: { id: old.id },
    data: b.data
  });

  await academyAudit(request, 'ACADEMY_QUESTION_UPDATED', updated.id);
  return updated;
});

// TENX_Q13_SEQUENTIAL_GATE
async function q13Gate(userId: string) {
  const courses = await prisma.course.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, lessons: { where: { status: 'PUBLISHED' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } } }
  });
  const attempts = await prisma.academyQuizAttempt.findMany({
    where: { userId, passed: true, submittedAt: { not: null } },
    select: { lessonId: true, courseId: true }
  });
  const passedLessons = new Set(attempts.filter(a => a.lessonId).map(a => a.lessonId as string));
  const passedCourses = new Set(attempts.filter(a => a.courseId).map(a => a.courseId as string));
  const lessonAccess = new Set<string>();
  const courseAccess = new Set<string>();
  const courseQuizAccess = new Set<string>();
  let previousCoursePassed = true;
  for (const course of courses) {
    if (!previousCoursePassed) break;
    courseAccess.add(course.id);
    let previousLessonPassed = true;
    for (const lesson of course.lessons) {
      if (!previousLessonPassed) break;
      lessonAccess.add(lesson.id);
      previousLessonPassed = passedLessons.has(lesson.id);
    }
    if (course.lessons.length && course.lessons.every(l => passedLessons.has(l.id))) {
      courseQuizAccess.add(course.id);
    }
    previousCoursePassed = passedCourses.has(course.id) && courseQuizAccess.has(course.id);
  }
  return { lessonAccess, courseAccess, courseQuizAccess, passedLessons, passedCourses };
}
// END TENX_Q13_SEQUENTIAL_GATE

app.post('/academy/quizzes/start', async (request, reply) => {
  const b = quizScope.safeParse(
    (() => {
      const x = request.body as any;
      if (!x || typeof x !== 'object') return {};
      const { initData, ...scope } = x;
      return scope;
    })()
  );

  const auth = z.object({
    initData: z.string().min(1).max(10000)
  }).passthrough().safeParse(request.body);

  if (!b.success || !auth.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const who = await miniUser(auth.data.initData);
  if ('code' in who) {
    return reply.code(who.code).send({ error: who.error });
  }

  const { lessonId, courseId } = b.data;
  const gate = await q13Gate(who.id);
  if (lessonId && !gate.lessonAccess.has(lessonId)) return reply.code(403).send({ error: 'academy_locked' });
  if (courseId && !gate.courseQuizAccess.has(courseId)) return reply.code(403).send({ error: 'academy_locked' });

  if (!(await quizScopeExists(lessonId, courseId, true))) {
    return reply.code(404).send({ error: 'target_not_found' });
  }

  const count = lessonId ? 3 : 5;
  const minimum = lessonId ? 3 : 5;

  const bank = await prisma.academyQuestion.findMany({
    where: {
      ...(lessonId ? { lessonId } : { courseId }),
      isActive: true
    }
  });

  if (bank.length < minimum) {
    return reply.code(409).send({
      error: 'quiz_bank_incomplete',
      required: minimum,
      available: bank.length
    });
  }

  const recent = await prisma.academyQuizAttempt.count({
    where: {
      userId: who.id,
      ...(lessonId ? { lessonId } : { courseId }),
      startedAt: { gte: new Date(Date.now() - 3600000) }
    }
  });

  if (recent >= 10) {
    return reply.code(429).send({ error: 'attempt_limit' });
  }

  const questions = quizRandom(bank).slice(0, count).map(q => {
    const options = q.options as string[];
    const order = quizRandom([0, 1, 2, 3]);

    return {
      id: q.id,
      prompt: q.prompt,
      options: order.map(i => options[i]),
      correctIndex: order.indexOf(q.correctIndex)
    };
  });

  const attempt = await prisma.academyQuizAttempt.create({
    data: {
      userId: who.id,
      lessonId: lessonId ?? null,
      courseId: courseId ?? null,
      questions
    }
  });

  return {
    attemptId: attempt.id,
    passScore: lessonId ? 3 : 4,
    questions: questions.map(({ id, prompt, options }) => ({
      id, prompt, options
    }))
  };
});

app.post('/academy/quizzes/submit', async (request, reply) => {
  const b = z.object({
    initData: z.string().min(1).max(10000),
    attemptId: z.string().min(1).max(64),
    answers: z.array(z.number().int().min(0).max(3))
      .min(3).max(5)
  }).strict().safeParse(request.body);

  if (!b.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const who = await miniUser(b.data.initData);
  if ('code' in who) {
    return reply.code(who.code).send({ error: who.error });
  }

  const attempt = await prisma.academyQuizAttempt.findFirst({
    where: { id: b.data.attemptId, userId: who.id }
  });

  if (!attempt) return reply.code(404).send({ error: 'not_found' });
  const gate = await q13Gate(who.id);
  if (attempt.lessonId && !gate.lessonAccess.has(attempt.lessonId)) return reply.code(403).send({ error: 'academy_locked' });
  if (attempt.courseId && !gate.courseQuizAccess.has(attempt.courseId)) return reply.code(403).send({ error: 'academy_locked' });
  if (attempt.submittedAt) {
    return reply.code(409).send({ error: 'already_submitted' });
  }

  const questions = attempt.questions as Array<{
    correctIndex: number
  }>;

  const count = attempt.lessonId ? 3 : 5;

  if (
    !Array.isArray(questions) ||
    questions.length !== count ||
    b.data.answers.length !== count
  ) {
    return reply.code(400).send({ error: 'invalid_answers' });
  }

  if (Date.now() - attempt.startedAt.getTime() > 1800000) {
    return reply.code(410).send({ error: 'quiz_expired' });
  }

  const score = questions.reduce(
    (sum, q, i) =>
      sum + Number(q.correctIndex === b.data.answers[i]),
    0
  );

  const passed = score >= (attempt.lessonId ? 3 : 4);

  const updated = await prisma.academyQuizAttempt.updateMany({
    where: {
      id: attempt.id,
      userId: who.id,
      submittedAt: null
    },
    data: {
      answers: b.data.answers,
      score,
      passed,
      submittedAt: new Date()
    }
  });

  if (updated.count !== 1) {
    return reply.code(409).send({ error: 'already_submitted' });
  }

  return {
    attemptId: attempt.id,
    score,
    total: count,
    passed,
    passScore: attempt.lessonId ? 3 : 4
  };
});
// END TENX_QUIZ_Q07_R1

// TENX_Q15_HISTORY_V1 — read-only, authenticated and scoped to current user.
app.post('/academy/quizzes/history', async (request, reply) => {
  const b = z.object({ initData: z.string().min(1).max(10000) }).strict().safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  const attempts = await prisma.academyQuizAttempt.findMany({
    where: { userId: who.id, submittedAt: { not: null } },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    take: 200,
    select: { id: true, lessonId: true, courseId: true, score: true, passed: true, startedAt: true, submittedAt: true,
      lesson: { select: { title: true } }, course: { select: { title: true } } }
  });
  const items = attempts.map(a => ({
    id: a.id, type: a.lessonId ? 'lesson' : 'course',
    title: a.lessonId ? (a.lesson?.title || 'آزمون درس') : (a.course?.title || 'آزمون دوره'),
    score: a.score, total: a.lessonId ? 3 : 5, passScore: a.lessonId ? 3 : 4,
    passed: a.passed, startedAt: a.startedAt, submittedAt: a.submittedAt
  }));
  const passed = items.filter(x => x.passed).length;
  const uniquePassed = new Set(attempts.filter(x => x.passed).map(x => x.lessonId ? 'L:'+x.lessonId : 'C:'+x.courseId)).size;
  return { items, summary: { attempts: items.length, passed, failed: items.length-passed,
    passRate: items.length ? Math.round(100*passed/items.length) : 0,
    uniquePassed, truncated: items.length === 200 } };
});
// END TENX_Q15_HISTORY_V1

app.post('/academy/courses', async (request, reply) => {
  const b = miniBody.safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });

  const courses = await prisma.course.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      lessons: {
        where: { status: 'PUBLISHED' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, title: true, summary: true, body: true, videoUrl: true }
      }
    }
  });

  const gate = await q13Gate(who.id);
  const lessonIds = courses.flatMap(course => course.lessons.map(lesson => lesson.id));
  const progressRows = lessonIds.length
    ? await prisma.lessonProgress.findMany({
        where: { userId: who.id, lessonId: { in: lessonIds } },
        select: { lessonId: true, completedAt: true, progressPct: true }
      })
    : [];
  const progressMap = new Map(progressRows.map(row => [
    row.lessonId,
    {
      done: Boolean(row.completedAt),
      progressPct: row.completedAt ? 100 : Math.max(0, Math.min(100, row.progressPct || 0))
    }
  ]));

  return {
    items: courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      isLocked: !gate.courseAccess.has(course.id),
      quizUnlocked: gate.courseQuizAccess.has(course.id),
      quizPassed: gate.passedCourses.has(course.id),
      lessons: course.lessons.map(lesson => {
        const progress = progressMap.get(lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          summary: lesson.summary,
          isLocked: !gate.lessonAccess.has(lesson.id),
          quizPassed: gate.passedLessons.has(lesson.id),
          done: gate.passedLessons.has(lesson.id),
          progressPct: progress?.progressPct ?? 0
        };
      })
    }))
  };
});

app.post('/academy/lessons/:id', async (request, reply) => {
  const p = academyIdParam.safeParse(request.params);
  const b = miniBody.safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });

  const lesson = await prisma.lesson.findFirst({
    where: { id: p.data.id, status: 'PUBLISHED', course: { status: 'PUBLISHED' } },
    select: { id: true, title: true, summary: true, body: true, videoUrl: true }
  });
  if (!lesson) return reply.code(404).send({ error: 'not_found' });
  if (!(await q13Gate(who.id)).lessonAccess.has(lesson.id)) return reply.code(403).send({ error: 'academy_locked' });

  const pr = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: who.id, lessonId: lesson.id } },
    select: {
      completedAt: true,
      progressPct: true,
      videoProgressPct: true,
      contentProgressPct: true
    }
  });

  return {
    ...lesson,
    done: Boolean(pr?.completedAt),
    progressPct: pr?.completedAt ? 100 : pr?.progressPct ?? 0,
    videoProgressPct: pr?.completedAt ? 100 : pr?.videoProgressPct ?? 0,
    contentProgressPct: pr?.completedAt ? 100 : pr?.contentProgressPct ?? 0
  };
});

app.post('/academy/lessons/:id/progress', async (request, reply) => {
  const p = academyIdParam.safeParse(request.params);
  const b = lessonProgressBody.safeParse(request.body);
  if (!p.success || !b.success) {
    return reply.code(400).send({ error: 'invalid_request', details: b.success ? undefined : b.error.flatten() });
  }

  const who = await miniUser(b.data.initData);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });

  const lesson = await prisma.lesson.findFirst({
    where: { id: p.data.id, status: 'PUBLISHED', course: { status: 'PUBLISHED' } },
    select: { id: true, body: true, videoUrl: true }
  });
  if (!lesson) return reply.code(404).send({ error: 'not_found' });
  if (!(await q13Gate(who.id)).lessonAccess.has(lesson.id)) return reply.code(403).send({ error: 'academy_locked' });

  const key = { userId: who.id, lessonId: lesson.id };
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: key },
    select: {
      completedAt: true,
      videoProgressPct: true,
      contentProgressPct: true
    }
  });

  let videoProgressPct = existing?.videoProgressPct ?? 0;
  let contentProgressPct = existing?.contentProgressPct ?? 0;

  if (typeof b.data.completed === 'boolean') {
    if (b.data.completed) {
      videoProgressPct = 100;
      contentProgressPct = 100;
    } else {
      videoProgressPct = 0;
      contentProgressPct = 0;
    }
  } else {
    if (typeof b.data.videoProgressPct === 'number') {
      videoProgressPct = Math.max(videoProgressPct, b.data.videoProgressPct);
    }
    if (typeof b.data.contentProgressPct === 'number') {
      contentProgressPct = Math.max(contentProgressPct, b.data.contentProgressPct);
    }
  }

  if (!lesson.videoUrl) videoProgressPct = 100;
  if (!lesson.body || !lesson.body.trim()) contentProgressPct = 100;

  const progressPct = lessonCombinedProgress(
    lesson.body,
    lesson.videoUrl,
    videoProgressPct,
    contentProgressPct
  );

  const completedAt = progressPct >= 100
    ? existing?.completedAt ?? new Date()
    : null;

  const saved = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: key },
    create: {
      ...key,
      completedAt,
      progressPct,
      videoProgressPct,
      contentProgressPct
    },
    update: {
      completedAt,
      progressPct,
      videoProgressPct,
      contentProgressPct
    }
  });

  return {
    ok: true,
    done: Boolean(saved.completedAt),
    progressPct: saved.progressPct,
    videoProgressPct: saved.videoProgressPct,
    contentProgressPct: saved.contentProgressPct
  };
});

// MMTRADE_ACADEMY_HOME_V2_API_BEGIN
// Dedicated seven-stage Academy home CMS. Uses the existing SystemSetting,
// adminGuard/SUPER_ADMIN authorization, AuditLog and LessonProgress tables.
const MM10_ACADEMY_HOME_KEY = 'MM10_ACADEMY_HOME_V2';
const MM10_ACADEMY_STAGE_IDS = ['welcome','gold','copy','account','risk','connection','start'] as const;
const mm10AcademySafeUrl = z.string().trim().max(1000).refine((value) =>
  value === '' ||
  (/^\/(?!\/)[a-zA-Z0-9_./?=&%#-]*$/.test(value) && !value.includes('..') && !value.includes('\\')) ||
  /^https:\/\/\S+$/i.test(value), 'invalid_academy_url');
const mm10AcademySectionSchema = z.object({
  heading: z.string().trim().max(120).optional(),
  body: z.string().trim().max(3000).optional(),
  bullets: z.array(z.string().trim().max(250)).max(20).optional()
}).strict();
const mm10AcademyStageSchema = z.object({
  id: z.enum(MM10_ACADEMY_STAGE_IDS),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).optional(),
  icon: mm10AcademySafeUrl,
  enabled: z.boolean(),
  locked: z.boolean(),
  lesson: z.object({
    title: z.string().trim().max(120).optional(),
    intro: z.string().trim().max(4000),
    sections: z.array(mm10AcademySectionSchema).max(12),
    note: z.string().trim().max(1200).optional(),
    imageUrl: mm10AcademySafeUrl.optional(),
    videoUrl: mm10AcademySafeUrl.optional(),
    ctaText: z.string().trim().max(80).optional(),
    ctaUrl: mm10AcademySafeUrl.optional()
  }).strict()
}).strict();
const mm10AcademyConfigSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(240),
  logo: mm10AcademySafeUrl,
  background: mm10AcademySafeUrl,
  footerBackground: mm10AcademySafeUrl,
  cta: z.object({
    enabled: z.boolean(),
    text: z.string().trim().min(1).max(80),
    href: mm10AcademySafeUrl,
    icon: z.string().trim().max(12)
  }).strict(),
  footerText: z.string().trim().max(180),
  riskText: z.string().trim().max(400),
  layout: z.object({
    backgroundScroll: z.boolean().default(false),
    backgroundCoverage: z.number().int().min(50).max(100).default(100)
  }).strict().default({ backgroundScroll: false, backgroundCoverage: 100 }),
  stages: z.array(mm10AcademyStageSchema).length(7)
}).strict().superRefine((value, context) => {
  const ids = value.stages.map(stage => stage.id);
  if (new Set(ids).size !== 7 || !MM10_ACADEMY_STAGE_IDS.every(id => ids.includes(id))) {
    context.addIssue({ code: 'custom', message: 'academy_must_contain_exactly_seven_unique_stage_ids' });
  }
});
function mm10AcademyDefaultConfig(): any {
  const a = '/miniapp/p74/learning/academy-assets/';
  return {
    schemaVersion: 1,
    enabled: true,
    title: 'آکادمی متین فیوچر',
    subtitle: 'مسیر آموزشی ۷ مرحله‌ای برای شروع کپی‌ترید',
    logo: '/miniapp/p74/learning/academy-assets/matin-future-logo.png',
    background: a + 'academy-bg-portrait.webp',
    footerBackground: a + 'academy-footer-mountains.webp',
    cta: { enabled: true, text: 'شروع ثبت‌نام', href: '/profile', icon: '➜' },
    footerText: 'آماده ورود به مرحله بعدی هستید؟',
    riskText: 'معاملات بازارهای مالی با ریسک همراه‌اند؛ سود تضمین‌شده نیست.',
    layout: { backgroundScroll: false, backgroundCoverage: 100 },
    stages: [
      { id: 'welcome', title: 'خوش آمدید', description: 'آشنایی سریع با مسیر پروژه و نحوه شروع', icon: a+'stage-01-rocket.webp', enabled: true, locked: false, lesson: { intro: 'به MATIN FUTURE خوش آمدید. این مسیر برای آشنایی با بازار طلا، سازوکار کپی‌ترید، افتتاح حساب و اتصال حساب معاملاتی طراحی شده است. قبل از شروع، این هفت مرحله را به ترتیب مرور کنید.', sections: [{heading:'در این مسیر چه یاد می‌گیرید؟',body:'از شناخت بازار طلا تا آماده‌سازی حساب و پایش معاملات، قدم‌به‌قدم با فرآیند آشنا می‌شوید.',bullets:['شناخت نماد XAUUSD و ویژگی‌های بازار طلا','درک سازوکار کپی‌ترید و نحوه اجرای معاملات','افتتاح حساب، تعیین ریسک و اتصال به MMTrade','شروع و بررسی عملکرد حساب معاملاتی']},{heading:'چطور از آکادمی استفاده کنید؟',body:'هر مرحله را باز کنید، محتوای آن را بخوانید و پس از یادگیری، مطالعه را تأیید کنید تا پیشرفت شما ثبت شود.'}], note:'این آکادمی محتوای آموزشی است و هیچ سود یا بازدهی را تضمین نمی‌کند.' } },
      { id: 'gold', title: 'بازار طلا', description: 'شناخت XAUUSD و دلیل تمرکز ما روی طلا', icon: a+'stage-02-gold.webp', enabled: true, locked: false, lesson: { intro: 'XAUUSD نماد رایج قیمت هر اونس طلا در برابر دلار آمریکاست. در این نماد، معامله‌گر با پیش‌بینی حرکت قیمت می‌تواند موقعیت خرید یا فروش باز کند.', sections: [{heading:'خرید و فروش یعنی چه؟',body:'در موقعیت BUY انتظار دارید قیمت افزایش پیدا کند؛ در موقعیت SELL انتظار دارید قیمت کاهش پیدا کند. در هر دو حالت، حرکت خلاف پیش‌بینی می‌تواند زیان ایجاد کند.'},{heading:'چه عواملی روی طلا اثر می‌گذارند؟',body:'قدرت دلار، نرخ بهره، داده‌های تورمی و اشتغال، تصمیم‌های بانک‌های مرکزی و رویدادهای ژئوپلیتیکی می‌توانند نوسان طلا را افزایش دهند.'},{heading:'چرا تمرکز این پروژه روی طلاست؟',body:'طلا بازاری شناخته‌شده و پرمعامله است؛ با این حال نقدشوندگی و فرصت معاملاتی به معنی کم‌ریسک بودن آن نیست.'}], note:'هنگام انتشار اخبار مهم، نوسان و لغزش قیمت می‌تواند بیشتر شود. از ریسک معامله آگاه باشید.' } },
      { id: 'copy', title: 'کپی ترید', description: 'درک نحوه کپی شدن معاملات در حساب شما', icon: a+'stage-03-copy.webp', enabled: true, locked: false, lesson: { intro: 'کپی‌ترید به شما اجازه می‌دهد اجرای معاملات یک استراتژی را طبق تنظیمات اتصال، در حساب معاملاتی خود دنبال کنید.', sections: [{heading:'فرآیند چگونه انجام می‌شود؟',body:'با باز یا بسته شدن معامله در حساب مبدأ، دستور متناظر طبق تنظیمات و محدودیت‌های اتصال برای حساب شما ارسال می‌شود.'},{heading:'حساب معاملاتی متعلق به چه کسی است؟',body:'معاملات در حساب معاملاتی خودتان اجرا می‌شوند. موجودی، معاملات باز و سود و زیان را از پنل بروکر بررسی می‌کنید.'},{heading:'چه چیزی را باید کنترل کنید؟',body:'میزان سرمایه درگیر، ضریب یا حجم کپی، حد ریسک، وضعیت اتصال و اختلاف احتمالی قیمت اجرا را بررسی کنید.'}], note:'کپی‌ترید سود را تضمین نمی‌کند؛ نتیجه حساب شما ممکن است با حساب مبدأ متفاوت باشد.' } },
      { id: 'account', title: 'افتتاح حساب', description: 'ثبت‌نام و ساخت حساب معاملاتی در ePlanet', icon: a+'stage-04-account.webp', enabled: true, locked: false, lesson: { intro: 'برای اتصال به سیستم، ابتدا باید حساب معاملاتی موردنیاز را در بروکر ePlanet ایجاد و مراحل تأیید آن را تکمیل کنید.', sections: [{heading:'مراحل افتتاح حساب',body:'از لینک رسمی ثبت‌نامی که توسط تیم پروژه ارائه شده استفاده کنید و اطلاعات را دقیقاً مطابق مدارک خود وارد کنید.',bullets:['ورود به لینک اختصاصی ثبت‌نام ePlanet','تکمیل اطلاعات شخصی و اطلاعات تماس','انجام مراحل احراز هویت در سامانه رسمی بروکر','ساخت حساب معاملاتی و نگهداری شناسه حساب']},{heading:'قبل از ادامه',body:'نوع حساب، شرایط معاملاتی، هزینه‌ها، اهرم و قوانین برداشت را در اسناد رسمی بروکر بررسی کنید.'}], note:'رمز عبور، کد یک‌بارمصرف یا اطلاعات محرمانه ورود را برای هیچ شخصی ارسال نکنید.', ctaText:'رفتن به مسیر ثبت‌نام', ctaUrl:'/profile' } },
      { id: 'risk', title: 'سرمایه و ریسک', description: 'انتخاب سرمایه و تنظیم ریسک متناسب با شرایط شما', icon: a+'stage-05-risk.webp', enabled: true, locked: false, lesson: { intro: 'پیش از اتصال حساب، مشخص کنید چه مقدار از سرمایه را آگاهانه در معرض ریسک معاملات قرار می‌دهید. مبلغ انتخابی باید با شرایط مالی و توان تحمل زیان شما متناسب باشد.', sections: [{heading:'قبل از شروع بررسی کنید',body:'میزان سرمایه قابل‌ریسک، حجم معاملات، اهرم، افت سرمایه قابل‌تحمل و شرایط توقف کپی را بشناسید.',bullets:['با پول موردنیاز زندگی یا بدهی وارد معامله نشوید','ریسک هر معامله و مجموع معاملات باز را در نظر بگیرید','حداکثر زیان قابل‌تحمل خود را از قبل مشخص کنید','عملکرد حساب را به‌صورت منظم بررسی کنید']},{heading:'انتظار واقع‌بینانه داشته باشید',body:'دوره‌های زیان، نوسان و افت سرمایه بخشی از معاملات هستند. عملکرد گذشته تضمین‌کننده نتایج آینده نیست.'}], note:'ممکن است بخشی یا تمام سرمایه‌ای که در معاملات درگیر می‌کنید از دست برود.' } },
      { id: 'connection', title: 'اتصال به MMTrade', description: 'اتصال حساب معاملاتی به سیستم کپی‌ترید', icon: a+'stage-06-connection.webp', enabled: true, locked: false, lesson: { intro: 'پس از آماده شدن حساب معاملاتی، باید آن را از مسیر رسمی و امن به زیرساخت MMTrade متصل کنید.', sections: [{heading:'اطلاعات موردنیاز',body:'شناسه حساب و اطلاعاتی را که در فرآیند رسمی اتصال درخواست می‌شود، آماده داشته باشید. فقط از روش‌های تأییدشده پروژه استفاده کنید.'},{heading:'پس از اتصال',body:'وضعیت اتصال را بررسی کنید، تنظیمات کپی و میزان سرمایه درگیر را تأیید کنید و مطمئن شوید حساب صحیح انتخاب شده است.'},{heading:'امنیت حساب',body:'رمز اصلی بروکر، کد تأیید دومرحله‌ای و اطلاعات حساس را در پیام یا فرم غیررسمی وارد نکنید.'}], note:'اتصال موفق به‌تنهایی به معنی فعال شدن معاملات یا تضمین نتیجه نیست.', ctaText:'ورود به پنل کاربری', ctaUrl:'/profile' } },
      { id: 'start', title: 'شروع معاملات', description: 'فعال‌سازی سیستم و پایش عملکرد حساب', icon: a+'stage-07-growth.webp', enabled: true, locked: false, lesson: { intro: 'پیش از فعال‌سازی، اتصال حساب و تنظیمات ریسک را دوباره بررسی کنید. پس از شروع، وضعیت معاملات را در حساب شخصی خود پایش کنید.', sections: [{heading:'چک‌لیست شروع',body:'این موارد را پیش از فعال‌سازی مرور کنید.',bullets:['شناسه حساب متصل‌شده صحیح است','میزان سرمایه و تنظیمات کپی را بررسی کرده‌اید','ریسک و افت سرمایه قابل‌تحمل را می‌شناسید','روش توقف یا قطع اتصال را می‌دانید']},{heading:'پس از فعال‌سازی',body:'وضعیت اتصال، معاملات باز، موجودی و سود و زیان را به‌صورت منظم بررسی کنید. در صورت تغییر شرایط بازار یا وضعیت حساب، تنظیمات را دوباره ارزیابی کنید.'}], note:'عنوان 10X وعده ده‌برابر شدن سرمایه نیست. معامله‌گری و کپی‌ترید همواره با احتمال زیان همراه‌اند.', ctaText:'ورود به پنل کاربری', ctaUrl:'/profile' } }
    ]
  };
}
function mm10AcademyLegacyPublishedConfig(fallback: any): any {
  const next = JSON.parse(JSON.stringify(fallback));
  next.title = 'آکادمی MMTrade Challenge 10X';
  next.logo = '/miniapp/assets/academy-mmtrade-challenge10x-logo-p42.jpg';
  const welcome = Array.isArray(next.stages) ? next.stages.find((stage: any) => stage?.id === 'welcome') : null;
  if (typeof welcome?.lesson?.intro === 'string') {
    welcome.lesson.intro = welcome.lesson.intro.replace('به MATIN FUTURE خوش آمدید.', 'به MMTrade Challenge 10X خوش آمدید.');
  }
  return next;
}
function mm10AcademyBrandConfig(value: any, fallback: any): any {
  const next = JSON.parse(JSON.stringify(value));
  if (next.title === 'آکادمی MMTrade Challenge 10X') next.title = fallback.title;
  if (next.logo === '/miniapp/assets/academy-mmtrade-challenge10x-logo-p42.jpg') next.logo = fallback.logo;
  const welcome = Array.isArray(next.stages) ? next.stages.find((stage: any) => stage?.id === 'welcome') : null;
  if (typeof welcome?.lesson?.intro === 'string') {
    welcome.lesson.intro = welcome.lesson.intro.replace('به MMTrade Challenge 10X خوش آمدید.', 'به MATIN FUTURE خوش آمدید.');
  }
  return next;
}
async function mm10AcademyReadState(): Promise<any> {
  const row = await prisma.systemSetting.findUnique({ where: { key: MM10_ACADEMY_HOME_KEY }, select: { value: true } });
  const fallback = mm10AcademyDefaultConfig();
  const raw = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value as any : {};
  const parsedDraft = mm10AcademyConfigSchema.safeParse(raw.draft);
  const parsedPublished = mm10AcademyConfigSchema.safeParse(raw.published);
  const draftBase = parsedDraft.success ? parsedDraft.data : (parsedPublished.success ? parsedPublished.data : fallback);
  const publishedBase = parsedPublished.success ? parsedPublished.data : mm10AcademyLegacyPublishedConfig(fallback);
  return {
    schemaVersion: 1,
    revision: Number.isInteger(Number(raw.revision)) ? Number(raw.revision) : 0,
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : null,
    draft: mm10AcademyBrandConfig(draftBase, fallback),
    published: publishedBase,
    history: Array.isArray(raw.history) ? raw.history.filter((item: any) => item && Number.isInteger(Number(item.revision)) && mm10AcademyConfigSchema.safeParse(item.config).success).slice(-20) : []
  };
}
async function mm10AcademySaveState(state: any, request: FastifyRequest, action: string, metadata: any = {}) {
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: MM10_ACADEMY_HOME_KEY },
      create: { key: MM10_ACADEMY_HOME_KEY, value: state as Prisma.InputJsonValue },
      update: { value: state as Prisma.InputJsonValue }
    });
    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request), action, entityType: 'AcademyHome', entityId: MM10_ACADEMY_HOME_KEY,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  });
}
app.get('/public/academy-home', async (_request, reply) => {
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  const state = await mm10AcademyReadState();
  return { config: state.published, revision: state.revision, publishedAt: state.publishedAt };
});
app.get('/admin/academy-home', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  reply.header('Cache-Control', 'no-store');
  return await mm10AcademyReadState();
});
app.put('/admin/academy-home/draft', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  const body = z.object({ config: mm10AcademyConfigSchema }).strict().safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_academy_config', details: body.error.flatten() });
  const state = await mm10AcademyReadState();
  state.draft = body.data.config;
  await mm10AcademySaveState(state, request, 'ACADEMY_HOME_DRAFT_SAVED', { stageCount: body.data.config.stages.length });
  return { ok: true, state };
});
app.post('/admin/academy-home/publish', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  const state = await mm10AcademyReadState();
  const draft = mm10AcademyConfigSchema.safeParse(state.draft);
  if (!draft.success) return reply.code(409).send({ error: 'academy_draft_invalid' });
  const now = new Date().toISOString();
  const actor = (request as any).admin;
  state.revision += 1;
  state.published = JSON.parse(JSON.stringify(draft.data));
  state.draft = JSON.parse(JSON.stringify(draft.data));
  state.publishedAt = now;
  state.history = (Array.isArray(state.history) ? state.history : []).concat([{
    revision: state.revision, publishedAt: now, createdBy: actor?.email || 'SUPER_ADMIN', config: state.published
  }]).slice(-20);
  await mm10AcademySaveState(state, request, 'ACADEMY_HOME_PUBLISHED', { revision: state.revision });
  return { ok: true, revision: state.revision, state };
});
app.post('/admin/academy-home/restore', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  const body = z.object({ revision: z.number().int().positive() }).strict().safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_revision' });
  const state = await mm10AcademyReadState();
  const snapshot = state.history.find((item: any) => Number(item.revision) === body.data.revision);
  if (!snapshot) return reply.code(404).send({ error: 'academy_version_not_found' });
  const restored = mm10AcademyConfigSchema.safeParse(snapshot.config);
  if (!restored.success) return reply.code(409).send({ error: 'academy_version_invalid' });
  const now = new Date().toISOString();
  const actor = (request as any).admin;
  state.revision += 1;
  state.published = JSON.parse(JSON.stringify(restored.data));
  state.draft = JSON.parse(JSON.stringify(restored.data));
  state.publishedAt = now;
  state.history = state.history.concat([{
    revision: state.revision, publishedAt: now, createdBy: actor?.email || 'SUPER_ADMIN',
    restoredFrom: body.data.revision, config: state.published
  }]).slice(-20);
  await mm10AcademySaveState(state, request, 'ACADEMY_HOME_RESTORED', { sourceRevision: body.data.revision, revision: state.revision });
  return { ok: true, revision: state.revision, state };
});
app.get('/admin/academy-home/analytics', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  const rows = await prisma.lessonProgress.findMany({
    where: { lessonId: { startsWith: 'MM10_ACADEMY_HOME_V2:' }, completedAt: { not: null } },
    select: { userId: true, lessonId: true }
  });
  const uniqueUsers = new Set(rows.map(row => row.userId));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row.lessonId.slice('MM10_ACADEMY_HOME_V2:'.length);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const config = (await mm10AcademyReadState()).published;
  const stages = config.stages.map((stage: any) => ({ id: stage.id, title: stage.title, completed: counts.get(stage.id) || 0 }));
  const ctaClicks = await prisma.auditLog.count({ where: { entityType: 'AcademyHome', action: 'ACADEMY_HOME_CTA_CLICK' } });
  return { trackedUsers: uniqueUsers.size, completedStages: rows.length, ctaClicks, stages };
});
const mm10AcademyProgressBody = z.object({ initData: z.string().min(1).max(10000) }).strict();
async function mm10AcademyProgressState(userId: string) {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: MM10_ACADEMY_STAGE_IDS.map(id => `MM10_ACADEMY_HOME_V2:${id}`) }, completedAt: { not: null } },
    select: { lessonId: true }
  });
  const completed = new Set(rows.map(row => row.lessonId.slice('MM10_ACADEMY_HOME_V2:'.length)));
  return { tracked: true, read: MM10_ACADEMY_STAGE_IDS.filter(id => completed.has(id)), completed: completed.size, total: MM10_ACADEMY_STAGE_IDS.length };
}
app.post('/academy-home/progress/status', async (request, reply) => {
  reply.header('Cache-Control', 'no-store');
  const body = mm10AcademyProgressBody.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(body.data.initData, false);
  if ('code' in who) return { tracked: false, read: [], reason: who.error };
  return mm10AcademyProgressState(who.id);
});
app.post('/academy-home/progress/complete', { config: { rateLimit: { max: 25, timeWindow: '1 minute' } } }, async (request, reply) => {
  reply.header('Cache-Control', 'no-store');
  const body = mm10AcademyProgressBody.extend({ stageId: z.enum(MM10_ACADEMY_STAGE_IDS) }).strict().safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_stage' });
  const who = await miniUser(body.data.initData, false);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: who.id, lessonId: `MM10_ACADEMY_HOME_V2:${body.data.stageId}` } },
    create: { userId: who.id, lessonId: `MM10_ACADEMY_HOME_V2:${body.data.stageId}`, completedAt: new Date(), progressPct: 100, contentProgressPct: 100, videoProgressPct: 100 },
    update: { completedAt: new Date(), progressPct: 100, contentProgressPct: 100, videoProgressPct: 100 }
  });
  return mm10AcademyProgressState(who.id);
});
app.post('/academy-home/cta-click', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  const body = z.object({ initData: z.string().min(1).max(10000).optional() }).strict().safeParse(request.body);
  if (!body.success || !body.data.initData) return { ok: true, tracked: false };
  const who = await miniUser(body.data.initData, false);
  if ('code' in who) return { ok: true, tracked: false };
  await prisma.auditLog.create({ data: { userId: who.id, action: 'ACADEMY_HOME_CTA_CLICK', entityType: 'AcademyHome', entityId: 'registration-cta' } });
  return { ok: true, tracked: true };
});
// MMTRADE_ACADEMY_HOME_V2_API_END

// MMTrade Stage 1 education: authenticated, persistent completion and stage-two gate.
const MM_STAGE1_KEYS = ['challenge','forex','gold','crypto','broker','scam','risk'] as const;
const MM_STAGE1_IDS = MM_STAGE1_KEYS.map(k => `MM10_STAGE1_V1_${k}`);
const mmStage1Body = z.object({ initData: z.string().min(1).max(10000) }).strict();
async function mmStage1State(userId: string) {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: MM_STAGE1_IDS }, completedAt: { not: null } },
    select: { lessonId: true }
  });
  const doneIds = new Set(rows.map(row => row.lessonId));
  const read = MM_STAGE1_KEYS.filter(key => doneIds.has(`MM10_STAGE1_V1_${key}`));
  return { read, done: read.length, total: MM_STAGE1_KEYS.length, unlocked: read.length === MM_STAGE1_KEYS.length };
}
app.post('/challenge/learning/stage1/status', async (request, reply) => {
  reply.header('Cache-Control', 'no-store');
  const body = mmStage1Body.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(body.data.initData, false);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  return mmStage1State(who.id);
});
app.post('/challenge/learning/stage1/complete', {
  config: { rateLimit: { max: 25, timeWindow: '1 minute' } }
}, async (request, reply) => {
  reply.header('Cache-Control', 'no-store');
  const body = mmStage1Body.extend({ lessonKey: z.enum(MM_STAGE1_KEYS) }).strict().safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_lesson' });
  const who = await miniUser(body.data.initData, false);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: who.id, lessonId: `MM10_STAGE1_V1_${body.data.lessonKey}` } },
    create: { userId: who.id, lessonId: `MM10_STAGE1_V1_${body.data.lessonKey}`, completedAt: new Date(), progressPct: 100, contentProgressPct: 100, videoProgressPct: 100 },
    update: { completedAt: new Date(), progressPct: 100, contentProgressPct: 100, videoProgressPct: 100 }
  });
  return mmStage1State(who.id);
});
app.post('/challenge/learning/stage2/content', async (request, reply) => {
  reply.header('Cache-Control', 'no-store');
  const body = mmStage1Body.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
  const who = await miniUser(body.data.initData, false);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  const state = await mmStage1State(who.id);
  if (!state.unlocked) return reply.code(403).send({ error: 'stage1_incomplete', done: state.done, total: state.total });
  return { unlocked: true, title: 'آموزش عضویت در چالش 10X', steps: [
    { title: 'ورود به لینک ثبت‌نام', detail: 'لینک رسمی ثبت‌نام بروکر ePlanet را از پنل چالش باز کنید.' },
    { title: 'ثبت اطلاعات صحیح', detail: 'نام، شماره تماس و ایمیل را دقیق و مطابق مدارک وارد کنید.' },
    { title: 'تأیید حساب', detail: 'ایمیل یا شماره تماس را طبق دستورالعمل رسمی تأیید کنید.' },
    { title: 'احراز هویت', detail: 'در صورت نیاز، مدارک را فقط در سامانه رسمی بروکر بارگذاری کنید.' },
    { title: 'افتتاح حساب', detail: 'بعد از تأیید، حساب معاملاتی بسازید و شماره حساب را در MMTrade ثبت کنید.' }
  ] };
});
// Stage 1 Object Studio: only authenticated admins may change the scene.
const mmSceneKey = 'MM10_STAGE1_SCENE_V1';
const mmSceneDraftKey = 'MM10_STAGE1_SCENE_DRAFT_V1';
const mmSceneItem = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,48}$/),
  type: z.enum(['candles','orb','coin','bars','ring','label','text','image','flag','glow']),
  x: z.number().min(0).max(100), y: z.number().min(0).max(100),
  w: z.number().min(5).max(100), rot: z.number().min(-180).max(180),
  opacity: z.number().min(0).max(100), z: z.number().int().min(0).max(100),
  anim: z.enum(['none','float','pulse','rise','spin','glow','shimmer']),
  text: z.string().max(100).default(''),
  src: z.string().max(300).regex(/^\/(?:uploads\/|miniapp\/p74\/)[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/).optional()
}).strict().refine(v => v.type !== 'image' || Boolean(v.src), { message: 'image_requires_safe_source' })
  .refine(v => !v.src || (!v.src.includes('..') && !v.src.includes('//')), { message: 'unsafe_asset_path' });
const mmSceneList = z.array(mmSceneItem).max(32).refine(items => new Set(items.map(x => x.id)).size === items.length, { message: 'duplicate_id' });
async function mmReadScene(key: string = mmSceneKey) {
  const row = await prisma.systemSetting.findUnique({ where: { key }, select: { value: true } });
  const parsed = mmSceneList.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}
app.get('/challenge/learning/stage1/scene', async (_request, reply) => {
  reply.header('Cache-Control', 'no-store');
  return { items: await mmReadScene() };
});
app.get('/admin/challenge/stage1/scene', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  return { items: (await mmReadScene(mmSceneDraftKey)) ?? (await mmReadScene(mmSceneKey)) };
});
app.put('/admin/challenge/stage1/scene', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  const body = z.object({ items: mmSceneList }).strict().safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'invalid_scene' });
  await prisma.systemSetting.upsert({
    where: { key: mmSceneDraftKey },
    create: { key: mmSceneDraftKey, value: body.data.items },
    update: { value: body.data.items }
  });
  return { ok: true, count: body.data.items.length, draft: true };
});
app.post('/admin/challenge/stage1/scene/publish', async (request, reply) => {
  if (!(await p60OwnerOnly(request, reply))) return;
  const draft = await mmReadScene(mmSceneDraftKey);
  if (draft === null) return reply.code(409).send({ error: 'draft_missing' });
  await prisma.systemSetting.upsert({
    where: { key: mmSceneKey },
    create: { key: mmSceneKey, value: draft },
    update: { value: draft }
  });
  return { ok: true, count: draft.length, published: true };
});
// MMTRADE_CHALLENGE_RESULT_R1: broker evidence and supervised decisions.
// IMPORTANT: Account registration/copy connection is not proof of passing 10X.
type MMChallengeVerdict = 'PASSED' | 'FAILED' | 'IN_PROGRESS' | 'UNDER_REVIEW';
type MMChallengeBroker = { verdict: MMChallengeVerdict; checkedAt: string; accountId: string; evidenceHash: string };
type MMChallengeManual = { verdict: MMChallengeVerdict; reason: string; evidenceRef: string | null; adminId: string; decidedAt: string };
type MMChallengeRecord = { version: 1; broker: MMChallengeBroker | null; manual: MMChallengeManual | null; lastAttemptAt: string | null };
const mmChallengeVerdicts = new Set<MMChallengeVerdict>(['PASSED','FAILED','IN_PROGRESS','UNDER_REVIEW']);
const mmChallengeKey = (userId: string) => `MM10_CHALLENGE_RESULT_R1_${userId}`;
const mmChallengeBlank = (): MMChallengeRecord => ({ version:1, broker:null, manual:null, lastAttemptAt:null });
function mmChallengeDecode(input: unknown): MMChallengeRecord {
  const data = input && typeof input === 'object' ? input as Record<string, any> : {};
  const b = data.broker, m = data.manual;
  const broker: MMChallengeBroker | null = b && mmChallengeVerdicts.has(b.verdict) && typeof b.checkedAt === 'string' && typeof b.accountId === 'string'
    ? { verdict:b.verdict, checkedAt:b.checkedAt, accountId:b.accountId, evidenceHash:String(b.evidenceHash || '').slice(0,64) } : null;
  const manual: MMChallengeManual | null = m && mmChallengeVerdicts.has(m.verdict) && typeof m.reason === 'string' && typeof m.adminId === 'string'
    ? { verdict:m.verdict, reason:m.reason, evidenceRef:typeof m.evidenceRef === 'string' ? m.evidenceRef : null, adminId:m.adminId, decidedAt:String(m.decidedAt || '') } : null;
  return { version:1, broker, manual, lastAttemptAt:typeof data.lastAttemptAt === 'string' ? data.lastAttemptAt : null };
}
function mmChallengeView(value: MMChallengeRecord, accountId: string | null) {
  const matches = value.broker && accountId && value.broker.accountId === accountId;
  const broker = matches ? value.broker : null;
  const effective = value.manual ?? broker;
  return {
    verdict: effective?.verdict ?? 'NOT_VERIFIED',
    source: value.manual ? 'SUPER_ADMIN' : broker ? 'EPLANET' : 'NONE',
    accountLinked: Boolean(accountId),
    checkedAt: broker?.checkedAt ?? null,
    decidedAt: value.manual?.decidedAt ?? null,
    brokerVerdict: broker?.verdict ?? null,
    hasOverride: Boolean(value.manual),
    conflict: Boolean(value.manual && broker && value.manual.verdict !== broker.verdict)
  };
}
async function mmChallengeRead(userId: string) {
  const [setting, workflow] = await Promise.all([
    prisma.systemSetting.findUnique({ where:{key:mmChallengeKey(userId)} }),
    prisma.eplanetUserWorkflow.findUnique({ where:{userId},select:{accountId:true,challengeParticipant:true} })
  ]);
  const value = mmChallengeDecode(setting?.value);
  return { value, accountId:workflow?.accountId ?? null, participant:Boolean(workflow?.challengeParticipant), display:mmChallengeView(value,workflow?.accountId ?? null) };
}
function mmChallengeNested(data: unknown, path: string): unknown {
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]{0,100}$/.test(path)) return null;
  return path.split('.').reduce<unknown>((value,key) => value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string,unknown>)[key] : null, data);
}
const mmChallengeLastFetch = new Map<string,number>();
const mmChallengeConfigReady = () => Boolean(process.env.EPLANET_CHALLENGE_STATUS_URL && process.env.EPLANET_CHALLENGE_STATUS_FIELD && process.env.EPLANET_CHALLENGE_ACCOUNT_FIELD && process.env.EPLANET_CHALLENGE_PROGRAM_FIELD && process.env.EPLANET_CHALLENGE_PROGRAM_ID && process.env.EPLANET_CHALLENGE_ALLOWED_HOSTS);
async function mmChallengeSync(userId: string) {
  if (!mmChallengeConfigReady()) throw new Error('broker_result_api_not_configured');
  const workflow = await prisma.eplanetUserWorkflow.findUnique({where:{userId},select:{accountId:true}});
  if (!workflow?.accountId) throw new Error('no_verified_trading_account');
  const template = String(process.env.EPLANET_CHALLENGE_STATUS_URL);
  if (!template.includes('{accountId}')) throw new Error('broker_url_requires_account_placeholder');
  const url = new URL(template.replace('{accountId}',encodeURIComponent(workflow.accountId)));
  const hosts = String(process.env.EPLANET_CHALLENGE_ALLOWED_HOSTS).split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.toLowerCase())) throw new Error('broker_url_not_allowlisted');
  const headers: Record<string,string> = {accept:'application/json'};
  const token = process.env.EPLANET_CHALLENGE_API_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('broker_http_'+response.status);
  const size = Number(response.headers.get('content-length') || 0);
  if (size > 150000) throw new Error('broker_response_too_large');
  const raw = await response.text();
  if (raw.length > 150000) throw new Error('broker_response_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('broker_not_json'); }
  const accountValue = mmChallengeNested(parsed,String(process.env.EPLANET_CHALLENGE_ACCOUNT_FIELD));
  const verdictValue = mmChallengeNested(parsed,String(process.env.EPLANET_CHALLENGE_STATUS_FIELD));
  const programValue = mmChallengeNested(parsed,String(process.env.EPLANET_CHALLENGE_PROGRAM_FIELD));
  if (String(programValue) !== String(process.env.EPLANET_CHALLENGE_PROGRAM_ID)) throw new Error('broker_challenge_program_mismatch');
  if (String(accountValue) !== workflow.accountId) throw new Error('broker_account_mismatch');
  if (typeof verdictValue !== 'string' || !mmChallengeVerdicts.has(verdictValue as MMChallengeVerdict)) throw new Error('broker_challenge_verdict_unavailable');
  // Never infer PASS from balance, deposits, trade history, or "challengeParticipant".
  const item: MMChallengeBroker = {verdict:verdictValue as MMChallengeVerdict, checkedAt:new Date().toISOString(), accountId:workflow.accountId, evidenceHash:mmChallengeHash('sha256').update(raw).digest('hex')};
  await prisma.$transaction(async tx => {
    const key=mmChallengeKey(userId);
    const old=mmChallengeDecode((await tx.systemSetting.findUnique({where:{key}}))?.value);
    const next:MMChallengeRecord={...old,broker:item,lastAttemptAt:new Date().toISOString()};
    await tx.systemSetting.upsert({where:{key},create:{key,value:next as any},update:{value:next as any}});
    if(old.broker?.verdict!==item.verdict || old.broker?.accountId!==item.accountId){
      await tx.auditLog.create({data:{userId,action:'CHALLENGE_BROKER_RESULT_CHANGED',entityType:'MMTradeChallengeResult',entityId:userId,
        metadata:{from:old.broker?.verdict??null,to:item.verdict,accountVerified:true,evidenceHash:item.evidenceHash,source:'EPLANET'}}});
    }
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return mmChallengeRead(userId);
}
// Authenticated Mini App: never accepts a userId or status from the browser.
app.post('/challenge/result/status',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  const input=z.object({initData:z.string().min(1).max(10000)}).strict().safeParse(request.body);
  if(!input.success)return reply.code(400).send({error:'invalid_request'});
  const who=await miniUser(input.data.initData,false);
  if('code' in who)return reply.code(who.code).send({error:who.error});
  let result=await mmChallengeRead(who.id);
  // Opportunistic read-through sync, at most once per account per 15 minutes.
  const last=mmChallengeLastFetch.get(who.id)||0;
  if(result.accountId && mmChallengeConfigReady() && Date.now()-last>15*60*1000){
    mmChallengeLastFetch.set(who.id,Date.now());
    try{result=await mmChallengeSync(who.id);}catch(e){request.log.warn({message:e instanceof Error?e.message:'broker_sync_failed'},'Challenge result unavailable; preserving last verified state');}
  }
  return result.display;
});
app.get('/admin/challenge/results',async(request,reply)=>{
  if(!(await p37SuperSession(request,reply)))return;
  const q=z.object({q:z.string().trim().max(80).optional()}).safeParse(request.query);
  if(!q.success)return reply.code(400).send({error:'invalid_query'});
  const term=q.data.q||'';
  const users=await prisma.user.findMany({where:term?{OR:[{telegramId:{contains:term}},{username:{contains:term}},{firstName:{contains:term}}]}:{eplanetWorkflow:{isNot:null}},include:{eplanetWorkflow:true},orderBy:{createdAt:'desc'},take:40});
  const results=await Promise.all(users.map(async u=>{
    const value=mmChallengeDecode((await prisma.systemSetting.findUnique({where:{key:mmChallengeKey(u.id)}}))?.value);
    return {userId:u.id,username:u.username,telegramId:u.telegramId,accountId:u.eplanetWorkflow?.accountId||null,status:mmChallengeView(value,u.eplanetWorkflow?.accountId||null)};
  }));
  reply.header('Cache-Control','no-store');return {items:results};
});
app.get('/admin/challenge/results/:userId',async(request,reply)=>{
  if(!(await p37SuperSession(request,reply)))return;
  const p=z.object({userId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)}).safeParse(request.params);
  if(!p.success)return reply.code(400).send({error:'invalid_user'});
  const user=await prisma.user.findUnique({where:{id:p.data.userId},select:{id:true,username:true,telegramId:true}});
  if(!user)return reply.code(404).send({error:'user_not_found'});
  const [result,history]=await Promise.all([mmChallengeRead(user.id),prisma.auditLog.findMany({where:{userId:user.id,entityType:'MMTradeChallengeResult'},orderBy:{createdAt:'desc'},take:50,select:{action:true,adminUserId:true,createdAt:true,metadata:true}})]);
  reply.header('Cache-Control','no-store');return {user,accountId:result.accountId,status:result.display,broker:result.value.broker,manual:result.value.manual,history};
});
app.put('/admin/challenge/results/:userId',async(request,reply)=>{
  const actor=await p37SuperSession(request,reply);if(!actor)return;
  const p=z.object({userId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)}).safeParse(request.params);
  const body=z.object({verdict:z.enum(['PASSED','FAILED','IN_PROGRESS','UNDER_REVIEW']),reason:z.string().trim().min(10).max(500),evidenceRef:z.string().trim().max(200).optional()}).strict().refine(x=>!['PASSED','FAILED'].includes(x.verdict)||Boolean(x.evidenceRef&&x.evidenceRef.length>=4),{message:'final_decision_requires_evidence_reference'}).safeParse(request.body);
  if(!p.success||!body.success)return reply.code(400).send({error:'invalid_request'});
  const user=await prisma.user.findUnique({where:{id:p.data.userId},select:{id:true,eplanetWorkflow:{select:{accountId:true}}}});
  if(!user)return reply.code(404).send({error:'user_not_found'});
  if(['PASSED','FAILED'].includes(body.data.verdict) && !user.eplanetWorkflow?.accountId) return reply.code(409).send({error:'verified_account_required'});
  await prisma.$transaction(async tx=>{
    const key=mmChallengeKey(user.id),old=mmChallengeDecode((await tx.systemSetting.findUnique({where:{key}}))?.value);
    const manual:MMChallengeManual={verdict:body.data.verdict,reason:body.data.reason,evidenceRef:body.data.evidenceRef||null,adminId:actor.id,decidedAt:new Date().toISOString()};
    const next:MMChallengeRecord={...old,manual};
    await tx.systemSetting.upsert({where:{key},create:{key,value:next as any},update:{value:next as any}});
    await tx.auditLog.create({data:{adminUserId:actor.id,userId:user.id,action:'CHALLENGE_SUPERADMIN_DECISION',entityType:'MMTradeChallengeResult',entityId:user.id,ipAddress:request.ip,
      metadata:{previous:old.manual?.verdict||null,next:manual.verdict,reason:manual.reason,evidenceRef:manual.evidenceRef,brokerVerdict:old.broker?.verdict||null}}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  reply.header('Cache-Control','no-store');return {ok:true,status:(await mmChallengeRead(user.id)).display};
});
app.post('/admin/challenge/results/:userId/clear-override',async(request,reply)=>{
  const actor=await p37SuperSession(request,reply);if(!actor)return;
  const p=z.object({userId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)}).safeParse(request.params);
  const body=z.object({reason:z.string().trim().min(10).max(500)}).strict().safeParse(request.body);
  if(!p.success||!body.success)return reply.code(400).send({error:'invalid_request'});
  const user=await prisma.user.findUnique({where:{id:p.data.userId},select:{id:true}});if(!user)return reply.code(404).send({error:'user_not_found'});
  await prisma.$transaction(async tx=>{
    const key=mmChallengeKey(user.id),old=mmChallengeDecode((await tx.systemSetting.findUnique({where:{key}}))?.value);
    const next:MMChallengeRecord={...old,manual:null};
    await tx.systemSetting.upsert({where:{key},create:{key,value:next as any},update:{value:next as any}});
    await tx.auditLog.create({data:{adminUserId:actor.id,userId:user.id,action:'CHALLENGE_SUPERADMIN_OVERRIDE_CLEARED',entityType:'MMTradeChallengeResult',entityId:user.id,ipAddress:request.ip,metadata:{previous:old.manual?.verdict||null,reason:body.data.reason}}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return {ok:true,status:(await mmChallengeRead(user.id)).display};
});
app.post('/admin/challenge/results/:userId/sync',async(request,reply)=>{
  const actor=await p37SuperSession(request,reply);if(!actor)return;
  const p=z.object({userId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)}).safeParse(request.params);
  if(!p.success)return reply.code(400).send({error:'invalid_user'});
  try{const result=await mmChallengeSync(p.data.userId);return {ok:true,status:result.display};}
  catch(e){request.log.warn({error:e instanceof Error?e.message:'broker_failed'},'Broker challenge verification unavailable');return reply.code(503).send({error:e instanceof Error?e.message:'broker_failed'});}
});
// END MMTRADE_CHALLENGE_RESULT_R1

// MMTrade Stage 1 routes end.

// ---- Page builder + popups ----
const PAGE_SLUGS = ['index', 'academy', 'stage2', 'crypto', 'copy-trading', 'challenge', 'support', 'profile', 'mmtrade10x', 'eplanet', 'copytrade-academy'] as const;

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

// MMTRADE_ROUTE_MANAGER_R6_API_BEGIN
// Canonical URLs are page identities, not names of physical HTML files.
// All write operations below require SUPER_ADMIN and use one DB transaction.
const rm6PageInfo: Record<string, { label: string; defaultPath: string; target: string; legacy: string[] }> = {
  index: {label:'خانه',defaultPath:'/miniapp/index.html',target:'/miniapp/index.html',legacy:['/miniapp/index.html','/miniapp/']},
  academy: {label:'آموزش / مرحله اول',defaultPath:'/academy',target:'/miniapp/p74/learning/stage1.html',legacy:['/miniapp/academy.html','/miniapp/index.html?view=academy']},
  crypto: {label:'رمزارز',defaultPath:'/crypto',target:'/miniapp/crypto.html',legacy:['/miniapp/crypto.html']},
  'copy-trading': {label:'کپی‌ترید',defaultPath:'/copy-trading',target:'/miniapp/copy-trading.html',legacy:['/miniapp/copy-trading.html']},
  challenge: {label:'چالش',defaultPath:'/challenge',target:'/miniapp/index.html?view=mmtrade10x',legacy:['/miniapp/challenge.html']},
  support: {label:'پشتیبانی',defaultPath:'/support',target:'/miniapp/p74/support/support.html',legacy:['/miniapp/support.html','/miniapp/p74/support/support.html']},
  profile: {label:'پروفایل',defaultPath:'/profile',target:'/miniapp/p74/profile/profile.html',legacy:['/miniapp/profile.html','/miniapp/p74/profile/profile.html']},
  mmtrade10x: {label:'چالش 10X در مینی‌اپ',defaultPath:'/mmtrade10x',target:'/miniapp/index.html?view=mmtrade10x',legacy:[]}
};
const rm6Slugs = Object.keys(rm6PageInfo);
const rm6AliasesKey='MM_ROUTE_ALIASES_R6';
const rm6RevisionKey='MM_ROUTE_REVISION_R6';
const rm6MutableKeys=['HOME_LINKS_V1','BOTTOM_NAV_V1','TENX_P62_HOME_STUDIO_V1','BOT_CONTROL_CONFIG'];
const rm6CanonicalPattern=/^\/[a-zA-Z0-9_-]{1,60}$/;
const rm6Protected=new Set([
  '/admin','/api','/health','/miniapp','/public','/auth','/content','/assets',
  '/uploads','/favicon.ico','/webhook','/robots.txt','/sitemap.xml','/go',
  '/login','/logout','/register','/privacy','/terms','/status','/docs','/healthz'
]);
let rm6Cache:{ at:number;value:any }|null=null;
const rm6Origin='https://mmtrade.parsahojabrian.ir';
const rm6Json=(v:any)=>JSON.parse(JSON.stringify(v));
function rm6CleanAliases(raw:any):Record<string,string[]>{
  const out:Record<string,string[]>={};
  for(const slug of rm6Slugs){
    const xs=raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw[slug])?raw[slug]:[];
    out[slug]=xs.filter((p:any)=>typeof p==='string'&&rm6CanonicalPattern.test(p)).slice(-30);
  }
  return out;
}
async function rm6State(db:any=prisma,force=false):Promise<any>{
  if(!force && db===prisma && rm6Cache && Date.now()-rm6Cache.at<10000)return rm6Cache.value;
  const keys=[...rm6Slugs.map(s=>'PAGE_PATH_'+s),rm6AliasesKey,rm6RevisionKey];
  const items=await db.systemSetting.findMany({where:{key:{in:keys}},select:{key:true,value:true}});
  const stored=new Map<string,any>(items.map((x:any)=>[x.key,x.value]));
  const aliases=rm6CleanAliases(stored.get(rm6AliasesKey));
  const paths:Record<string,string>={};
  for(const slug of rm6Slugs){
    const s=stored.get('PAGE_PATH_'+slug);
    paths[slug]=typeof s==='string'&&rm6CanonicalPattern.test(s)?s:rm6PageInfo[slug].defaultPath;
  }
  const revision=Math.max(0,Math.trunc(Number(stored.get(rm6RevisionKey))||0));
  const state={paths,aliases,revision};
  if(db===prisma)rm6Cache={at:Date.now(),value:state};
  return state;
}
function rm6RouteEntries(state:any){
  return rm6Slugs.map(slug=>({
    slug,label:rm6PageInfo[slug].label,path:state.paths[slug],
    target:rm6PageInfo[slug].target,
    aliases:Array.from(new Set([...rm6PageInfo[slug].legacy,...state.aliases[slug],rm6PageInfo[slug].defaultPath]))
      .filter(p=>p!==state.paths[slug])
  }));
}
function rm6UrlMatch(raw:string,old:string,destination:string):string|null{
  if(typeof raw!=='string'||!raw.trim())return null;
  // No rewriting a different host, mailto, javascript URL, or free-form prose.
  const absolute=/^https:\/\//i.test(raw);
  if(!raw.startsWith('/')&&!absolute)return null;
  let u:URL;
  try{u=new URL(raw,rm6Origin)}catch{return null}
  if(u.origin!==rm6Origin)return null;
  const qi=old.indexOf('?'); const path=qi>=0?old.slice(0,qi):old;
  if(u.pathname!==path)return null;
  if(qi>=0){
    if((u.search||'')!==old.slice(qi))return null;
  } else if(u.pathname==='/miniapp/index.html' && u.searchParams.has('view')){
    // This HTML file carries different pages via ?view=..., do not mistake them for index.
    return null;
  }
  const extra=qi>=0?'':u.search;
  return (absolute?rm6Origin:'')+destination+extra+u.hash;
}
function rm6MapLink(v:string,from:string[],to:string):string{
  for(const old of from){const next=rm6UrlMatch(v,old,to);if(next!==null)return next;}
  return v;
}
function rm6Transform(input:any,from:string[],to:string):{result:any,count:number,samples:string[]}{
  let count=0;const samples:string[]=[];
  function rec(v:any,key:string,depth:number):any{
    if(depth>30)return v;
    if(typeof v==='string'){
      const replacement=rm6MapLink(v,from,to);
      if(replacement!==v){count++;if(samples.length<12)samples.push(key+': '+v+' → '+replacement);return replacement;}
      // R74/R77 editor embeds its validated JSON config as text in a dedicated marker block.
      if((key==='text'||key.endsWith('.text'))&&v.startsWith('{')&&v.length<=12000){
        try{const data=JSON.parse(v);if(data&&typeof data==='object'&&typeof data.version==='number'&&[74,77].includes(data.version)){
          const before=count,updated=rec(data,'config',depth+1);
          if(count>before)return JSON.stringify(updated);
        }}catch{}
      }
      return v;
    }
    if(Array.isArray(v))return v.map((x,i)=>rec(x,key+'['+i+']',depth+1));
    if(v&&typeof v==='object'){
      const out:any={};for(const [k,x] of Object.entries(v)){
        // Historical records must remain immutable for truthful rollback.
        out[k]=(k==='history'&&depth===0)?x:rec(x,key?key+'.'+k:k,depth+1);
      }
      return out;
    }
    return v;
  }
  return {result:rec(input,'',0),count,samples};
}
function rm6Sources(slug:string,state:any){
  return Array.from(new Set([state.paths[slug],rm6PageInfo[slug].defaultPath,
    ...rm6PageInfo[slug].legacy,...state.aliases[slug]]));
}
async function rm6StaticCandidates(paths:string[]):Promise<any[]> {
  // Read-only scan of executable/static files. Never alter source automatically.
  const fs=await import('node:fs');
  const roots=[
    {dir:join(process.cwd(),'public','miniapp'),prefix:'public/miniapp'},
    {dir:join(process.cwd(),'apps','bot','src'),prefix:'apps/bot/src'}
  ];
  const out:any[]=[];let visited=0;
  for(const root of roots){
    if(!fs.existsSync(root.dir))continue;
    const todo=[{dir:root.dir,rel:''}];
    while(todo.length&&visited<1200){
      const current=todo.pop()!;
      for(const entry of fs.readdirSync(current.dir,{withFileTypes:true})){
        if(visited>=1200)break;
        if(entry.isSymbolicLink())continue;
        const relative=current.rel?current.rel+'/'+entry.name:entry.name;
        const full=join(current.dir,entry.name);
        if(entry.isDirectory()){
          if(!['node_modules','.git','studio'].includes(entry.name))todo.push({dir:full,rel:relative});
          continue;
        }
        if(!entry.isFile()||!/[.](?:html|js|ts|css)$/.test(entry.name))continue;
        visited++;const st=fs.statSync(full);if(st.size>1800000)continue;
        const text=fs.readFileSync(full,'utf-8');
        let hits=0;for(const path of paths){
          let at=0;while((at=text.indexOf(path,at))>=0){hits++;at+=path.length;}
        }
        if(hits)out.push({file:root.prefix+'/'+relative,occurrences:hits,review:true});
      }
    }
  }
  return out.sort((a,b)=>b.occurrences-a.occurrences).slice(0,50);
}
async function rm6Inventory(db:any,state:any,slug:string,next:string){
  const from=rm6Sources(slug,state).filter(s=>s!==next);
  const pages=await db.contentPage.findMany({select:{slug:true,blocks:true,title:true}});
  const drafts=await db.contentPageDraft.findMany({select:{slug:true,blocks:true,title:true}});
  const popups=await db.popup.findMany({select:{id:true,title:true,buttonUrl:true,pageSlug:true}});
  const storedSettings=await db.systemSetting.findMany({where:{key:{in:rm6MutableKeys}},select:{key:true,value:true}});
  const settings=[...storedSettings];
  const existingKeys=new Set(storedSettings.map((s:any)=>s.key));
  // Some installations rely on built-in defaults instead of saved settings.
  // Materialize a migrated default only when a link actually changes.
  if(!existingKeys.has('HOME_LINKS_V1'))settings.push({key:'HOME_LINKS_V1',value:normalizeHomeLinks(null)});
  if(!existingKeys.has('BOTTOM_NAV_V1'))settings.push({key:'BOTTOM_NAV_V1',value:bottomNavDefaults});
  if(!existingKeys.has('TENX_P62_HOME_STUDIO_V1')){
    try{settings.push({key:'TENX_P62_HOME_STUDIO_V1',value:p62Defaults()})}catch{}
  }
  const changed:any[]=[];
  const totals:Record<string,number>={pages:0,drafts:0,popups:0,settings:0};
  for(const p of pages){const m=rm6Transform(p.blocks,from,next);if(m.count){
    totals.pages+=m.count;changed.push({type:'page',id:p.slug,count:m.count,detail:m.samples,next:m.result});}}
  for(const p of drafts){const m=rm6Transform(p.blocks,from,next);if(m.count){
    totals.drafts+=m.count;changed.push({type:'draft',id:p.slug,count:m.count,detail:m.samples,next:m.result});}}
  for(const p of popups){if(!p.buttonUrl)continue;const u=rm6MapLink(p.buttonUrl,from,next);if(u!==p.buttonUrl){
    totals.popups++;changed.push({type:'popup',id:p.id,label:p.title,count:1,detail:[p.buttonUrl+' → '+u],next:u});}}
  for(const s of settings){const m=rm6Transform(s.value,from,next);if(m.count){
    totals.settings+=m.count;changed.push({type:'setting',id:s.key,count:m.count,detail:m.samples,next:m.result});}}
  return {totals,changed};
}
function rm6Validate(slug:string,next:string,state:any):string|null{
  if(!rm6PageInfo[slug])return 'unknown_page';
  if(!rm6CanonicalPattern.test(next)||rm6Protected.has(next.toLowerCase()))return 'invalid_path';
  if(state.paths[slug]===next)return 'unchanged_path';
  for(const row of rm6RouteEntries(state)){
    if(row.slug===slug)continue;
    if([row.path,...row.aliases].some((s:string)=>s.toLowerCase()===next.toLowerCase()))return 'route_collision_'+row.slug;
  }
  return null;
}
async function rm6Owner(request:FastifyRequest,reply:FastifyReply):Promise<boolean>{
  if(!(await adminGuard(request,reply)))return false;
  if((request as any).admin?.role!=='SUPER_ADMIN'){
    reply.code(403).send({error:'super_admin_required'});return false;
  }
  return true;
}
const rm6Request=z.object({slug:z.enum(PAGE_SLUGS),newPath:z.string().trim().max(64)}).strict();
app.get('/public/page-routes',async(_request,reply)=>{
  const state=await rm6State();reply.header('cache-control','no-store');
  return {revision:state.revision,pages:rm6RouteEntries(state)};
});
app.get('/admin/route-manager',async(request,reply)=>{
  if(!(await rm6Owner(request,reply)))return;
  const state=await rm6State(prisma,true);
  reply.header('cache-control','no-store');
  return {revision:state.revision,pages:rm6RouteEntries(state)};
});
app.post('/admin/route-manager/preview',async(request,reply)=>{
  if(!(await rm6Owner(request,reply)))return;
  const b=rm6Request.safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_input'});
  const state=await rm6State(prisma,true);const {slug,newPath}=b.data;
  const issue=rm6Validate(slug,newPath,state);
  if(issue)return reply.code(409).send({error:issue});
  const i=await rm6Inventory(prisma,state,slug,newPath);
  const staticCandidates=await rm6StaticCandidates(rm6Sources(slug,state).filter(s=>s!==newPath));
  return {ok:true,slug,newPath,oldPath:state.paths[slug],revision:state.revision,
    totals:i.totals,changes:i.changed.map(({next,...x})=>x),staticCandidates,
    notes:['Static JavaScript redirects and links inside external messages require a separate audit.',
    'Old links remain available through aliases/legacy URLs where supported by Nginx.']};
});
app.post('/admin/route-manager/publish',async(request,reply)=>{
  if(!(await rm6Owner(request,reply)))return;
  const b=rm6Request.extend({expectedRevision:z.number().int().min(0),expectedOldPath:z.string()}).safeParse(request.body);
  if(!b.success)return reply.code(400).send({error:'invalid_input'});
  const result=await prisma.$transaction(async(tx)=>{
    const state=await rm6State(tx,true);
    if(state.revision!==b.data.expectedRevision||state.paths[b.data.slug]!==b.data.expectedOldPath)return {error:'stale_preview'};
    const issue=rm6Validate(b.data.slug,b.data.newPath,state);
    if(issue)return {error:issue};
    const i=await rm6Inventory(tx,state,b.data.slug,b.data.newPath);
    const slug=b.data.slug,old=state.paths[slug],next=b.data.newPath;
    for(const x of i.changed){
      if(x.type==='page'){
        const original=await tx.contentPage.findUnique({where:{slug:x.id},select:{title:true,status:true}});
        await tx.contentPage.update({where:{slug:x.id},data:{blocks:x.next}});
        const latest=await tx.contentPageVersion.aggregate({where:{pageSlug:x.id},_max:{version:true}});
        await tx.contentPageVersion.create({data:{pageSlug:x.id,version:(latest._max.version||0)+1,
          title:original?.title||null,status:original?.status||'PUBLISHED',blocks:x.next,
          createdByAdminId:adminIdOf(request)}});
      }
      if(x.type==='draft')await tx.contentPageDraft.update({where:{slug:x.id},data:{blocks:x.next}});
      if(x.type==='popup')await tx.popup.update({where:{id:x.id},data:{buttonUrl:x.next}});
      if(x.type==='setting')await tx.systemSetting.upsert({where:{key:x.id},
        create:{key:x.id,value:x.next},update:{value:x.next}});
    }
    state.aliases[slug]=Array.from(new Set([...(state.aliases[slug]||[]),old]))
      .filter((x:string)=>rm6CanonicalPattern.test(x)&&x!==next).slice(-30);
    const json=rm6CleanAliases(state.aliases);
    await tx.systemSetting.upsert({where:{key:rm6AliasesKey},create:{key:rm6AliasesKey,value:json},update:{value:json}});
    await tx.systemSetting.upsert({where:{key:'PAGE_PATH_'+slug},create:{key:'PAGE_PATH_'+slug,value:next},update:{value:next}});
    const revision=state.revision+1;
    await tx.systemSetting.upsert({where:{key:rm6RevisionKey},create:{key:rm6RevisionKey,value:revision},update:{value:revision}});
    await tx.auditLog.create({data:{adminUserId:adminIdOf(request),action:'MM_ROUTE_R6_PUBLISHED',
      entityType:'PageRoute',entityId:slug,metadata:{from:old,to:next,revision,totals:i.totals}}});
    return {ok:true,slug,oldPath:old,newPath:next,revision,totals:i.totals};
  },{timeout:20000});
  if('error' in result)return reply.code(409).send(result);
  rm6Cache=null;
  return result;
});
// MMTRADE_ROUTE_MANAGER_R6_API_END
// MMTRADE_PAGE_LIFECYCLE_R10_API_BEGIN
// Reversible registry of published and archived pages. No Prisma schema change.
const r10Key='MM_PAGE_LIFECYCLE_R10';
const r10SlugSchema=z.string().regex(/^[a-z][a-z0-9-]{2,39}$/);
const r10Builtins=['index','academy','crypto','copy-trading','challenge','support','profile','mmtrade10x'];
const r10Engine=z.enum(['p74','p62','legacy']);
const r10Status=z.enum(['DRAFT','PUBLISHED','ARCHIVED']);
const r10CustomSchema=z.object({slug:r10SlugSchema,title:z.string().min(1).max(120),status:r10Status,previousStatus:z.enum(['DRAFT','PUBLISHED']).optional()}).strict();
const r10StateSchema=z.object({version:z.number().int().min(0),start:z.string().max(60),engine:r10Engine,
 builtins:z.record(z.enum(['PUBLISHED','ARCHIVED'])),custom:z.array(r10CustomSchema).max(70)}).strict();
type R10State=z.infer<typeof r10StateSchema>;
const r10Defaults=():R10State=>({version:0,start:'index',engine:'p74',builtins:Object.fromEntries(r10Builtins.map(s=>[s,'PUBLISHED'])) as Record<string,'PUBLISHED'|'ARCHIVED'>,custom:[]});
function r10SafeState(raw:any):R10State{
 const base=r10Defaults();const candidate=r10StateSchema.safeParse(raw);
 if(!candidate.success)return base;
 const x=candidate.data;
 const custom=x.custom.filter(c=>!r10Builtins.includes(c.slug));
 const builtins:any={};for(const slug of r10Builtins)builtins[slug]=x.builtins[slug]==='ARCHIVED'?'ARCHIVED':'PUBLISHED';
 const start= x.start==='index'||r10Builtins.includes(x.start)||custom.some(c=>c.slug===x.start)?x.start:'index';
 return {version:x.version,start,engine:x.engine,builtins,custom};
}
async function r10Read(db:any=prisma):Promise<R10State>{
 const row=await db.systemSetting.findUnique({where:{key:r10Key},select:{value:true}});
 return r10SafeState(row?.value);
}
async function r10Write(tx:any,state:R10State,actor:string|null,action:string,meta:any={}){
 state.version++;
 await tx.systemSetting.upsert({where:{key:r10Key},create:{key:r10Key,value:state as unknown as Prisma.InputJsonValue},update:{value:state as unknown as Prisma.InputJsonValue}});
 await tx.auditLog.create({data:{adminUserId:actor,action,entityType:'PageLifecycle',metadata:meta}});
}
async function r10Owner(request:FastifyRequest,reply:FastifyReply){
 if(!(await adminGuard(request,reply)))return false;
 if((request as any).admin?.role!=='SUPER_ADMIN'){reply.code(403).send({error:'super_admin_required'});return false;}
 return true;
}
function r10Entries(state:R10State,routeState:any){
 const builtins=r10Builtins.map(slug=>{
  const record=rm6RouteEntries(routeState).find((x:any)=>x.slug===slug);
  return {slug,title:record?.label||slug,kind:'BUILTIN',path:record?.path||('/'+slug),target:record?.target||'',
   aliases:record?.aliases||[],status:state.builtins[slug]||'PUBLISHED'};
 });
 const custom=state.custom.map(c=>({...c,kind:'CUSTOM',path:'/p/'+c.slug,target:'/p/'+c.slug,aliases:[]}));
 return [...builtins,...custom];
}
function r10ValidStart(state:R10State,slug:string):boolean{
 if(r10Builtins.includes(slug))return state.builtins[slug]==='PUBLISHED';
 return state.custom.some(c=>c.slug===slug&&c.status==='PUBLISHED');
}
async function r10Payload(db:any=prisma){
 const [state,routes]=await Promise.all([r10Read(db),rm6State(db,true)]);
 const pages=r10Entries(state,routes);
 let chosen=pages.find(p=>p.slug===state.start&&p.status==='PUBLISHED');
 if(!chosen)chosen=pages.find(p=>p.slug==='index');
 return {version:state.version,start:chosen?.slug||'index',startPath:chosen?.path||'/miniapp/index.html',engine:state.engine,pages};
}
const r10EditSchema=z.object({status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']).optional(),title:z.string().trim().min(1).max(120).optional()}).strict();
app.get('/public/page-lifecycle',async(_request,reply)=>{
 reply.header('Cache-Control','no-store');return await r10Payload();
});
app.get('/admin/page-lifecycle',async(request,reply)=>{
 if(!(await r10Owner(request,reply)))return;
 reply.header('Cache-Control','no-store');return await r10Payload();
});
app.post('/admin/page-lifecycle',async(request,reply)=>{
 if(!(await r10Owner(request,reply)))return;
 const v=z.object({slug:r10SlugSchema,title:z.string().trim().min(1).max(120),expectedVersion:z.number().int().min(0)}).strict().safeParse(request.body);
 if(!v.success)return reply.code(400).send({error:'invalid_page'});
 const {slug,title,expectedVersion}=v.data;
 if(r10Builtins.includes(slug)||['admin','api','miniapp','public','health','content','p74','p62'].includes(slug))return reply.code(409).send({error:'reserved_slug'});
 const result=await prisma.$transaction(async tx=>{
  const state=await r10Read(tx);
  if(state.version!==expectedVersion)return {error:'stale_version'};
  if(state.custom.some(x=>x.slug===slug))return {error:'slug_exists'};
  if(state.custom.length>=70)return {error:'page_limit'};
  if(await tx.contentPage.findUnique({where:{slug}}))return {error:'cms_slug_in_use'};
  const blocks=[{type:'heading',text:title},{type:'text',text:'متن صفحه را از پنل ویرایش کنید.'}];
  await tx.contentPageDraft.create({data:{slug,title,blocks}});
  state.custom.push({slug,title,status:'DRAFT'});
  await r10Write(tx,state,adminIdOf(request),'R10_PAGE_CREATED',{slug});
  return {ok:true,path:'/p/'+slug,version:state.version};
 });
 if('error' in result)return reply.code(409).send(result);
 return result;
});
app.patch('/admin/page-lifecycle/:slug',async(request,reply)=>{
 if(!(await r10Owner(request,reply)))return;
 const params=z.object({slug:z.string()}).safeParse(request.params);
 const body=r10EditSchema.extend({expectedVersion:z.number().int().min(0)}).safeParse(request.body);
 if(!params.success||!body.success)return reply.code(400).send({error:'invalid_request'});
 const slug=params.data.slug;
 const result=await withContentLock(prisma,slug,async tx=>{
  const state=await r10Read(tx);
  if(state.version!==body.data.expectedVersion)return {error:'stale_version'};
  const builtin=r10Builtins.includes(slug),page=state.custom.find(p=>p.slug===slug);
  if(!builtin&&!page)return {error:'page_not_found'};
  if(body.data.title&&builtin)return {error:'builtin_title_locked'};
  if(body.data.status==='ARCHIVED'&&state.start===slug)return {error:'select_another_start_first'};
  if(builtin){if(body.data.status==='DRAFT')return {error:'builtin_cannot_be_draft'};if(body.data.status)state.builtins[slug]=body.data.status;}
  else if(page){
   if(body.data.title){page.title=body.data.title;await tx.contentPageDraft.updateMany({where:{slug},data:{title:page.title}});}
   if(body.data.status){
    if(body.data.status==='ARCHIVED'&&page.status!=='ARCHIVED')page.previousStatus=page.status==='PUBLISHED'?'PUBLISHED':'DRAFT';
    if(body.data.status==='PUBLISHED'){
     const published=await tx.contentPage.findUnique({where:{slug}});
     if(!published||published.status!=='PUBLISHED')return {error:'publish_content_first'};
    }
    page.status=body.data.status;
   }
  }
  await r10Write(tx,state,adminIdOf(request),'R10_PAGE_UPDATED',{slug,status:body.data.status,title:body.data.title});
  return {ok:true,version:state.version};
 });
 if('error' in result)return reply.code(409).send(result);
 return result;
});
app.post('/admin/page-lifecycle/start',async(request,reply)=>{
 if(!(await r10Owner(request,reply)))return;
 const b=z.object({slug:z.string().max(60),engine:r10Engine,expectedVersion:z.number().int().min(0)}).strict().safeParse(request.body);
 if(!b.success)return reply.code(400).send({error:'invalid_request'});
 const result=await prisma.$transaction(async tx=>{
  const state=await r10Read(tx);
  if(state.version!==b.data.expectedVersion)return {error:'stale_version'};
  if(!r10ValidStart(state,b.data.slug))return {error:'start_not_published'};
  state.start=b.data.slug;state.engine=b.data.engine;
  await r10Write(tx,state,adminIdOf(request),'R10_START_CHANGED',{slug:state.start,engine:state.engine});
  return {ok:true,version:state.version};
 });
 if('error' in result)return reply.code(409).send(result);
 return result;
});
app.get('/admin/page-lifecycle/:slug/draft',async(request,reply)=>{
 if(!(await r10Owner(request,reply)))return;
 const slug=String((request.params as any).slug||'');
 const state=await r10Read();const page=state.custom.find(x=>x.slug===slug);
 if(!page)return reply.code(404).send({error:'custom_page_not_found'});
 const [draft,published]=await Promise.all([prisma.contentPageDraft.findUnique({where:{slug}}),prisma.contentPage.findUnique({where:{slug}})]);
 return {slug,title:draft?.title??published?.title??page.title,blocks:draft?.blocks??published?.blocks??[],revision:contentRevision(draft??published),status:page.status};
});
app.put('/admin/page-lifecycle/:slug/draft',async(request,reply)=>{
 if(!(await r10Owner(request,reply)))return;
 const slug=String((request.params as any).slug||'');
 const v=z.object({expectedRevision:z.string().regex(/^[a-f0-9]{64}$/).optional(),title:z.string().trim().min(1).max(120),blocks:z.array(blockSchema).max(220)}).strict().safeParse(request.body);
 if(!v.success)return reply.code(400).send({error:'invalid_blocks',details:v.error.flatten()});
 const state=await r10Read();if(!state.custom.some(x=>x.slug===slug))return reply.code(404).send({error:'custom_page_not_found'});
 const saved=await withContentLock(prisma,slug,async tx=>{
  const current=await tx.contentPageDraft.findUnique({where:{slug}})??await tx.contentPage.findUnique({where:{slug}});
  assertContentRevision(current,v.data.expectedRevision);
  const saved=await tx.contentPageDraft.upsert({where:{slug},create:{slug,title:v.data.title,blocks:toInputJson(v.data.blocks as unknown as Prisma.JsonValue)},update:{title:v.data.title,blocks:toInputJson(v.data.blocks as unknown as Prisma.JsonValue)}});
  await tx.auditLog.create({data:{adminUserId:adminIdOf(request),action:'R10_PAGE_DRAFT_SAVED',entityType:'PageLifecycle',entityId:slug}});
  return saved;
 });
 return {ok:true,revision:contentRevision(saved)};
});
app.post('/admin/page-lifecycle/:slug/publish',async(request,reply)=>{
 if(!(await r10Owner(request,reply)))return;
 const slug=String((request.params as any).slug||'');
 const body=z.object({expectedRevision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().safeParse(request.body??{});
 if(!body.success)return reply.code(400).send({error:'invalid_request'});
 const result=await withContentLock(prisma,slug,async tx=>{
  const state=await r10Read(tx);
  const page=state.custom.find(x=>x.slug===slug);
  if(!page)return {error:'custom_page_not_found'};
  const draft=await tx.contentPageDraft.findUnique({where:{slug}});
  assertContentRevision(draft,body.data.expectedRevision);
  const validated=draft&&z.array(blockSchema).max(220).safeParse(draft.blocks);
  if(!draft||!validated||!validated.success)return {error:'draft_invalid_or_missing'};
  await tx.contentPage.upsert({where:{slug},create:{slug,title:draft.title,blocks:toInputJson(validated.data as unknown as Prisma.JsonValue),status:'PUBLISHED'},update:{title:draft.title,blocks:toInputJson(validated.data as unknown as Prisma.JsonValue),status:'PUBLISHED'}});
  const latest=await tx.contentPageVersion.aggregate({where:{pageSlug:slug},_max:{version:true}});
  await tx.contentPageVersion.create({data:{pageSlug:slug,version:(latest._max.version??0)+1,title:draft.title,blocks:toInputJson(validated.data as unknown as Prisma.JsonValue),status:'PUBLISHED',createdByAdminId:adminIdOf(request)}});
  page.title=draft.title||page.title;page.status='PUBLISHED';
  await r10Write(tx,state,adminIdOf(request),'R10_PAGE_PUBLISHED',{slug});
  return {ok:true,version:state.version};
 });
 if('error' in result)return reply.code(409).send(result);
 return result;
});
app.get('/public/page-lifecycle/content/:slug',async(request,reply)=>{
 const slug=String((request.params as any).slug||'');
 const state=await r10Read();
 if(!state.custom.some(p=>p.slug===slug&&p.status==='PUBLISHED'))return reply.code(404).send({error:'page_unavailable'});
 const page=await prisma.contentPage.findUnique({where:{slug},select:{title:true,blocks:true,status:true}});
 if(!page||page.status!=='PUBLISHED')return reply.code(404).send({error:'page_unpublished'});
 reply.header('cache-control','no-store');return {title:page.title,blocks:page.blocks};
});
// R10.2: public page handled by early onRequest hook above.
// MMTRADE_PAGE_LIFECYCLE_R10_API_END

// EPLANET_OFFICIAL_R2_BEGIN
// ePlanet onboarding uses existing SystemSetting, User and EplanetUserWorkflow records.
// All mutations are serialized inside this single API process to prevent lost JSON updates.
const eplanetStoreKey = 'EPLANET_ONBOARDING_V1';
const eplanetStepKeys = ['registration','deposit','connect','activation'] as const;
const eplanetTeamSteps = ['ACCOUNT_CREATED','DEPOSIT_COMPLETED','COPY_CONNECTED','CHALLENGE_PARTICIPANT'] as const;
const eplanetWorkflowFields = ['accountCreated','depositCompleted','copyConnected','challengeParticipant'] as const;
const eplanetDefaults:any = {
 title:'مسیر اتصال به ePlanet',
 subtitle:'از افتتاح حساب تا فعال‌سازی سیستم کپی‌ترید',
 registerUrl:'',
 heroImage:'assets/icon-eplanet.webp',
 steps:[
  {key:'registration',title:'Registration',fa:'ثبت‌نام و افتتاح حساب ePlanet',description:'حساب ePlanet را ایجاد کنید و شناسه حساب معاملاتی را ثبت کنید.',externalUrl:'',imageUrl:'assets/icon-registration.webp'},
  {key:'deposit',title:'Deposit',fa:'واریز و شارژ حساب معاملاتی',description:'واریز وجه را انجام دهید و درخواست بررسی را ارسال کنید.',externalUrl:'',imageUrl:'assets/icon-deposit.webp'},
  {key:'connect',title:'Connect to MMTrade',fa:'اتصال حساب به سیستم معاملاتی',description:'اطلاعات حساب را طبق راهنمای اتصال ثبت کنید.',externalUrl:'',imageUrl:'assets/icon-connect.webp'},
  {key:'activation',title:'Activate Copy Trading',fa:'فعال‌سازی کپی‌ترید',description:'کپی‌ترید را فعال کنید و درخواست تأیید نهایی را ارسال کنید.',externalUrl:'',imageUrl:'assets/icon-activate.webp'}
 ]
};

let eplanetMutationTail:Promise<void> = Promise.resolve();
async function eplanetSerialize<T>(work:()=>Promise<T>):Promise<T>{
 const previous=eplanetMutationTail;
 let release!:()=>void;
 eplanetMutationTail=new Promise<void>(resolve=>{release=resolve});
 await previous;
 try{return await work()}
 finally{release()}
}

function eplanetUrl(value:unknown):string{
 if(typeof value!=='string'||!value.trim())return '';
 try{
  const url=new URL(value);
  return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.toString():'';
 }catch{return ''}
}
function eplanetImage(value:unknown,fallback:string):string{
 if(typeof value!=='string'||!value.trim())return fallback;
 const image=value.trim();
 if(/^assets\/[A-Za-z0-9._/-]+$/.test(image)&&!image.includes('..'))return image;
 return eplanetUrl(image)||fallback;
}
function eplanetConfig(raw:any){
 const value=raw&&typeof raw==='object'?raw:{};
 const sourceSteps=Array.isArray(value.steps)?value.steps:[];
 return {
  title:typeof value.title==='string'?value.title.slice(0,120):eplanetDefaults.title,
  subtitle:typeof value.subtitle==='string'?value.subtitle.slice(0,240):eplanetDefaults.subtitle,
  registerUrl:eplanetUrl(value.registerUrl),
  heroImage:eplanetImage(value.heroImage,eplanetDefaults.heroImage),
  steps:eplanetStepKeys.map((key,index)=>{
   const step=sourceSteps.find((item:any)=>item?.key===key)||eplanetDefaults.steps[index];
   return {
    key,
    title:typeof step.title==='string'?step.title.slice(0,100):eplanetDefaults.steps[index].title,
    fa:typeof step.fa==='string'?step.fa.slice(0,160):eplanetDefaults.steps[index].fa,
    description:typeof step.description==='string'?step.description.slice(0,700):eplanetDefaults.steps[index].description,
    externalUrl:eplanetUrl(step.externalUrl),
    imageUrl:eplanetImage(step.imageUrl,eplanetDefaults.steps[index].imageUrl)
   };
  })
 };
}
async function eplanetRead(db:any=prisma):Promise<any>{
 const row=await db.systemSetting.findUnique({
  where:{key:eplanetStoreKey},select:{value:true}
 });
 const stored:any=row?.value||{};
 return {
  config:eplanetConfig(stored.config),
  requests:Array.isArray(stored.requests)
   ?stored.requests.filter((item:any)=>item&&typeof item.id==='string').slice(-1500)
   :[]
 };
}
async function eplanetWrite(db:any,value:any){
 await db.systemSetting.upsert({
  where:{key:eplanetStoreKey},
  create:{key:eplanetStoreKey,value:value as unknown as Prisma.InputJsonValue},
  update:{value:value as unknown as Prisma.InputJsonValue}
 });
}
function eplanetStatuses(workflow:any,requests:any[]){
 const completed=eplanetWorkflowFields.map(field=>workflow?.[field]===true);
 let blocked=false;
 return Object.fromEntries(eplanetStepKeys.map((key,index)=>{
  let status='locked';
  if(!blocked&&!completed[index]){
   const request=[...requests].reverse().find((item:any)=>item.step===key&&item.status==='pending');
   const rejected=[...requests].reverse().find((item:any)=>item.step===key&&item.status==='rejected');
   status=request?'pending':rejected?'rejected':'available';
  }
  if(!completed[index])blocked=true;
  return [key,{status}];
 }));
}

app.get('/miniapp/eplanet/config',async(_request,reply)=>{
 reply.header('Cache-Control','no-store');
 const state=await eplanetRead();
 return {ok:true,config:state.config};
});

app.post('/miniapp/eplanet/status',async(request,reply)=>{
 reply.header('Cache-Control','no-store');
 const parsed=z.object({initData:z.string().min(1).max(10000)}).strict().safeParse(request.body);
 if(!parsed.success)return reply.code(400).send({error:'invalid_request'});
 const user=await miniUser(parsed.data.initData,false);
 if('code'in user)return reply.code(user.code).send({error:user.error});
 const [record,state]=await Promise.all([
  prisma.user.findUnique({where:{id:user.id},select:{id:true,eplanetWorkflow:true}}),
  eplanetRead()
 ]);
 if(!record)return reply.code(404).send({error:'user_not_found'});
 return {
  ok:true,
  steps:eplanetStatuses(
   record.eplanetWorkflow,
   state.requests.filter((item:any)=>item.userId===user.id)
  ),
  version:record.eplanetWorkflow?.version??0
 };
});

app.post('/miniapp/eplanet/submit',async(request,reply)=>{
 const parsed=z.object({
  initData:z.string().min(1).max(10000),
  step:z.enum(eplanetStepKeys),
  accountId:z.string().trim().max(100).optional()
 }).strict().safeParse(request.body);
 if(!parsed.success)return reply.code(400).send({error:'invalid_request'});
 const user=await miniUser(parsed.data.initData,false);
 if('code'in user)return reply.code(user.code).send({error:user.error});
 const index=eplanetStepKeys.indexOf(parsed.data.step);
 const record=await prisma.user.findUnique({
  where:{id:user.id},select:{id:true,eplanetWorkflow:true}
 });
 if(!record)return reply.code(404).send({error:'user_not_found'});
 const completed=eplanetWorkflowFields.map(field=>record.eplanetWorkflow?.[field]===true);
 if(completed.slice(0,index).some(value=>!value)||completed[index])
  return reply.code(409).send({error:'step_not_available'});
 if(index===0&&!parsed.data.accountId?.trim())
  return reply.code(400).send({error:'account_id_required'});

 return eplanetSerialize(async()=>{
  const state=await eplanetRead();
  if(state.requests.some((item:any)=>
   item.userId===user.id&&item.step===parsed.data.step&&item.status==='pending'
  ))return reply.code(409).send({error:'request_already_pending'});
  const requestId=customPageRandomUUID();
  state.requests.push({
   id:requestId,userId:user.id,step:parsed.data.step,
   accountId:parsed.data.accountId?.trim()||'',
   status:'pending',createdAt:new Date().toISOString()
  });
  state.requests=state.requests.slice(-1500);
  await eplanetWrite(prisma,state);
  return reply.code(201).send({ok:true,status:'pending',requestId});
 });
});

app.get('/miniapp/eplanet/admin/requests',async(request,reply)=>{
 const actor=await p37SuperSession(request,reply);
 if(!actor)return;
 const state=await eplanetRead();
 const pending=state.requests.filter((item:any)=>item.status==='pending');
 const ids=[...new Set<string>(pending.map((item:any)=>String(item.userId)))];
 const users=ids.length?await prisma.user.findMany({
  where:{id:{in:ids}},
  select:{id:true,telegramId:true,username:true,firstName:true,lastName:true}
 }):[];
 const usersById=new Map(users.map((user:any)=>[user.id,user]));
 return {
  ok:true,
  items:pending.map((item:any)=>({...item,user:usersById.get(item.userId)||null})).reverse()
 };
});

app.put('/miniapp/eplanet/admin/config',async(request,reply)=>{
 const actor=await p37SuperSession(request,reply);
 if(!actor)return;
 const stepSchema=z.object({
  key:z.enum(eplanetStepKeys),
  title:z.string().trim().min(1).max(100),
  fa:z.string().trim().min(1).max(160),
  description:z.string().max(700),
  externalUrl:z.string().max(1000).optional().default(''),
  imageUrl:z.string().max(1000).optional().default('')
 }).strict();
 const parsed=z.object({
  title:z.string().trim().min(1).max(120),
  subtitle:z.string().max(240),
  registerUrl:z.string().max(1000).optional().default(''),
  heroImage:z.string().max(1000).optional().default(''),
  steps:z.array(stepSchema).length(4)
 }).strict().safeParse(request.body);
 if(!parsed.success)return reply.code(400).send({error:'invalid_config'});
 const value=parsed.data;
 if(
  (value.registerUrl&&!eplanetUrl(value.registerUrl))||
  (value.heroImage&&!eplanetImage(value.heroImage,''))||
  value.steps.some(step=>
   (step.externalUrl&&!eplanetUrl(step.externalUrl))||
   (step.imageUrl&&!eplanetImage(step.imageUrl,''))
  )
 )return reply.code(400).send({error:'invalid_url'});
 if(new Set(value.steps.map(step=>step.key)).size!==4)
  return reply.code(400).send({error:'duplicate_step_key'});

 return eplanetSerialize(async()=>{
  const state=await eplanetRead();
  state.config=eplanetConfig(value);
  await prisma.$transaction(async tx=>{
   await eplanetWrite(tx,state);
   await tx.auditLog.create({
    data:{
     adminUserId:actor.id,
     action:'EPLANET_CONTENT_UPDATED',
     entityType:'SystemSetting',
     entityId:eplanetStoreKey,
     metadata:{steps:4}
    }
   });
  });
  return {ok:true,config:state.config};
 });
});

app.post('/miniapp/eplanet/admin/requests/:id/decision',async(request,reply)=>{
 const actor=await p37SuperSession(request,reply);
 if(!actor)return;
 const params=z.object({id:z.string().min(1).max(100)}).safeParse(request.params);
 const parsed=z.object({
  approved:z.boolean(),
  note:z.string().trim().max(500).optional()
 }).strict().safeParse(request.body);
 if(!params.success||!parsed.success)
  return reply.code(400).send({error:'invalid_request'});

 return eplanetSerialize(async()=>{
  const state=await eplanetRead();
  const item=state.requests.find((entry:any)=>entry.id===params.data.id);
  if(!item||item.status!=='pending')
   return reply.code(404).send({error:'pending_request_not_found'});

  const stepIndex=eplanetStepKeys.indexOf(item.step);
  if(stepIndex<0)return reply.code(409).send({error:'invalid_stored_request_step'});
  if(parsed.data.approved){
   const current=await prisma.eplanetUserWorkflow.findUnique({
    where:{userId:item.userId},
    select:{
     version:true,accountCreated:true,depositCompleted:true,
     copyConnected:true,challengeParticipant:true
    }
   });
   const workflowField=eplanetWorkflowFields[stepIndex];
   // Idempotent recovery: if workflow committed but queue write failed, finish the queue decision.
   if(current?.[workflowField]!==true){
    const result=await p37ChangeWorkflow(item.userId,{
     step:eplanetTeamSteps[stepIndex],
     approved:true,
     version:current?.version??0,
     ...(item.step==='registration'&&item.accountId?{accountId:item.accountId}:{}),
     ...(parsed.data.note!==undefined?{note:parsed.data.note}:{})
    },{adminUserId:actor.id});
    if('error'in result)
     return reply.code(result.status??409).send({error:result.error});
   }
   item.status='approved';
  }else{
   item.status='rejected';
   item.note=parsed.data.note||'نیازمند اصلاح';
  }
  item.decidedAt=new Date().toISOString();
  item.decidedBy=actor.id;
  await prisma.$transaction(async tx=>{
   await eplanetWrite(tx,state);
   await tx.auditLog.create({
    data:{
     adminUserId:actor.id,
     action:'EPLANET_REQUEST_DECIDED',
     entityType:'EplanetOnboardingRequest',
     entityId:item.id,
     metadata:{step:item.step,approved:parsed.data.approved}
    }
   });
  });
  return {ok:true,status:item.status};
 });
});
// EPLANET_OFFICIAL_R2_END


// MMVS_SPATIAL_R4_API_BEGIN
// MMVS R7: optional lock, reversible hide, z-index and opacity. Existing R4 layouts remain valid.
// Super-admin-only position editor. Stored in existing SystemSetting JSON; no migration.
const mmvsSpatialSlug = z.enum(PAGE_SLUGS);
// MMVS_R9_ANIMATION_SCHEMA: existing layout, optional per-object movement.
const mmvsSpatialAnimation = z.object({
  kind: z.enum(['float','spin','sway','pulse']),
  durationMs: z.number().int().min(400).max(30000),
  amplitude: z.number().finite().min(1).max(150),
  delayMs: z.number().int().min(0).max(10000),
  loop: z.boolean()
}).strict();
// MMVS_R99_BACKGROUND_STUDIO: backward-compatible layered section backgrounds.
const mmvsBgUrl = z.string().min(1).max(2048).refine(v => !v.startsWith('//') && /\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i.test(v) && (v.startsWith('/') || /^https:\/\//i.test(v) || /^http:\/\//i.test(v)), 'invalid_background_url');
const mmvsBgColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const mmvsBgStop = z.object({color:mmvsBgColor,at:z.number().finite().min(0).max(100),alpha:z.number().finite().min(0).max(1).optional()}).strict();
const mmvsBgLayerBase = {
  id:z.string().regex(/^bg-[A-Za-z0-9_-]{1,80}$/),
  enabled:z.boolean(),
  opacity:z.number().finite().min(0).max(1),
  blur:z.number().finite().min(0).max(30),
  blend:z.enum(['normal','screen','multiply','overlay','soft-light'])
};
const mmvsBgLayer = z.discriminatedUnion('type',[
  z.object({...mmvsBgLayerBase,type:z.literal('solid'),color:mmvsBgColor}).strict(),
  z.object({...mmvsBgLayerBase,type:z.literal('linear'),angle:z.number().finite().min(0).max(360),stops:z.array(mmvsBgStop).min(2).max(5)}).strict(),
  z.object({...mmvsBgLayerBase,type:z.literal('radial'),centerX:z.number().finite().min(0).max(100),centerY:z.number().finite().min(0).max(100),shape:z.enum(['circle','ellipse']).optional(),stops:z.array(mmvsBgStop).min(2).max(5)}).strict(),
  z.object({...mmvsBgLayerBase,type:z.literal('image'),url:mmvsBgUrl,fit:z.enum(['cover','contain','fill']),positionX:z.number().finite().min(0).max(100),positionY:z.number().finite().min(0).max(100)}).strict()
]);
const mmvsSectionBackground = z.object({
  url: mmvsBgUrl.optional(),
  fit: z.enum(['cover','contain']).optional(),
  position: z.enum(['center','top','bottom']).optional(),
  dim: z.number().finite().min(0).max(0.8).optional(),
  sourceSelector: z.string().min(1).max(500).optional(),
  layers: z.array(mmvsBgLayer).min(1).max(8).optional()
}).strict().refine(bg => {
  const legacy = bg.url!==undefined && bg.fit!==undefined && bg.position!==undefined && bg.dim!==undefined;
  const layered = Array.isArray(bg.layers) && bg.layers.length>=1;
  return legacy || layered;
}, 'invalid_section_background');

const mmvsSpatialItem = z.object({
  selector: z.string().min(1).max(500).refine(v => !v.startsWith('#p74-home-config') && !v.startsWith('#p77-profile-config') && !v.startsWith('#mmvs-spatial-'), 'reserved_selector'),
  x: z.number().finite().min(-4000).max(4000),
  y: z.number().finite().min(-4000).max(4000),
  scale: z.number().finite().min(0.2).max(4),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  zIndex: z.number().int().min(-1000).max(20000).optional(),
  opacity: z.number().finite().min(0.05).max(1).optional(),
  widthPx: z.number().int().min(24).max(1600).optional(),
  heightPx: z.number().int().min(16).max(1600).optional(),
  // MMVS_V2_LAYER_METADATA: optional, backward-compatible; legacy zIndex untouched.
  layerId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  groupId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  rank: z.number().int().min(1).max(500).optional(),
  renderPlane: z.enum(['native','free']).optional(),
  animation: mmvsSpatialAnimation.optional(),
  sectionBackground: mmvsSectionBackground.optional()
}).strict();
const mmvsSpatialLayout = z.object({
  items: z.array(mmvsSpatialItem).max(500),
  // MMVS_DOM_ORDER_R85_SCHEMA - persisted DOM sibling/parent operations.
  domMoves: z.array(z.object({
    selector: z.string().min(1).max(500),
    reference: z.string().min(1).max(500),
    placement: z.enum(['before','after','inside'])
  }).strict()).max(80).optional()
}).strict().superRefine((value, ctx) => {
  const unique = new Set<string>();
  for(const [i, item] of value.items.entries()) {
    if(unique.has(item.selector))ctx.addIssue({code:'custom',path:['items',i,'selector'],message:'duplicate_selector'});
    unique.add(item.selector);
  }
});
type MmvsSpatialLayout = z.infer<typeof mmvsSpatialLayout>;
type MmvsSpatialHistory = {revision:number;at:string;layout:MmvsSpatialLayout};
type MmvsSpatialState = {version:1;revision:number;published:MmvsSpatialLayout;draft:MmvsSpatialLayout|null;history:MmvsSpatialHistory[]};
const mmvsSpatialEmpty = ():MmvsSpatialLayout => ({items:[]});
const mmvsSpatialKey = (slug:string) => 'MMVS_SPATIAL_R4_'+slug;
const mmvsSpatialCopy = <T>(obj:T):T => JSON.parse(JSON.stringify(obj));
async function mmvsSpatialRead(slug:string,db:Prisma.TransactionClient|PrismaClient=prisma):Promise<MmvsSpatialState>{
  const row=await db.systemSetting.findUnique({where:{key:mmvsSpatialKey(slug)},select:{value:true}});
  const value:any=row?.value;
  if(!value || typeof value!=='object' || Array.isArray(value) || value.version!==1) return {version:1,revision:0,published:mmvsSpatialEmpty(),draft:null,history:[]};
  const published=mmvsSpatialLayout.safeParse(value.published);
  const draft=value.draft==null?null:mmvsSpatialLayout.safeParse(value.draft);
  if(!published.success || (draft && !draft.success) || !Number.isSafeInteger(value.revision)||value.revision<0)throw Error('MMVS_SPATIAL_CORRUPT_STATE');
  return {version:1,revision:value.revision,published:published.data,draft:draft?draft.data:null,
    history:Array.isArray(value.history)?value.history.slice(-25):[]};
}
async function mmvsSpatialWrite(slug:string,state:MmvsSpatialState,request:FastifyRequest,action:string,tx:Prisma.TransactionClient){
    await tx.systemSetting.upsert({where:{key:mmvsSpatialKey(slug)},
      create:{key:mmvsSpatialKey(slug),value:state as unknown as Prisma.InputJsonValue},
      update:{value:state as unknown as Prisma.InputJsonValue}});
    await tx.auditLog.create({data:{adminUserId:adminIdOf(request),action,entityType:'VisualStudioSpatial',entityId:slug,
      metadata:{revision:state.revision,items:(state.draft??state.published).items.length}}});
}
async function mmvsSpatialOwner(request:FastifyRequest,reply:FastifyReply){
  if(!(await adminGuard(request,reply)))return false;
  if((request as any).admin?.role!=='SUPER_ADMIN'){reply.code(403).send({error:'super_admin_required'});return false;}
  return true;
}
app.get('/public/mmvs/layout/:slug',async(request,reply)=>{
  const p=z.object({slug:mmvsSpatialSlug}).safeParse(request.params);
  if(!p.success)return reply.code(404).send({error:'invalid_page'});
  reply.header('cache-control','no-store');
  const state=await mmvsSpatialRead(p.data.slug);
  return {revision:state.revision,layout:state.published};
});
app.get('/admin/mmvs/layout/:slug',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=z.object({slug:mmvsSpatialSlug}).safeParse(request.params);
  if(!p.success)return reply.code(404).send({error:'invalid_page'});
  reply.header('cache-control','no-store');
  return await mmvsSpatialRead(p.data.slug);
});
app.put('/admin/mmvs/layout/:slug/draft',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=z.object({slug:mmvsSpatialSlug}).safeParse(request.params);
  const b=z.object({expectedRevision:z.number().int().min(0),layout:mmvsSpatialLayout}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_spatial_layout'});
  return withContentLock(prisma,p.data.slug,async tx=>{
  const current=await mmvsSpatialRead(p.data.slug,tx);
  if(current.revision!==b.data.expectedRevision)return reply.code(409).send({error:'spatial_revision_conflict'});
  current.draft=mmvsSpatialCopy(b.data.layout);current.revision++;
  await mmvsSpatialWrite(p.data.slug,current,request,'MMVS_SPATIAL_DRAFT_SAVED',tx);
  return {ok:true,revision:current.revision};
  });
});
app.post('/admin/mmvs/layout/:slug/publish',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=z.object({slug:mmvsSpatialSlug}).safeParse(request.params);
  const b=z.object({expectedRevision:z.number().int().min(0)}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  return withContentLock(prisma,p.data.slug,async tx=>{
  const current=await mmvsSpatialRead(p.data.slug,tx);
  if(current.revision!==b.data.expectedRevision)return reply.code(409).send({error:'spatial_revision_conflict'});
  if(!current.draft)return reply.code(409).send({error:'spatial_draft_not_found'});
  current.published=mmvsSpatialCopy(current.draft);current.draft=null;current.revision++;
  current.history=[...current.history,{revision:current.revision,at:new Date().toISOString(),layout:mmvsSpatialCopy(current.published)}].slice(-25);
  await mmvsSpatialWrite(p.data.slug,current,request,'MMVS_SPATIAL_PUBLISHED',tx);
  return {ok:true,revision:current.revision};
  });
});
app.post('/admin/mmvs/layout/:slug/restore',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=z.object({slug:mmvsSpatialSlug}).safeParse(request.params);
  const b=z.object({expectedRevision:z.number().int().min(0),revision:z.number().int().positive()}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  return withContentLock(prisma,p.data.slug,async tx=>{
  const current=await mmvsSpatialRead(p.data.slug,tx);
  if(current.revision!==b.data.expectedRevision)return reply.code(409).send({error:'spatial_revision_conflict'});
  const snap=current.history.find((x:any)=>x.revision===b.data.revision);
  if(!snap)return reply.code(404).send({error:'spatial_version_not_found'});
  const parsed=mmvsSpatialLayout.safeParse(snap.layout);
  if(!parsed.success)return reply.code(409).send({error:'spatial_version_invalid'});
  current.draft=mmvsSpatialCopy(parsed.data);current.revision++;
  await mmvsSpatialWrite(p.data.slug,current,request,'MMVS_SPATIAL_RESTORED_TO_DRAFT',tx);
  return {ok:true,revision:current.revision};
  });
});
// MMVS_SPATIAL_R4_API_END

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
  z.object({ type: z.literal('html'), html: z.string().min(1).max(16000) }),
  z.object({
    type: z.literal('mm10_step'),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(3000)
  }),
  z.object({
    type: z.literal('element'),
    selector: z.string().trim().min(1).max(500),
    deleted: z.boolean().optional(),
    text: z.string().max(48000).optional(), // Object Studio layer configuration shares the P74 element marker.
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

// TENX_CUSTOM_PAGE_ADMIN_API_V1
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
    draftUpdatedAt: draft?.updatedAt ?? null, revision: contentRevision(source),
    isCustom: true, publicSlug: meta.publicSlug, publicPath: '/p/' + meta.publicSlug,
    published: { title: published?.title ?? null, blocks: Array.isArray(published?.blocks) ? published.blocks : [],
      status: published?.status ?? 'DRAFT', updatedAt: published?.updatedAt ?? null }
  };
});

app.put('/admin/custom-pages/:slug/draft', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  const b = z.object({ expectedRevision:z.string().regex(/^[a-f0-9]{64}$/).optional(), title: z.string().trim().max(200).nullable().optional(), blocks: z.array(blockSchema).max(220) }).strict().safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request', details: b.success ? undefined : b.error.flatten() });
  if (!(await tenxCustomPagesRead()).some(x => x.slug === p.data.slug)) return reply.code(404).send({ error: 'page_not_found' });
  const blocks = JSON.parse(JSON.stringify(b.data.blocks));
  const title = b.data.title ?? null;
  const saved = await withContentLock(prisma,p.data.slug,async tx => {
    const current=await tx.contentPageDraft.findUnique({where:{slug:p.data.slug}})??await tx.contentPage.findUnique({where:{slug:p.data.slug}});
    assertContentRevision(current,b.data.expectedRevision);
    const draft = await tx.contentPageDraft.upsert({ where: { slug: p.data.slug },
      create: { slug: p.data.slug, title, blocks }, update: { title, blocks } });
    const latest = await tx.contentPageVersion.aggregate({ where: { pageSlug: p.data.slug }, _max: { version: true } });
    await tx.contentPageVersion.create({ data: { pageSlug: p.data.slug, version: (latest._max.version ?? 0) + 1,
      title: draft.title, blocks: toInputJson(draft.blocks), status: 'DRAFT', createdByAdminId: adminIdOf(request) } });
    await tx.auditLog.create({ data: { adminUserId: adminIdOf(request), action: 'CUSTOM_PAGE_DRAFT_SAVED', entityType: 'ContentPageDraft', entityId: p.data.slug } });
    return draft;
  });
  return { ok: true, updatedAt: saved.updatedAt, revision:contentRevision(saved) };
});

app.post('/admin/custom-pages/:slug/publish', async (request, reply) => {
  if (!(await tenxCustomPageWriter(request, reply))) return;
  const p = z.object({ slug: tenxCustomSlugSchema }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });
  if (!(await tenxCustomPagesRead()).some(x => x.slug === p.data.slug)) return reply.code(404).send({ error: 'page_not_found' });
  const body=z.object({expectedRevision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().safeParse(request.body??{});
  if(!body.success)return reply.code(400).send({error:'invalid_request'});
  const published = await withContentLock(prisma,p.data.slug,async tx => {
    const draft = await tx.contentPageDraft.findUnique({ where: { slug: p.data.slug } });
    if (!draft) return null;
    assertContentRevision(draft,body.data.expectedRevision);
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
  const result = await withContentLock(prisma,p.data.slug,async tx => {
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


/* TENX_PAGE_FILES_MANAGER_R1_API_BEGIN */
const PM_R1_FS = await import('node:fs/promises');
const PM_R1_PATH = await import('node:path');
const PM_R1_CRYPTO = await import('node:crypto');

type PMR1Root = { id: string; label: string; path: string };
type PMR1File = {
  id: string; rootId: string; rootLabel: string; path: string;
  category: string; categoryLabel: string; size: number; modifiedAt: string;
  sha256: string | null; protected: boolean; protectionReason: string | null;
  absolutePath: string;
};

const PM_R1_ROOTS: PMR1Root[] = [
  { id: 'project', label: 'سورس کل پروژه', path: process.cwd() },
  { id: 'live-miniapp', label: 'مینی‌اپ منتشرشده', path: '/srv/tenx-public/miniapp' }
];
const PM_R1_SKIP_DIRS = new Set([
  '.git', 'node_modules', '.page-manager-trash', '.page-manager-stage',
  '.page-manager-backups', '.cache'
]);
const PM_R1_HTML_EXTS = new Set(['.html', '.htm']);
const PM_R1_TEXT_EXTS = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.css', '.json', '.md', '.yml', '.yaml'
]);
const PM_R1_MAX_WALK = 12000;
const PM_R1_MAX_PREVIEW = 1500000;
const PM_R1_PROTECTED = new Map<string, string>([
  ['project:public/miniapp/index.html', 'ورودی اصلی مینی‌اپ و میزبان اجرای P74 است. حذف این فایل هوم سه‌پله‌ای را از کار می‌اندازد.'],
  ['live-miniapp:index.html', 'نسخه زنده ورودی مینی‌اپ و میزبان اجرای P74 است.'],
  ['project:apps/api/public/admin.html', 'فایل اصلی پنل سوپرادمین است.'],
  ['project:apps/api/public/team.html', 'پنل مدیریت تیم به این فایل وابسته است.']
]);

function pmR1Id(rootId: string, rel: string): string {
  return PM_R1_CRYPTO.createHash('sha256').update(rootId + '\0' + rel).digest('hex').slice(0, 24);
}
function pmR1Category(rootId: string, rel: string): { category: string; label: string } {
  if (rootId === 'live-miniapp') return { category: 'live-miniapp', label: 'مینی‌اپ منتشرشده' };
  if (rel.startsWith('public/miniapp/')) return { category: 'miniapp-source', label: 'سورس مینی‌اپ' };
  if (rel.startsWith('apps/api/public/')) return { category: 'admin', label: 'پنل‌ها و رابط مدیریت' };
  if (rel.startsWith('academy-content/')) return { category: 'academy-archive', label: 'نسخه‌ها و آرشیو آکادمی' };
  if (rel.startsWith('public/')) return { category: 'public', label: 'سایر فایل‌های عمومی' };
  if (rel.startsWith('apps/')) return { category: 'application', label: 'بخش‌های داخلی برنامه' };
  if (rel.startsWith('tests/')) return { category: 'tests', label: 'تست‌ها' };
  if (rel.startsWith('dist/') || rel.startsWith('coverage/')) return { category: 'generated', label: 'خروجی‌های ساخته‌شده' };
  return { category: 'project', label: 'سایر فایل‌های پروژه' };
}
function pmR1Protected(rootId: string, rel: string): string | null {
  return PM_R1_PROTECTED.get(rootId + ':' + rel) ?? null;
}
async function pmR1Root(rootId: string): Promise<PMR1Root | null> {
  const root = PM_R1_ROOTS.find(x => x.id === rootId);
  if (!root) return null;
  try {
    const st = await PM_R1_FS.stat(root.path);
    if (!st.isDirectory()) return null;
    return root;
  } catch { return null; }
}
async function pmR1Resolve(root: PMR1Root, rel: string): Promise<string> {
  if (!rel || rel.includes('\0') || PM_R1_PATH.isAbsolute(rel)) throw new Error('INVALID_PATH');
  const normalized = rel.replace(/\\/g, '/');
  if (normalized.split('/').some((part: string) => part === '..' || part === '.')) throw new Error('INVALID_PATH');
  const rootReal = await PM_R1_FS.realpath(root.path);
  const absolute = PM_R1_PATH.resolve(rootReal, normalized);
  if (!absolute.startsWith(rootReal + PM_R1_PATH.sep)) throw new Error('PATH_OUTSIDE_ROOT');
  const st = await PM_R1_FS.lstat(absolute);
  if (st.isSymbolicLink() || !st.isFile()) throw new Error('NOT_REGULAR_FILE');
  const real = await PM_R1_FS.realpath(absolute);
  if (!real.startsWith(rootReal + PM_R1_PATH.sep)) throw new Error('PATH_OUTSIDE_ROOT');
  return real;
}
async function pmR1Walk(root: PMR1Root, extensions: Set<string>): Promise<Array<{ absolutePath: string; path: string; size: number; modifiedAt: string }>> {
  const found: Array<{ absolutePath: string; path: string; size: number; modifiedAt: string }> = [];
  const stack: Array<{ absolutePath: string; path: string }> = [{ absolutePath: root.path, path: '' }];
  while (stack.length && found.length < PM_R1_MAX_WALK) {
    const current = stack.pop()!;
    let entries: any[];
    try { entries = await PM_R1_FS.readdir(current.absolutePath, { withFileTypes: true }) as any[]; }
    catch { continue; }
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue;
      const rel = current.path ? current.path + '/' + entry.name : entry.name;
      const absolutePath = PM_R1_PATH.join(current.absolutePath, entry.name);
      if (entry.isDirectory()) {
        if (!PM_R1_SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.page-manager-')) {
          stack.push({ absolutePath, path: rel });
        }
        continue;
      }
      if (!entry.isFile() || !extensions.has(PM_R1_PATH.extname(entry.name).toLowerCase())) continue;
      try {
        const st = await PM_R1_FS.stat(absolutePath);
        found.push({ absolutePath, path: rel, size: st.size, modifiedAt: st.mtime.toISOString() });
      } catch {}
      if (found.length >= PM_R1_MAX_WALK) break;
    }
  }
  return found;
}
async function pmR1ListFiles(): Promise<PMR1File[]> {
  const out: PMR1File[] = [];
  for (const rootDef of PM_R1_ROOTS) {
    const root = await pmR1Root(rootDef.id);
    if (!root) continue;
    const files = await pmR1Walk(root, PM_R1_HTML_EXTS);
    for (const file of files) {
      const cat = pmR1Category(root.id, file.path);
      const protectionReason = pmR1Protected(root.id, file.path);
      let sha256: string | null = null;
      if (file.size <= 8 * 1024 * 1024) {
        try {
          const bytes = await PM_R1_FS.readFile(file.absolutePath);
          sha256 = PM_R1_CRYPTO.createHash('sha256').update(bytes).digest('hex');
        } catch {}
      }
      out.push({
        id: pmR1Id(root.id, file.path), rootId: root.id, rootLabel: root.label,
        path: file.path, category: cat.category, categoryLabel: cat.label,
        size: file.size, modifiedAt: file.modifiedAt, sha256,
        protected: Boolean(protectionReason), protectionReason,
        absolutePath: file.absolutePath
      });
    }
  }
  return out.sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel, 'fa') || a.path.localeCompare(b.path));
}
async function pmR1References(target: PMR1File): Promise<Array<{ root: string; path: string; line: number; excerpt: string }>> {
  const needles = new Set<string>();
  needles.add(target.path);
  const basename = PM_R1_PATH.posix.basename(target.path);
  if (!['index.html', 'admin.html', 'team.html', 'preview.html', 'source.html', 'live.html'].includes(basename.toLowerCase()) && basename.length > 7) needles.add(basename);
  if (target.rootId === 'live-miniapp') {
    needles.add('/miniapp/' + target.path);
    needles.add('miniapp/' + target.path);
  } else if (target.path.startsWith('public/miniapp/')) {
    const miniRel = target.path.slice('public/'.length);
    needles.add(miniRel);
    needles.add('/' + miniRel);
  } else if (target.path.startsWith('public/')) {
    needles.add(target.path.slice('public/'.length));
    needles.add('/' + target.path.slice('public/'.length));
  }
  const refs: Array<{ root: string; path: string; line: number; excerpt: string }> = [];
  for (const rootDef of PM_R1_ROOTS) {
    const root = await pmR1Root(rootDef.id);
    if (!root) continue;
    const candidates = await pmR1Walk(root, PM_R1_TEXT_EXTS);
    for (const candidate of candidates) {
      if (root.id === target.rootId && candidate.path === target.path) continue;
      if (candidate.size > 2 * 1024 * 1024) continue;
      let content = '';
      try { content = await PM_R1_FS.readFile(candidate.absolutePath, 'utf8'); } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if ([...needles].some(n => n && line.includes(n))) {
          refs.push({ root: root.label, path: candidate.path, line: i + 1, excerpt: line.trim().slice(0, 260) });
          if (refs.length >= 80) return refs;
        }
      }
    }
  }
  return refs;
}
function pmR1TrashRoot(root: PMR1Root): string {
  return root.id === 'live-miniapp'
    ? PM_R1_PATH.join(PM_R1_PATH.dirname(root.path), '.page-manager-trash')
    : PM_R1_PATH.join(root.path, '.page-manager-trash');
}
async function pmR1TrashItems(): Promise<any[]> {
  const items: any[] = [];
  for (const rootDef of PM_R1_ROOTS) {
    const root = await pmR1Root(rootDef.id);
    if (!root) continue;
    const trashRoot = pmR1TrashRoot(root);
    let dirs: any[] = [];
    try { dirs = await PM_R1_FS.readdir(trashRoot, { withFileTypes: true }) as any[]; } catch { continue; }
    for (const dir of dirs) {
      if (!dir.isDirectory() || !/^\d+-[a-f0-9]{24}$/.test(dir.name)) continue;
      try {
        const manifest = JSON.parse(await PM_R1_FS.readFile(PM_R1_PATH.join(trashRoot, dir.name, 'manifest.json'), 'utf8'));
        items.push({ id: dir.name, rootId: root.id, rootLabel: root.label, path: manifest.path, category: manifest.category, archivedAt: manifest.archivedAt, size: manifest.size, sha256: manifest.sha256 });
      } catch {}
    }
  }
  return items.sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
}
async function pmR1FindTrash(id: string): Promise<{ root: PMR1Root; dir: string; manifest: any } | null> {
  if (!/^\d+-[a-f0-9]{24}$/.test(id)) return null;
  for (const rootDef of PM_R1_ROOTS) {
    const root = await pmR1Root(rootDef.id);
    if (!root) continue;
    const dir = PM_R1_PATH.join(pmR1TrashRoot(root), id);
    try {
      const manifest = JSON.parse(await PM_R1_FS.readFile(PM_R1_PATH.join(dir, 'manifest.json'), 'utf8'));
      if (manifest.rootId === root.id && typeof manifest.path === 'string') return { root, dir, manifest };
    } catch {}
  }
  return null;
}
async function pmR1Admin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!(await adminGuard(request, reply))) return false;
  const identity = (request as any).admin as AdminIdentity | undefined;
  if (!identity || identity.role !== 'SUPER_ADMIN') {
    reply.code(403).send({ error: 'SUPER_ADMIN_REQUIRED' });
    return false;
  }
  return true;
}
async function pmR1Audit(request: FastifyRequest, action: string, id: string, metadata: any): Promise<void> {
  await prisma.auditLog.create({
    data: { adminUserId: adminIdOf(request), action, entityType: 'ProjectHtmlFile', entityId: id, metadata }
  }).catch(() => undefined);
}

app.get('/admin/page-files', async (request, reply) => {
  if (!(await pmR1Admin(request, reply))) return;
  const items = await pmR1ListFiles();
  const counts: Record<string, number> = { all: items.length };
  for (const item of items) counts[item.category] = (counts[item.category] ?? 0) + 1;
  return { items: items.map(({ absolutePath, ...item }) => item), counts, roots: PM_R1_ROOTS.map(x => ({ id: x.id, label: x.label })) };
});

app.get('/admin/page-files/:id', async (request, reply) => {
  if (!(await pmR1Admin(request, reply))) return;
  const p = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_file_id' });
  const item = (await pmR1ListFiles()).find(x => x.id === p.data.id);
  if (!item) return reply.code(404).send({ error: 'file_not_found' });
  if (item.size > PM_R1_MAX_PREVIEW) return reply.code(413).send({ error: 'preview_too_large', maxBytes: PM_R1_MAX_PREVIEW });
  const content = await PM_R1_FS.readFile(item.absolutePath, 'utf8');
  const references = await pmR1References(item);
  const { absolutePath, ...safeItem } = item;
  return { item: safeItem, content, references };
});

app.get('/admin/page-files-trash', async (request, reply) => {
  if (!(await pmR1Admin(request, reply))) return;
  return { items: await pmR1TrashItems() };
});

app.post('/admin/page-files/:id/archive', async (request, reply) => {
  if (!(await pmR1Admin(request, reply))) return;
  const p = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }).safeParse(request.params);
  const body = z.object({ confirmPath: z.string().max(500).optional() }).strict().safeParse(request.body ?? {});
  if (!p.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
  const item = (await pmR1ListFiles()).find(x => x.id === p.data.id);
  if (!item) return reply.code(404).send({ error: 'file_not_found' });
  if (item.protected) return reply.code(409).send({ error: 'protected_file', reason: item.protectionReason });
  const root = await pmR1Root(item.rootId);
  if (!root) return reply.code(404).send({ error: 'root_not_available' });
  const references = await pmR1References(item);
  if (references.length && body.data.confirmPath !== item.path) {
    return reply.code(409).send({ error: 'references_found', references, requiredConfirmation: item.path });
  }
  const absolute = await pmR1Resolve(root, item.path);
  const trashRoot = pmR1TrashRoot(root);
  const trashId = Date.now() + '-' + item.id;
  const trashDir = PM_R1_PATH.join(trashRoot, trashId);
  await PM_R1_FS.mkdir(trashDir, { recursive: true });
  const payload = PM_R1_PATH.join(trashDir, 'payload.html');
  const manifest = {
    id: trashId, rootId: root.id, path: item.path, category: item.category,
    categoryLabel: item.categoryLabel, archivedAt: new Date().toISOString(),
    size: item.size, sha256: item.sha256, references
  };
  try {
    await PM_R1_FS.rename(absolute, payload);
    await PM_R1_FS.writeFile(PM_R1_PATH.join(trashDir, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  } catch (error) {
    try { if (await PM_R1_FS.stat(payload).then(() => true).catch(() => false)) await PM_R1_FS.rename(payload, absolute); } catch {}
    await PM_R1_FS.rm(trashDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  await pmR1Audit(request, 'PROJECT_HTML_ARCHIVED', item.id, { rootId: root.id, path: item.path, references: references.length });
  return { ok: true, archivedId: trashId, path: item.path, references: references.length };
});

app.post('/admin/page-files-trash/:id/restore', async (request, reply) => {
  if (!(await pmR1Admin(request, reply))) return;
  const p = z.object({ id: z.string().regex(/^\d+-[a-f0-9]{24}$/) }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_trash_id' });
  const item = await pmR1FindTrash(p.data.id);
  if (!item) return reply.code(404).send({ error: 'trash_item_not_found' });
  const rootReal = await PM_R1_FS.realpath(item.root.path);
  const destination = PM_R1_PATH.resolve(rootReal, item.manifest.path);
  if (!destination.startsWith(rootReal + PM_R1_PATH.sep)) return reply.code(400).send({ error: 'invalid_restore_path' });
  if (await PM_R1_FS.stat(destination).then(() => true).catch(() => false)) return reply.code(409).send({ error: 'restore_destination_exists' });
  await PM_R1_FS.mkdir(PM_R1_PATH.dirname(destination), { recursive: true });
  const parentReal = await PM_R1_FS.realpath(PM_R1_PATH.dirname(destination));
  if (!parentReal.startsWith(rootReal + PM_R1_PATH.sep)) return reply.code(400).send({ error: 'restore_parent_outside_root' });
  await PM_R1_FS.rename(PM_R1_PATH.join(item.dir, 'payload.html'), destination);
  await PM_R1_FS.rm(item.dir, { recursive: true, force: true });
  await pmR1Audit(request, 'PROJECT_HTML_RESTORED', p.data.id, { rootId: item.root.id, path: item.manifest.path });
  return { ok: true, path: item.manifest.path };
});

app.delete('/admin/page-files-trash/:id', async (request, reply) => {
  if (!(await pmR1Admin(request, reply))) return;
  const p = z.object({ id: z.string().regex(/^\d+-[a-f0-9]{24}$/) }).safeParse(request.params);
  const body = z.object({ confirmation: z.literal('DELETE') }).strict().safeParse(request.body ?? {});
  if (!p.success || !body.success) return reply.code(400).send({ error: 'permanent_delete_confirmation_required' });
  const item = await pmR1FindTrash(p.data.id);
  if (!item) return reply.code(404).send({ error: 'trash_item_not_found' });
  await PM_R1_FS.rm(item.dir, { recursive: true, force: false });
  await pmR1Audit(request, 'PROJECT_HTML_PERMANENTLY_DELETED', p.data.id, { rootId: item.root.id, path: item.manifest.path });
  return { ok: true };
});
/* TENX_PAGE_FILES_MANAGER_R1_API_END */


// Canonical paired history: old content-only versions remain visible but cannot be restored as a pair.
const studioSnapshotSchema=z.object({
  format:z.literal(1),slug:mmvsSpatialSlug,contentVersionId:z.string(),version:z.number().int().positive(),
  title:z.string().nullable(),blocks:z.array(blockSchema).max(220),layout:mmvsSpatialLayout,capturedAt:z.string()
});
const studioReleaseParams=z.object({slug:mmvsSpatialSlug,id:z.string().min(1).max(64)});
async function readStudioSnapshot(tx:Prisma.TransactionClient|PrismaClient,slug:string,id:string){
  const row=await tx.systemSetting.findUnique({where:{key:studioReleaseKey(slug,id)},select:{value:true}});
  const parsed=studioSnapshotSchema.safeParse(row?.value);
  if(!parsed.success||parsed.data.slug!==slug||parsed.data.contentVersionId!==id)throw new ContentConflict('paired_snapshot_unavailable');
  return parsed.data;
}
app.get('/admin/mmvs/releases/:slug',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=z.object({slug:mmvsSpatialSlug}).safeParse(request.params);
  if(!p.success)return reply.code(400).send({error:'invalid_page'});
  reply.header('cache-control','no-store');
  const versions=await prisma.contentPageVersion.findMany({where:{pageSlug:p.data.slug,status:'PUBLISHED'},orderBy:{version:'desc'},take:50,
    select:{id:true,version:true,title:true,createdAt:true,createdBy:{select:{email:true}}}});
  const keys=versions.map(v=>studioReleaseKey(p.data.slug,v.id));
  const paired=await prisma.systemSetting.findMany({where:{key:{in:keys}},select:{key:true}});
  const available=new Set(paired.map(row=>row.key));
  return {items:versions.map(v=>({...v,paired:available.has(studioReleaseKey(p.data.slug,v.id))}))};
});
app.get('/admin/mmvs/releases/:slug/:id',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=studioReleaseParams.safeParse(request.params);
  if(!p.success)return reply.code(400).send({error:'invalid_release'});
  reply.header('cache-control','no-store');
  return await readStudioSnapshot(prisma,p.data.slug,p.data.id);
});
app.post('/admin/mmvs/releases/:slug/checkpoint',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=z.object({slug:mmvsSpatialSlug}).safeParse(request.params);
  const b=z.object({expectedPublishedRevision:z.string().regex(/^[a-f0-9]{64}$/),spatialExpectedRevision:z.number().int().min(0)}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  return await withContentLock(prisma,p.data.slug,async tx=>{
    const page=await tx.contentPage.findUnique({where:{slug:p.data.slug}});
    if(!page||page.status!=='PUBLISHED')throw new ContentConflict('published_page_not_found');
    assertContentRevision(page,b.data.expectedPublishedRevision);
    const spatial=await mmvsSpatialRead(p.data.slug,tx);
    if(spatial.revision!==b.data.spatialExpectedRevision)throw new ContentConflict('spatial_revision_conflict');
    const latest=await tx.contentPageVersion.aggregate({where:{pageSlug:p.data.slug},_max:{version:true}});
    const version=await tx.contentPageVersion.create({data:{pageSlug:p.data.slug,version:(latest._max.version??0)+1,title:page.title,blocks:toInputJson(page.blocks),status:'PUBLISHED',createdByAdminId:adminIdOf(request)}});
    await recordStudioRelease(tx,p.data.slug,version,spatial.published);
    await tx.auditLog.create({data:{adminUserId:adminIdOf(request),action:'STUDIO_RELEASE_CHECKPOINT_CREATED',entityType:'ContentPage',entityId:p.data.slug,metadata:{version:version.version,versionId:version.id}}});
    return {ok:true,id:version.id,version:version.version};
  });
});
app.post('/admin/mmvs/releases/:slug/:id/restore',async(request,reply)=>{
  if(!(await mmvsSpatialOwner(request,reply)))return;
  const p=studioReleaseParams.safeParse(request.params);
  const b=z.object({expectedRevision:z.string().regex(/^[a-f0-9]{64}$/),spatialExpectedRevision:z.number().int().min(0)}).strict().safeParse(request.body);
  if(!p.success||!b.success)return reply.code(400).send({error:'invalid_request'});
  return await withContentLock(prisma,p.data.slug,async tx=>{
    const current=await tx.contentPageDraft.findUnique({where:{slug:p.data.slug}})??await tx.contentPage.findUnique({where:{slug:p.data.slug}});
    assertContentRevision(current,b.data.expectedRevision);
    const spatial=await mmvsSpatialRead(p.data.slug,tx);
    if(spatial.revision!==b.data.spatialExpectedRevision)throw new ContentConflict('spatial_revision_conflict');
    const snapshot=await readStudioSnapshot(tx,p.data.slug,p.data.id);
    const draft=await tx.contentPageDraft.upsert({where:{slug:p.data.slug},create:{slug:p.data.slug,title:snapshot.title,blocks:toInputJson(snapshot.blocks)},update:{title:snapshot.title,blocks:toInputJson(snapshot.blocks)}});
    spatial.draft=mmvsSpatialCopy(snapshot.layout);spatial.revision++;
    await mmvsSpatialWrite(p.data.slug,spatial,request,'MMVS_SPATIAL_RESTORED_TO_DRAFT',tx);
    const latest=await tx.contentPageVersion.aggregate({where:{pageSlug:p.data.slug},_max:{version:true}});
    await tx.contentPageVersion.create({data:{pageSlug:p.data.slug,version:(latest._max.version??0)+1,title:draft.title,blocks:toInputJson(draft.blocks),status:'DRAFT',createdByAdminId:adminIdOf(request)}});
    await tx.auditLog.create({data:{adminUserId:adminIdOf(request),action:'STUDIO_RELEASE_RESTORED_TO_DRAFT',entityType:'ContentPage',entityId:p.data.slug,metadata:{sourceVersionId:snapshot.contentVersionId,sourceVersion:snapshot.version,spatialRevision:spatial.revision}}});
    return {ok:true,revision:contentRevision(draft),spatialRevision:spatial.revision};
  });
});

// MMVS_MEDIA_LIBRARY_R1_API_BEGIN
// Reusable, read-only inventory of public website assets. Only SUPER_ADMIN may enumerate.
// Files are served by existing public static routes. No destructive operations are exposed.
type MmvsMediaLibraryAssetR1 = {url:string;name:string;group:'uploads'|'academy'|'site'};
let mmvsMediaLibraryCacheR1: {at:number;items:MmvsMediaLibraryAssetR1[];truncated:boolean}|null=null;
async function mmvsMediaLibraryScanR1(){
  const fsp=await import('node:fs/promises');
  const pathLib=await import('node:path');
  const inventory:MmvsMediaLibraryAssetR1[]=[];
  const maximum=45000;
  let truncated=false;
  const roots=[
    {folder:pathLib.join(process.cwd(),'public','miniapp'),prefix:'/miniapp'},
    {folder:pathLib.join(process.cwd(),'public','uploads'),prefix:'/uploads'}
  ];
  for(const root of roots){
    const stack:[string,string[],number][]=[[root.folder,[],0]];
    while(stack.length){
      if(inventory.length>=maximum){truncated=true;break;}
      const [folder,components,depth]=stack.pop()!;
      if(depth>13)continue;
      let entries:import('node:fs').Dirent[];
      try{entries=await fsp.readdir(folder,{withFileTypes:true})}catch{continue}
      for(const entry of entries){
        if(inventory.length>=maximum){truncated=true;break}
        if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
        const parts=[...components,entry.name];
        if(entry.isDirectory()){
          if(depth<13&&!['node_modules','backups','__pycache__'].includes(entry.name))stack.push([pathLib.join(folder,entry.name),parts,depth+1]);
          continue;
        }
        if(!entry.isFile()||! /\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(entry.name))continue;
        const url=root.prefix+'/'+parts.map(encodeURIComponent).join('/');
        inventory.push({url,name:entry.name,group:root.prefix==='/uploads'?'uploads':parts[0]==='p74'&&parts[1]==='copytrade-academy'?'academy':'site'});
      }
    }
  }
  inventory.sort((a,b)=>{
    const pa=a.group==='uploads'?0:a.group==='academy'?1:2;
    const pb=b.group==='uploads'?0:b.group==='academy'?1:2;
    return pa-pb||a.url.localeCompare(b.url);
  });
  return {at:Date.now(),items:inventory,truncated};
}
app.get('/admin/mmvs/media-library',async(request,reply)=>{
  if(!(await adminGuard(request,reply)))return;
  if((request as any).admin?.role!=='SUPER_ADMIN')return reply.code(403).send({error:'super_admin_required'});
  const parsed=z.object({
    page:z.coerce.number().int().min(1).max(3000).optional(),
    limit:z.coerce.number().int().min(8).max(100).optional(),
    search:z.string().trim().max(120).optional(),
    group:z.enum(['all','uploads','academy','site']).optional(),
    refresh:z.enum(['1']).optional()
  }).strict().safeParse(request.query||{});
  if(!parsed.success)return reply.code(400).send({error:'invalid_media_query'});
  const q=parsed.data;
  if(!mmvsMediaLibraryCacheR1||q.refresh==='1'||Date.now()-mmvsMediaLibraryCacheR1.at>45000){
    mmvsMediaLibraryCacheR1=await mmvsMediaLibraryScanR1();
  }
  const f=mmvsMediaLibraryCacheR1;
  let all=f.items;
  if(q.group&&q.group!=='all')all=all.filter(x=>x.group===q.group);
  if(q.search){const needle=q.search.toLocaleLowerCase();all=all.filter(x=>(x.name+' '+x.url).toLocaleLowerCase().includes(needle))}
  const page=q.page||1,limit=q.limit||32;
  const selection=all.slice((page-1)*limit,page*limit);
  const paths=[
    {prefix:'/miniapp/',folder:join(process.cwd(),'public','miniapp')},
    {prefix:'/uploads/',folder:join(process.cwd(),'public','uploads')}
  ];
  const fs=await import('node:fs/promises');
  const result=await Promise.all(selection.map(async x=>{
    let bytes=0;
    const mapping=paths.find(m=>x.url.startsWith(m.prefix));
    if(mapping){
      // URLs were generated from trusted directory entries; prevent path traversal on decoding.
      const rel=x.url.slice(mapping.prefix.length).split('/').map(decodeURIComponent);
      if(rel.every(p=>p!=='.'&&p!=='..'&&!p.includes('/')&&!p.includes('\\'))){
        try{const st=await fs.stat(join(mapping.folder,...rel));if(st.isFile())bytes=st.size}catch{}
      }
    }
    return {...x,bytes};
  }));
  reply.header('cache-control','no-store');
  return {ok:true,items:result,total:all.length,truncated:f.truncated,page,limit};
});
// MMVS_R98_PERMANENT_MEDIA_DELETE: restrict deletion to generated P62 uploads only.
// System/bundled assets and files referenced by current page data are never deleted.
app.delete('/admin/mmvs/media-library/delete-permanent',async(request,reply)=>{
 if(!(await p62Owner(request,reply)))return;
 const b=z.object({
   url:z.string().max(220).regex(/^\/uploads\/home-studio\/p62-[a-f0-9]{32}\.(?:png|jpg|webp)$/),
   confirmation:z.literal('DELETE')
 }).strict().safeParse(request.body??{});
 if(!b.success)return reply.code(400).send({error:'invalid_or_unmanaged_media'});
 const url=b.data.url;
 const name=url.split('/').pop()!;
 const fsp=await import('node:fs/promises');
 const target=p62path.join(p62MediaDir,name);
 let stat:import('node:fs').Stats;
 try{stat=await fsp.lstat(target)}catch(e:any){return reply.code(e?.code==='ENOENT'?404:500).send({error:'media_not_found_or_unreadable'})}
 if(!stat.isFile()||stat.isSymbolicLink())return reply.code(400).send({error:'non_regular_media_refused'});
 // Reject deleting a file in current published pages, drafts or system settings.
 // This includes spatial layout backgrounds and shared site configuration.
 const [published,drafts,settings]=await Promise.all([
   prisma.contentPage.findMany({select:{slug:true,blocks:true}}),
   prisma.contentPageDraft.findMany({select:{slug:true,blocks:true}}),
   prisma.systemSetting.findMany({select:{key:true,value:true}})
 ]);
 const mentions=(v:unknown)=>JSON.stringify(v??'').includes(url);
 const used=[
   ...published.filter(x=>mentions(x.blocks)).map(x=>'published:'+x.slug),
   ...drafts.filter(x=>mentions(x.blocks)).map(x=>'draft:'+x.slug),
   ...settings.filter(x=>mentions(x.value)).map(x=>'setting:'+x.key)
 ].slice(0,20);
 if(used.length)return reply.code(409).send({error:'media_still_referenced',usedBy:used});
 // Audit authorization and deletion intent before the irreversible operation.
 await prisma.auditLog.create({data:{adminUserId:adminIdOf(request),action:'MMVS_MEDIA_PERMANENT_DELETE_REQUESTED',entityType:'HomeStudioMedia',entityId:name,metadata:{url,bytes:stat.size}}});
 try{await fsp.unlink(target)}catch{return reply.code(500).send({error:'physical_delete_failed'})}
 mmvsMediaLibraryCacheR1=null;
 await prisma.auditLog.create({data:{adminUserId:adminIdOf(request),action:'MMVS_MEDIA_PERMANENTLY_DELETED',entityType:'HomeStudioMedia',entityId:name,metadata:{url,bytes:stat.size}}}).catch(()=>undefined);
 reply.header('cache-control','no-store');
 return {ok:true,deleted:true,url};
});

// MMVS_R98_SECTION_AND_PERMANENT_DELETE
// MMVS_MEDIA_LIBRARY_R1_API_END

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
    revision: contentRevision(source),
    draftUpdatedAt: draft?.updatedAt ?? null,
    published: {
      revision: contentRevision(published),
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
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    title: z.string().trim().max(200).nullable().optional(),
    blocks: z.array(blockSchema).max(220)
  }).strict().safeParse(request.body);

  if (!p.success || !b.success) {
    return reply.code(400).send({
      error: 'invalid_request',
      details: b.success ? undefined : b.error.flatten()
    });
  }

  const blocks = JSON.parse(JSON.stringify(b.data.blocks));
  const title = b.data.title ?? null;

  const saved = await withContentLock(prisma,p.data.slug,async (tx) => {
    const current=await tx.contentPageDraft.findUnique({where:{slug:p.data.slug}});
    const source=current??await tx.contentPage.findUnique({where:{slug:p.data.slug}});
    assertContentRevision(source,b.data.expectedRevision);
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

  return { ok: true, updatedAt: saved.updatedAt, revision: contentRevision(saved) };
});

app.post('/admin/content/pages/:slug/publish', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  if (!p.success) return reply.code(400).send({ error: 'invalid_request' });

  const body=z.object({
    expectedRevision:z.string().regex(/^[a-f0-9]{64}$/).optional(),
    spatialExpectedRevision:z.number().int().min(0).optional()
  }).strict().safeParse(request.body??{});
  if(!body.success)return reply.code(400).send({error:'invalid_request'});
  if(body.data.spatialExpectedRevision!==undefined&&(request as any).admin?.role!=='SUPER_ADMIN')return reply.code(403).send({error:'super_admin_required'});
  const published = await withContentLock(prisma,p.data.slug,async (tx) => {
    const draft = await tx.contentPageDraft.findUnique({where:{slug:p.data.slug}})
      ?? (body.data.spatialExpectedRevision!==undefined?await tx.contentPage.findUnique({where:{slug:p.data.slug}}):null);

    // R12: permit first publication of a spatial-only page.
    // Preserve the normal content revision and SUPER_ADMIN checks.
    const initialSpatial = !draft && body.data.spatialExpectedRevision !== undefined
      ? await mmvsSpatialRead(p.data.slug,tx) : null;
    if (!draft && (!initialSpatial?.draft || initialSpatial.draft.items.length===0)) return null;
    if (!draft) {
      assertContentRevision(null,body.data.expectedRevision);
    } else {
      assertContentRevision(draft,body.data.expectedRevision);
    }
    const publishContent = draft ?? {title:null,blocks:[]};
    let spatialRevision:number|undefined;
    // Content and spatial publication share this transaction: either both commit or neither does.
    if(body.data.spatialExpectedRevision!==undefined){
      const spatial=await mmvsSpatialRead(p.data.slug,tx);
      if(spatial.revision!==body.data.spatialExpectedRevision)throw new ContentConflict('spatial_revision_conflict');
      spatialRevision=spatial.revision;
      if(spatial.draft){
        spatial.published=mmvsSpatialCopy(spatial.draft);spatial.draft=null;spatial.revision++;
        spatial.history=[...spatial.history,{revision:spatial.revision,at:new Date().toISOString(),layout:mmvsSpatialCopy(spatial.published)}].slice(-25);
        await mmvsSpatialWrite(p.data.slug,spatial,request,'MMVS_SPATIAL_PUBLISHED',tx);
        spatialRevision=spatial.revision;
      }
    }

    const page = await tx.contentPage.upsert({
      where: { slug: p.data.slug },
      create: {
        slug: p.data.slug,
        title: publishContent.title,
        blocks: toInputJson(publishContent.blocks),
        status: 'PUBLISHED'
      },
      update: {
        title: publishContent.title,
        blocks: toInputJson(publishContent.blocks),
        status: 'PUBLISHED'
      }
    });

    const latest = await tx.contentPageVersion.aggregate({
      where: { pageSlug: p.data.slug },
      _max: { version: true }
    });

    const version=await tx.contentPageVersion.create({
      data: {
        pageSlug: p.data.slug,
        version: (latest._max.version ?? 0) + 1,
        title: page.title,
        blocks: toInputJson(page.blocks),
        status: 'PUBLISHED',
        createdByAdminId: adminIdOf(request)
      }
    });

    const publishedLayout=await mmvsSpatialRead(p.data.slug,tx);
    await recordStudioRelease(tx,p.data.slug,version,publishedLayout.published);

    await tx.auditLog.create({
      data: {
        adminUserId: adminIdOf(request),
        action: 'CONTENT_PAGE_PUBLISHED',
        entityType: 'ContentPage',
        entityId: p.data.slug,
        metadata: { status: 'PUBLISHED' }
      }
    });

    return {...page,spatialRevision};
  });

  if (!published) {
    return reply.code(409).send({ error: 'draft_not_found' });
  }

  return { ok: true, status: published.status, updatedAt: published.updatedAt, spatialRevision:published.spatialRevision };
});

app.put('/admin/content/pages/:slug', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;
  const p = z.object({ slug: z.enum(PAGE_SLUGS) }).safeParse(request.params);
  const b = z.object({ title: z.string().trim().max(200).nullable().optional(), status: z.enum(['DRAFT', 'PUBLISHED']), blocks: z.array(blockSchema).max(220) }).strict().safeParse(request.body);
  if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_request', details: b.success ? undefined : b.error.flatten() });
  const blocks = JSON.parse(JSON.stringify(b.data.blocks));
  const saved = await withContentLock(prisma,p.data.slug,async (tx) => {
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

  const result = await withContentLock(prisma,p.data.slug,async (tx) => {
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


// =========================================================
// CHALLENGE ORGANIZERS
// =========================================================
const CHALLENGE_ORGANIZERS_KEY = 'CHALLENGE_ORGANIZERS_V1';

const DEFAULT_CHALLENGE_ORGANIZERS = {
  enabled: false,
  title: 'برگزارکنندگان چالش 10X',
  subtitle: 'با همراهی تیم برگزارکننده',
  body: 'با برگزارکنندگان چالش 10X آشنا شوید.',
  pageSlug: 'index',
  frequency: 'ONCE',
  organizers: [
    {
      id: 'organizer-meytan',
      name: 'میتن',
      role: 'برگزارکننده چالش',
      bio: '',
      imageUrl: null,
      sortOrder: 1,
      isActive: true
    },
    {
      id: 'organizer-mohammad-javad',
      name: 'محمد جواد',
      role: 'برگزارکننده چالش',
      bio: '',
      imageUrl: null,
      sortOrder: 2,
      isActive: true
    }
  ]
};

const challengeOrganizersInput = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300),
  body: z.string().trim().max(3000),
  pageSlug: z.enum(PAGE_SLUGS),
  frequency: z.enum(['ONCE', 'EVERY_VISIT']),
  organizers: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().max(160),
    bio: z.string().trim().max(3000),
    imageUrl: safeLink.nullable(),
    sortOrder: z.number().int().min(0).max(1000),
    isActive: z.boolean()
  }).strict()).max(12)
}).strict();

app.get('/admin/challenge-organizers', async (request, reply) => {
  if (!await adminGuard(request, reply)) return;

  const row = await prisma.systemSetting.findUnique({
    where: { key: CHALLENGE_ORGANIZERS_KEY }
  });

  const saved = row?.value && typeof row.value === 'object'
    ? row.value as any
    : null;

  return {
    ...(saved || DEFAULT_CHALLENGE_ORGANIZERS),
    popupId: saved?.popupId ?? null
  };
});

app.put('/admin/challenge-organizers', async (request, reply) => {
  if (!await adminGuard(request, reply)) return;

  const parsed = challengeOrganizersInput.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const data = parsed.data;
  const ids = data.organizers.map(x => x.id);
  if (new Set(ids).size !== ids.length) {
    return reply.code(400).send({ error: 'duplicate_organizer_id' });
  }

  const active = data.organizers.filter(x => x.isActive);
  if (data.enabled && active.length === 0) {
    return reply.code(400).send({ error: 'at_least_one_active_organizer_required' });
  }

  const result = await prisma.$transaction(async tx => {
    const current = await tx.systemSetting.findUnique({
      where: { key: CHALLENGE_ORGANIZERS_KEY }
    });

    const previous = current?.value && typeof current.value === 'object'
      ? current.value as any
      : {};

    const popupData = {
      title: data.title,
      body: [data.subtitle, data.body].filter(Boolean).join('\n\n'),
      imageUrl: null,
      buttonText: null,
      buttonUrl: null,
      pageSlug: data.pageSlug,
      frequency: data.frequency,
      status: data.enabled ? 'PUBLISHED' as const : 'DRAFT' as const
    };

    let popupId = typeof previous.popupId === 'string'
      ? previous.popupId
      : null;

    if (popupId) {
      const existing = await tx.popup.findUnique({
        where: { id: popupId },
        select: { id: true }
      });

      if (existing) {
        await tx.popup.update({
          where: { id: popupId },
          data: popupData
        });
      } else {
        const created = await tx.popup.create({ data: popupData });
        popupId = created.id;
      }
    } else {
      const created = await tx.popup.create({ data: popupData });
      popupId = created.id;
    }

    const value = {
      ...data,
      popupId
    };

    await tx.systemSetting.upsert({
      where: { key: CHALLENGE_ORGANIZERS_KEY },
      create: {
        key: CHALLENGE_ORGANIZERS_KEY,
        value: value as Prisma.InputJsonValue
      },
      update: {
        value: value as Prisma.InputJsonValue
      }
    });

    return value;
  });

  return { ok: true, ...result };
});

app.post('/admin/challenge-organizers/upload', async (request, reply) => {
  if (!await adminGuard(request, reply)) return;

  const parsed = z.object({
    dataUrl: z.string().min(1).max(700000)
  }).strict().safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_image' });
  }

  const match = parsed.data.dataUrl.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!match) {
    return reply.code(400).send({ error: 'unsupported_image_type' });
  }

  const mime = match[1];
  const encoded = match[2];
  const bytes = Buffer.from(encoded, 'base64');

  if (!bytes.length || bytes.length > 480 * 1024) {
    return reply.code(413).send({ error: 'image_too_large' });
  }

  const isPng =
    mime === 'png' &&
    bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const isJpeg =
    mime === 'jpeg' &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const isWebp =
    mime === 'webp' &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';

  if (!isPng && !isJpeg && !isWebp) {
    return reply.code(400).send({ error: 'invalid_image_content' });
  }

  const { mkdir, writeFile } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');

  const directory = join(
    process.cwd(),
    'public',
    'uploads',
    'challenge-organizers'
  );

  await mkdir(directory, { recursive: true });

  const extension = mime === 'jpeg' ? 'jpg' : mime;
  const filename = randomUUID() + '.' + extension;

  await writeFile(join(directory, filename), bytes, { flag: 'wx' });

  return {
    ok: true,
    imageUrl: '/uploads/challenge-organizers/' + filename
  };
});

// =========================================================
// END CHALLENGE ORGANIZERS
// =========================================================


app.post('/content/page', async (request, reply) => {
  const b = z.object({
    initData: z.string().min(1).max(10000),
    slug: z.union([z.enum(PAGE_SLUGS), tenxCustomPublicSlugSchema])
  }).safeParse(request.body);
  if (!b.success) return reply.code(400).send({ error: 'invalid_request' });
  let contentSlug = b.data.slug;
  if (!(PAGE_SLUGS as readonly string[]).includes(contentSlug)) {
    const meta = (await tenxCustomPagesRead()).find(x => x.publicSlug === contentSlug);
    if (!meta) return reply.code(404).send({ error: 'page_not_found' });
    contentSlug = meta.slug;
    const published = await prisma.contentPage.findUnique({ where: { slug: contentSlug }, select: { status: true } });
    if (!published || published.status !== 'PUBLISHED') return reply.code(404).send({ error: 'page_not_published' });
  }
  const who = await miniUser(b.data.initData, false);
  if ('code' in who) return reply.code(who.code).send({ error: who.error });
  // MMTRADE_STAGE2_ROUTE_FIX_R2: mirror the real stage-2 lesson access policy.
  if (contentSlug === 'stage2') {
    const access = await mmStage1State(who.id);
    if (!access.unlocked) return reply.code(403).send({ error: 'stage1_incomplete', done: access.done, total: access.total });
  }
  const [user, page, lessons, popups] = await Promise.all([
    prisma.user.findUnique({ where: { id: who.id }, select: { registrationStage: true } }),
    prisma.contentPage.findUnique({ where: { slug: contentSlug } }),
    prisma.lesson.findMany({ where: { status: 'PUBLISHED', course: { status: 'PUBLISHED' } }, select: { id: true } }),
    prisma.popup.findMany({ where: { status: 'PUBLISHED', pageSlug: contentSlug }, orderBy: { createdAt: 'asc' } }),
    prisma.systemSetting.findUnique({ where: { key: 'CHALLENGE_ORGANIZERS_V1' } })
  ]);
  const lessonIds = lessons.map((l) => l.id);
  const done = lessonIds.length ? await prisma.lessonProgress.count({ where: { userId: who.id, completedAt: { not: null }, lessonId: { in: lessonIds } } }) : 0;
  const seenRows = popups.length ? await prisma.popupView.findMany({ where: { userId: who.id, popupId: { in: popups.map((x) => x.id) } }, select: { popupId: true } }) : [];
  const seen = new Set(seenRows.map((x) => x.popupId));
  const organizerSetting = await prisma.systemSetting.findUnique({
    where: { key: 'CHALLENGE_ORGANIZERS_V1' }
  });

  const organizerConfig = organizerSetting?.value && typeof organizerSetting.value === 'object'
    ? organizerSetting.value as any
    : null;

  const organizerId = typeof organizerConfig?.popupId === 'string'
    ? organizerConfig.popupId
    : null;

  const activeOrganizers = Array.isArray(organizerConfig?.organizers)
    ? organizerConfig.organizers
        .filter((x: any) => x && x.isActive === true && typeof x.name === 'string')
        .sort((a: any, b: any) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .slice(0, 12)
    : [];

  const organizerEligible =
    organizerConfig?.enabled === true &&
    organizerConfig?.pageSlug === contentSlug &&
    Boolean(organizerId) &&
    activeOrganizers.length > 0;

  const organizerSeen = organizerEligible && organizerConfig.frequency !== 'EVERY_VISIT'
    ? await prisma.popupView.findUnique({
        where: {
          userId_popupId: {
            userId: who.id,
            popupId: organizerId!
          }
        },
        select: { popupId: true }
      })
    : null;

  const organizerPopup = organizerEligible &&
    (organizerConfig.frequency === 'EVERY_VISIT' || !organizerSeen)
      ? {
          id: organizerId,
          title: organizerConfig.title,
          subtitle: organizerConfig.subtitle,
          body: organizerConfig.body,
          organizers: activeOrganizers.map((x: any) => ({
            id: x.id,
            name: x.name,
            role: x.role,
            bio: x.bio,
            imageUrl: x.imageUrl
          }))
        }
      : null;

  const popup = organizerPopup
    ?? (popups.find((x) =>
      x.id !== organizerId &&
      (x.frequency === 'EVERY_VISIT' || !seen.has(x.id))
    ) ?? null);
  const homeLinksRow = contentSlug === 'index'
    ? await prisma.systemSetting.findUnique({ where: { key: 'HOME_LINKS_V1' } })
    : null;
  const homeLinks = contentSlug === 'index'
    ? normalizeHomeLinks(homeLinksRow?.value)
    : undefined;
  const stage = user?.registrationStage ?? 'STARTED';
  const idx = Math.max(0, REG_ORDER.indexOf(stage));
  return {
    blocks: page && page.status === 'PUBLISHED' && Array.isArray(page.blocks) ? page.blocks : [],
    ...(homeLinks ? { homeLinks } : {}),
    progress: { registration: { stage, pct: Math.round((idx / (REG_ORDER.length - 1)) * 100) }, academy: { done, total: lessonIds.length, pct: lessonIds.length ? Math.round((done / lessonIds.length) * 100) : 0 } },
    popup: popup ? (
      'organizers' in popup
        ? popup
        : {
            id: popup.id,
            title: popup.title,
            body: popup.body,
            imageUrl: popup.imageUrl,
            buttonText: popup.buttonText,
            buttonUrl: popup.buttonUrl
          }
    ) : null
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

  const body: any = request.body ?? {};
  const requestedSourceId =
    typeof body.sourceVersionId === 'string'
      ? body.sourceVersionId.trim()
      : '';

  const parsed = progressDraftInput.safeParse({
    title: body.title,
    description: body.description
  });

  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_request' });
  }

  const sourceVersion = requestedSourceId
    ? await prisma.progressPathVersion.findUnique({
        where: { id: requestedSourceId },
        include: {
          stages: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
        }
      })
    : await prisma.progressPathVersion.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        include: {
          stages: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
        }
      });

  if (requestedSourceId && !sourceVersion) {
    return reply.code(404).send({
      error: 'progress_source_version_not_found'
    });
  }

  if (sourceVersion?.status === 'DRAFT') {
    return reply.code(400).send({
      error: 'progress_source_must_not_be_draft'
    });
  }

  const cloneStages = async (
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    targetVersionId: string
  ): Promise<number> => {
    const sourceStages = await tx.progressStage.findMany({
      where: { pathVersionId: sourceVersionId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    const idMap = new Map<string, string>();
    const copies: Array<{
      source: typeof sourceStages[number];
      targetId: string;
    }> = [];

    for (const stage of sourceStages) {
      const created = await tx.progressStage.create({
        data: {
          pathVersionId: targetVersionId,
          key: stage.key,
          title: stage.title,
          description: stage.description,
          weight: stage.weight,
          sortOrder: stage.sortOrder,
          isActive: stage.isActive,
          isVisible: stage.isVisible,
          completionType: stage.completionType,
          completionConfig:
            stage.completionConfig as Prisma.InputJsonValue,
          prerequisiteIds: [] as Prisma.InputJsonValue,
          actionType: stage.actionType,
          actionTarget: stage.actionTarget
        }
      });

      idMap.set(stage.id, created.id);
      copies.push({ source: stage, targetId: created.id });
    }

    for (const copy of copies) {
      const raw = Array.isArray(copy.source.prerequisiteIds)
        ? copy.source.prerequisiteIds
        : [];

      if (raw.some(value => typeof value !== 'string')) {
        throw new Error('Invalid source progress prerequisites');
      }

      const mappedIds = raw.map(value => {
        const mapped = idMap.get(value as string);
        if (!mapped) {
          throw new Error('Unmapped source progress prerequisite');
        }
        return mapped;
      });

      await tx.progressStage.update({
        where: { id: copy.targetId },
        data: {
          prerequisiteIds: mappedIds as Prisma.InputJsonValue
        }
      });
    }

    return copies.length;
  };

  const existingDraft = await prisma.progressPathVersion.findFirst({
    where: { status: 'DRAFT' },
    orderBy: { version: 'desc' },
    include: {
      stages: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
    }
  });

  // Never overwrite an existing non-empty draft.
  if (existingDraft && existingDraft.stages.length > 0) {
    return reply.code(409).send({
      error: 'progress_draft_already_has_stages',
      draftVersionId: existingDraft.id,
      message: 'ابتدا پیش‌نویس فعلی را منتشر یا تعیین تکلیف کنید.'
    });
  }

  const title =
    parsed.data.title ?? sourceVersion?.title ?? 'مسیر پیشرفت 10X';

  const description =
    parsed.data.description ?? sourceVersion?.description ?? null;

  try {
    const result = await prisma.$transaction(async tx => {
      let targetId: string;
      let versionNumber: number;

      if (existingDraft) {
        const changed = await tx.progressPathVersion.updateMany({
          where: {
            id: existingDraft.id,
            status: 'DRAFT'
          },
          data: { title, description }
        });

        if (changed.count !== 1) {
          throw new Error('Progress draft changed concurrently');
        }

        targetId = existingDraft.id;
        versionNumber = existingDraft.version;
      } else {
        const max = await tx.progressPathVersion.aggregate({
          _max: { version: true }
        });

        const created = await tx.progressPathVersion.create({
          data: {
            version: (max._max.version ?? 0) + 1,
            title,
            description,
            status: 'DRAFT'
          }
        });

        targetId = created.id;
        versionNumber = created.version;
      }

      const clonedStageCount = sourceVersion
        ? await cloneStages(tx, sourceVersion.id, targetId)
        : 0;

      await tx.auditLog.create({
        data: {
          adminUserId: adminIdOf(request),
          action: existingDraft
            ? 'PROGRESS_DRAFT_CREATED_FROM_VERSION'
            : 'PROGRESS_DRAFT_CREATED',
          entityType: 'ProgressPathVersion',
          entityId: targetId,
          metadata: {
            version: versionNumber,
            sourceVersionId: sourceVersion?.id ?? null,
            sourceVersionNumber: sourceVersion?.version ?? null,
            clonedStageCount
          }
        }
      });

      const item = await tx.progressPathVersion.findUnique({
        where: { id: targetId },
        include: {
          stages: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
          },
          _count: { select: { assignments: true } }
        }
      });

      return { item, clonedStageCount };
    });

    return reply.code(existingDraft ? 200 : 201).send({
      ok: true,
      reused: Boolean(existingDraft),
      clonedStageCount: result.clonedStageCount,
      sourceVersionId: sourceVersion?.id ?? null,
      item: result.item
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const draft = await prisma.progressPathVersion.findFirst({
        where: { status: 'DRAFT' },
        orderBy: { version: 'desc' },
        include: {
          stages: true,
          _count: { select: { assignments: true } }
        }
      });

      if (draft) {
        return reply.code(409).send({
          error: 'progress_draft_already_exists',
          draftVersionId: draft.id
        });
      }
    }

    throw error;
  }
});

// ---- PROGRESS_STAGES_API_V1 ----
app.get('/admin/progress/activities', async (request, reply) => {
  if (!(await adminGuard(request, reply))) return;

  const lessons = await prisma.lesson.findMany({
    where: {
      status: 'PUBLISHED',
      course: { status: 'PUBLISHED' }
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      course: { select: { title: true } }
    }
  });

  return {
    items: lessons.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      courseTitle: lesson.course.title
    }))
  };
});

const progressStageCreateInput = z.object({
  pathVersionId: z.string().min(1).max(100),
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000).nullable().optional(),
  weight: z.number().int().min(1).max(1_000_000),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isVisible: z.boolean().optional(),
  completionType: z.enum(['MANUAL', 'REGISTRATION_STAGE', 'ACADEMY_LESSON']),
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

  const academyStages = stages.filter(
    stage => stage.completionType === 'ACADEMY_LESSON'
  );

  if (academyStages.length) {
    const lessonIds = academyStages.map(stage => {
      const config = stage.completionConfig;
      return config && typeof config === 'object' && !Array.isArray(config)
        ? (config as Record<string, unknown>).lessonId
        : undefined;
    }).filter((id): id is string => typeof id === 'string');

    const foundLessons = await prisma.lesson.findMany({
      where: { id: { in: lessonIds } },
      select: { id: true }
    });

    const foundIds = new Set(foundLessons.map(lesson => lesson.id));
    const invalidStage = academyStages.find(stage => {
      const config = stage.completionConfig;
      const lessonId =
        config && typeof config === 'object' && !Array.isArray(config)
          ? (config as Record<string, unknown>).lessonId
          : undefined;
      return typeof lessonId !== 'string' || !foundIds.has(lessonId);
    });

    if (invalidStage) {
      return reply.code(400).send({
        error: 'invalid_academy_lesson_config',
        stageId: invalidStage.id
      });
    }
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


// ---- PROGRESS_COMPLETION_RESOLVER_V1 ----
type ProgressStateReader = Pick<
  Prisma.TransactionClient,
  'userProgressEvent' | 'lessonProgress'
>;

type ProgressCompletionStage = {
  id: string;
  completionType: string;
  completionConfig: unknown;
};

async function resolveProgressCompletionState(
  db: ProgressStateReader,
  userId: string,
  pathVersionId: string,
  registrationStage: string,
  stages: ProgressCompletionStage[]
) {
  const lessonIdByStage = new Map<string, string>();
  const lessonIds = stages.flatMap(stage => {
    if (stage.completionType !== 'ACADEMY_LESSON') return [];

    const config = stage.completionConfig;
    const lessonId =
      config && typeof config === 'object' && !Array.isArray(config)
        ? (config as Record<string, unknown>).lessonId
        : undefined;

    if (typeof lessonId !== 'string') return [];
    lessonIdByStage.set(stage.id, lessonId);
    return [lessonId];
  });

  const [events, lessonRows] = await Promise.all([
    db.userProgressEvent.findMany({
      where: { userId, pathVersionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    }),
    lessonIds.length
      ? db.lessonProgress.findMany({
          where: { userId, lessonId: { in: lessonIds } },
          select: { lessonId: true, completedAt: true, progressPct: true }
        })
      : Promise.resolve([] as Array<{
          lessonId: string;
          completedAt: Date | null;
          progressPct: number;
        }>)
  ]);

  const latestByStage = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    if (!latestByStage.has(event.stageId)) {
      latestByStage.set(event.stageId, event);
    }
  }

  const lessonProgressById = new Map(
    lessonRows.map(row => [
      row.lessonId,
      row.completedAt ? 100 : Math.max(0, Math.min(100, row.progressPct || 0))
    ])
  );

  const registrationIndex = REG_ORDER.indexOf(registrationStage);
  const completedIds = new Set<string>();
  const progressPctByStage = new Map<string, number>();

  for (const stage of stages) {
    let completed = false;

    if (stage.completionType === 'MANUAL') {
      completed = latestByStage.get(stage.id)?.eventType === 'COMPLETED';
    } else if (stage.completionType === 'REGISTRATION_STAGE') {
      const config = stage.completionConfig;
      const target =
        config && typeof config === 'object' && !Array.isArray(config)
          ? (config as Record<string, unknown>).targetStage
          : undefined;

      const targetIndex = typeof target === 'string'
        ? REG_ORDER.indexOf(target)
        : -1;

      completed = targetIndex >= 0 && registrationIndex >= targetIndex;
    } else if (stage.completionType === 'ACADEMY_LESSON') {
      const lessonId = lessonIdByStage.get(stage.id);
      const pct = lessonId
        ? lessonProgressById.get(lessonId) ?? 0
        : 0;

      progressPctByStage.set(stage.id, pct);
      completed = pct >= 100;
    }

    if (completed) completedIds.add(stage.id);
  }

  return { completedIds, latestByStage, progressPctByStage };
}

// ---- END PROGRESS_COMPLETION_RESOLVER_V1 ----

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

    const completionState = await resolveProgressCompletionState(
      tx,
      userId,
      assignment.pathVersionId,
      (await tx.user.findUnique({
        where: { id: userId },
        select: { registrationStage: true }
      }))?.registrationStage ?? 'STARTED',
      assignment.pathVersion.stages.filter(item => item.isActive)
    );

    const latest = completionState.latestByStage.get(stageId);

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

      if (prerequisites.some(id => !completionState.completedIds.has(id))) {
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
        completionState.completedIds.has(item.id) &&
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


  // ---- PROGRESS_ARCHIVED_ASSIGNMENT_MIGRATION_V1 ----
  // Move users from archived path versions to the currently published version.
  // Historical events remain untouched. Only matching MANUAL stages are carried
  // forward, and only when both versions use the same stable stage key and type.

  if (assignment.pathVersion.status !== 'PUBLISHED') {
    const previousAssignment = assignment;

    assignment = await prisma.$transaction(async tx => {
      const latestPublished = await tx.progressPathVersion.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { version: 'desc' }
      });

      if (!latestPublished) return previousAssignment;

      if (latestPublished.id === previousAssignment.pathVersionId) {
        return previousAssignment;
      }

      const targetVersion = await tx.progressPathVersion.findUnique({
        where: { id: latestPublished.id },
        include: {
          stages: {
            where: { isActive: true },
            orderBy: [
              { sortOrder: 'asc' },
              { createdAt: 'asc' }
            ]
          }
        }
      });

      if (!targetVersion) return previousAssignment;

      const oldManualStages = previousAssignment.pathVersion.stages.filter(
        stage => stage.completionType === 'MANUAL'
      );

      const newManualStages = targetVersion.stages.filter(
        stage => stage.completionType === 'MANUAL'
      );

      const oldStageIds = oldManualStages.map(stage => stage.id);

      const oldLatestEvents = oldStageIds.length
        ? await tx.userProgressEvent.findMany({
            where: {
              userId: who.id,
              pathVersionId: previousAssignment.pathVersionId,
              stageId: { in: oldStageIds }
            },
            orderBy: [
              { createdAt: 'desc' },
              { id: 'desc' }
            ]
          })
        : [];

      const latestEventByStage = new Map<string, typeof oldLatestEvents[number]>();

      for (const event of oldLatestEvents) {
        if (!latestEventByStage.has(event.stageId)) {
          latestEventByStage.set(event.stageId, event);
        }
      }

      // Conditional update prevents duplicate migration under concurrent requests.
      const changed = await tx.userProgressAssignment.updateMany({
        where: {
          userId: who.id,
          pathVersionId: previousAssignment.pathVersionId
        },
        data: {
          pathVersionId: targetVersion.id
        }
      });

      if (changed.count !== 1) {
        return tx.userProgressAssignment.findUniqueOrThrow({
          where: { userId: who.id },
          include: assignmentInclude
        });
      }

      const oldManualByKey = new Map(
        oldManualStages.map(stage => [stage.key, stage])
      );

      for (const newStage of newManualStages) {
        const oldStage = oldManualByKey.get(newStage.key);
        if (!oldStage) continue;

        const previousEvent = latestEventByStage.get(oldStage.id);
        if (!previousEvent) continue;

        await tx.userProgressEvent.create({
          data: {
            userId: who.id,
            pathVersionId: targetVersion.id,
            stageId: newStage.id,
            stageKey: newStage.key,
            eventType: previousEvent.eventType,
            source: 'VERSION_MIGRATION',
            reason: previousEvent.reason ?? 'Preserved from previous path version',
            verifiedByAdminId: previousEvent.verifiedByAdminId,
            proof: {
              method: 'version_migration',
              fromVersionId: previousAssignment.pathVersionId,
              fromStageId: oldStage.id,
              fromEventId: previousEvent.id,
              originalSource: previousEvent.source
            }
          }
        });
      }

      return tx.userProgressAssignment.findUniqueOrThrow({
        where: { userId: who.id },
        include: assignmentInclude
      });
    });
  }
  // ---- END PROGRESS_ARCHIVED_ASSIGNMENT_MIGRATION_V1 ----

  const stages = assignment.pathVersion.stages;


  const completionState = await resolveProgressCompletionState(
    prisma,
    who.id,
    assignment.pathVersionId,
    user.registrationStage,
    stages
  );

  const snapshot = calculateProgressSnapshot(
    stages.map(stage => ({
      id: stage.id,
      isVisible: stage.isVisible,
      weight: stage.weight,
      prerequisiteIds: stage.prerequisiteIds
    })),
    completionState.completedIds,
    completionState.progressPctByStage
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
      progressPct: snapshotStage.progressPct,
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
  if(error instanceof ContentConflict){const messages:Record<string,string>={paired_snapshot_unavailable:'این نسخه snapshot هماهنگ محتوا و چیدمان ندارد.',published_page_not_found:'این صفحه هنوز نسخه عمومی منتشرشده ندارد.'};return reply.code(409).send({error:error.code,message:messages[error.code]||'نسخه صفحه تغییر کرده است؛ تغییرات محلی را نگه دارید و نسخه جدید را بررسی کنید.'});}

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

// TENX_P37_311_SECURITY

// TENX_P37_312_PAGINATION_TX
