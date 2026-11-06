(()=>{'use strict';
const $=id=>document.getElementById(id);
const lessons=[
{id:'challenge',icon:'⛰',title:'چالش 10X چیست؟',body:'چالش 10X مسیر آموزشی آشنایی با بازار، عضویت و مدیریت حساب است. نام 10X به‌معنی تضمین ده‌برابرشدن سرمایه نیست.',key:'قبل از ورود به چالش، قوانین و ریسک‌های آن را مطالعه کن.'},
{id:'forex',icon:'↗',title:'فارکس چیست؟',body:'فارکس بازار مبادله ارزهای کشورهاست. برای نمونه، EUR/USD قیمت یورو نسبت به دلار را نشان می‌دهد. معامله ممکن است سود یا زیان داشته باشد.',key:'اهرم می‌تواند زیان را هم چندبرابر کند.'},
{id:'gold',icon:'◆',title:'طلا و XAUUSD چیست؟',body:'XAUUSD نماد رایج قیمت اونس طلا نسبت به دلار آمریکاست. معامله این نماد الزاماً به معنی خرید طلای فیزیکی نیست.',key:'پیش از معامله نوع قرارداد و هزینه‌های آن را بررسی کن.'},
{id:'crypto',icon:'₿',title:'کریپتو و ارز دیجیتال چیست؟',body:'دارایی‌های رمزارزی مانند بیت‌کوین و اتریوم روی شبکه‌های دیجیتال معامله می‌شوند. قیمت‌ها ممکن است به‌شدت نوسان کنند.',key:'اشتباه در انتقال رمزارز یا مدیریت کلید خصوصی ممکن است برگشت‌ناپذیر باشد.'},
{id:'broker',icon:'▦',title:'بروکر و صرافی چه تفاوتی دارند؟',body:'بروکر خدمات معاملات مالی ارائه می‌کند؛ صرافی معمولاً بستر تبدیل و خریدوفروش دارایی است. خدمات، مجوزها و هزینه‌ها متفاوت‌اند.',key:'وضعیت مجوز، کارمزد، نوع قرارداد و برداشت را بررسی کن.'},
{id:'scam',icon:'⚑',title:'آیا این بازارها کلاهبرداری‌اند؟',body:'خود بازار مالی لزوماً کلاهبرداری نیست؛ اما پلتفرم‌های جعلی یا فروشندگان وعده سود قطعی می‌توانند کلاهبردار باشند.',key:'وعده سود تضمینی و فشار برای واریز سریع، نشانه هشدار است.'},
{id:'risk',icon:'⚖',title:'مدیریت ریسک چیست؟',body:'قبل از معامله حد زیان قابل‌تحمل، اندازه موقعیت و نقطه خروج را مشخص کن. هیچ استراتژی‌ای سود دائمی تضمین نمی‌کند.',key:'با پول ضروری زندگی وارد معاملات پرریسک نشو.'}
];
const KEYS=lessons.map(x=>x.id), tg=window.Telegram?.WebApp;
const initData=tg?.initData||'';
let read=new Set(), active=null, busy=false, scene=[];
try{tg?.ready();tg?.expand()}catch{}
const status=(t,err=false)=>{const n=$('status');n.textContent=t;n.style.color=err?'#ff9f9b':'#e8c894'};
async function api(path,data){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store'});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'server_error');return body}
function updateProgress(){const n=KEYS.filter(k=>read.has(k)).length,pct=Math.round(n/KEYS.length*100);$('progressPercent').textContent=pct.toLocaleString('fa-IR')+'٪';$('progressFill').style.width=pct+'%';$('progressLabel').textContent=`آموزش‌های تأییدشده: ${n.toLocaleString('fa-IR')} از ۷`;const btn=$('next');btn.disabled=n!==7||!initData;btn.textContent=n===7?'ادامه به مرحله ۲ ←':'🔒 مرحله ۲ قفل است — '+(7-n).toLocaleString('fa-IR')+' درس باقی‌مانده'}
function renderLessons(){const root=$('lessons');root.replaceChildren();lessons.forEach((lesson,i)=>{
const done=read.has(lesson.id),opened=active===lesson.id;
const card=document.createElement('article');card.className='lesson'+(done?' is-read':'')+(opened?' open':'');
const head=document.createElement('button');head.type='button';head.className='lesson-head';head.setAttribute('aria-expanded',String(opened));
const mark=document.createElement('span');mark.className='status';mark.textContent=done?'✓':'•';
const ico=document.createElement('span');ico.className='lesson-icon';ico.textContent=lesson.icon;
const title=document.createElement('span');title.className='lesson-title';title.textContent=`${(i+1).toLocaleString('fa-IR')}. ${lesson.title}`;
const arrow=document.createElement('span');arrow.className='lesson-chevron';arrow.textContent='‹';head.append(mark,ico,title,arrow);head.addEventListener('click',()=>{active=opened?null:lesson.id;renderLessons()});card.append(head);
const answer=document.createElement('div');answer.className='answer';const p=document.createElement('p');p.textContent=lesson.body;const tip=document.createElement('p');tip.className='key';tip.textContent=lesson.key;answer.append(p,tip);
if(!done){const confirm=document.createElement('button');confirm.type='button';confirm.className='confirm';confirm.textContent='✓ مطالعه کردم';confirm.disabled=!initData||busy;confirm.addEventListener('click',async()=>{
 if(busy||!initData)return;busy=true;confirm.disabled=true;status('در حال ثبت مطالعه درس...');try{const j=await api('/challenge/learning/stage1/complete',{initData,lessonKey:lesson.id});read=new Set(j.read.filter(k=>KEYS.includes(k)));status('مطالعه درس ثبت شد ✓');renderLessons();updateProgress()}catch(e){status('ثبت ناموفق: '+e.message,true);confirm.disabled=false}finally{busy=false}
});answer.append(confirm)}else{const d=document.createElement('div');d.style.color='#67e5a5';d.textContent='✓ این درس در حساب شما تکمیل شده است.';answer.append(d)}card.append(answer);root.append(card)
})}
function makeStatic(html){const t=document.createElement('template');t.innerHTML=html;return t.content.cloneNode(true)}
function objectContent(o){switch(o.type){
case 'coin':return makeStatic('<span class="content coin">₿</span>');
case 'orb':return makeStatic('<span class="content orb"></span>');
case 'ring':case 'glow':return makeStatic('<span class="content light-ring"></span>');
case 'bars':return makeStatic('<span class="content bar-group"><i style="--bar:30%"></i><i style="--bar:56%"></i><i style="--bar:79%"></i><i style="--bar:100%"></i></span>');
case 'candles':return makeStatic('<span class="content candlestick-row">'+[72,42,86,67,37,78,99,53,75,93,58,80].map((h,i)=>`<span class="candle ${[1,4,7,10].includes(i)?'down':'up'}" style="--ch:${h}%;--dur:${2+i%4*.45}s;--d:-${i*.33}s"><i></i><b></b></span>`).join('')+'</span>');
case 'label':return makeStatic('<span class="content label-art">FOREX · GOLD · CRYPTO</span>');
case 'flag':return makeStatic('<span class="content label-art">⚑ 10X</span>');
case 'text':{const el=document.createElement('span');el.className='content label-art';el.textContent=o.text||'';return el}
case 'image':{const img=document.createElement('img');img.className='content';img.alt=o.text||'آبجکت';img.decoding='async';img.loading='lazy';img.style.maxWidth='100%';img.src=o.src||'';return img}
default:return document.createTextNode('')
}}
function clamp(v,min,max){v=Number(v);return Number.isFinite(v)?Math.min(max,Math.max(min,v)):min}
function renderScene(items){scene=Array.isArray(items)?items:[];const hero=$('hero');hero.querySelectorAll('.object').forEach(n=>n.remove());for(const o of scene){const el=document.createElement('div');el.className='object '+(o.anim&&o.anim!=='none'?o.anim:'');el.dataset.id=o.id;el.style.cssText=`--x:${clamp(o.x,0,100)}%;--y:${clamp(o.y,0,100)}%;--w:${clamp(o.w,5,100)}%;--rot:${clamp(o.rot,-180,180)}deg;--opacity:${clamp(o.opacity,0,100)/100};--z:${clamp(o.z,0,100)}`;el.append(objectContent(o));hero.append(el);
if(new URLSearchParams(location.search).get('studio')==='1' && window.parent!==window){el.style.touchAction='none';let start=null;el.addEventListener('pointerdown',e=>{e.preventDefault();start={id:o.id,x:e.clientX,y:e.clientY,ox:o.x,oy:o.y};el.setPointerCapture(e.pointerId)});el.addEventListener('pointermove',e=>{if(!start)return;const b=hero.getBoundingClientRect();o.x=clamp(start.ox+(e.clientX-start.x)/b.width*100,0,100);o.y=clamp(start.oy+(e.clientY-start.y)/b.height*100,0,100);el.style.setProperty('--x',o.x+'%');el.style.setProperty('--y',o.y+'%');window.parent.postMessage({type:'MM_STAGE1_OBJECT_MOVED',id:o.id,x:o.x,y:o.y},location.origin)});el.addEventListener('pointerup',()=>{start=null})}
}}
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent)return;const d=e.data;if(d?.type==='MM_STAGE1_SCENE_PREVIEW'&&Array.isArray(d.items)&&d.items.length<=32)renderScene(d.items)});
async function init(){renderLessons();updateProgress();try{const [remote,def]=await Promise.all([fetch('/challenge/learning/stage1/scene',{cache:'no-store'}).then(r=>r.json()),fetch('./scene-defaults.json').then(r=>r.json())]);renderScene(Array.isArray(remote.items)?remote.items:def)}catch(e){status('خطا در دریافت آبجکت‌ها',true)}
if(!initData){status('برای ثبت پیشرفت، این صفحه را از داخل مینی‌اپ تلگرام باز کن.',true);return}
try{const state=await api('/challenge/learning/stage1/status',{initData});read=new Set((state.read||[]).filter(k=>KEYS.includes(k)));renderLessons();updateProgress();status(state.unlocked?'هر ۷ درس تکمیل شده‌اند؛ مرحله ۲ باز است.':'بعد از خواندن هر درس، «مطالعه کردم» را انتخاب کن.')}catch(e){status('خطای احراز هویت یا اتصال: '+e.message,true)}
}
$('next').addEventListener('click',()=>{if(read.size===7&&initData)location.assign('./stage2.html')});init();
})();
