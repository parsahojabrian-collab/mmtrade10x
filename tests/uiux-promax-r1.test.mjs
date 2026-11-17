import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const entrypoints = [
  'apps/api/public/admin.html',
  'apps/api/public/team.html',
  'public/miniapp/academy.html',
  'public/miniapp/control-center-v2/index.html',
  'public/miniapp/custom.html',
  'public/miniapp/index.html',
  'public/miniapp/p74/copytrade-academy/index.html',
  'public/miniapp/p74/eplanet/admin.html',
  'public/miniapp/p74/eplanet/index.html',
  'public/miniapp/p74/learning/academy-home.html',
  'public/miniapp/p74/learning/academy-preview.html',
  'public/miniapp/p74/learning/academy-studio.html',
  'public/miniapp/p74/learning/admin-challenge.html',
  'public/miniapp/p74/learning/stage1.html',
  'public/miniapp/p74/learning/stage2.html',
  'public/miniapp/p74/learning/studio.html',
  'public/miniapp/p74/mmtrade-r3-preview/index.html',
  'public/miniapp/p74/preview.html',
  'public/miniapp/p74/profile/editor.html',
  'public/miniapp/p74/profile/preview.html',
  'public/miniapp/p74/profile/profile.html',
  'public/miniapp/p74/studio/index.html',
  'public/miniapp/p74/studio/page-runtime.html',
  'public/miniapp/p74/support/preview.html',
  'public/miniapp/p74/support/support.html',
  'public/miniapp/support-preview/index.html',
  'public/miniapp/support.html',
];

test('all 27 UI entrypoints load the scoped Pro Max layer exactly once', () => {
  assert.equal(entrypoints.length, 27);
  for (const path of entrypoints) {
    const html = read(path);
    assert.equal((html.match(/mm-uiux-promax-r1\.css/g) || []).length, 1, path);
    assert.match(html, /<html\b[^>]*\bdir=["']rtl["']/i, path);
    assert.match(html, /<\/head\s*>/i, path);
  }
});

test('admin and team retain independent shell enhancements', () => {
  assert.match(read('apps/api/public/admin.html'), /id="mm-uupm-admin-r1"/);
  assert.match(read('apps/api/public/team.html'), /id="mm-uupm-team-r1"/);
});

test('home remains scalable, with existing P74 staging and separate nav intact', () => {
  const html = read('public/miniapp/index.html');
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  assert.match(read('public/miniapp/p74/home.css'), /mountain_steps_5\.webp/);
  assert.match(read('public/miniapp/p74/home.js'), /p74-mountain-area/);
  const nav = read('public/miniapp/shared/mm-bottom-nav.js');
  for (const id of ['home','academy','challenge','support','profile']) {
    assert.ok(nav.includes("id:'" + id + "'"), 'missing original nav item: ' + id);
  }
});

test('design rules cover all core surfaces and accessible interactions', () => {
  const css = read('public/miniapp/shared/mm-uiux-promax-r1.css');
  for (const marker of [
    '#p74-app','#mmu-bottom-nav','#p77-app','#p78-app','.academy-shell',
    '#course-index','.app-shell .steps','#workspace','.studio-shell',
    '#mmtrade10x-view',':focus-visible','prefers-reduced-motion',
    'safe-area-inset-bottom','mm-peyda-ui.css'
  ]) assert.ok(css.includes(marker), 'Missing design marker: ' + marker);
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
});

test('public font configuration only references privately supplied assets', () => {
  const css = read('public/miniapp/shared/mm-peyda-ui.css');
  assert.equal((css.match(/@font-face/g) || []).length, 18);
  assert.match(css, /\/fonts\/peyda\/standard\//);
  assert.match(css, /\/fonts\/peyda\/fanum\//);
});
