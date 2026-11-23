import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateTelegramInitData } from '../packages/shared/src/telegram-init-data.ts';

const load = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = load('../apps/api/src/index.ts');
const css = load('../public/miniapp/shared/mm-bottom-nav.css');
const index = load('../public/miniapp/index.html');

function signedInitData(token, timestamp) {
  const params = new URLSearchParams({
    auth_date: String(timestamp),
    user: JSON.stringify({ id: 101010, first_name: 'Test' })
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

test('malformed max-age cannot silently disable Telegram initData expiry', () => {
  const token = '12345:fake-token';
  const stale = signedInitData(token, 1577836800);
  for (const age of [NaN, Infinity, -1, 0]) {
    assert.deepEqual(validateTelegramInitData(stale, token, age),
      { ok: false, reason: 'invalid_max_age' });
  }
  assert.deepEqual(validateTelegramInitData(stale, token, 300),
    { ok: false, reason: 'init_data_expired' });
  const fresh = signedInitData(token, Math.floor(Date.now() / 1000));
  assert.equal(validateTelegramInitData(fresh, token, 300).ok, true);
});

test('unified bottom bar suppresses the old MATIN FUTURE bar', () => {
  assert.match(index, /\/miniapp\/p74\/mf-navigation\.js/);
  assert.match(index, /\/miniapp\/shared\/mm-bottom-nav\.js/);
  assert.match(css, /html\.mmu-nav-ready \.mf-global-bottom-nav,/);
  assert.match(css, /\.r10-bottom \{ display: none !important; \}/);
});

test('admin settings and audit log are committed in the same transaction', () => {
  const start = api.indexOf("app.put('/admin/settings'");
  const end = api.indexOf("app.patch('/admin/users/:id'", start);
  assert.ok(start >= 0 && end > start);
  const route = api.slice(start, end);
  assert.match(route, /await prisma\.\$transaction\(\[/);
  assert.match(route, /prisma\.auditLog\.create\(\{ data: \{ adminUserId: adminIdOf\(request\), action: 'ADMIN_SETTINGS_UPDATED'/);
  assert.doesNotMatch(route, /\]\)\);\s*await prisma\.auditLog\.create/);
});
