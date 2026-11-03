#!/usr/bin/env python3
"""R13-D2: 50-lesson topic-specific hybrid 3D scene enhancement; guarded production deploy."""
from pathlib import Path
from datetime import datetime
import hashlib, json, os, shutil, subprocess, sys

ROOT=Path('/root/miniapp10x'); WEB=ROOT/'public/miniapp'; HTML=WEB/'index.html'; D1=WEB/'tenx-hybrid3d.js'; RENDERER=WEB/'tenx-lesson-renderer.js'; TARGET=WEB/'tenx-hybrid3d-scenes.js'; OUTROOT=ROOT/'academy-content'
COURSES=[
('آشنایی با بازارهای مالی',['بازارهای مالی چگونه کار می‌کنند؟','انواع بازارها و ابزارهای معاملاتی','انتخاب بازار مناسب برای معامله‌گری']),
('مفاهیم پایه معامله‌گری',['پیپ، لات و حجم معاملات','اسپرد، کمیسیون و اهرم معاملاتی','سفارش‌گذاری و مدیریت معاملات']),
('مبانی نمودارخوانی',['ساختار نمودار و تایم‌فریم','کندل‌شناسی مقدماتی','حمایت و مقاومت مقدماتی']),
('مدیریت سرمایه مقدماتی',['ریسک و بازده در معامله‌گری','حد ضرر و حد سود','محاسبه حجم معامله']),
('پرایس اکشن مقدماتی',['ساختار بازار و روندها','سقف‌ها و کف‌های قیمتی','شکست ساختار بازار','تشخیص نواحی مهم قیمت']),
('تحلیل تکنیکال کاربردی',['روند و خطوط روند','سطوح حمایت و مقاومت پیشرفته','الگوهای قیمتی کاربردی','تحلیل چند تایم‌فریمی']),
('رفتار قیمت و نقدینگی',['مفهوم نقدینگی در بازار','شکار نقدینگی و شکست‌های کاذب','ناحیه‌های عرضه و تقاضا','تأیید ورود بر اساس رفتار قیمت']),
('تحلیل بنیادی و اخبار',['شاخص‌های اقتصادی مهم','نرخ بهره و سیاست پولی','تأثیر اخبار بر طلا و ارز','ترکیب تحلیل بنیادی و تکنیکال']),
('استراتژی‌سازی معاملاتی',['اجزای یک استراتژی معاملاتی','قوانین ورود و خروج','طراحی چک‌لیست معاملاتی']),
('بک‌تست و ارزیابی عملکرد',['اصول بک‌تست معتبر','شاخص‌های ارزیابی استراتژی','بیش‌برازش و خطاهای بک‌تست','آزمون خارج از نمونه']),
('روان‌شناسی معامله‌گری',['کنترل هیجان و تصمیم‌گیری','انضباط و پایبندی به برنامه','مدیریت ضررهای متوالی']),
('مدیریت ریسک پیشرفته',['ریسک تجمعی، افت سرمایه و هم‌بستگی معاملات','تنظیم حجم بر اساس نوسان','طراحی محدودیت‌های حفاظتی']),
('مبانی سیستم 10X',['معرفی چارچوب معاملاتی 10X','قوانین اصلی و پیش‌نیازهای سیستم']),
('اجرای عملی سیستم 10X',['آماده‌سازی نمودار و ابزارها','تشخیص موقعیت معاملاتی','اجرای ورود و مدیریت معامله']),
('ارزیابی عملکرد 10X',['ثبت و تحلیل معاملات سیستم']),
('توسعه مهارت با 10X',['طراحی برنامه تمرین','تحلیل اشتباهات معاملاتی','بهینه‌سازی فرآیند تصمیم‌گیری'])]
THEMES=['network','market','compass','volume','cost','orders','timeline','candles','levels','risk','stops','sizing','trend','swings','breakout','zones','trend','levels','patterns','timeline','liquidity','breakout','zones','signal','macro','rates','news','macro','strategy','orders','checklist','backtest','metrics','overfit','timeline','mind','discipline','risk','risk','volatility','shield','strategy','checklist','chart','signal','orders','metrics','plan','review','process']
assert sum(map(lambda x:len(x[1]),COURSES))==50 and len(THEMES)==50
DATA=[]; n=0
for ci,(course,titles) in enumerate(COURSES,1):
 for li,title in enumerate(titles,1):
  DATA.append(dict(id=f'tenx_q09_lesson_{ci:02d}_{li:02d}',title=title,course=course,scene=THEMES[n],number=n+1));n+=1

