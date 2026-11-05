/* MMTrade Object Studio: client-side image optimization before authenticated upload.
   No remote services, token access, or image retention. */
(function (global) {
  'use strict';
  const MiB = 1024 * 1024;
  const OUTPUT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const TYPES = new Set([...OUTPUT_TYPES, 'image/heic', 'image/heif']);
  const LIMITS = Object.freeze({
    background: Object.freeze({ width: 1440, height: 3200, target: 1.4 * MiB, qualities: [.86, .78, .70] }),
    object: Object.freeze({ width: 1600, height: 1600, target: .65 * MiB, qualities: [.92, .85, .78] })
  });
  const MAX_UPLOAD = 12 * MiB;
  const MAX_SOURCE = 35 * MiB;
  function readable(bytes) { return bytes >= MiB ? (bytes / MiB).toFixed(2) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB'; }
  function bounds(width, height, config) {
    const scale = Math.min(1, config.width / width, config.height / height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  function canvasBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob && blob.size && blob.type === type ? blob : null), type, quality));
  }
  // Safari/WebView can reject a Blob URL even for a supported image.
  // Try the native bitmap decoder and a FileReader URL before reporting failure.
  function decodeUrl(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { image.onload = image.onerror = null; resolve(image); };
      image.onerror = () => { image.onload = image.onerror = null; reject(new Error('IMAGE_DECODE_FAILED')); };
      image.src = src;
    });
  }
  async function imageFromFile(file) {
    try {
      const url = URL.createObjectURL(file);
      try { return await decodeUrl(url); }
      finally { URL.revokeObjectURL(url); }
    } catch (_) { /* fallback below */ }
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file); }
      catch (_) { /* fallback below */ }
    }
    if (typeof FileReader !== 'undefined' && file.size <= 12 * MiB) {
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
          reader.readAsDataURL(file);
        });
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) return await decodeUrl(dataUrl);
      } catch (_) { /* show a useful format error below */ }
    }
    throw new Error('فایل تصویر در این مرورگر قابل باز شدن نیست. برای پوستر خروجی JPG یا PNG واقعی بگیر؛ تغییر پسوند کافی نیست.');
  }
  function mimeType(file) {
    const given = String(file.type || '').toLowerCase();
    if (given) return given;
    const extension = String(file.name || '').toLowerCase().split('.').pop();
    return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' })[extension] || '';
  }
  async function encode(image, size, type, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('مرورگر امکان پردازش تصویر را ندارد');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await canvasBlob(canvas, type, quality);
    canvas.width = canvas.height = 0;
    return blob;
  }
  async function optimize(file, options = {}) {
    const role = options.role === 'background' ? 'background' : 'object';
    const spec = LIMITS[role];
    const notify = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    if (!(file instanceof Blob)) throw new Error('فقط تصویر PNG، JPG، WebP یا HEIC پذیرفته می‌شود');
    const actualType = mimeType(file);
    if (!TYPES.has(actualType)) throw new Error('فقط تصویر PNG، JPG، WebP یا HEIC پذیرفته می‌شود');
    if (file.type !== actualType) file = new File([file], file.name || 'image', { type: actualType, lastModified: Date.now() });
    const mustConvert = !OUTPUT_TYPES.has(actualType);
    if (!file.size || file.size > MAX_SOURCE) throw new Error('حجم اولیه تصویر باید کمتر از ۳۵ مگابایت باشد');
    notify('در حال آماده‌سازی و بهینه‌سازی تصویر…');
    let bestBlob = null;
    let bestSize = null;
    let imageWidth = 0, imageHeight = 0;
    let image;
    try {
      image = await imageFromFile(file);
      imageWidth = image.naturalWidth || image.width;
      imageHeight = image.naturalHeight || image.height;
      if (!imageWidth || !imageHeight || imageWidth * imageHeight > 64000000 || imageWidth > 16000 || imageHeight > 16000) {
        throw new Error('ابعاد تصویر بسیار بزرگ است؛ تصویر کوچک‌تری انتخاب کن');
      }
      let size = bounds(imageWidth, imageHeight, spec);
      const resized = size.width !== imageWidth || size.height !== imageHeight;
      // Small assets should remain untouched unless a resize is needed, avoiding blurry icons.
      if (!resized && file.size <= 48 * 1024 && !mustConvert) return result(file, file, imageWidth, imageHeight);
      const format = 'image/webp'; // WebP keeps alpha, including transparent PNG cutouts.
      for (let round = 0; round < 2; round++) {
        for (const quality of spec.qualities) {
          const blob = await encode(image, size, format, quality);
          // If WebP encoding is unavailable, try a native format below instead.
          if (!blob) break;
          if (!bestBlob || blob.size < bestBlob.size) { bestBlob = blob; bestSize = { ...size }; }
          if (blob.size <= spec.target && blob.size < file.size) break;
        }
        if ((bestBlob && bestBlob.size <= spec.target) || round) break;
        size = { width: Math.max(1, Math.round(size.width * .82)), height: Math.max(1, Math.round(size.height * .82)) };
      }
      if (!bestBlob) {
        // PNG for potentially transparent input; JPEG only for JPEG input.
        const fallbackType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        bestBlob = await encode(image, size, fallbackType, fallbackType === 'image/jpeg' ? .85 : undefined);
        bestSize = { ...size };
      }
    } catch (error) {
      // Never upload an undecodable image or an unconverted HEIC to the existing API.
      if (/بسیار بزرگ|قابل باز شدن نیست/.test(String(error.message))) throw error;
      if (mustConvert) throw new Error('این مرورگر نتوانست HEIC را به WebP تبدیل کند؛ تصویر را به JPG یا PNG تبدیل و دوباره انتخاب کن');
      if (file.size > MAX_UPLOAD) throw new Error('مرورگر نتوانست تصویر بزرگ را بهینه کند؛ از تصویر کوچک‌تری استفاده کن');
      notify('فشرده‌سازی در این مرورگر در دسترس نبود؛ فایل اصلی استفاده شد');
      return result(file, file, imageWidth, imageHeight);
    } finally {
      if (image && typeof image.close === 'function') image.close();
    }
    if (mustConvert && !bestBlob) throw new Error('مرورگر نتوانست فرمت HEIC را تبدیل کند؛ فایل را به JPG یا PNG تبدیل کن');
    if (!bestBlob || (!mustConvert && bestBlob.size >= file.size && file.size <= MAX_UPLOAD)) return result(file, file, imageWidth, imageHeight);
    if (bestBlob.size > MAX_UPLOAD) throw new Error('حجم نهایی تصویر از محدودیت ۱۲ مگابایت بیشتر است');
    const extension = bestBlob.type === 'image/webp' ? '.webp' : bestBlob.type === 'image/png' ? '.png' : '.jpg';
    const name = (String(file.name || 'image').replace(/\.[^.]+$/, '').slice(0, 75) || 'image') + extension;
    const output = new File([bestBlob], name, { type: bestBlob.type, lastModified: Date.now() });
    return result(file, output, bestSize.width, bestSize.height);
  }
  function result(original, output, width, height) {
    const savings = Math.max(0, Math.round(100 * (original.size - output.size) / original.size));
    return {
      file: output, originalBytes: original.size, uploadedBytes: output.size,
      savings, width, height,
      summary: original === output ? 'تصویر با حجم اصلی (' + readable(original.size) + ') استفاده شد' :
        'کاهش حجم: ' + readable(original.size) + ' ← ' + readable(output.size) + ' (' + savings + '٪ کمتر)'
    };
  }
  global.MMTradeImageOptimizer = Object.freeze({ optimize, bounds, readable, LIMITS });
})(window);
