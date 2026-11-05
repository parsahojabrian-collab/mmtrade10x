import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const code = readFileSync(new URL('../public/miniapp/p74/image-optimizer.js', import.meta.url), 'utf8');
const scope = { window: {}, Blob, File };
runInNewContext(code, scope);
const opt = scope.window.MMTradeImageOptimizer;

test('background sizes are constrained without stretching', () => {
  const b = opt.bounds(3000, 7000, opt.LIMITS.background);
  assert.equal(b.width, 1371);
  assert.equal(b.height, 3200);
  assert.equal(opt.bounds(700, 1400, opt.LIMITS.background).width, 700);
});

test('object sizes stay inside 1600px while preserving aspect ratio', () => {
  const b = opt.bounds(2000, 1000, opt.LIMITS.object);
  assert.equal(b.width, 1600);
  assert.equal(b.height, 800);
});

test('invalid image types cannot enter uploader', async () => {
  const f = new File(['test'], 'unsafe.svg', { type: 'image/svg+xml' });
  await assert.rejects(opt.optimize(f, { role: 'object' }), /PNG/);
});

test('images larger than 35 MiB are rejected before decoding', async () => {
  const f = new File([new Uint8Array(35 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' });
  await assert.rejects(opt.optimize(f, { role: 'background' }), /۳۵/);
});

test('editor uses optimizer for both backgrounds and image objects', () => {
  const html = readFileSync(new URL('../apps/api/public/admin.html', import.meta.url), 'utf8');
  assert.match(html, /image-optimizer\.js\?v=OBJECT_STUDIO_OPTIMIZE_R2/);
  assert.match(html, /MMTradeImageOptimizer\.optimize\(file,\{role/);
  assert.match(html, /uploadObjectMedia\(f,'background'\)/);
  assert.match(html, /uploadObjectMedia\(f,'object'\)/);
});