def digest(b):return hashlib.sha256(b).hexdigest()
def fail(s):print('R13_D2=BLOCKED\nREASON='+s);sys.exit(1)
if not (HTML.is_file() and D1.is_file() and RENDERER.is_file()):fail('REQUIRED_FILES_MISSING')
if TARGET.exists():fail('TARGET_ALREADY_EXISTS_NO_OVERWRITE')
original=HTML.read_bytes(); html=original.decode('utf-8')
if html.count('/miniapp/tenx-hybrid3d.js?v=r13d1')!=1:fail('D1_LOADER_MISSING_OR_DUPLICATE')
if 'tenx-hybrid3d-scenes.js' in html:fail('D2_ALREADY_INSTALLED')
node=shutil.which('node')
if not node:fail('NODE_MISSING')
# Build a strictly DOM-based visual layer. Never mutate lessons, quizzes, or progress.
js=r'''(function(){'use strict';
const DATA=__LESSONS__;
const byTitle=new Map(DATA.map(x=>[normalize(x.title),x]));
function normalize(s){return String(s||'').replace(/[\u200c\u200f\u200e]/g,' ').replace(/\s+/g,' ').trim().replace(/[؟?!.,،؛:]/g,'');}
const SVG='http://www.w3.org/2000/svg';
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function svgEl(tag,attrs){const e=document.createElementNS(SVG,tag);Object.entries(attrs||{}).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;}
function line(g,x1,y1,x2,y2,color='#39ff88',width=2,opacity=1){g.appendChild(svgEl('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,opacity,'stroke-linecap':'round'}));}
function rect(g,x,y,w,h,color,rx=4){g.appendChild(svgEl('rect',{x,y,width:w,height:h,rx,fill:color}));}
function circle(g,x,y,r,color){g.appendChild(svgEl('circle',{cx:x,cy:y,r,fill:color}));}
function path(g,d,color='#39ff88',width=3){g.appendChild(svgEl('path',{d,fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'}));}
function text(g,x,y,value,color='#d8f8e9',size=11){const e=svgEl('text',{x,y,fill:color,'font-size':size,'font-family':'sans-serif','text-anchor':'middle'});e.textContent=value;g.appendChild(e);}
function draw(g,type,seed){
 const gold='#e8bd60',green='#39ff88',red='#ff6377',blue='#55c9ff';
 for(let i=0;i<7;i++){line(g,15,25+i*24,325,25+i*24,'#3d8b75',.7,.18);line(g,20+i*50,20,20+i*50,172,'#3d8b75',.7,.18);}
 const candles=['candles','trend','swings','breakout','levels','zones','signal','timeline','patterns','liquidity','chart','orders','stops'];
 if(candles.includes(type)){
  const vals=[75,85,62,93,104,89,120,115,142,130,151,165];
  vals.forEach((v,i)=>{let h=18+((i*13+seed*7)%30),x=27+i*25,y=175-v*.67;line(g,x+6,y-9,x+6,y+h+8,i%4===2?red:green,2);rect(g,x,y,12,h,i%4===2?red:green,2);});
  if(['levels','zones','breakout','liquidity','stops'].includes(type)){rect(g,20,72,300,23,'#17483d',4);line(g,20,83,320,83,gold,2);text(g,270,68,'KEY LEVEL',gold,10);}
  if(type==='timeline'){line(g,20,122,320,122,blue,2);text(g,260,116,'M5 / H1 / D1',blue,11);}
  if(type==='patterns')path(g,'M25 140 L78 95 L130 140 L181 95 L235 140',gold,2);
 }else if(['risk','sizing','volume','volatility','metrics','backtest','overfit'].includes(type)){
  const bars=[48,72,57,108,89,131,115];bars.forEach((v,i)=>{rect(g,28+i*43,170-v,26,v,i%3===1?gold:green,5);text(g,41+i*43,186,String(i+1),'#8cb3a9',9);});
  if(type==='risk'||type==='volatility'){path(g,'M20 86 Q75 30 130 91 T240 80 T322 48',red,3);}
  if(type==='overfit'){path(g,'M20 145 L65 110 L115 78 L160 46 L205 28 L250 20 L315 18',green,3);path(g,'M20 145 L65 110 L115 95 L160 128 L205 90 L250 151 L315 136',red,3);}
 }else if(['network','market','macro','rates','news','strategy','checklist','process','plan','review','discipline','mind','shield','compass','cost'].includes(type)){
  const pts=[[65,55],[164,36],[268,62],[95,133],[226,134],[164,92]];
  const links=[[0,1],[1,2],[0,3],[3,5],[5,4],[4,2],[1,5],[0,5],[2,5]];
  links.forEach(([a,b])=>line(g,pts[a][0],pts[a][1],pts[b][0],pts[b][1],gold,2,.7));
  pts.forEach(([x,y],i)=>{circle(g,x,y,17,i===5?gold:'#12654d');circle(g,x,y,7,i===5?'#0b1c21':green);});
  if(type==='shield'){path(g,'M164 55 L211 73 L204 130 Q164 163 124 130 L117 73 Z',gold,4);}
  if(type==='mind'||type==='discipline')text(g,164,101,'FOCUS','#0b1c21',12);
 }else{
  path(g,'M24 140 Q88 40 145 92 T320 35',green,4);
  for(let i=0;i<5;i++)circle(g,45+i*57,115-(i*13),10,i%2?gold:green);
 }
}
const css=`
.tenx-lr-root .hx-hero .hx-scene{display:none!important}
.tenx-lr-root .hx-hero{grid-template-columns:minmax(0,1fr) 48%;min-height:230px}
.hx-topic-scene{position:relative;min-width:0;transform:perspective(850px) rotateY(-9deg) rotateX(5deg);filter:drop-shadow(0 15px 18px #0009);transition:transform .3s ease}
.hx-topic-scene:before{content:'';position:absolute;inset:8% 5%;background:radial-gradient(ellipse,#36ff8966,transparent 70%);filter:blur(18px)}
.hx-topic-scene svg{position:relative;display:block;width:100%;height:auto;overflow:visible;border:1px solid #39ff8840;border-radius:16px;background:linear-gradient(145deg,#0d3430dd,#08121fdd);box-shadow:inset 0 1px 0 #ffffff25,0 12px 25px #0009,0 0 22px #0ca55b22}
.hx-scene-caption{font:700 10px sans-serif;color:#e8bd60;letter-spacing:1px;text-align:center;margin-top:8px}
.hx-lesson-id{display:inline-block;font:700 11px sans-serif;color:#9af8bd;margin-top:7px}
@media(hover:hover){.hx-topic-scene:hover{transform:perspective(850px) rotateY(0deg) rotateX(0deg)}}
@media(max-width:430px){.tenx-lr-root .hx-hero{grid-template-columns:minmax(0,1fr) 44%;min-height:195px;gap:5px}.hx-topic-scene{transform:perspective(800px) rotateY(-5deg)}.hx-scene-caption{font-size:8px}}
@media(prefers-reduced-motion:reduce){.hx-topic-scene{transition:none}}
`;
function enhance(root){if(!root||root.dataset.hxD2==='1')return false;const hero=root.querySelector('.hx-hero');if(!hero)return false;
 const title=hero.querySelector('.hx-hero-title');const t=normalize(title&&title.textContent);const entry=byTitle.get(t);
 if(!entry)return false;
 const scene=el('div','hx-topic-scene');scene.setAttribute('role','img');scene.setAttribute('aria-label','نمودار مفهومی سه‌بعدی مرتبط با '+entry.title);
 const svg=svgEl('svg',{viewBox:'0 0 340 205','aria-hidden':'true',focusable:'false'});draw(svg,entry.scene,entry.number);scene.appendChild(svg);
 scene.appendChild(el('div','hx-scene-caption',entry.scene.toUpperCase()+' · 10X 3D'));
 hero.appendChild(scene);const copy=hero.querySelector('.hx-hero-copy');if(copy)copy.appendChild(el('span','hx-lesson-id','LESSON '+String(entry.number).padStart(2,'0')+' / 50'));
 root.dataset.hxD2='1';root.dataset.hxLesson=entry.id;return true;
}
function scan(){document.querySelectorAll('.tenx-lr-root').forEach(enhance)}
if(!document.getElementById('tenx-hybrid3d-scenes-style')){const style=el('style');style.id='tenx-hybrid3d-scenes-style';style.textContent=css;document.head.appendChild(style)}
let queued=false;function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()})}
const obs=new MutationObserver(schedule);function start(){scan();obs.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();'''
js=js.replace('__LESSONS__',json.dumps(DATA,ensure_ascii=False,separators=(',',':')))
chk=subprocess.run([node,'--check'],input=js,text=True,capture_output=True)
if chk.returncode:fail('JS_SYNTAX_'+chk.stderr[:150])
# Anchor to actual D1 loader closing tag, not arbitrary text.
anchor='<script src="/miniapp/tenx-hybrid3d.js?v=r13d1"></script>'
if html.count(anchor)!=1:fail('EXACT_D1_SCRIPT_TAG_NOT_FOUND')
loader='<script src="/miniapp/tenx-hybrid3d-scenes.js?v=r13d2"></script>'
newhtml=html.replace(anchor,anchor+'\n'+loader,1)
OUT=OUTROOT/('r13-d2-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f'));OUT.mkdir(mode=0o700,parents=True)
backup=OUT/'index.html.before';backup.write_bytes(original);backup.chmod(0o600)
(OUT/'lesson-manifest.json').write_text(json.dumps(DATA,ensure_ascii=False,indent=2),encoding='utf-8')
manifest={'phase':'R13-D2','lessons':len(DATA),'htmlBefore':digest(original),'htmlAfter':digest(newhtml.encode()),'js':digest(js.encode()),'databaseChanged':False}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
rollback=OUT/'rollback.sh';rollback.write_text('#!/bin/bash\nset -euo pipefail\n'+f'HTML={str(HTML)!r}\nJS={str(TARGET)!r}\n'+f'test "$(sha256sum "$HTML" | cut -d\' \' -f1)" = {manifest["htmlAfter"]!r} || {{ echo ROLLBACK_BLOCKED_HTML_CHANGED; exit 1; }}\n'+f'test "$(sha256sum "$JS" | cut -d\' \' -f1)" = {manifest["js"]!r} || {{ echo ROLLBACK_BLOCKED_JS_CHANGED; exit 1; }}\n'+f'cp {str(backup)!r} "$HTML"\nrm "$JS"\necho R13_D2_ROLLBACK=PASS\n',encoding='utf-8');rollback.chmod(0o700)
htmp=WEB/'.r13d2-index.tmp';jtmp=WEB/'.r13d2-scenes.tmp';htmp.write_text(newhtml,encoding='utf-8');jtmp.write_text(js,encoding='utf-8');htmp.chmod(HTML.stat().st_mode&0o777);jtmp.chmod(0o644)
print('PREFLIGHT=PASS\nJS_SYNTAX=PASS\nLESSON_MANIFEST=50\nBACKUP=PASS',flush=True)
try:os.replace(jtmp,TARGET);os.replace(htmp,HTML)
except Exception as e:
 if digest(HTML.read_bytes())==manifest['htmlAfter']:shutil.copy2(backup,HTML)
 if TARGET.exists() and digest(TARGET.read_bytes())==manifest['js']:TARGET.unlink()
 fail('DEPLOY_'+type(e).__name__)
if digest(HTML.read_bytes())!=manifest['htmlAfter'] or digest(TARGET.read_bytes())!=manifest['js']:fail('POSTVERIFY_HASH_MISMATCH')
print('FRONTEND_FILES=PASS_PUBLISHED\nDATABASE_CHANGED=NO\nSERVICES_RESTARTED=NO\nROLLBACK=READY\nROLLBACK_PATH='+str(rollback)+'\nLESSON_MANIFEST_PATH='+str(OUT/'lesson-manifest.json')+'\nR13_D2=PASS_PUBLISHED')
