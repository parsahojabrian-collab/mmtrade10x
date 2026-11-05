import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateTelegramInitData } from '../packages/shared/src/telegram-init-data.ts';

const api = await readFile(new URL('../apps/api/src/index.ts', import.meta.url), 'utf8');
const bot = await readFile(new URL('../apps/bot/src/index.ts', import.meta.url), 'utf8');
const schema = await readFile(new URL('../packages/db/prisma/schema.prisma', import.meta.url), 'utf8');

test('Telegram initData HMAC is accepted and tampering is rejected', () => {
  const token = '123456:TEST_TOKEN';
  const authDate = Math.floor(Date.now() / 1000);
  const user = JSON.stringify({ id: 123456789, first_name: 'Test' });
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAE-test', user });
  const check = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  params.set('hash', hash);
  const valid = validateTelegramInitData(params.toString(), token, 300);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.user.id, 123456789);
  params.set('user', JSON.stringify({ id: 999, first_name: 'Tampered' }));
  assert.equal(validateTelegramInitData(params.toString(), token, 300).ok, false);
});

test('public pre-registration endpoint requires privacy consent and stores consent', () => {
  assert.match(api, /app\.post\('\/public\/pre-register'/);
  assert.match(api, /privacyConsent: z\.literal\(true\)/);
  assert.match(api, /type: 'PRIVACY_PROCESSING'/);
});

test('Telegram auth validates initData on server and bot uses official API', () => {
  assert.match(api, /validateTelegramInitData\(body\.data\.initData, token/);
  assert.match(bot, /const bot = new Bot\(token,\s*apiRoot \? \{ client: \{ apiRoot \} \} : undefined\);/);
  assert.doesNotMatch(bot, /telegram-relay-parsa/);
});

test('registration progress and reminder data models exist', () => {
  assert.match(schema, /model RegistrationStageEvent/);
  assert.match(schema, /model ChannelMembershipCheck/);
  assert.match(schema, /model FollowUpJob/);
});
