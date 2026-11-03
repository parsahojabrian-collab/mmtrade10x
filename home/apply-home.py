#!/usr/bin/env python3
"""Installs the new home page as the Mini App index. Run from the project root."""
import os, re, shutil, sys
ROOT = os.getcwd(); HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(ROOT, 'public/miniapp/index.html')
if not os.path.isdir(os.path.dirname(DEST)): print('ERROR: public/miniapp not found'); sys.exit(1)
s = open(os.path.join(HERE, 'home.html'), encoding='utf-8').read()
def once(old, new, label):
    global s
    if s.count(old) != 1: print('ERROR: anchor not found exactly once:', label); sys.exit(1)
    s = s.replace(old, new)
# 1. Telegram SDK
once('</head>', '<script src="https://telegram.org/js/telegram-web-app.js"></script>\n</head>', 'head')
# 2. remove the in-page fake admin overlay + its button + dead JS
s, n = re.subn(r'<div class="admin" id="admin">.*?(?=\n\n<nav class="bottom-nav")', '', s, count=1, flags=re.S)
if n != 1: print('ERROR: admin overlay not found'); sys.exit(1)
once('　·　<button class="btn secondary" style="padding:5px 10px" onclick="openAdmin()">پیش‌نمایش پنل ادمین</button>', '', 'admin button')
s = '\n'.join(l for l in s.split('\n') if not re.match(r'function (openAdmin|applyPreview|adminTab)\(', l))
# 3. links to pages that do not exist -> on-page anchors
s = s.replace('href="register.html"', 'href="#register"').replace('href="organizers.html"', 'href="#team"').replace('href="faq.html"', 'href="#faq"')
# 4. real academy progress in the hero (filled by blocks.js data)
once('<div class="fine">نمایش نمونه داشبورد</div><strong>وضعیت مسیر شما</strong></div><span class="pill">● نسخه نمایشی</span>',
     '<div class="fine">داشبورد شما</div><strong>وضعیت مسیر شما</strong></div><span class="pill">● پیشرفت شما</span>', 'hero head')
once('<strong style="font-size:25px">۳ از ۹ درس</strong><span class="positive">۳۳٪</span></div><div class="progress"><span></span></div>',
     '<strong style="font-size:25px" id="heroDone">برای دیدن پیشرفت، از ربات تلگرام وارد شو</strong><span class="positive" id="heroPct"></span></div><div class="progress"><span id="heroBar" style="width:0"></span></div>', 'hero progress')
once('<div class="fine">گام پیشنهادی بعدی</div><strong>مبانی مدیریت ریسک</strong></div><span class="pill">درس ۴</span>',
     '<div class="fine">گام بعدی</div><strong>ادامه‌ی مسیر در آکادمی</strong></div><a class="pill" href="academy.html">آکادمی ←</a>', 'hero next')
once('<button class="btn secondary" onclick="openModal(\'loginModal\')">ورود</button>', '<button class="btn secondary" id="loginBtn" onclick="openModal(\'loginModal\')">ورود</button>', 'login btn')
once('<div>این صفحه نمونه رابط کاربری است؛ هیچ اتصال سرور، خرید، پیامک یا ثبت‌نام واقعی ندارد.</div>', '<div>معامله‌گری ریسک دارد و نتیجه یا سود مشخصی تضمین نمی‌شود.</div>', 'footer note')
# 5. runtime: Telegram ready/expand, hide login inside Telegram, fill progress, blocks + popup
tail = '''<script>(function(){var w=window.Telegram&&Telegram.WebApp,f=function(n){return Number(n).toLocaleString('fa-IR')};
if(w&&w.initData){try{w.ready();w.expand()}catch(e){}var b=document.getElementById('loginBtn');if(b)b.style.display='none'}
window.addEventListener('tenx:data',function(e){var a=e.detail.progress.academy;document.getElementById('heroDone').textContent=a.total?(f(a.done)+' از '+f(a.total)+' درس'):'هنوز درسی منتشر نشده';document.getElementById('heroPct').textContent=f(a.pct)+'٪';document.getElementById('heroBar').style.width=a.pct+'%'})})();</script>
<script src="/miniapp/blocks.js"></script>
</body>'''
once('</body>', tail, 'body end')
dest_bak = DEST + '.pre-home.bak'
if os.path.exists(DEST): shutil.copy(DEST, dest_bak)
open(DEST, 'w', encoding='utf-8').write(s)
shutil.copy(os.path.join(HERE, 'blocks.js'), os.path.join(ROOT, 'public/miniapp/blocks.js'))
print('OK: public/miniapp/index.html replaced (backup: index.html.pre-home.bak).')
