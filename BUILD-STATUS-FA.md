# گزارش ساخت نسخه یکپارچه 10X

تاریخ بسته: ۱۴۰۵/۰۸/۰۸ (2026-10-30)

## انجام‌شده در سورس
- ادغام ۹ صفحه HTML با پروژه بک‌اند و ربات
- ساخت ساختار monorepo و فایل‌های package/TypeScript
- تکمیل validator استاندارد HMAC برای Telegram Web App initData
- حذف آدرس واسط Telegram API از کد Bot و بازگشت به Bot API رسمی
- محدود کردن شروع مسیر ثبت‌نام به گفتگوی خصوصی ربات
- تکمیل route پیش‌ثبت‌نام وب با رضایت پردازش و رضایت اختیاری پیامک
- افزودن پشتیبانی از ارقام فارسی/عربی در شماره تلفن
- محدودیت نرخ endpointهای عمومی
- اتصال فرم‌های ثبت‌نام HTML به API
- ساخت ۷ صفحه مستقل Mini App
- ثبت تیکت از Mini App پس از احراز هویت Telegram سمت سرور
- تکمیل migration اولیه MySQL و فایل lock
- افزودن تست HMAC و تست‌های قراردادی
- افزودن `.env.example`، systemd، Nginx و مستندات backup/restore
- افزودن پیگیری خودکار پس از ۵ ساعت بی‌فعالیتی برای کاربران تلگرامی ناقص

## نتایج قابل تکرار در محیط فعلی
- `node --experimental-strip-types --check apps/api/src/index.ts`: موفق
- `node --experimental-strip-types --check apps/bot/src/index.ts`: موفق
- بررسی syntax جاوااسکریپت inline تمام ۱۶ فایل HTML: موفق
- `npm test`: چهار تست موفق

## مواردی که در محیط فعلی اجرا/تأیید نشدند
- `npm install` دو بار به timeout رسید؛ وابستگی‌ها دریافت نشدند.
- در نتیجه `npm run build` و `prisma validate/generate/migrate` اجرا نشدند.
- دیتابیس MySQL، Bot Token، کانال‌ها، دامنه و HTTPS واقعی در اختیار نبودند.
- هیچ سرویس واقعی آنلاین یا مستقر اعلام نمی‌شود.

## مانده‌های مهم پیش از اعلام آماده‌به‌کار عملیاتی
- نصب وابستگی‌ها و اجرای build/typecheck
- اجرای migration روی MySQL واقعی و تست restore
- تست انتهابه‌انتها با BotFather و کانال‌های واقعی
- تست ثبت‌نام در مرورگر و Mini App واقعی تلگرام
- پیاده‌سازی ورود چندمدیره و RBAC؛ در حال حاضر پنل با یک ADMIN_API_TOKEN مشترک محافظت می‌شود.
- پیاده‌سازی واقعی SMS، AI support، CMS/Page Builder، Academy/LMS، Skill Tree، Simulator، Journal و Challenge reporting
- انتخاب و بررسی حقوقی/فنی ارائه‌دهندگان خرید رمزارز و Copy Trading؛ هر دو در این نسخه غیرفعال هستند.
