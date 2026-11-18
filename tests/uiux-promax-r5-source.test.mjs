import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('all 18 Peyda faces come from existing public P74 path', () => {
  const css = source('public/miniapp/10x-fonts.css');
  assert.equal((css.match(/@font-face/g) || []).length, 18);
  assert.match(css, /mm-uux-r1\/fonts\/peyda\/standard\/PeydaWeb-Regular/);
  assert.match(css, /mm-uux-r1\/fonts\/peyda\/fanum\/PeydaWebFaNum-Black/);
  assert.doesNotMatch(css, /fonts\/doran/i);
});

test('Home renders native 3D mark and preserves configurable objects and stages', () => {
  const js = source('public/miniapp/p74/home.js');
  const css = source('public/miniapp/p74/home.css');
  assert.match(js, /p74-header-cube/);
  assert.match(js, /renderObjects\(stage,cfg,editorDrag\)/);
  assert.match(js, /makeLink\('p74-step'/);
  assert.match(css, /p74-cube-front/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /fonts\/doran|P74Doran/);
});

test('Profile groups metrics but keeps genuine user actions and CTA', () => {
  const js = source('public/miniapp/p74/profile/profile.js');
  const css = source('public/miniapp/p74/profile/profile.css');
  assert.match(js, /p77-overview-grid/);
  assert.match(js, /data-action=/);
  assert.match(js, /id=\"p77-main-cta\"/);
  assert.match(css, /min-width:900px/);
  assert.doesNotMatch(css, /fonts\/doran|P77Doran/);
});

test('bottom navigation keeps one component and uses local Peyda', () => {
  const nav = source('public/miniapp/shared/mm-bottom-nav.css');
  assert.match(nav, /MM-Peyda-Nav/);
  assert.doesNotMatch(nav, /fonts\/doran|MMU-Doran/);
});

test('Studio keeps stable save publish preview and spatial controls', () => {
  const html = source('public/miniapp/p74/studio/index.html');
  const css = source('public/miniapp/p74/studio/studio.css');
  for (const id of ['workspace','page-toolbar','save','publish','spatial-panel','mmvs-pc-device']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing Studio hook: ' + id);
  }
  assert.match(html, /mmvs-workspace-intro/);
  assert.match(css, /MM-Peyda-Studio/);
});

test('ePlanet still exposes real verification flow', () => {
  const html = source('public/miniapp/p74/eplanet/index.html');
  for (const id of ['doneCount','stepDialog','refreshStatus','submitVerification']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing verification hook: ' + id);
  }
  assert.match(html, /\/miniapp\/10x-fonts.css\?v=UUPM_R5/);
});

test('Copy Trading lessons no longer require Google Fonts', () => {
  const html = source('public/miniapp/p74/copytrade-academy/index.html');
  const css = source('public/miniapp/p74/copytrade-academy/style.css');
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.match(html, /id="course-index"/);
  assert.match(css, /MM-Peyda-FaNum/);
});

test('Support uses the real ticket controls and private Peyda files', () => {
  const css = source('public/miniapp/p74/support/support.css');
  const html = source('public/miniapp/p74/support/support.html');
  assert.match(css, /mm-uux-r1\/fonts\/peyda/);
  assert.doesNotMatch(css, /fonts\/doran/);
  for (const id of ['newTicketBtn','ticketsBtn','faqBtn']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing support hook: ' + id);
  }
});
