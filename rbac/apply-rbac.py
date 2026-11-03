#!/usr/bin/env python3
"""Applies multi-admin login (RBAC) to the 10X project. Run from the project root."""
import os, re, shutil, sys

ROOT = os.getcwd()
API = os.path.join(ROOT, 'apps/api/src/index.ts')
HERE = os.path.dirname(os.path.abspath(__file__))

def fail(msg):
    print('ERROR:', msg)
    sys.exit(1)

if not os.path.exists(API):
    fail('apps/api/src/index.ts not found. Run this from the project root.')
src = open(API, encoding='utf-8').read()
if 'admin-auth' in src:
    fail('RBAC already applied.')

def replace_once(text, old, new, label):
    if text.count(old) != 1:
        fail('could not find exactly one match for: ' + label)
    return text.replace(old, new)

# 1. imports
imp = ("import { validateTelegramInitData } from '../../../packages/shared/src/telegram-init-data.js';\n"
       "import { ADMIN_ROLES, MIN_ADMIN_PASSWORD_LENGTH, SESSION_TTL_SECONDS, canAccess, hashPassword, passwordVersion, signSession, verifyPassword, verifySession } from '../../../packages/shared/src/admin-auth.js';\n"
       "import type { FastifyReply, FastifyRequest } from 'fastify';")
if 'timingSafeEqual' not in src:
    imp += "\nimport { timingSafeEqual } from 'node:crypto';"
src = replace_once(src,
    "import { validateTelegramInitData } from '../../../packages/shared/src/telegram-init-data.js';", imp, 'telegram import')

# 2. replace guard
if 'function adminGuard(' not in src or "app.get('/miniapp'" not in src:
    fail('adminGuard or /miniapp route not found')
start = src.index('function adminGuard(')
end = src.index("app.get('/miniapp'")
new_guard = open(os.path.join(HERE, 'guard.ts.txt'), encoding='utf-8').read()
src = src[:start] + new_guard + src[end:]

# 3. await every guard call
src, n = re.subn(r"if \(!adminGuard\(request, reply\)\) return;", "if (!(await adminGuard(request, reply))) return;", src)
print('guard calls updated:', n)
if n < 12: fail('unexpected number of guard calls: %d' % n)

# 4. record which admin did what
actions = ['ADMIN_USER_LIST_VIEW','ADMIN_SETTINGS_UPDATED','ADMIN_USER_UPDATED','SUPPORT_TICKET_STATUS_UPDATED','INCOMPLETE_REGISTRATIONS_EXPORT','FOLLOWUP_SCHEDULED','TELEGRAM_NOTIFICATION_QUEUED','SUPPORT_REPLY_CREATED']
for a in actions:
    pat = re.compile(r"(auditLog\.create\(\{ data: \{ )((?:(?!\}\s*\}\)).)*?action: '%s')" % a)
    src, c = pat.subn(r"\1adminUserId: adminIdOf(request), \2", src)
    if c != 1: fail('audit log site not found: ' + a)

# 5. admin panel UI
OLD_CARD = '<section class="card"><div class="row"><input id="token" type="password" placeholder="ADMIN_API_TOKEN" autocomplete="off"><button id="connect">اتصال امن</button><button class="secondary" id="clear">قطع اتصال</button></div><div id="msg" class="msg muted">برای شروع، توکن مدیر را وارد کن.</div></section>'
NEW_CARD = ('<section class="card"><h2>ورود مدیر</h2><div class="row"><input id="email" type="email" placeholder="ایمیل مدیر" autocomplete="username"><input id="password" type="password" placeholder="رمز عبور" autocomplete="current-password"><button id="login">ورود</button><button class="secondary" id="clear">خروج</button></div>'
 '<details><summary class="muted">ورود اضطراری با ADMIN_API_TOKEN</summary><div class="row"><input id="token" type="password" placeholder="ADMIN_API_TOKEN" autocomplete="off"><button class="secondary" id="connect">اتصال با توکن</button></div></details>'
 '<div id="msg" class="msg muted">با ایمیل و رمز مدیر وارد شو.</div></section>')
src = replace_once(src, OLD_CARD, NEW_CARD, 'login card')

