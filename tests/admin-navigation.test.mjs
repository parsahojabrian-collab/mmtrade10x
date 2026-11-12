import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const admin = readFileSync(new URL('../apps/api/public/admin.html', import.meta.url), 'utf8');
const mobile = admin.match(/<script id="p53-owner-mobile-js">([\s\S]*?)<\/script>/)[1];
const render = mobile.slice(mobile.indexOf('  function render(items){'), mobile.indexOf('  function refresh(){'));
const navigate = admin.slice(admin.indexOf('async function navigateManagement('), admin.indexOf('async function boot(){'));

class Element {
  children = [];
  handlers = {};
  classList = { toggle() {} };
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute() {}
  addEventListener(name, callback) { this.handlers[name] = callback; }
  querySelectorAll(selector) {
    const [tag, className] = selector.split('.');
    return this.children.flatMap(child => [
      ...(child.tag === tag && child.className.split(' ').includes(className) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
}

for (const id of ['objectStudio', 'users']) {
  test(`mobile menu opens ${id} through management navigation`, async () => {
    const groupsHost = new Element();
    const calls = [];
    const scope = {
      groupsHost, bar: new Element(), filterItems() {}, close() {},
      cur: 'overview', me: { role: 'SUPER_ADMIN' },
      document: { querySelectorAll: () => [] },
      window: { MMTradeObjectStudioOpen: async () => calls.push('studio') },
      show: async target => { calls.push(target); scope.cur = target; },
      element(tag, className, textContent) {
        return Object.assign(new Element(), { tag, className, textContent });
      },
      byId() { return null; }, console
    };
    runInNewContext(`${navigate}\n${render}\nrender([['${id}', '${id}']]);`, scope);
    groupsHost.querySelectorAll('button.p53-item')[0].handlers.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, id === 'objectStudio' ? ['visualStudio'] : ['users']);
  });
}

test('empty-menu recovery preserves the Object Studio navigation route', async () => {
  const code = admin.match(/<script id="tenx-p52-mobile-recovery">([\s\S]*?)<\/script>/)[1];
  let callback;
  const calls = [];
  const nodes = {
    app: { classList: { contains: () => false } }, nav: { children: [] },
    who: { textContent: 'owner · SUPER_ADMIN' }
  };
  const scope = {
    document: { readyState: 'complete', getElementById: id => nodes[id], querySelectorAll: () => [] },
    MutationObserver: class { observe() {} },
    MENU: [['objectStudio', 'Object Studio']], ok: () => true,
    me: { role: 'SUPER_ADMIN' }, cur: 'overview', console,
    window: { MMTradeObjectStudioOpen: async () => calls.push('studio') },
    show: async id => { calls.push(id); scope.cur = id; },
    TENX_P51_RENDER_MENU(entries, handler) { callback = handler; }
  };
  runInNewContext(`${navigate}\n${code}`, scope);
  assert.equal(typeof callback, 'function');
  await callback('objectStudio');
  assert.deepEqual(calls, ['visualStudio']);
});
