import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const safeSource = read('public/miniapp/safe-html.js');
const scope = { window: {} };
runInNewContext(safeSource, scope);
const safe = scope.window.TenxSafeHtml;

test('custom HTML sanitizer exposes a bounded allowlist renderer', () => {
  assert.equal(typeof safe.append, 'function');
  assert.ok(safe.allowedTags.includes('section'));
  assert.ok(safe.allowedTags.includes('table'));
  for (const tag of ['script', 'style', 'iframe', 'form', 'svg', 'object']) {
    assert.ok(safe.droppedTags.includes(tag));
    assert.ok(!safe.allowedTags.includes(tag));
  }
});

test('custom HTML links reject script schemes and protocol-relative URLs', () => {
  assert.equal(safe.isSafeUrl('/miniapp/example'), true);
  assert.equal(safe.isSafeUrl('https://example.com/path'), true);
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/x', '/a/../b', 'https://x.test/" onmouseover="x']) {
    assert.equal(safe.isSafeUrl(value), false, value);
  }
});

test('custom HTML images are restricted to local assets', () => {
  assert.equal(safe.isSafeImageUrl('/uploads/home-studio/photo.webp'), true);
  assert.equal(safe.isSafeImageUrl('/miniapp/p74/assets/logo.webp'), true);
  for (const value of ['https://evil.example/x.png', 'data:image/png;base64,AA', '//evil.example/x.png', '/uploads/../secret.png']) {
    assert.equal(safe.isSafeImageUrl(value), false, value);
  }
});

test('inline styles allow bounded design properties and remove executable or layout-control CSS', () => {
  const result = safe.sanitizeStyle('color:#ffffff;background-color:#10251b;padding:16px;border-radius:14px;position:fixed;z-index:9999;background-image:url(https://evil.test/x);width:100%');
  assert.equal(result.color, '#ffffff');
  assert.equal(result['background-color'], '#10251b');
  assert.equal(result.padding, '16px');
  assert.equal(result['border-radius'], '14px');
  assert.equal(result.width, '100%');
  assert.equal(result.position, undefined);
  assert.equal(result['z-index'], undefined);
  assert.equal(result['background-image'], undefined);
});

test('API, editor, preview and public renderer all support the same HTML block', () => {
  const api = read('apps/api/src/index.ts');
  const admin = read('apps/api/public/admin.html');
  const publicBlocks = read('public/miniapp/blocks.js');
  const index = read('public/miniapp/index.html');
  assert.match(api, /type: z\.literal\('html'\), html: z\.string\(\)\.min\(1\)\.max\(16000\)/);
  assert.match(admin, /html: \[\['html','کد HTML سفارشی/);
  assert.match(admin, /safeHtml\.append\(n, b\.html \|\| ''\)/);
  assert.match(admin, /window\.TenxSafeHtml\.append\(n,b\.html\|\|''\)/);
  assert.match(publicBlocks, /case 'html':var custom=el\('section','tenx-custom-html'\)/);
  assert.ok(index.indexOf('/miniapp/safe-html.js') < index.indexOf('/miniapp/blocks.js'));
});

test('custom HTML is never directly injected as innerHTML or executable script', () => {
  assert.doesNotMatch(safeSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(safeSource, /\beval\s*\(|new Function\s*\(/);
  assert.match(safeSource, /attribute\.name\.toLowerCase\(\)/);
  assert.match(safeSource, /name\.startsWith\('on'\)/);
});
