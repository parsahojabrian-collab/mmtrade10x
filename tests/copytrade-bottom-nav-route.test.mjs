import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const unified = readFileSync(new URL('../public/miniapp/shared/mm-bottom-nav.js', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../public/miniapp/p74/mf-navigation.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../public/miniapp/p74/home.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../apps/api/src/index.ts', import.meta.url), 'utf8');

function extract(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Cannot extract ${start}`);
  return source.slice(a, b);
}

const unifiedHelpers = extract(unified, 'const P74_STEP4_HREF=', 'const routeIds=');
const targetHref = runInNewContext(`(() => { ${unifiedHelpers}; return targetHref; })()`);

const mfHelpers = extract(legacy, 'function isCopyTradingItem(item)', 'function activeItem(items)');
const makeMfItems = runInNewContext(`(() => {
  const STAGE1 = '/miniapp/index.html?view=mmtrade10x';
  const P74_STEP4_HREF = '/eplanet';
  const iconPaths = { home: '', academy: '', support: '', chart: '', trophy: '', user: '', book: '', star: '' };
  const validHref = href => typeof href === 'string' && href.startsWith('/');
  ${mfHelpers}
  return makeItems;
})()`);

test('Copy Trade and P74 home step four resolve to the same ePlanet route', () => {
  assert.match(home, /\[3,'\/eplanet'\]/);
  assert.match(api, /eplanet:\s*\{[^\n]*defaultPath:'\/eplanet',target:'\/miniapp\/p74\/eplanet\/index\.html'/);
  assert.match(unified, /a\.href=targetHref\(it\)/);
  assert.match(legacy, /href: isCopyTradingItem\(item\) \? P74_STEP4_HREF : item\.href/);
});

test('unified nav fixes a configured Copy Trade link without changing unrelated tabs', () => {
  for (const label of ['کپی ترید', 'کپی‌ترید', 'کپی تریدینگ', 'Copy Trading']) {
    assert.equal(targetHref({ id: 'support', label, href: '/copy-trading' }), '/eplanet', label);
  }
  assert.equal(targetHref({ id: 'copy-trading', label: 'آموزش کپی‌ترید', href: '/copytrade-academy' }), '/eplanet');
  assert.equal(targetHref({ id: 'support', label: 'پشتیبانی', href: '/support' }), '/support');
  assert.equal(targetHref({ id: 'profile', label: 'پروفایل', href: '/profile' }), '/profile');
});

test('P74-managed bottom navigation ignores stale Copy Trade hrefs', () => {
  const items = makeMfItems([
    { id: 'copy-trading', label: 'آموزش کپی‌ترید', href: '/copytrade-academy', icon: 'chart', enabled: true, sort: 20 },
    { id: 'support', label: 'پشتیبانی', href: '/support', icon: 'support', enabled: true, sort: 30 }
  ]);
  assert.equal(items.find(item => item.id === 'copy-trading').href, '/eplanet');
  assert.equal(items.find(item => item.id === 'support').href, '/support');
  assert.equal(makeMfItems([{ id: 'custom', label: 'کپی ترید', href: '/copy-trading', icon: 'chart', enabled: true, sort: 10 }])[0].href, '/eplanet');
});

test('redirected ePlanet page can mark the Copy Trade navigation item active', () => {
  assert.match(unified, /curr==='\/miniapp\/p74\/eplanet\/index\.html'/);
  assert.match(legacy, /path === '\/miniapp\/p74\/eplanet\/index\.html'/);
});
