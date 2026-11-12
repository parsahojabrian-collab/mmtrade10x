import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/miniapp/p74/image-optimizer.js', import.meta.url), 'utf8');

function setup({ bitmap = false, dataUrl = false, urlWorks = false, webpWorks = true, encodeWorks = true, encodedBytes = 6000 } = {}) {
  let bitmapClosed = false;
  let urlRevoked = 0;
  let dataRead = 0;
  const dims = { naturalWidth: 1440, naturalHeight: 600 };
  class FakeImage {
    set src(value) {
      queueMicrotask(() => {
        if ((urlWorks && value.startsWith('blob:')) || (dataUrl && value.startsWith('data:image/'))) {
          Object.assign(this, dims); this.onload?.();
        } else this.onerror?.();
      });
    }
  }
  class FakeReader {
    readAsDataURL() { dataRead++; queueMicrotask(() => { this.result = 'data:image/jpeg;base64,AA=='; this.onload?.(); }); }
  }
  const scope = {
    window: {}, Blob, File,
    URL: { createObjectURL: () => 'blob:picture', revokeObjectURL: () => { urlRevoked++; } },
    Image: FakeImage,
    FileReader: FakeReader,
    createImageBitmap: bitmap ? async () => ({ width: 1440, height: 600, close() { bitmapClosed = true; } }) : undefined,
    document: { createElement() { return { width: 0, height: 0, getContext() { return { drawImage() {}, imageSmoothingEnabled: false, imageSmoothingQuality: '' }; }, toBlob(cb, type) { cb(encodeWorks && (webpWorks || type !== 'image/webp') ? new Blob([new Uint8Array(encodedBytes)], { type }) : null); } }; } }
  };
  vm.runInNewContext(code, scope);
  return { opt: scope.window.MMTradeImageOptimizer, get bitmapClosed() { return bitmapClosed; }, get urlRevoked() { return urlRevoked; }, get dataRead() { return dataRead; } };
}

const large = (type = 'image/jpeg', name = 'poster.jpg') => new File([new Uint8Array(200000)], name, { type });

test('uses native bitmap decoding after Safari blob-URL failure and releases it', async () => {
  const env = setup({ bitmap: true });
  const result = await env.opt.optimize(large(), { role: 'object' });
  assert.equal(result.file.type, 'image/webp');
  assert.equal(result.width, 1440);
  assert.equal(result.height, 600);
  assert.equal(env.bitmapClosed, true);
  assert.equal(env.urlRevoked, 1);
});

test('uses FileReader URL when blob-URL and bitmap decoders fail', async () => {
  const env = setup({ dataUrl: true });
  const result = await env.opt.optimize(large());
  assert.equal(result.file.type, 'image/webp');
  assert.equal(env.dataRead, 1);
});

test('converts iPhone HEIC to a supported upload format when browser decodes it', async () => {
  const env = setup({ bitmap: true });
  const result = await env.opt.optimize(large('image/heic', 'iphone.heic'));
  assert.equal(result.file.type, 'image/webp');
  assert.match(result.file.name, /\.webp$/);
});

test('never sends raw HEIC when browser cannot decode it', async () => {
  const env = setup();
  await assert.rejects(env.opt.optimize(large('image/heic', 'iphone.heic')), /JPG|PNG/);
});

test('provides explicit guidance when all image decoders fail', async () => {
  const env = setup();
  await assert.rejects(env.opt.optimize(large()), /JPG|PNG/);
});

test('accepts a blank MIME for a correctly named PNG image', async () => {
  const env = setup({ urlWorks: true });
  const file = new File([new Uint8Array(1024)], 'poster.png', { type: '' });
  const result = await env.opt.optimize(file);
  assert.equal(result.file.type, 'image/png');
  assert.equal(result.file.size, 1024);
});


test('an unsupported source is never returned when every encoder fails', async () => {
  const env = setup({ bitmap: true, encodeWorks: false });
  await assert.rejects(env.opt.optimize(large('image/heic', 'iphone.heic')), /JPG|PNG/);
  assert.equal(env.bitmapClosed, true);
});

test('an encoder failure cannot bypass the requested image bounds', async () => {
  const env = setup({ bitmap: true, encodeWorks: false });
  await assert.rejects(env.opt.optimize(large(), { role: 'object', maxDimension: 128 }), /JPG|PNG/);
});

test('an oversized encoded result cannot fall back to an unresized source', async () => {
  const env = setup({ bitmap: true, encodedBytes: 12 * 1024 * 1024 + 1 });
  await assert.rejects(env.opt.optimize(large(), { role: 'object', maxDimension: 128 }), /۱۲/);
});

test('native fallback after encoding failure retains the inferred MIME', async () => {
  const env = setup({ bitmap: true, encodeWorks: false });
  const file = large('', 'poster.png');
  const result = await env.opt.optimize(file);
  assert.equal(result.file.type, 'image/png');
  assert.equal(result.file.size, file.size);
  assert.equal(result.width, 1440);
});
