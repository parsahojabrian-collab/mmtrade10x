import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_ROLES, canAccess, hashPassword, passwordVersion, signSession, verifyPassword, verifySession } from '../packages/shared/src/admin-auth.ts';

const SECRET = 'x'.repeat(40);

test('password hash verifies and rejects wrong password', async () => {
  const h = await hashPassword('correct-horse-battery');
  assert.equal(await verifyPassword('correct-horse-battery', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('session round trip, tamper, expiry, wrong secret', () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const t = signSession({ sub: 'a1', role: 'SUPPORT', pv: 'p', exp }, SECRET);
  assert.equal(verifySession(t, SECRET)?.sub, 'a1');
  assert.equal(verifySession(t, 'y'.repeat(40)), null);
  assert.equal(verifySession(t.slice(0, -2) + 'AA', SECRET), null);
  const old = signSession({ sub: 'a1', role: 'SUPPORT', pv: 'p', exp: 10 }, SECRET);
  assert.equal(verifySession(old, SECRET), null);
});

test('password version changes with hash', async () => {
  assert.notEqual(passwordVersion(await hashPassword('aaaaaaaaaaaa')), passwordVersion(await hashPassword('aaaaaaaaaaaa')));
});

test('role permissions', () => {
  assert.equal(ADMIN_ROLES.length, 8);
  assert.equal(canAccess('SUPER_ADMIN', 'POST /admin/anything'), true);
  assert.equal(canAccess('SUPPORT', 'GET /admin/tickets'), true);
  assert.equal(canAccess('SUPPORT', 'PATCH /admin/tickets/:id'), true);
  assert.equal(canAccess('SUPPORT', 'PATCH /admin/users/:id'), false);
  assert.equal(canAccess('ANALYST', 'GET /admin/users'), true);
  assert.equal(canAccess('ANALYST', 'PATCH /admin/users/:id'), false);
  assert.equal(canAccess('USER_MANAGER', 'PATCH /admin/users/:id'), true);
  for (const r of ADMIN_ROLES.filter((r) => r !== 'SUPER_ADMIN')) {
    assert.equal(canAccess(r, 'GET /admin/settings'), false, r + ' settings');
    assert.equal(canAccess(r, 'GET /admin/admins'), false, r + ' admins');
    assert.equal(canAccess(r, 'GET /admin/summary'), true, r + ' summary');
  }
  assert.equal(canAccess('ACADEMY_MANAGER', 'POST /admin/academy/courses'), true);
  assert.equal(canAccess('CONTENT_MANAGER', 'POST /admin/academy/courses'), false);
});
