import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/miniapp/p74/home.js', import.meta.url), 'utf8');
const match = source.match(/function pageElementGeometry\(node,fallbackStage\)\{([\s\S]*?)\n\}/);
assert.ok(match, 'pageElementGeometry helper must exist in P74 source');
const pageElementGeometry = new Function('node', 'fallbackStage', match[1]);

function host(overrides = {}) {
  return {
    clientWidth: 420,
    clientHeight: 780,
    clientLeft: 10,
    clientTop: 10,
    scrollLeft: 5,
    scrollTop: 20,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 440, height: 800 }),
    ...overrides
  };
}

test('reads x/y and width/height as percentages of parent padding box', () => {
  const parent = host();
  const node = {
    offsetParent: parent,
    getBoundingClientRect: () => ({ left: 147, top: 346, width: 210, height: 195 })
  };
  assert.deepEqual(pageElementGeometry(node, null), { x: 10, y: 20, w: 50, h: 25 });
});

test('uses fallback stage when offsetParent is unavailable', () => {
  const parent = host({ clientWidth: 200, clientHeight: 100, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) });
  const node = { offsetParent: null,
    getBoundingClientRect: () => ({ left: 20, top: 10, width: 40, height: 20 }) };
  assert.deepEqual(pageElementGeometry(node, parent), { x: 10, y: 10, w: 20, h: 20 });
});

test('clamps an element that extends beyond the parent bounds', () => {
  const parent = host({ clientWidth: 200, clientHeight: 100, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) });
  const node = { offsetParent: parent,
    getBoundingClientRect: () => ({ left: 180, top: 90, width: 80, height: 25 }) };
  assert.deepEqual(pageElementGeometry(node, null), { x: 60, y: 75, w: 40, h: 25 });
});

test('returns null when a parent has no measurable dimensions', () => {
  const parent = host({ clientWidth: 0, clientHeight: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) });
  const node = { offsetParent: parent,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) };
  assert.equal(pageElementGeometry(node, null), null);
});

test('both preview selection and direct editor geometry use the shared helper', () => {
  assert.match(source, /function geometry\(node\)\{return pageElementGeometry\(node,stage\)\}/);
  assert.match(source, /const layout=pageElementGeometry\(node,document\.querySelector\('\.p74-page'\)\)/);
  assert.match(source, /hostWidth=Number\(host\.clientWidth\)\|\|hr\.width/);
  assert.match(source, /hostHeight=Number\(host\.clientHeight\)\|\|hr\.height/);
});
