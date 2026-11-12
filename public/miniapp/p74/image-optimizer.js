/* MMTRADE_IMAGE_OPTIMIZER_R33
 * Image optimization for Visual Studio library, Home Studio and Object Studio.
 * Quality-first, transparent-background-safe, no external service or data upload.
 * 10:1 is a target, not a guarantee; never silently destroy GIF animation.
 */
(function (global) {
  'use strict';
  const MiB = 1024 * 1024;
  const VERSION = 'MMTRADE_IMAGE_OPTIMIZER_R33';
  const ACCEPTED = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/avif',
    'image/heic', 'image/heif', 'image/bmp', 'image/gif', 'image/tiff'
  ]);
  const SERVER_ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const MIME_BY_EXT = {
    jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp',
    avif:'image/avif', heic:'image/heic', heif:'image/heif',
    bmp:'image/bmp', dib:'image/bmp', gif:'image/gif', tif:'image/tiff', tiff:'image/tiff'
  };
  const MAX_SOURCE = 80 * MiB;
  const MAX_UPLOAD = 12 * MiB; // Current P62 API limit. Do not relax this in the browser.
  const MAX_PIXELS = 64 * 1000 * 1000;
  const LIMITS = Object.freeze({
    library: Object.freeze({ width: 16000, height: 16000, targetRatio: 10 }),
    background: Object.freeze({ width: 1440, height: 3200, targetRatio: 10 }),
    object: Object.freeze({ width: 1600, height: 1600, targetRatio: 10 })
  });
  const OUTPUTS = Object.freeze([
    ['image/webp', .96], ['image/webp', .92],
    ['image/webp', .88], ['image/webp', .84]
  ]);
  const readable = bytes => bytes >= MiB ? (bytes / MiB).toFixed(2) + ' MB' :
    Math.max(1, Math.round(bytes / 1024)) + ' KB';
  function bounds(width, height, limits) {
    const scale = Math.min(1, limits.width / width, limits.height / height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  function mimeType(file) {
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    const declared = String(file.type || '').toLowerCase();
    const normalized = ({'image/jpg':'image/jpeg', 'image/x-png':'image/png',
      'image/x-ms-bmp':'image/bmp', 'image/x-bmp':'image/bmp', 'image/x-tiff':'image/tiff'})[declared] || declared;
    return ACCEPTED.has(normalized) ? normalized : (MIME_BY_EXT[ext] || normalized);
  }
  function canvasBlob(canvas, mime, quality) {
    return new Promise(resolve => {
      try { canvas.toBlob(blob => resolve(blob && blob.size > 0 && blob.type === mime ? blob : null), mime, quality); }
      catch (_) { resolve(null); }
    });
  }
  function loadUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { img.onerror = img.onload = null; resolve(img); };
      img.onerror = () => { img.onerror = img.onload = null; reject(new Error('IMAGE_DECODE_FAILED')); };
      img.src = url;
    });
  }
  async function readImage(file) {
    let url;
    try { url = URL.createObjectURL(file); return await loadUrl(url); }
    catch (_) { /* Safari/WebView fallback */ }
    finally { if (url) URL.revokeObjectURL(url); }
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file); } catch (_) {}
    }
    if (typeof FileReader !== 'undefined' && file.size <= 12 * MiB) {
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error('FILE_READ_FAILED'));
          r.readAsDataURL(file);
        });
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) return await loadUrl(dataUrl);
      } catch (_) {}
    }
    throw new Error('مرورگر امکان بازکردن این فرمت را ندارد؛ نسخه JPG، PNG یا WebP تصویر را انتخاب کن.');
  }
  /* A GIF must be proven single-frame before using canvas, which otherwise
   * silently turns a multi-frame animation into a still picture. */
  async function gifIsAnimated(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 13 || String.fromCharCode(...bytes.slice(0, 3)) !== 'GIF') throw Error('فایل GIF معتبر نیست');
    let i = 13, frames = 0;
    if (bytes[10] & 0x80) i += 3 * (1 << ((bytes[10] & 7) + 1));
    const skipSubBlocks = () => {
      while (i < bytes.length) {
        const length = bytes[i++]; if (!length) return true;
        i += length;
      }
      return false;
    };
    while (i < bytes.length) {
      const tag = bytes[i++];
      if (tag === 0x3b) return frames > 1;
      if (tag === 0x21) { // extension: label + data subblocks
        if (++i >= bytes.length || !skipSubBlocks()) break;
      } else if (tag === 0x2c) {
        if (i + 9 > bytes.length) break;
        const packed = bytes[i + 8]; i += 9;
        if (packed & 0x80) i += 3 * (1 << ((packed & 7) + 1));
        if (i >= bytes.length) break;
        i++; // LZW minimum code size
        if (!skipSubBlocks()) break;
        if (++frames > 1) return true;
      } else break;
    }
    // Fail closed: an unparseable GIF must not be flattened.
    throw Error('امکان تشخیص فریم‌های GIF وجود ندارد؛ لطفاً PNG یا WebP انتخاب کن');
  }
  function summary(source, final, width, height, resized) {
    const savings = Math.max(0, Math.round((1 - final.size / source.size) * 100));
    const ratio = source.size / final.size;
    const note = source === final ? 'نسخه اصلی حفظ شد؛ کاهش بیشتر بدون افت محسوس کیفیت ممکن نبود' :
      'حجم: ' + readable(source.size) + ' ← ' + readable(final.size) +
      ' | ' + savings + '٪ کاهش | ' + ratio.toFixed(1) + ' برابر';
    return {
      file: final, originalBytes: source.size, uploadedBytes: final.size,
      savings, ratio, targetReached: ratio >= 10, width, height,
      summary: (resized ? 'ابعاد برای جایگاه تصویر تنظیم شد؛ ' : '') + note
    };
  }
  async function optimize(file, options = {}) {
    const role = Object.hasOwn(LIMITS, options.role) ? options.role : 'library';
    const limits = LIMITS[role];
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    if (!(file instanceof Blob)) throw Error('فایل تصویر نامعتبر است');
    if (!file.size || file.size > MAX_SOURCE) throw Error('حجم فایل اولیه باید بین ۱ بایت و ۸۰ مگابایت باشد');
    const mime = mimeType(file);
    if (!ACCEPTED.has(mime)) throw Error('فرمت پشتیبانی نمی‌شود؛ PNG، JPG، WebP، AVIF، HEIC، BMP، TIFF و GIF ثابت قابل بررسی هستند');
    if (mime === 'image/gif' && await gifIsAnimated(file))
      throw Error('GIF متحرک قابل تبدیل با Canvas نیست، چون انیمیشن حذف می‌شود. برای انیمیشن از فایل ویدیویی استفاده کن.');
    const hasServerNativeType = SERVER_ACCEPTED.has(mime);
    const source = file.type === mime ? file : new File([file], file.name || 'image', { type: mime, lastModified: Date.now() });
    let image, canvas;
    try {
      progress('در حال بررسی ابعاد و فشرده‌سازی با حفظ جزئیات…');
      image = await readImage(source);
      const w = image.naturalWidth || image.width;
      const h = image.naturalHeight || image.height;
      if (!w || !h || w > 16000 || h > 16000 || w * h > MAX_PIXELS)
        throw Error('ابعاد تصویر از محدوده پردازش امن مرورگر بیشتر است');
      const maxDimension = Number(options.maxDimension);
      const effectiveLimits = Number.isFinite(maxDimension) && maxDimension >= 128 && maxDimension <= 16000
        ? {width:Math.min(limits.width,maxDimension),height:Math.min(limits.height,maxDimension)} : limits;
      const size = bounds(w, h, effectiveLimits);
      const resized = size.width !== w || size.height !== h;
      if (hasServerNativeType && !resized && source.size <= 48 * 1024)
        return summary(file, source, w, h, false);
      canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw Error('Canvas در مرورگر فعال نیست');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, size.width, size.height);
      let selected = null;
      for (let i = 0; i < OUTPUTS.length; i++) {
        const [type, quality] = OUTPUTS[i];
        progress('بهینه‌سازی تصویر، مرحله ' + (i + 1) + ' از ' + OUTPUTS.length + '…');
        const candidate = await canvasBlob(canvas, type, quality);
        if (!candidate) continue; // Browser may not encode AVIF; exact MIME is checked.
        if (!selected || candidate.size < selected.size) selected = candidate;
        if (candidate.size <= file.size / limits.targetRatio && candidate.size <= MAX_UPLOAD) {
          selected = candidate;
          break; // Keep the highest-fidelity candidate meeting 10:1.
        }
      }
      if (!selected) {
        // Some WebViews do not support WebP encoding.
        const fallback = mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        selected = await canvasBlob(canvas, fallback, fallback === 'image/jpeg' ? .94 : undefined);
      }
      // Avoid a second lossy generation when an already optimized JPEG/WebP
      // would save only a negligible amount. The source remains untouched.
      const minGain = (mime === 'image/jpeg' || mime === 'image/webp') ? .20 : .05;
      if (!selected) {
        if (hasServerNativeType && !resized && source.size <= MAX_UPLOAD)
          return summary(file, source, w, h, false);
        throw Error('امکان تبدیل تصویر وجود ندارد؛ نسخه JPG یا PNG را انتخاب کن');
      }
      if (hasServerNativeType && !resized &&
          selected.size >= file.size * (1 - minGain) && source.size <= MAX_UPLOAD)
        return summary(file, source, w, h, false);
      if (selected.size > MAX_UPLOAD) {
        if (hasServerNativeType && !resized && source.size <= MAX_UPLOAD) return summary(file, source, w, h, false);
        throw Error('با حفظ کیفیت، حجم تصویر به زیر سقف ۱۲ مگابایت نرسید');
      }
      const validExt = selected.type === 'image/webp' ? '.webp' : selected.type === 'image/png' ? '.png' : '.jpg';
      const filename = (String(file.name || 'image').replace(/\.[^.]+$/, '').slice(0, 70) || 'image') + validExt;
      const output = new File([selected], filename, { type: selected.type, lastModified: Date.now() });
      return summary(file, output, size.width, size.height, resized);
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
      if (image && typeof image.close === 'function') image.close();
    }
  }
  global.MMTradeImageOptimizer = Object.freeze({ optimize, bounds, readable, LIMITS, VERSION });
})(window);
