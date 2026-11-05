# MMTrade Object Studio — تغییر سورس اصلی (R1)

این بسته یک نصب‌کننده Pxx نیست؛ فقط تغییرات سورس اصلی است. هیچ تغییری در دیتابیس یا تنظیمات موجود کاربران ضروری نیست.

## فایل‌های تغییرکرده

- `apps/api/public/admin.html`: ویرایشگر لایه‌ای، آپلود تصویر، انتخاب انیمیشن و کنترل مختصات در پنل P76
- `apps/api/src/index.ts`: افزایش سقف `element.text` تا 48000 کاراکتر برای ذخیره لایه‌ها در مارکر Home (فقط مسیر مدیریت با مجوز مدیر)
- `public/miniapp/p74/home.js`: نمایش لایه‌ها روی صفحه و drag-and-drop در پیش‌نمایش
- `public/miniapp/p74/home.css`: استایل و انیمیشن‌های آبجکت
- `public/miniapp/p74/preview.html`: بارگذاری مدل پیش‌نمایش
- `public/miniapp/p74/object-model.js`: مدل و اعتبارسنجی مشترک؛ نوع آبجکت، منبع مجاز تصویر، مختصات، انیمیشن و مراحل
- `tests/object-studio.test.mjs`: هشت تست جدید

## مهم: محدودیت تصاویر تخت فعلی

تصاویر `mountain_steps_3.webp` تا `mountain_steps_8.webp` قبلاً پرچم 10X، مکعب‌های MM و نورهای مسیر را در خودشان دارند. این بسته **نمی‌تواند پیکسل‌های آن‌ها را به آبجکت مستقل تبدیل کند**. باید ۶ نسخه «فقط کوه و پله‌های سنگی» بدون اجزای تزئینی تولید شود و در پنل، به‌عنوان پس‌زمینه هر شماره ۳ تا ۸ آپلود شود. سپس پرچم، نور و دیگر عناصر را به‌صورت لایه اضافه کنید. تا قبل از این کار، حذف آبجکت جلوی لایه‌های جدید را می‌گیرد ولی نسخه حک‌شده در پس‌زمینه را حذف نمی‌کند.

## فرآیند ایمن اعمال روی سرور

1. این مخزن GitHub قبلاً به شاخه `main` ارسال شده. قبل از ادغام، وضعیت `git status --short` و `git log -1` را بررسی کنید و مطمئن شوید API عکس پروفایل Worker در آن موجود است.
2. فایل `object-studio-source.diff` را به `/root` انتقال دهید.
3. در `/root/miniapp10x` ابتدا `git apply --check /root/object-studio-source.diff` را اجرا کنید. اگر خطا داد، **اجرا نکنید** و تغییرات فعلی را بازنویسی نکنید.
4. سپس `git apply /root/object-studio-source.diff` و تست‌های `node --test tests/object-studio.test.mjs`، `node --test tests/*.test.mjs` و `./node_modules/.bin/tsc -p tsconfig.json --noEmit` را اجرا کنید.
5. **تا زمان انتشار تأیید‌شده، به سرویس‌ها و فایل‌های Live دست نزنید.** انتشار نیازمند انتقال `public/miniapp/p74/{object-model.js,home.js,home.css,preview.html}` به `/srv/tenx-public/miniapp/p74/`، Build و انتشار `apps/api/public/admin.html` طبق تنظیم فعلی، Restart کنترل‌شده API و تست واقعی پنل است. برای برگشت از بکاپ فایل‌های Live و commit قبلی استفاده کنید.
6. فقط بعد از آزمایش ذخیره پیش‌نویس/انتشار/بارگذاری عکس در محیط کنترل‌شده، تغییرات را Commit و Push کنید.

## مدل داده

`#p74-home-config` نسخه 74 باقی می‌ماند (backward-compatible):

```json
{
  "version": 74,
  "stepCount": 7,
  "backgrounds": {"7": "/uploads/home-studio/p62-example.webp"},
  "objects": [{
    "id": "flag1", "type": "flag", "name": "پرچم 10X", "content": "10X",
    "x": 68, "y": 28, "w": 17, "h": 8,
    "z": 8, "visible": true, "stages": "all",
    "opacity": 1, "rotation": -7,
    "animation": "sway", "duration": 3.5, "delay": 0
  }]
}
```

واحد مختصات/ابعاد درصد نسبت به کادر کامل 780×1770 است (مستقل از اندازه صفحه موبایل). حداکثر ۴۸ آبجکت. نوع‌ها: `image`، `text`، `shape`، `light`، `flag`. انیمیشن‌ها: none، float، pulse، spin، glow، sway، drift، fade-in، slide-up، twinkle. فایل‌های آپلودی از API مدیریت موجود `admin/home-studio/media` استفاده می‌کنند؛ نیازی به جدول جدید نیست. آدرس عکس فقط `/miniapp/p74/assets/` یا `/uploads/home-studio/` مجاز است. در تنظیمات کاربر نهایی هیچ کدی از ورودی اجرا نمی‌شود.

## محدودیت‌های تست

تست‌های داده‌ای و آزمایش UI در مرورگر محلی پاس شدند؛ کامپایل TypeScript کامل در محیط تولید فقط روی سرور کاربر امکان‌پذیر است. تست واقعی API آپلود/انتشار با احراز هویت و تنظیمات Nginx در این محیط انجام نشده است. نصب مستقیم روی Live بدون تست توصیه نمی‌شود.
