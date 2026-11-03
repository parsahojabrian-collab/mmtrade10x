#!/usr/bin/env python3
"""Adds page builder blocks + popups + progress bars. Run from project root AFTER academy."""
import os, shutil, sys, glob
ROOT = os.getcwd(); HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8').write(s)
def fail(m): print('ERROR:', m); sys.exit(1)
def once(t, old, new, label):
    if t.count(old) != 1: fail('anchor not found exactly once: ' + label)
    return t.replace(old, new)
SCHEMA = os.path.join(ROOT, 'packages/db/prisma/schema.prisma'); API = os.path.join(ROOT, 'apps/api/src/index.ts')
PANEL = os.path.join(ROOT, 'apps/api/public/admin.html'); MINI = os.path.join(ROOT, 'public/miniapp')
for p in (SCHEMA, API, PANEL, MINI):
    if not os.path.exists(p): fail('missing: ' + p)
schema, api, panel = rd(SCHEMA), rd(API), rd(PANEL)
if 'enum ContentStatus' not in schema or 'academyAudit' not in api: fail('Apply the academy patch first.')
if 'model ContentPage' in schema or 'contentAudit' in api or 'editPage(' in panel: fail('Pages patch already applied.')
api2 = once(api, 'app.setErrorHandler(', rd(os.path.join(HERE, 'api.ts.txt')) + 'app.setErrorHandler(', 'setErrorHandler')
panel2 = once(panel, "['audit','گزارش فعالیت',[]],", "['pages','صفحه‌ها و پاپ‌آپ',['CONTENT_MANAGER','ANALYST']],['audit','گزارش فعالیت',[]],", 'menu')
panel2 = once(panel2, 'async audit(){', rd(os.path.join(HERE, 'admin-pages.js.txt')).rstrip('\n') + '\nasync audit(){', 'views')
panel2 = once(panel2, 'function drawer(u){', rd(os.path.join(HERE, 'admin-edit2.js.txt')) + 'function drawer(u){', 'drawer fn')
tag = '<script src="/miniapp/blocks.js"></script>'
pages = {}
for f in sorted(glob.glob(os.path.join(MINI, '*.html'))):
    s = rd(f)
    if os.path.basename(f).startswith('_') or '</body>' not in s or tag in s: continue
    pages[f] = once(s, '</body>', tag + '</body>', os.path.basename(f))
mig = os.path.join(ROOT, 'packages/db/prisma/migrations/20261030130000_pages'); os.makedirs(mig, exist_ok=True)
shutil.copy(os.path.join(HERE, 'migration.sql'), os.path.join(mig, 'migration.sql'))
shutil.copy(os.path.join(HERE, 'blocks.js'), os.path.join(MINI, 'blocks.js'))
for p in [SCHEMA, API, PANEL] + list(pages): shutil.copy(p, p + '.pre-pages.bak')
wr(SCHEMA, schema.rstrip('\n') + '\n' + rd(os.path.join(HERE, 'schema.add.txt'))); wr(API, api2); wr(PANEL, panel2)
for f, s in pages.items(): wr(f, s)
print('OK. pages patched:', len(pages), '\nNext: npm run db:migrate && npm run db:generate && npm run build && systemctl restart 10x-api')