src = replace_once(src,
    "const [s,u,t,settings]=await Promise.all([api('/admin/summary'),api('/admin/users?limit=50'),api('/admin/tickets'),api('/admin/settings')]);",
    "const safe=p=>p.catch(()=>null);const [s,u,t,settings]=await Promise.all([api('/admin/summary'),safe(api('/admin/users?limit=50')),safe(api('/admin/tickets')),safe(api('/admin/settings'))]);",
    'load fetch')
src = replace_once(src,
    "renderUsers(u.items);renderTickets(t.items);const x=settings.settings;$('mini').value=x.MINI_APP_URL||'';$('channels').value=x.REQUIRED_CHANNELS||'';$('links').value=x.REQUIRED_CHANNEL_LINKS||'';$('allow').value=String(Boolean(x.ALLOW_NO_REQUIRED_CHANNELS));msg('اتصال برقرار شد.',true)}",
    "if(u)renderUsers(u.items);if(t)renderTickets(t.items);if(settings){const x=settings.settings;$('mini').value=x.MINI_APP_URL||'';$('channels').value=x.REQUIRED_CHANNELS||'';$('links').value=x.REQUIRED_CHANNEL_LINKS||'';$('allow').value=String(Boolean(x.ALLOW_NO_REQUIRED_CHANNELS))}const me=await api('/admin/auth/me');msg('اتصال برقرار شد. نقش: '+me.role,true);await loadAdmins()}",
    'load render')

roles = ['SUPER_ADMIN','USER_MANAGER','SUPPORT','CONTENT_MANAGER','ACADEMY_MANAGER','CHALLENGE_MANAGER','ANALYST','MARKETING_MANAGER']
opts = ''.join('<option>%s</option>' % r for r in roles)
ADMINS_SECTION = ('<section class="card hide" id="adminsCard"><h2>مدیران و نقش‌ها</h2><div class="table"><table><thead><tr><th>ایمیل</th><th>نقش</th><th>فعال</th><th>عملیات</th></tr></thead><tbody id="admins"></tbody></table></div>'
 '<h3>افزودن مدیر</h3><div class="row"><input id="newEmail" type="email" placeholder="ایمیل"><input id="newPass" type="password" placeholder="رمز (حداقل ۱۲ نویسه)" autocomplete="new-password"><select id="newRole">' + opts + '</select><button id="addAdmin">افزودن</button></div></section>\n')
src = replace_once(src, "</main><script>\nlet token='';", ADMINS_SECTION + "</main><script>\nlet token='';", 'control main end')

ADMIN_JS = open(os.path.join(HERE, 'admin-ui.js.txt'), encoding='utf-8').read()
src = replace_once(src, "$('connect').onclick=async()=>{token=$('token').value;try{await load()}catch(e){msg('خطا: '+e.message)}};\n",
    "$('connect').onclick=async()=>{token=$('token').value;try{await load()}catch(e){msg('خطا: '+e.message)}};\n" + ADMIN_JS, 'connect handler')
src = replace_once(src, "$('clear').onclick=()=>{token='';$('token').value='';$('stats').textContent='';msg('اتصال قطع شد.')};",
    "$('clear').onclick=()=>{token='';$('token').value='';$('stats').textContent='';try{sessionStorage.removeItem('tenx_admin_token')}catch(e){}$('adminsCard').classList.add('hide');msg('خارج شدی.')};", 'clear handler')

src = replace_once(src, "<script>let token='';const $=id=>document.getElementById(id);function message(t){$('msg').textContent=t}",
    "<script>let token='';const $=id=>document.getElementById(id);try{const s=sessionStorage.getItem('tenx_admin_token');if(s)$('token').value=s}catch(e){}function message(t){$('msg').textContent=t}", 'automation prefill')

shutil.copy(API, API + '.pre-rbac.bak')
open(API, 'w', encoding='utf-8').write(src)
for rel in ['packages/shared/src/admin-auth.ts', 'tests/admin-auth.test.mjs']:
    dest = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy(os.path.join(HERE, 'files', rel), dest)
print('RBAC applied. Backup: apps/api/src/index.ts.pre-rbac.bak')
