#!/usr/bin/env python3
"""Serves the new admin panel at /admin/panel. Run from the project root."""
import os, shutil, sys
ROOT = os.getcwd()
API = os.path.join(ROOT, 'apps/api/src/index.ts')
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(API, encoding='utf-8').read()
if "'/admin/panel'" in src:
    print('ERROR: panel route already exists'); sys.exit(1)
marker = "app.get('/miniapp'"
if src.count(marker) != 1:
    print('ERROR: could not find exactly one /miniapp route'); sys.exit(1)
route = r'''app.get('/admin/panel', async (_request, reply) => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const file = [join(process.cwd(), 'apps/api/public/admin.html'), join(process.cwd(), 'public/admin.html')].find((p) => existsSync(p));
  if (!file) return reply.code(404).send({ error: 'panel_file_missing' });
  reply.header('content-security-policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
  reply.header('cache-control', 'no-store');
  return reply.type('text/html; charset=utf-8').send(readFileSync(file, 'utf-8'));
});

'''
shutil.copy(API, API + '.pre-panel.bak')
open(API, 'w', encoding='utf-8').write(src.replace(marker, route + marker))
os.makedirs(os.path.join(ROOT, 'apps/api/public'), exist_ok=True)
shutil.copy(os.path.join(HERE, 'admin.html'), os.path.join(ROOT, 'apps/api/public/admin.html'))
print('OK. Backup: apps/api/src/index.ts.pre-panel.bak ; panel: apps/api/public/admin.html')
