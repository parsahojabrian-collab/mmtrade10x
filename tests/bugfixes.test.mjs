import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalPhone, phoneVariants } from '../packages/shared/src/phone.ts';
import { csvCellSafe } from '../packages/shared/src/csv.ts';
import { canAccess } from '../packages/shared/src/admin-auth.ts';

const api = await readFile(new URL('../apps/api/src/index.ts', import.meta.url), 'utf8');
const bot = await readFile(new URL('../apps/bot/src/index.ts', import.meta.url), 'utf8');

test('phone numbers from every source collapse to one canonical form', () => {
  for (const input of ['۰۹۱۲۳۴۵۶۷۸۹', '09123456789', '9123456789', '989123456789', '+98 912 345 6789', '00989123456789', '+98(912)345-6789']) {
    assert.equal(canonicalPhone(input), '+989123456789', input);
  }
  assert.equal(canonicalPhone('4915123456789'), '+4915123456789');
  assert.ok(phoneVariants('989123456789').includes('09123456789'));
  assert.ok(phoneVariants('09123456789').includes('989123456789'));
});

test('CSV export neutralises formulas but keeps phone numbers intact', () => {
  assert.equal(csvCellSafe('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCellSafe('@cmd'), `"'@cmd"`);
  assert.equal(csvCellSafe('-2+3'), `"'-2+3"`);
  assert.equal(csvCellSafe('+989123456789'), '"+989123456789"');
  assert.equal(csvCellSafe('Ali "Z"'), '"Ali ""Z"""');
  assert.equal(csvCellSafe(null), '""');
});

test('role rules: marketing can export the CSV, analyst can read audit logs, support cannot', () => {
  assert.equal(canAccess('MARKETING_MANAGER', 'GET /admin/registrations/incomplete.csv'), true);
  assert.equal(canAccess('ANALYST', 'GET /admin/audit-logs'), true);
  assert.equal(canAccess('SUPPORT', 'GET /admin/audit-logs'), false);
  assert.equal(canAccess('SUPPORT', 'POST /admin/bot/restart'), false);
});

test('API fixes are present in the source', () => {
  assert.doesNotMatch(api, /adminIdentity/);
  assert.match(api, /trustProxy:/);
  assert.match(api, /requireRegistered/);
  assert.match(api, /csvCellSafe\(v\)/);
  assert.doesNotMatch(api, /const normalizePhone/);
  assert.match(api, /canonicalPhone\(parsed\.data\.phone\)/);
  assert.doesNotMatch(api, /reply\.code\(existing \? 200 : 201\)/);
  assert.match(api, /ZodError/);
  assert.match(api, /adminUser: \{ select: \{ email: true \} \}/);
});

test('bot fixes are present in the source', () => {
  assert.match(bot, /async \(ctx, next\) =>/);
  assert.match(bot, /return next\(\);/);
  assert.match(bot, /canonicalPhone\(contact\.phone_number\)/);
  assert.match(bot, /MAX_AUTO_FOLLOWUPS/);
  assert.match(bot, /bot_blocked/);
  assert.match(bot, /status: 'PROCESSING' \}, data: \{ status: 'PENDING' \}/);
  assert.match(bot, /academyPath: String\(saved\.PAGE_PATH_academy \?\? '\/academy'\)/);
  assert.match(bot, /new URL\(settings\.academyPath \|\| '\/academy', base\)/);
  assert.match(bot, /\.webApp\('🎓 ورود به آکادمی'/);
});


test('content page versioning and rollback are implemented server-side', async () => {
  const schema = await readFile(new URL('../packages/db/prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../packages/db/prisma/migrations/20261030170000_content_versions/migration.sql', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../apps/api/public/admin.html', import.meta.url), 'utf8');
  assert.match(schema, /model ContentPageVersion/);
  assert.match(migration, /CREATE TABLE `ContentPageVersion`/);
  assert.match(api, /app\.get\('\/admin\/content\/pages\/:slug\/versions'/);
  assert.match(api, /app\.post\('\/admin\/content\/pages\/:slug\/rollback'/);
  assert.match(api, /CONTENT_PAGE_ROLLED_BACK/);
  assert.match(panel, /pageHistory\(r\.slug\)/);
});
