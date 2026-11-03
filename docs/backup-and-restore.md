# Backup و بازیابی دیتابیس

پیش از migration یا انتشار نسخه جدید، backup بگیر. مقدارهای اتصال را در shell امن یا secret manager تنظیم کن؛ رمز دیتابیس را در history ترمینال قرار نده.

```bash
mysqldump --single-transaction --routines --triggers "$MYSQL_DATABASE" > "10x-$(date +%F-%H%M).sql"
```

برای بازیابی روی دیتابیس مقصد خالی/تأییدشده:

```bash
mysql "$MYSQL_DATABASE" < /secure/backup/10x-backup.sql
```

پس از restore، `npm run db:generate` و بررسی سلامت `/health` را اجرا کن. قبل از بازگشایی ترافیک، تعداد کاربران و چند رکورد نمونه را با کنترل دسترسی بررسی کن.
