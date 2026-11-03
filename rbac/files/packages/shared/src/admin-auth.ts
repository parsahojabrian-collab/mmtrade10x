import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

export const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'USER_MANAGER',
  'SUPPORT',
  'CONTENT_MANAGER',
  'ACADEMY_MANAGER',
  'CHALLENGE_MANAGER',
  'ANALYST',
  'MARKETING_MANAGER'
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'base64');
  const expected = Buffer.from(parts[2]!, 'base64');
  const actual = await scryptAsync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Changes whenever the password changes, so old sessions die after a reset. */
export function passwordVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export type SessionPayload = { sub: string; role: string; pv: string; exp: number };

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): SessionPayload | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof p.sub !== 'string' || typeof p.pv !== 'string' || typeof p.exp !== 'number') return null;
    return p.exp > nowSeconds ? p : null;
  } catch {
    return null;
  }
}

type Rule = { match: RegExp; read?: readonly AdminRole[]; write?: readonly AdminRole[] };

const ALL = ADMIN_ROLES;
// SUPER_ADMIN always passes. Any route not matched by a rule is SUPER_ADMIN-only (safe default).
const RULES: Rule[] = [
  { match: /^GET \/admin\/auth\/me$/, read: ALL },
  { match: /^GET \/admin\/summary$/, read: ALL },
  { match: /^\S+ \/admin\/users(\/|$)/, read: ['USER_MANAGER', 'SUPPORT', 'ANALYST', 'MARKETING_MANAGER'], write: ['USER_MANAGER'] },
  { match: /^\S+ \/admin\/tickets(\/|$)/, read: ['SUPPORT', 'USER_MANAGER'], write: ['SUPPORT'] },
  { match: /^\S+ \/admin\/(followups|notifications|incomplete)(\/|$)/, read: ['MARKETING_MANAGER', 'USER_MANAGER'], write: ['MARKETING_MANAGER'] },
  { match: /^\S+ \/admin\/content(\/|$)/, read: ['CONTENT_MANAGER', 'ANALYST'], write: ['CONTENT_MANAGER'] },
  { match: /^\S+ \/admin\/academy(\/|$)/, read: ['ACADEMY_MANAGER', 'ANALYST'], write: ['ACADEMY_MANAGER'] },
  { match: /^\S+ \/admin\/challenges?(\/|$)/, read: ['CHALLENGE_MANAGER', 'ANALYST'], write: ['CHALLENGE_MANAGER'] }
];

export function canAccess(role: string, routeKey: string): boolean {
  if (role === 'SUPER_ADMIN') return true;
  const isRead = routeKey.startsWith('GET ');
  for (const rule of RULES) {
    if (!rule.match.test(routeKey)) continue;
    const allowed = isRead ? rule.read : rule.write;
    return Boolean(allowed && (allowed as readonly string[]).includes(role));
  }
  return false;
}
