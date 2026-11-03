#!/usr/bin/env python3
"""Adds the Academy (courses/lessons). Run from the project root."""
import os, re, shutil, sys
ROOT = os.getcwd(); HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8').write(s)
def fail(m): print('ERROR:', m); sys.exit(1)
def once(t, old, new, label):
    if t.count(old) != 1: fail('anchor not found exactly once: ' + label)
    return t.replace(old, new)

SCHEMA = os.path.join(ROOT, 'packages/db/prisma/schema.prisma')
API = os.path.join(ROOT, 'apps/api/src/index.ts')
PANEL = os.path.join(ROOT, 'apps/api/public/admin.html')
MINI = os.path.join(ROOT, 'public/miniapp/academy.html')
for p in (SCHEMA, API, PANEL, MINI):
    if not os.path.exists(p): fail('missing file: ' + p)
schema, api, panel, mini = rd(SCHEMA), rd(API), rd(PANEL), rd(MINI)
if 'model Course' in schema or 'academyAudit' in api or 'editAc(' in panel: fail('Academy already applied.')
if 'adminIdOf' not in api or 'validateTelegramInitData' not in api: fail('RBAC patch not found in index.ts')

# prepare all edits in memory first, write only if all succeed
api2 = once(api, 'app.setErrorHandler(', rd(os.path.join(HERE, 'api.ts.txt')) + 'app.setErrorHandler(', 'setErrorHandler')
panel2 = once(panel, "['audit','گزارش فعالیت',[]],", "['academy','آکادمی',['ACADEMY_MANAGER','ANALYST']],['audit','گزارش فعالیت',[]],", 'menu')
panel2 = once(panel2, 'async audit(){', rd(os.path.join(HERE, 'admin-academy.js.txt')).rstrip('\n') + '\nasync audit(){', 'views')
panel2 = once(panel2, 'function drawer(u){', rd(os.path.join(HERE, 'admin-edit.js.txt')) + 'function drawer(u){', 'drawer fn')
mini2, n = re.subn(r'<section class="card"><h2>محتوای آکادمی</h2>.*?</section>',
    lambda m: '<div id="authStatus" class="status">در حال اعتبارسنجی حساب تلگرام…</div><p id="userInfo" class="muted"></p><div id="courses"></div><div id="lesson" class="hide"></div>', mini, count=1, flags=re.S)
if n != 1: fail('academy placeholder card not found in academy.html')
mini2 = once(mini2, '</style>', rd(os.path.join(HERE, 'mini.css.txt')).strip() + '</style>', 'mini css')
mini2 = once(mini2, '</body>', rd(os.path.join(HERE, 'mini.js.txt')) + '</body>', 'mini js')

mig = os.path.join(ROOT, 'packages/db/prisma/migrations/20261030120000_academy')
os.makedirs(mig, exist_ok=True)
shutil.copy(os.path.join(HERE, 'migration.sql'), os.path.join(mig, 'migration.sql'))
for p in (SCHEMA, API, PANEL, MINI): shutil.copy(p, p + '.pre-academy.bak')
wr(SCHEMA, schema.rstrip('\n') + '\n' + rd(os.path.join(HERE, 'schema.add.txt')))
wr(API, api2); wr(PANEL, panel2); wr(MINI, mini2)
print('OK. Next: npm run db:migrate && npm run db:generate && npm run build && systemctl restart 10x-api')
