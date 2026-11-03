#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import hashlib, json, os, shutil, subprocess, sys
ROOT=Path('/root/miniapp10x'); WEB=ROOT/'public/miniapp'; HTML=WEB/'index.html'; JS=WEB/'tenx-hybrid3d-examples.js'
OLD='<script src="/miniapp/tenx-hybrid3d-examples.js?v=r13d3"></script>'
NEW='<script src="/miniapp/tenx-hybrid3d-examples.js?v=r13d7"></script>'
def digest(b):return hashlib.sha256(b).hexdigest()
def fail(reason):print('R13_D7=BLOCKED\nREASON='+reason);sys.exit(1)
if not HTML.is_file() or not JS.is_file():fail('FILES_MISSING')
html=HTML.read_text('utf-8'); js=JS.read_text('utf-8')
if html.count(OLD)!=1 or html.count(NEW):fail('UNEXPECTED_LOADER')
start=js.find('function candidate(node)'); end=js.find("if(!document.getElementById('tenx-hybrid3d-examples-style'))",start)
if start<0 or end<0 or start>=end:fail('D3_SOURCE_STRUCTURE_UNEXPECTED')
if "root.dataset.hxD3='1'" not in js[start:end] or 'p.replaceWith(card)' not in js[start:end]:fail('D3_SIGNATURE_MISMATCH')
replacement=r'''function candidate(node){
 if(!node||node.closest('.hx-example3d'))return false;
 const t=(node.textContent||'').trim();
 return t.length>=12&&t.length<=2400;
}
function makeCard(source,kind){
 const card=el('section','hx-example3d');
 card.setAttribute('aria-label','نمایش سه‌بعدی مثال آموزشی');
 const top=el('div','hx-ex-top');
 top.append(el('span','','✦ مثال آموزشی 3D'),el('span','hx-ex-pill',kind==='risk'?'مدیریت ریسک':kind==='chart'?'رفتار قیمت':kind==='backtest'?'ارزیابی استراتژی':kind==='flow'?'جریان بازار':'مفهوم آموزشی'));
 card.appendChild(top);
 const stage=el('div','hx-ex-stage');
 if(kind==='chart'||kind==='backtest')plot(stage,kind);else objects(stage,kind);
 card.appendChild(stage);
 card.appendChild(el('div','hx-ex-note','مدل شماتیک آموزشی است و داده واقعی بازار نیست.'));
 addSlider(card,kind);
 card.appendChild(el('div','hx-ex-source',source));
 return card;
}
function enhance(root){
 if(!root)return;
 // Re-render may reuse the root element; do not use a permanent root-level processed flag.
 if(root.querySelector('.hx-example3d'))return;
 const headings=Array.from(root.querySelectorAll('.tenx-lr-heading'));
 let count=0;
 headings.forEach(h=>{
   if(count>=8||!/مثال|سناریو|نمونه کاربردی/.test(h.textContent||''))return;
   let next=h.nextElementSibling;
   while(next&&next.classList.contains('hx-block-label'))next=next.nextElementSibling;
   if(!next||!next.classList.contains('tenx-lr-paragraph')||!candidate(next))return;
   const source=next.textContent.trim();
   const lessonTitle=(root.querySelector('.hx-hero-title')||{}).textContent||'';
   const kind=classify(lessonTitle+' '+source);
   next.replaceWith(makeCard(source,kind));count++;
 });
 // Fallback for lessons with examples explicitly in paragraph text.
 if(!count){
   Array.from(root.querySelectorAll('.tenx-lr-paragraph')).forEach(p=>{
     if(count>=8||!candidate(p)||!/(مثال|فرض کنید|سناریو|برای نمونه)/.test(p.textContent||''))return;
     const source=p.textContent.trim();
     const lessonTitle=(root.querySelector('.hx-hero-title')||{}).textContent||'';
     p.replaceWith(makeCard(source,classify(lessonTitle+' '+source)));count++;
   });
 }
}
'''
newjs=js[:start]+replacement+js[end:]
node=shutil.which('node')
if not node:fail('NODE_MISSING')
p=subprocess.run([node,'--check'],input=newjs,text=True,capture_output=True)
if p.returncode:fail('JS_SYNTAX_'+p.stderr[:180])
newhtml=html.replace(OLD,NEW,1)
if newhtml.count(NEW)!=1:fail('HTML_PATCH_FAILED')
out=ROOT/'academy-content'/('r13-d7-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
out.mkdir(parents=True,mode=0o700)
for f,n in [(HTML,'index.html.before'),(JS,'examples.js.before')]:
 b=out/n;b.write_bytes(f.read_bytes());b.chmod(0o600)
manifest={'before_html':digest(HTML.read_bytes()),'after_html':digest(newhtml.encode()),'before_js':digest(JS.read_bytes()),'after_js':digest(newjs.encode()),'database_changed':False}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
rollback=out/'rollback.sh'
rollback.write_text('#!/bin/bash\nset -euo pipefail\n'+f'HTML="{HTML}"\nJS="{JS}"\n'+f'test "$(sha256sum "$HTML" | cut -d\' \' -f1)" = "{manifest["after_html"]}" || exit 1\n'+f'test "$(sha256sum "$JS" | cut -d\' \' -f1)" = "{manifest["after_js"]}" || exit 1\n'+f'cp "{out}/index.html.before" "$HTML"\ncp "{out}/examples.js.before" "$JS"\necho R13_D7_ROLLBACK=PASS\n')
rollback.chmod(0o700)
htmp=WEB/'.r13-d7-html.tmp'; jtmp=WEB/'.r13-d7-js.tmp'
htmp.write_text(newhtml,'utf-8');jtmp.write_text(newjs,'utf-8');htmp.chmod(HTML.stat().st_mode&0o777);jtmp.chmod(JS.stat().st_mode&0o777)
print('PREFLIGHT=PASS\nJS_SYNTAX=PASS\nBACKUP=PASS',flush=True)
try:
 os.replace(jtmp,JS);os.replace(htmp,HTML)
except Exception as exc:
 shutil.copy2(out/'index.html.before',HTML);shutil.copy2(out/'examples.js.before',JS)
 fail('DEPLOY_ERROR_'+str(exc))
if digest(HTML.read_bytes())!=manifest['after_html'] or digest(JS.read_bytes())!=manifest['after_js']:
 fail('POSTVERIFY_FAILED_MANUAL_INSPECTION_REQUIRED')
print('FRONTEND_FILES=PASS_PUBLISHED\nDATABASE_CHANGED=NO\nSERVICES_RESTARTED=NO\nROLLBACK=READY\nROLLBACK_PATH='+str(rollback)+'\nR13_D7=PASS_PUBLISHED')
