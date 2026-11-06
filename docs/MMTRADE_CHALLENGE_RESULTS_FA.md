# MMTrade10X — وضعیت پاس‌شدن چالش

## طراحی ایمن

موجودبودن حساب ePlanet، واریز، شرکت در چالش و وصل‌شدن کپی‌ترید **به معنای پاس‌شدن چالش نیست**. نتیجه PASSED یا FAILED فقط از گزارش رسمی قابل‌تطبیق ePlanet یا تصمیم مستند سوپرادمین نمایش داده می‌شود.

- **PASSED / سبز:** پاس شده و تأیید شده.
- **FAILED / قرمز:** پاس نشده و نتیجه معتبر ثبت شده.
- **IN_PROGRESS / طلایی:** در حال انجام، هنوز نتیجه نهایی ندارد.
- **UNDER_REVIEW / طلایی:** در انتظار بررسی.
- **NOT_VERIFIED / خنثی:** داده معتبر برای داوری نداریم؛ هرگز خودکار قرمز نمی‌شود.

نتیجه دریافتی از بروکر و تصمیم دستی سوپرادمین جداگانه ذخیره می‌شوند. تصمیم دستی اولویت نمایش دارد؛ اگر آخرین بروکر با آن اختلاف داشته باشد، `conflict=true` به پنل نشان داده می‌شود. تاریخچه در جدول موجود `AuditLog` ذخیره می‌شود؛ وضعیت فعلی در `SystemSetting`، بنابراین **migration جدید لازم نیست**.

## دسترسی‌ها

- وضعیت کاربر: `POST /challenge/result/status` با `initData` معتبر تلگرام، بدون userId از کلاینت.
- سوپرادمین: `/miniapp/p74/learning/admin-challenge.html` (پس از لاگین در همان دامنه با نشست سوپرادمین).
- لیست: `GET /admin/challenge/results`.
- جزئیات و ۵۰ سابقه اخیر: `GET /admin/challenge/results/:userId`.
- تصمیم مستند: `PUT /admin/challenge/results/:userId` با `verdict`, `reason` و برای نتیجه قطعی `evidenceRef`.
- لغو تصمیم دستی: `POST /admin/challenge/results/:userId/clear-override` با دلیل.
- همگام‌سازی مجدد با بروکر: `POST /admin/challenge/results/:userId/sync`.

## اتصال رسمی به ePlanet — پیش‌نیاز مهم

**هیچ endpoint رسمی برای «پاس شدن چالش 10X» از مدارک موجود تأیید نشده است.** تنظیمات زیر باید فقط پس از دریافت *مستندات معتبر ePlanet* و نمونه پاسخ واقعی پر شوند. دسترسی IB/معرفی مشتری به‌تنهایی ممکن است نتیجه پاس/رد را ارائه نکند.

```
EPLANET_CHALLENGE_STATUS_URL=https://YOUR_VERIFIED_EPLANET_API_HOST/path/{accountId}
EPLANET_CHALLENGE_ALLOWED_HOSTS=YOUR_VERIFIED_EPLANET_API_HOST
EPLANET_CHALLENGE_API_TOKEN=PUT_SECRET_ONLY_IN_SERVER_ENV
EPLANET_CHALLENGE_STATUS_FIELD=path.to.official.challenge.status
EPLANET_CHALLENGE_ACCOUNT_FIELD=path.to.account.id
EPLANET_CHALLENGE_PROGRAM_FIELD=path.to.challenge.program_id
EPLANET_CHALLENGE_PROGRAM_ID=OFFICIAL_MMTRADE_10X_PROGRAM_ID
```

- مقدار `status` باید دقیقاً یکی از `PASSED`, `FAILED`, `IN_PROGRESS`, `UNDER_REVIEW` باشد؛ اگر نام فیلد یا نگاشت رسمی متفاوت است، ابتدا **آداپتور** باید بر اساس مستندات اصلاح شود. از مقادیر حدسی استفاده نکنید.
- شناسه حساب پاسخ باید با حساب ثبت‌شده برای همان کاربر مطابقت داشته باشد.
- درخواست فقط HTTPS، دامنه allowlist، timeout هشت ثانیه، بدون redirect و بدون ارسال توکن به مرورگر انجام می‌شود.
- بعد از پیکربندی، بررسی با بازکردن وضعیت کاربر در مینی‌اپ به‌صورت حداکثر هر ۱۵ دقیقه انجام می‌شود؛ همچنین سوپرادمین دکمه «بررسی از ePlanet» دارد. این سرویس زمان‌بندی مستقل در حالت بدون مراجعه کاربر ندارد.
- اگر بروکر نتیجه رسمی نداشته باشد، «تأیید نشده» نمایش داده می‌شود؛ هیچ نتیجه‌ای ساخته نمی‌شود.

## اتصال UI به صفحه آموزشی

این بسته فایل اصلی مرحله اول را عوض نمی‌کند. پس از اعمال patch، یک بار `challenge-status.js` را با `defer` به انتهای HTML مرحله ۱ اضافه کنید و در همان صفحه CSS را اسکریپت بارگذاری می‌کند. راهنمای دستور کوتاه در پیام همراه بسته است.

## ترتیب آزمایش و انتشار

۱. قبل از تغییر سرور: آخرین سورس و دیتابیس و فایل‌های Live را بکاپ بگیرید.
۲. `git apply --check`، `node --test`، `tsc --noEmit` و `git diff --check`.
۳. پس از بررسی کد و ورود امن مدیر، ابتدا صفحه مدیریتی را روی محیط آزمایشی تست کنید، تصمیم تست و بازگردانی آن را در AuditLog بررسی کنید.
۴. فقط بعد از تأیید تست‌ها Build/Restart و انتشار صفحات انجام شود. وضعیت نتایج کاربران واقعی بدون شواهد تغییر نکند.

نکته: این بسته **منطق محافظت‌شده + ثبت دستی مستند + مسیر اتصال به ePlanet** را فراهم می‌کند، اما بدون endpoint رسمی تأییدشده «اتصال خودکار واقعی» فعال نخواهد بود.
