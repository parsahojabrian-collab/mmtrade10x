# MMTrade10X — مرحله ۱: آموزش، آبجکت‌های متحرک و قفل مرحله ۲

## مسیرهای اجرا

- آموزش مرحله اول: `/miniapp/p74/learning/stage1.html`
- مرحله دوم با قفل Backend: `/miniapp/p74/learning/stage2.html`
- استودیوی مدیریت آبجکت‌های مرحله اول: `/miniapp/p74/learning/studio.html`

## رفتار اصلی

- هر یک از ۷ درس به‌صورت درون‌صفحه‌ای باز می‌شود. دایره قبل از تأیید قرمز است و تنها پس از فشردن «مطالعه کردم» و ثبت موفق در سرور سبز می‌شود.
- اطلاعات تکمیل به ازای شناسه داخلی **کاربر احرازشده با Telegram WebApp initData** در جدول موجود `LessonProgress` ذخیره می‌شود؛ برای این نسخه مهاجرت دیتابیس لازم نیست.
- API `/challenge/learning/stage2/content` تا کامل شدن هر ۷ درس، با HTTP `403` پاسخ می‌دهد. فایل HTML مرحله ۲ صرفاً پوسته است و محتوای آموزشی پشت API قرار دارد.
- **این قفل، دسترسی به همین مرحله دوم MMTrade را کنترل می‌کند، نه سایت/لینک خارجی بروکر یا مسیرهای دیگری که قبلاً وجود داشته‌اند.** مسیرهای جداگانه مرتبط با عضویت باید در صورت نیاز جدا به همین گیت وصل شوند.
- کاربر باید در دیتابیس MMTrade شناخته شده باشد؛ برای حساب‌های بدون ثبت‌نام اولیه، `registration_required` نمایش داده می‌شود.
- ۶ آبجکت پیش‌فرض، کندل‌های سبز/قرمز و انیمیشن‌ها روی صفحه هستند.
- در استودیوی آبجکت‌ها، ذخیره به‌صورت پیش‌نویس انجام می‌شود؛ انتشار جداگانه و با تأیید مدیر است.
- برای استفاده از استودیو، ابتدا در **همان تب** وارد پنل ادمین `/admin` شوید (توکن مدیریت در `sessionStorage` موجود باشد) و سپس آدرس استودیو را باز کنید.
- برای تصاویر آبجکت، در R1 مسیر تصویر آپلودشده از سیستم رسانه فعلی را در فیلد `src` وارد کنید. افزودن فایل مستقیم در این استودیوی جدید هنوز به سیستم آپلود متصل نیست.
- صحت «مطالعه واقعی» با کلیک قابل اثبات نیست؛ ثبت پیشرفت صرفاً تأیید صریح کاربر است.

## نصب امن (بدون نصب‌کننده پچ جدید)

داخل `/root/miniapp10x`:

```sh
# نخست از فایل منبع API و شاخه جاری بکاپ بگیرید
cp apps/api/src/index.ts /root/MMTRADE_STAGE1_API_BEFORE.ts
# فقط تفاوت‌های سورس را اعمال کنید
unzip -p /root/MMTRADE_STAGE1_SOURCE_R1.zip stage1-source.diff > /root/mmtrade-stage1.diff
[ -s /root/mmtrade-stage1.diff ] && git apply --check /root/mmtrade-stage1.diff && git apply /root/mmtrade-stage1.diff
node --check public/miniapp/p74/learning/stage1.js
node --check public/miniapp/p74/learning/stage2.js
node --check public/miniapp/p74/learning/studio.js
node --test tests/mmtrade-stage1-learning.test.mjs
./node_modules/.bin/tsc -p tsconfig.json --noEmit
```

بعد از قبولی همه تست‌ها، قبل از انتشار از `/srv/tenx-public/miniapp/p74/` و `dist/apps/api/src/index.js` بکاپ بگیرید و سپس:

```sh
npm run build
install -d /srv/tenx-public/miniapp/p74/learning
rsync -av public/miniapp/p74/learning/ /srv/tenx-public/miniapp/p74/learning/
systemctl restart 10x-api
curl --retry 6 --retry-delay 1 --retry-all-errors -fsS -o /dev/null -w 'API_HTTP=%{http_code}\n' https://mmtrade.parsahojabrian.ir/health
curl -fsS -o /dev/null -w 'STAGE1_HTTP=%{http_code}\n' https://mmtrade.parsahojabrian.ir/miniapp/p74/learning/stage1.html
```

برای لینک‌کردن دکمه‌های اول و دوم در **ویرایشگر هوم P76**:

- لینک دکمه ۱: `/miniapp/p74/learning/stage1.html`
- لینک دکمه ۲: `/miniapp/p74/learning/stage2.html`

پس از انتشار، با یک **حساب تست واقعی تلگرام** بررسی کنید که مرحله ۲ تا قبل از تأیید ۷ درس پیام قفل (HTTP 403 پشت صحنه) بدهد و بعد از تأیید ۷ درس باز شود. تغییر لینک‌های هوم را ابتدا در پیش‌نویس آزمون کنید و بعد منتشر کنید.

## بازگردانی

اگر Build یا تست‌ها شکست خورد، API را ری‌استارت نکنید؛ سورس را از فایل پشتیبان یا `git restore` بازیابی کنید. اگر بعد از انتشار مشکل ایجاد شد، فایل `dist` API را از بکاپ قبل از انتشار برگردانید، سرویس API را ری‌استارت کنید و فایل‌های استاتیک را از نسخه پشتیبان بازگردانید. داده‌های تکمیل درس کاربران در DB مستقل باقی می‌مانند.
