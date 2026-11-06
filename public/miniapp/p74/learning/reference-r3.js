/* MMTrade Stage1 reference R3 visual adapter: preserves lesson completion API. */
(()=>{'use strict';
const ASSETS='./assets/reference-r3/';
const info={
  'فارکس':{order:1,icon:'01_forex_icon.webp',sub:'بازار جهانی تبادل ارزها و تغییر قیمت آن‌ها'},
  'کریپتو':{order:2,icon:'02_crypto_icon.webp',sub:'دارایی‌های دیجیتال مانند بیت‌کوین، با نوسان زیاد'},
  'طلا':{order:3,icon:'03_gold_icon.webp',sub:'XAUUSD قیمت جهانی اونس طلا در برابر دلار است'},
  'کلاهبرداری':{order:4,icon:'04_safety_icon.webp',sub:'این بازارها ذاتاً کلاهبرداری نیستند؛ مراقب وعده سود قطعی باش'},
  'چالش 10X':{order:5,icon:'04_safety_icon.webp',sub:'آشنایی با مراحل چالش، قوانین و ریسک‌ها'},
  'بروکر':{order:6,icon:'01_forex_icon.webp',sub:'تفاوت بروکر و صرافی، هزینه‌ها و اعتبارسنجی'},
  'ریسک':{order:7,icon:'04_safety_icon.webp',sub:'مدیریت سرمایه، حجم معامله و حد زیان'}
};
function pick(s){for(const [key,v] of Object.entries(info))if(s.includes(key))return v;return {order:8,icon:'04_safety_icon.webp',sub:'یک نکته کاربردی از بازارهای مالی'}}
function setupHero(){const hero=document.getElementById('hero');if(!hero||hero.classList.contains('ref-r3-hero'))return;
 hero.classList.add('ref-r3-hero');
 const art=document.createElement('img');art.className='ref-r3-art';art.src=ASSETS+'hero_from_approved_reference.webp';art.alt='تصویر بازارهای مالی از مرجع تأییدشده: کره زمین، بیت‌کوین، شمش طلا و نمودار';art.decoding='async';art.fetchPriority='high';hero.prepend(art);
 const candles=document.createElement('div');candles.className='ref-r3-candles';candles.setAttribute('aria-hidden','true');
 for(let i=0;i<8;i++){const n=document.createElement('i');const green=i%3!==1;n.style.setProperty('--h',(24+(i*19)%51)+'%');n.style.setProperty('--c',green?'#21e993':'#f15553');n.style.setProperty('--t',(1.9+(i%4)*.35)+'s');n.style.setProperty('--delay',(-i*.28)+'s');candles.append(n)}hero.append(candles);
}
function decorateLessons(){const root=document.getElementById('lessons');if(!root)return;
 root.querySelectorAll('.lesson').forEach(card=>{
   if(card.dataset.refR3==='1')return;
   const head=card.querySelector('.lesson-head'),title=card.querySelector('.lesson-title'),ico=card.querySelector('.lesson-icon');if(!head||!title||!ico)return;
   const v=pick(title.textContent||'');card.style.order=String(v.order);card.dataset.refR3='1';
   const img=document.createElement('img');img.src=ASSETS+v.icon;img.alt='';img.loading='lazy';ico.replaceChildren(img);
   const copy=document.createElement('span');copy.className='ref-r3-copy';head.insertBefore(copy,title);copy.append(title);
   const sub=document.createElement('small');sub.className='ref-r3-sub';sub.textContent=v.sub;copy.append(sub);
 });
}
function startLesson(){const first=[...document.querySelectorAll('.lesson')].sort((a,b)=>Number(a.style.order)-Number(b.style.order)).find(n=>!n.classList.contains('is-read'));
 const target=first||document.getElementById('lessons');if(!target)return;target.scrollIntoView({block:'center',behavior:'smooth'});const b=target.querySelector('.lesson-head');if(b&&b.getAttribute('aria-expanded')==='false')b.click();}
function setup(){setupHero();const root=document.getElementById('lessons');if(!root)return;decorateLessons();
 const observer=new MutationObserver(()=>decorateLessons());observer.observe(root,{childList:true});
 const tip=document.querySelector('.tip');if(tip&&!document.getElementById('ref-r3-start')){const btn=document.createElement('button');btn.id='ref-r3-start';btn.className='ref-r3-start';btn.type='button';btn.textContent='شروع آموزش مرحله ۱  ❯';btn.addEventListener('click',startLesson);tip.insertAdjacentElement('afterend',btn)}
 const progress=document.querySelector('.progressbox');if(progress&&tip){document.getElementById('ref-r3-start')?.insertAdjacentElement('afterend',progress)}
 const progressStatus=document.getElementById('status');if(progressStatus&&root)root.insertAdjacentElement('afterend',progressStatus);
 const nav=document.querySelector('.tabbar a[href*=\"view=academy\"]');if(nav){nav.href='/miniapp/p74/learning/stage1.html';nav.replaceChildren();const ic=document.createElement('span');ic.textContent='♜';nav.append(ic,document.createTextNode('چالش‌ها'))}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
