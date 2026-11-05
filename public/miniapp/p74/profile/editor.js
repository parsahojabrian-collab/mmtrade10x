/* P77 independent safe live editor: draft in localStorage, no unverified backend writes. */
(function(){'use strict';
const $=id=>document.getElementById(id);const FRAME=$('frame'),FIELDS=$('fields');let cfg=null;
function clone(x){return JSON.parse(JSON.stringify(x))}
function say(s){$('status').textContent=s}
function row(host,label,value,onChange,kind='text'){const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.type=kind==='check'?'checkbox':kind==='number'?'number':'text';if(kind==='check')i.checked=Boolean(value);else i.value=value??'';if(kind==='number')i.step='any';i.addEventListener(kind==='check'?'change':'input',()=>{onChange(kind==='check'?i.checked:kind==='number'?Number(i.value):i.value);update()});l.append(i);host.append(l)}
function group(title){const box=document.createElement('fieldset');const leg=document.createElement('legend');leg.textContent=title;box.append(leg);FIELDS.append(box);return box}
const K={brand:'نام برند',tagline:'شعار برند',pathCaption:'عنوان مسیر رشد',progressTitle:'عنوان پیشرفت',progressSubtitle:'زیرعنوان پیشرفت',stageTitle:'عنوان مرحله',accountTitle:'وضعیت حساب',planTitle:'پلن چالش',awardsTitle:'دستاوردها و جوایز',tasksTitle:'عنوان ماموریت‌ها',daysTitle:'عنوان روزهای فعالیت',scoreTitle:'عنوان امتیاز',ctaText:'متن دکمه اصلی',ctaHref:'لینک دکمه اصلی',supportHref:'لینک پشتیبانی HTTPS'};
function update(){if(!cfg)return;FRAME.contentWindow?.postMessage({type:'P77_CONFIG_PREVIEW',config:clone(cfg)},location.origin)}
function draw(){if(!cfg)return;FIELDS.querySelectorAll('fieldset').forEach(x=>x.remove());let b=group('عنوان‌ها و اطلاعات نمایشی');Object.entries(K).forEach(([k,t])=>row(b,t,cfg[k],v=>cfg[k]=v));b=group('رنگ و ابعاد');for(const [k,t] of [['radius','گردی کارت‌ها (۹–۳۰)'],['gap','فاصله کارت‌ها (۴–۲۰)'],['scale','مقیاس فونت (۰٫۸ تا ۱٫۲)'],['heroHeight','ارتفاع کارت کاربر (۱۳۶–۲۲۵)']])row(b,t,cfg.settings[k],v=>cfg.settings[k]=v,'number');for(const [k,t] of [['animate','انیمیشن سبک'],['showRewardsNav','نمایش تب جوایز']])row(b,t,cfg.settings[k],v=>cfg.settings[k]=v,'check');b=group('منوی عملیات');cfg.menuTitles.forEach((v,i)=>row(b,'عنوان '+(i+1),v,x=>cfg.menuTitles[i]=x));b=group('مدال‌ها');cfg.awardTitles.forEach((v,i)=>row(b,'عنوان '+(i+1),v,x=>cfg.awardTitles[i]=x));b=group('منوی پایین');cfg.nav.forEach((v,i)=>{row(b,'عنوان '+(i+1),v.title,x=>v.title=x);row(b,'مقصد '+(i+1),v.href,x=>v.href=x)});update()}
function load(){let saved;try{saved=JSON.parse(localStorage.getItem('p77_editor_draft')||'null')}catch(e){}cfg=saved||clone(FRAME.contentWindow.P77Profile?.defaults||{});if(cfg.settings)draw();else{say('در حال آماده‌سازی…');setTimeout(load,120)}}
FRAME.addEventListener('load',()=>{if(!cfg)load();else update()});
$('save').onclick=()=>{try{localStorage.setItem('p77_editor_draft',JSON.stringify(cfg));say('پیش‌نویس در این مرورگر ذخیره شد')}catch(e){say('ذخیره ممکن نشد')}};
$('reset').onclick=()=>{if(!confirm('ویرایش‌های محلی بازنشانی شوند؟'))return;try{localStorage.removeItem('p77_editor_draft')}catch(e){}cfg=clone(FRAME.contentWindow.P77Profile.defaults);draw();say('بازنشانی شد')};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:77,...cfg},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='p77-profile-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);say('فایل تنظیمات آماده شد')};
$('import').onclick=()=>{const file=document.createElement('input');file.type='file';file.accept='application/json,.json';file.onchange=()=>{if(!file.files?.length)return;const reader=new FileReader();reader.onload=()=>{try{const value=JSON.parse(reader.result);if(!value||!value.settings||!Array.isArray(value.nav))throw Error('ساختار نامعتبر');cfg=clone(value);draw();say('تنظیمات بارگذاری شد')}catch(e){say('فایل JSON معتبر نیست')}};reader.readAsText(file.files[0])};file.click()};
/* Optional authenticated Studio bridge; standalone editor never publishes by itself. */
window.addEventListener('message',function(e){
 if(e.origin!==location.origin||e.source!==window.parent||!e.data)return;
 if(e.data.type==='P77_STUDIO_LOAD'&&e.data.config&&e.data.config.settings&&Array.isArray(e.data.config.nav)){
  cfg=clone(e.data.config);draw();say('تنظیمات منتشرشده/پیش‌نویس Studio بارگذاری شد');
 }
 if(e.data.type==='P77_STUDIO_GET'&&cfg){
  e.source.postMessage({type:'P77_STUDIO_STATE',config:clone(cfg),requestId:e.data.requestId},e.origin);
 }
});

})();
