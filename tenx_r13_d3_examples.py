#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import hashlib,json,os,shutil,subprocess,sys
ROOT=Path('/root/miniapp10x'); WEB=ROOT/'public/miniapp'; HTML=WEB/'index.html'; D2=WEB/'tenx-hybrid3d-scenes.js'; TARGET=WEB/'tenx-hybrid3d-examples.js'
def die(msg): print('R13_D3=BLOCKED\nREASON='+msg);sys.exit(1)
if not HTML.is_file() or not D2.is_file():die('REQUIRED_FILES_MISSING')
html=HTML.read_text('utf-8'); anchor='<script src="/miniapp/tenx-hybrid3d-scenes.js?v=r13d2"></script>'
if html.count(anchor)!=1:die('D2_LOADER_MISSING_OR_DUPLICATED')
if TARGET.exists() or 'tenx-hybrid3d-examples.js' in html:die('D3_ALREADY_INSTALLED')
node=shutil.which('node')
if not node:die('NODE_MISSING')
js=r'''(function(){'use strict';
const STYLES=`
.tenx-lr-root .hx-example3d{position:relative;isolation:isolate;overflow:hidden;margin:16px 0 22px;padding:16px;border-radius:20px;border:1px solid #4df5a75c;background:radial-gradient(ellipse at 85% 0%,#2b986336,transparent 52%),linear-gradient(145deg,#0a2425,#0a1222);box-shadow:inset 0 1px #ffffff24,0 18px 34px #0006}
.tenx-lr-root .hx-example3d:before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 27px,#74f4aa09 28px),repeating-linear-gradient(90deg,transparent 0 27px,#74f4aa09 28px);transform:perspective(400px) rotateX(30deg) scale(1.2);z-index:-1}
.hx-ex-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;color:#e8bd60;font-size:11px;font-weight:800}.hx-ex-pill{border:1px solid #e8bd6060;border-radius:20px;padding:3px 9px;color:#d7fce8;font-size:10px}
.hx-ex-stage{perspective:700px;display:flex;gap:12px;align-items:center;justify-content:center;min-height:130px;flex-wrap:wrap}.hx-ex-object{width:72px;height:90px;position:relative;display:grid;place-items:center;transform:rotateX(12deg) rotateY(-18deg);filter:drop-shadow(7px 12px 9px #0009)}.hx-ex-object:before{content:'';position:absolute;inset:14% 10% 8%;border-radius:12px;background:linear-gradient(125deg,#7bffba,#0d8a61 46%,#053f45);box-shadow:inset 4px 3px 7px #ffffff50,inset -6px -7px 8px #001a26,0 0 20px #31ff8533;transform:skewY(-6deg)}.hx-ex-object.gold:before{background:linear-gradient(125deg,#ffe7a4,#c49135 48%,#5e3e1c)}.hx-ex-object.red:before{background:linear-gradient(125deg,#ff9ca0,#b52b48 48%,#5e1633)}.hx-ex-object span{position:relative;z-index:1;font-size:23px;color:#061d1c;font-weight:900;text-shadow:0 1px #ffffff55}.hx-ex-arrow{color:#e8bd60;font-size:25px;font-weight:900}.hx-ex-plot{width:min(100%,300px);height:130px;filter:drop-shadow(0 8px 8px #0009)}.hx-ex-plot svg{display:block;width:100%;height:100%;overflow:visible}.hx-ex-note{color:#bed4d0;font-size:11px;line-height:1.8;text-align:center;margin-top:10px}.hx-ex-label{font-size:11px;color:#e8bd60;text-align:center;margin-top:4px}
.hx-ex-control{margin-top:12px;padding:11px;border:1px solid #ffffff24;border-radius:12px;background:#0003}.hx-ex-control label{display:block;font-size:12px;color:#d9e9e2}.hx-ex-control input{width:100%;accent-color:#39ff88;margin:9px 0}.hx-ex-result{font-size:12px;color:#92ffbe;font-weight:800}.hx-ex-source{margin:12px 0 0;padding:10px 12px;border-right:3px solid #e8bd60;border-radius:9px;background:#ffffff0a;color:#e1eae6;font-size:13px;line-height:2;text-align:right;white-space:pre-wrap}
@media(prefers-reduced-motion:reduce){.hx-ex-object{transform:none}}
@media(max-width:420px){.tenx-lr-root .hx-example3d{padding:12px}.hx-ex-object{width:60px;height:74px}}
`;
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
function classify(t){if(/بک.?تست|بیش.?برازش|خارج از نمونه|آزمون/.test(t))return 'backtest';if(/ریسک|حد ضرر|سرمایه|حجم معامله|لات|اهرم|درصد/.test(t))return 'risk';if(/روند|کندل|شکست|قیمت|حمایت|مقاومت|نقدینگی|ورود|خروج/.test(t))return 'chart';if(/نرخ بهره|تورم|اخبار|اقتصادی|عرضه|تقاضا/.test(t))return 'flow';return 'concept'}
function plot(stage,kind){const wrap=el('div','hx-ex-plot');const ns='http://www.w3.org/2000/svg';function node(tag,attrs){const n=document.createElementNS(ns,tag);Object.keys(attrs).forEach(k=>n.setAttribute(k,attrs[k]));return n}const svg=node('svg',{viewBox:'0 0 300 130',role:'img','aria-label':'نمودار شماتیک آموزشی بدون داده واقعی'});for(let y=25;y<130;y+=25)svg.appendChild(node('path',{d:`M0 ${y} H300`,stroke:'#ffffff19','stroke-width':1}));svg.appendChild(node('path',{d:'M0 90 H300',stroke:'#e8bd60','stroke-width':2,'stroke-dasharray':'5 5'}));const a=kind==='backtest'?'M8 112 L40 100 L70 60 L100 35 L135 24 L165 17 L195 10 L225 6 L292 4':kind==='flow'?'M8 104 L55 90 L95 72 L140 78 L182 47 L232 39 L292 16':'M8 110 L40 90 L70 103 L100 72 L130 79 L160 44 L195 55 L225 22 L250 40 L292 12';svg.appendChild(node('path',{d:a,fill:'none',stroke:'#39ff88','stroke-width':4,'stroke-linecap':'round','stroke-linejoin':'round'}));if(kind==='backtest')svg.appendChild(node('path',{d:'M8 112 L45 100 L70 88 L110 92 L145 65 L190 81 L230 61 L292 95',fill:'none',stroke:'#ffbd69','stroke-width':3,'stroke-dasharray':'7 5'}));wrap.appendChild(svg);stage.appendChild(wrap)}
function objects(stage,kind){const items=kind==='risk'?[['1%',''],['2%','gold'],['5%','red']]:kind==='flow'?[['↑',''],['↔','gold'],['↓','red']]:[['A',''],['→','gold'],['B','']];items.forEach(([t,c],i)=>{if(i)stage.appendChild(el('div','hx-ex-arrow','›'));const ob=el('div','hx-ex-object '+c);ob.appendChild(el('span','',t));stage.appendChild(ob)})}
function addSlider(card,kind){if(kind!=='risk')return;const c=el('div','hx-ex-control');const label=el('label','','شبیه‌سازی مستقل: ریسک هر معامله از سرمایه فرضی ۱۰۰۰ واحد');const range=el('input');range.type='range';range.min='0.5';range.max='5';range.step='0.5';range.value='1';range.setAttribute('aria-label','درصد ریسک فرضی');const result=el('div','hx-ex-result');function update(){const v=Number(range.value);result.textContent=`ریسک ${v.toLocaleString('fa-IR')}٪ = ${((1000*v)/100).toLocaleString('fa-IR')} واحد`};range.addEventListener('input',update);update();c.append(label,range,result);card.appendChild(c)}
function candidate(node){if(node.closest('.hx-example3d'))return false;const t=(node.textContent||'').trim();return t.length>=55&&t.length<=1900&&/(مثال|فرض کنید|فرض کنیم|برای نمونه|به عنوان مثال|به‌عنوان مثال|سناریو|محاسبه کنید)/i.test(t)}
function enhance(root){if(!root||root.dataset.hxD3==='1')return;root.dataset.hxD3='1';const paragraphs=Array.from(root.querySelectorAll('.tenx-lr-paragraph, p'));let count=0;paragraphs.forEach(p=>{if(count>=8||!candidate(p))return;const source=p.textContent.trim();const kind=classify(source);const card=el('section','hx-example3d');card.setAttribute('aria-label','نمایش سه‌بعدی مثال آموزشی');const top=el('div','hx-ex-top');top.append(el('span','','✦ مثال آموزشی 3D'),el('span','hx-ex-pill',kind==='risk'?'مدیریت ریسک':kind==='chart'?'رفتار قیمت':kind==='backtest'?'ارزیابی استراتژی':kind==='flow'?'جریان بازار':'مفهوم آموزشی'));card.appendChild(top);const stage=el('div','hx-ex-stage');if(kind==='chart'||kind==='backtest')plot(stage,kind);else objects(stage,kind);card.appendChild(stage);card.appendChild(el('div','hx-ex-note','تصویر شماتیک است؛ اعداد و نمودارها داده واقعی بازار نیستند.'));addSlider(card,kind);card.appendChild(el('div','hx-ex-source',source));p.replaceWith(card);count++})}
if(!document.getElementById('tenx-hybrid3d-examples-style')){const s=el('style');s.id='tenx-hybrid3d-examples-style';s.textContent=STYLES;document.head.appendChild(s)}
let queued=false;function scan(){document.querySelectorAll('.tenx-lr-root').forEach(enhance)}function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()})}const observer=new MutationObserver(schedule);function start(){scan();observer.observe(document.body,{childList:true,subtree:true})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();'''
check=subprocess.run([node,'--check'],input=js,text=True,capture_output=True)
if check.returncode:die('JS_SYNTAX_FAILED_'+check.stderr[:180])
loader='<script src="/miniapp/tenx-hybrid3d-examples.js?v=r13d3"></script>'
newhtml=html.replace(anchor,anchor+'\n'+loader,1)
OUT=ROOT/'academy-content'/('r13-d3-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f'));OUT.mkdir(parents=True,mode=0o700)
backup=OUT/'index.html.before';backup.write_bytes(HTML.read_bytes());backup.chmod(0o600)
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected_html=hashlib.sha256(newhtml.encode()).hexdigest();expected_js=hashlib.sha256(js.encode()).hexdigest()
manifest={'html_before':hashfile(backup),'html_after':expected_html,'js_sha256':expected_js,'database_changed':False,'notes':'Decorative schematic example visuals; existing example wording preserved'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
rollback=OUT/'rollback.sh';rollback.write_text('#!/bin/bash\nset -euo pipefail\nHTML='+str(HTML)+'\nJS='+str(TARGET)+'\ntest "$(sha256sum "$HTML" | cut -d\' \' -f1)" = '+expected_html+' || exit 1\ntest "$(sha256sum "$JS" | cut -d\' \' -f1)" = '+expected_js+' || exit 1\ncp '+str(backup)+' "$HTML"\nrm "$JS"\necho R13_D3_ROLLBACK=PASS\n');rollback.chmod(0o700)
print('PREFLIGHT=PASS\nJS_SYNTAX=PASS\nBACKUP=PASS',flush=True)
htmp=WEB/'.tenx-d3-index.tmp';jtmp=WEB/'.tenx-d3-js.tmp';htmp.write_text(newhtml,'utf-8');jtmp.write_text(js,'utf-8');htmp.chmod(HTML.stat().st_mode&0o777);jtmp.chmod(0o644)
try:os.replace(jtmp,TARGET);os.replace(htmp,HTML)
except Exception as exc:
    shutil.copy2(backup,HTML)
    if TARGET.exists() and hashfile(TARGET)==expected_js:TARGET.unlink()
    die('DEPLOY_ERROR_'+str(exc))
if hashfile(HTML)!=expected_html or hashfile(TARGET)!=expected_js:die('POSTVERIFY_FAILED_MANUAL_REVIEW_REQUIRED')
print('FRONTEND_FILES=PASS_PUBLISHED\nDATABASE_CHANGED=NO\nSERVICES_RESTARTED=NO\nROLLBACK=READY\nROLLBACK_PATH='+str(rollback)+'\nR13_D3=PASS_PUBLISHED')
