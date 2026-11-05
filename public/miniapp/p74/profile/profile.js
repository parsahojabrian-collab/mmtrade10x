/* P77 MMTrade Profile: semantic responsive UI, static approved visual assets; no fake production stats. */
(function(){'use strict';
if(window.__P77_PROFILE__)return;window.__P77_PROFILE__=true;
const VERSION='P77_PROFILE_MATCH_R1', MARK='#p77-profile-config';
const ROOT=document.getElementById('p77-app');if(!ROOT)return;
const DEMO=document.body.dataset.p77Demo==='true'||/\/preview\.html$/.test(location.pathname);
const CORE={
 brand:'MM Trade Challenge 10X',tagline:'چالش رشد ۱۰ برابری در معاملات',
 pathCaption:'در مسیر رشد 10X',progressTitle:'پیشرفت کلی',progressSubtitle:'در چالش 10X',
 stageTitle:'مرحله فعلی',scoreTitle:'امتیاز',daysTitle:'روزهای فعالیت',tasksTitle:'ماموریت تکمیل‌شده',
 accountTitle:'وضعیت حساب',planTitle:'پلن چالش',awardsTitle:'دستاوردها و جوایز',
 ctaText:'ادامه مسیر رشد',ctaHref:'/miniapp/challenge.html',supportHref:'',
 menuTitles:['ویرایش پروفایل','تنظیمات حساب','سوابق فعالیت','جوایز و دستاوردها','پشتیبانی'],
 awardTitles:['عضو 10X','پیشرو در چالش','تحلیل‌گر حرفه‌ای'],
 nav:[{title:'خانه',href:'/miniapp/index.html',icon:'home'},
      {title:'آکادمی',href:'/miniapp/academy.html',icon:'academy'},
      {title:'جوایز',href:'#p77-awards',icon:'gift'},
      {title:'پروفایل',href:'/miniapp/p74/profile/profile.html',icon:'user'}],
 settings:{radius:20,gap:10,scale:1,heroHeight:164,showRewardsNav:true,animate:true}
};
const DEMO_DATA={displayName:'امیر حسینی',username:'amir_trader10x',verified:true,vip:true,level:3,currentStage:3,currentStageTitle:'تمرین و اجرا',progressPercent:74,completedTasks:17,activeDays:28,points:12850,plan:'10X استاندارد',awards:['member','pioneer','analyst'],active:true,history:[{title:'شروع چالش',date:'روز اول'},{title:'آموزش‌های کلیدی',date:'روز هفتم'},{title:'تمرین و اجرا',date:'در حال انجام'}]};
const icons={
  home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  academy:'<path d="m2 9 10-6 10 6-10 6zM5 12v7c4 3 10 3 14 0v-7M22 9v9"/>',
  gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18"/><path d="M12 8C7 8 7 3 9 3c2.2 0 3 3.2 3 5Zm0 0c5 0 5-5 3-5-2.2 0-3 3.2-3 5Z"/>',
  user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  trophy:'<path d="M8 21h8M12 17v4M7 3h10v5a5 5 0 0 1-10 0V3Z"/><path d="M7 5H3v2a5 5 0 0 0 5 5M17 5h4v2a5 5 0 0 1-5 5"/>',
  crown:'<path d="M2 8l5 4 5-7 5 7 5-4-3 11H5L2 8Z"/>',
  check:'<path d="M5 12l5 5L20 7"/><circle cx="12" cy="12" r="10"/>',
  shield:'<path d="M12 2 4 6v7c0 5 4 8 8 9 4-1 8-4 8-9V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
  rocket:'<path d="M4 20c2.5 0 4-1 4-4M4 20c0-2.5 1-4 4-4M8 16l-2-2 3-4c3-4 8-6 12-6 0 4-2 9-6 12l-4 3-3-3Z"/><path d="M14 10h.01M9 19l-1 3M2 16l3-1"/>',
  star:'<path d="m12 2 3.2 6.6 7.3 1.1-5.3 5.2 1.3 7.2L12 18.5l-6.5 3.6 1.3-7.2L1.5 9.7l7.3-1.1L12 2Z"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M13 14h.01M18 14h.01"/>',
  list:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-8l1-8Z"/>',
  chevron:'<path d="m14 5-7 7 7 7"/>',
  pencil:'<path d="M12 20H4v-8L17 1a2 2 0 0 1 3 3L7 17l-3 3M14 4l6 6"/>',
  gear:'<path d="M10 2h4l.5 2.5 2 1 2.3-1.2 2.7 3-1.6 2 .5 2.3 2.4 1.1-.9 3.8-2.6.2-1.5 1.6.6 2.7-3.3 2-1.8-2-2.2.1-1.7 2-3.5-1.6.4-2.8-1.7-1.5-2.6-.1-1.2-3.7 2.4-1.3.4-2.3-1.7-2 2.5-3.1 2.4 1 1.9-1 .3-2.4Z"/><circle cx="12" cy="12" r="3"/>',
  chart:'<path d="M4 20V4M4 20h16M8 17v-5M13 17V8M18 17V5"/>',
  headset:'<path d="M3 13v-1a9 9 0 0 1 18 0v1M3 13v7h5v-8H3ZM21 13v7h-5v-8h5Z"/>',
  chevronleft:'<path d="m14 5-7 7 7 7"/>',
  close:'<path d="M5 5l14 14M19 5 5 19"/>',
  layers:'<path d="m2 8 10-6 10 6-10 6L2 8Zm0 6 10 6 10-6M2 19l10 6 10-6"/>'
};
const clone=v=>JSON.parse(JSON.stringify(v));const text=(x,n=120)=>String(x==null?'':x).replace(/[\u0000-\u001f]/g,'').trim().slice(0,n);
function safeHref(h){h=String(h||'').trim();if(/^\/(?!\/)[^\s<>'"]+$/.test(h))return h;if(/^#[A-Za-z][A-Za-z0-9_-]*$/.test(h))return h;try{let u=new URL(h);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href}catch(_){}return''}
function num(v,f=0,min=0,max=999999){let n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):f}
function cleanConfig(a){const o=clone(CORE);if(!a||typeof a!=='object')return o;
for(const k of ['brand','tagline','pathCaption','progressTitle','progressSubtitle','stageTitle','scoreTitle','daysTitle','tasksTitle','accountTitle','planTitle','awardsTitle','ctaText'])if(typeof a[k]==='string')o[k]=text(a[k],90)||o[k];
for(const k of ['ctaHref','supportHref'])if(typeof a[k]==='string')o[k]=safeHref(a[k])||(k==='supportHref'?'':o[k]);
for(const k of ['menuTitles','awardTitles'])if(Array.isArray(a[k]))o[k]=o[k].map((s,i)=>typeof a[k][i]==='string'?text(a[k][i],50)||s:s);
if(Array.isArray(a.nav))o.nav=o.nav.map((old,i)=>{const v=a.nav[i];return v&&typeof v==='object'?{...old,title:typeof v.title==='string'?text(v.title,25)||old.title:old.title,href:typeof v.href==='string'?safeHref(v.href)||old.href:old.href}:old});
if(a.settings&&typeof a.settings==='object'){for(const k of ['radius','gap','scale','heroHeight'])o.settings[k]=num(a.settings[k],o.settings[k],...({radius:[9,30],gap:[4,20],scale:[.8,1.2],heroHeight:[136,225]}[k]));
for(const k of ['showRewardsNav','animate'])if(typeof a.settings[k]==='boolean')o.settings[k]=a.settings[k]}
return o}
function defaultUser(){return {displayName:'کاربر MMTrade',username:'',verified:false,vip:null,level:null,currentStage:null,currentStageTitle:'',progressPercent:null,completedTasks:null,activeDays:null,points:null,plan:'',awards:[],active:null,history:[],photoUrl:'',accountStatus:'',daysMeaning:''}}
function cleanData(v){const u=defaultUser();if(!v||typeof v!=='object')return u;
for(const k of ['displayName','username','currentStageTitle','plan'])if(v[k]!=null)u[k]=text(v[k],80);
for(const k of ['level','currentStage','progressPercent','completedTasks','activeDays','points'])if(v[k]!=null)u[k]=num(v[k],null,0,100000000);
for(const k of ['vip','active','verified'])if(typeof v[k]==='boolean')u[k]=v[k];
if(Array.isArray(v.awards))u.awards=v.awards.filter(x=>['member','pioneer','analyst'].includes(x));
if(Array.isArray(v.history))u.history=v.history.slice(0,40).filter(x=>x&&typeof x==='object').map(x=>({title:text(x.title,70),date:text(x.date,40)}));
if(typeof v.photoUrl==='string'&&((/^https:\/\//i.test(v.photoUrl)&&safeHref(v.photoUrl))||(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v.photoUrl)&&v.photoUrl.length<350000)))u.photoUrl=v.photoUrl;
if(typeof v.accountStatus==='string')u.accountStatus=text(v.accountStatus,90);
if(v.daysMeaning==='membership')u.daysMeaning='membership';
return u}
const fa=n=>n==null?'—':new Intl.NumberFormat('fa-IR').format(n);
const I=(id,cl='')=>`<svg ${cl?'class="'+cl+'"':''} viewBox="0 0 24 24" aria-hidden="true">${icons[id]||icons.user}</svg>`;
const statIcon=['list','calendar','star'];
let cfg=cleanConfig(), data=DEMO?cleanData(DEMO_DATA):defaultUser(), userAlias='',localMotion=null;
function tt(k,t){const a=ROOT.querySelectorAll(`[data-text="${k}"]`);for(const x of a)x.textContent=t}
function getNickname(){try{return localStorage.getItem('p77_nickname')||''}catch(e){return''}}
function getMotion(){try{return localStorage.getItem('p77_motion')!=='off'}catch(e){return true}}
function toast(t){ROOT.querySelector('.p77-toast')?.remove();const p=document.createElement('div');p.className='p77-toast';p.textContent=text(t,250);p.setAttribute('role','status');ROOT.append(p);setTimeout(()=>p.remove(),2700)}
function template(){
 ROOT.classList.toggle('p77-demo',DEMO);
 ROOT.innerHTML=`<div class="p77-backdrop" aria-hidden="true"></div><main class="p77-shell">
 <header class="p77-brand"><div class="p77-monogram" aria-label="لوگوی MM"><img src="./assets/brand_mm.webp" alt="نشان MM Trade"/></div><h1>MM Trade Challenge <em>10X</em></h1><p data-text="tagline"></p><span class="p77-sample-flag">پیش‌نمایش با داده نمونه</span></header>
 <section class="p77-identity p77-glass" aria-label="شناسنامه کاربر"><img class="p77-hero-mountain" src="./assets/hero_mountain.webp" loading="eager" decoding="async" alt=""/>
  <div class="p77-person"><div class="p77-avatar" id="p77-avatar"><span class="p77-avatar-fallback">${I('user')}</span></div><div class="p77-person-meta"><h2 id="p77-name"></h2><span class="p77-username" id="p77-username"></span><div class="p77-status-row"><span class="p77-pill active" id="p77-active">${I('check')} <span></span></span><span class="p77-pill vip" id="p77-vip">${I('crown')} VIP</span></div></div></div>
  <div class="p77-hero-bottom"><div class="p77-level">${I('layers')}<div><strong id="p77-level">—</strong><small id="p77-level-en">Level —</small></div></div><div class="p77-path-caption">〃 <b data-text="pathCaption"></b> 〃</div></div>
 </section>
 <section class="p77-metrics-primary" aria-label="پیشرفت چالش">
  <button type="button" data-action="stage" class="p77-metric p77-glass" aria-label="مرحله فعلی"> <div><div class="p77-metric-title">${I('rocket')} <span data-text="stageTitle"></span></div><strong class="p77-metric-value" id="p77-stage">—</strong></div></button>
  <button type="button" data-action="progress" class="p77-metric p77-glass" aria-label="پیشرفت کل"><div><div class="p77-metric-title" data-text="progressTitle"></div><span class="p77-metric-caption" data-text="progressSubtitle"></span></div><div class="p77-ring" id="p77-ring"><span id="p77-percent">—</span></div></button>
 </section>
 <section class="p77-metrics-stats" aria-label="آمار کاربر">
   <div class="p77-stat p77-glass"><div class="p77-stat-line">${I('list')}<strong id="p77-tasks">—</strong></div><span data-text="tasksTitle"></span></div>
   <div class="p77-stat p77-glass"><div class="p77-stat-line">${I('calendar')}<strong id="p77-days">—</strong></div><span data-text="daysTitle"></span></div>
   <div class="p77-stat p77-glass"><div class="p77-stat-line">${I('star')}<strong id="p77-points">—</strong></div><span data-text="scoreTitle"></span></div>
 </section>
 <section class="p77-mini-rows">
  <button type="button" data-action="account" class="p77-mini-card p77-glass">${I('user','p77-action-icon')}<div class="p77-mini-copy"><strong data-text="accountTitle"></strong><small id="p77-account-detail"></small></div>${I('chevron','p77-chevron')}</button>
  <button type="button" data-action="plan" class="p77-mini-card p77-glass">${I('bolt','p77-action-icon')}<div class="p77-mini-copy"><strong data-text="planTitle"></strong><small id="p77-plan-detail"></small></div>${I('chevron','p77-chevron')}</button>
 </section>
 <section class="p77-awards p77-glass" id="p77-awards"><h2 class="p77-section-heading">${I('trophy')}<span data-text="awardsTitle"></span></h2><div class="p77-awards-row">
  <button class="p77-badge" type="button" data-award="member"><img src="./assets/badge_10x.webp" alt="" loading="lazy"/><span></span></button>
  <button class="p77-badge" type="button" data-award="pioneer"><img src="./assets/badge_rocket.webp" alt="" loading="lazy"/><span></span></button>
  <button class="p77-badge" type="button" data-award="analyst"><img src="./assets/badge_analyst.webp" alt="" loading="lazy"/><span></span></button>
  <img class="p77-award-coin" src="./assets/coin.webp" alt="" loading="lazy" decoding="async" />
 </div></section>
 <section class="p77-actions p77-glass" aria-label="عملیات حساب">
   ${['pencil','gear','chart','trophy','headset'].map((k,i)=>`<button type="button" class="p77-menu" data-action="${['edit','settings','activity','awards','support'][i]}">${I(k)}<span class="p77-menu-label" data-menu="${i}"></span>${I('chevron','p77-chevron')}</button>`).join('')}
 </section>
 <a class="p77-cta" id="p77-main-cta" href="/miniapp/challenge.html">${I('rocket')}<span class="p77-cta-text" data-text="ctaText"></span>${I('chevron')}</a>
 </main><nav class="p77-nav" aria-label="منوی اصلی" id="p77-nav"></nav>`;
}
function applyConfig(){
 const x=cfg.settings;ROOT.style.setProperty('--p77-radius',x.radius+'px');ROOT.style.setProperty('--p77-gap',x.gap+'px');ROOT.style.setProperty('--p77-scale',x.scale);ROOT.style.setProperty('--p77-hero-height',x.heroHeight+'px');
 ROOT.classList.toggle('p77-no-motion',!x.animate||!getMotion());
 for(const k of ['tagline','pathCaption','progressTitle','progressSubtitle','stageTitle','scoreTitle','daysTitle','tasksTitle','accountTitle','planTitle','awardsTitle','ctaText'])tt(k,cfg[k]);
 if(data.daysMeaning==='membership')tt('daysTitle','روزهای عضویت');
 ROOT.querySelector('.p77-brand h1').textContent='';const title=ROOT.querySelector('.p77-brand h1');const main=cfg.brand.replace(/\s*10X\s*$/i,'');title.append(document.createTextNode(main+' '));const em=document.createElement('em');em.textContent=/10X/i.test(cfg.brand)?'10X':'';title.append(em);
 ROOT.querySelectorAll('[data-menu]').forEach(n=>n.textContent=cfg.menuTitles[Number(n.dataset.menu)]||'');
 ROOT.querySelectorAll('[data-award]').forEach((n,i)=>n.querySelector('span').textContent=cfg.awardTitles[i]);
 const cta=ROOT.querySelector('#p77-main-cta');cta.href=safeHref(cfg.ctaHref)||'/miniapp/challenge.html';
 const nav=ROOT.querySelector('#p77-nav');nav.replaceChildren();cfg.nav.forEach((n,i)=>{if(i===2&&!x.showRewardsNav)return;const a=document.createElement('a');a.href=safeHref(n.href)||'#p77-awards';a.setAttribute('aria-label',n.title);if(i===3)a.setAttribute('aria-current','page');a.innerHTML=I(n.icon);const label=document.createElement('span');label.textContent=n.title;a.append(label);nav.append(a)});
}
function applyData(){
 const nickname=getNickname(),display=nickname||data.displayName||'کاربر MMTrade';ROOT.querySelector('#p77-name').textContent=display;
 ROOT.querySelector('#p77-username').textContent=data.username?'@'+data.username.replace(/^@/,''):'شناسه تلگرام دریافت نشده';
 const active=ROOT.querySelector('#p77-active');active.className='p77-pill '+(data.active===true?'active':'muted');active.querySelector('span').textContent=data.active===true?'عضو فعال':data.active===false?'غیرفعال':'وضعیت نامشخص';
 const vip=ROOT.querySelector('#p77-vip');vip.hidden=data.vip!==true;
 ROOT.querySelector('#p77-level').textContent=data.level!=null?'سطح '+fa(data.level):'سطح —';ROOT.querySelector('#p77-level-en').textContent='Level '+(data.level??'—');
 ROOT.querySelector('#p77-stage').textContent=data.currentStage!=null?`مرحله ${fa(data.currentStage)}: ${data.currentStageTitle||'—'}`:'هنوز مشخص نشده';
 const pct=data.progressPercent!=null?Math.max(0,Math.min(100,data.progressPercent)):null;
 ROOT.querySelector('#p77-ring').style.setProperty('--progress',pct??0);ROOT.querySelector('#p77-percent').textContent=pct!=null?fa(pct)+'٪':'—';
 ROOT.querySelector('#p77-tasks').textContent=fa(data.completedTasks);ROOT.querySelector('#p77-days').textContent=fa(data.activeDays);ROOT.querySelector('#p77-points').textContent=fa(data.points);
 tt('daysTitle',data.daysMeaning==='membership'?'روزهای عضویت':cfg.daysTitle);
 ROOT.querySelector('#p77-account-detail').textContent=data.accountStatus||(data.verified===true?'فعال و تأییدشده':'نیازمند بررسی');
 ROOT.querySelector('#p77-account-detail').classList.toggle('good',data.verified===true);
 ROOT.querySelector('#p77-plan-detail').textContent=data.plan||'اطلاعات ثبت نشده';
 const avatar=ROOT.querySelector('#p77-avatar');avatar.replaceChildren();if(data.photoUrl||DEMO){const im=document.createElement('img');im.alt='تصویر پروفایل';im.src=data.photoUrl||(DEMO?'./assets/portrait_demo.webp':'');im.referrerPolicy='no-referrer';im.addEventListener('error',()=>{avatar.replaceChildren();avatar.textContent=display[0]||'M'});avatar.append(im)}else{const sp=document.createElement('span');sp.className='p77-avatar-fallback';sp.textContent=display[0]||'M';avatar.append(sp)}
 ROOT.querySelectorAll('[data-award]').forEach(n=>{const awarded=data.awards.includes(n.dataset.award);n.classList.toggle('locked',!awarded);n.setAttribute('aria-label',(awarded?'دریافت شده: ':'قفل: ')+n.querySelector('span').textContent)});
}
function openDialog(title,contentBuilder){ROOT.querySelector('.p77-overlay')?.remove();const overlay=document.createElement('div');overlay.className='p77-overlay';const dlg=document.createElement('div');dlg.className='p77-dialog';dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-label',title);const head=document.createElement('div');head.className='p77-dialog-head';const h=document.createElement('h3');h.textContent=title;const close=document.createElement('button');close.className='p77-close';close.type='button';close.innerHTML=I('close');close.setAttribute('aria-label','بستن');head.append(h,close);dlg.append(head);overlay.append(dlg);ROOT.append(overlay);let prev=document.activeElement;const shut=()=>{overlay.remove();document.removeEventListener('keydown',onKey);prev?.focus?.()};const onKey=e=>{if(e.key==='Escape')shut()};document.addEventListener('keydown',onKey);close.addEventListener('click',shut);overlay.addEventListener('click',e=>{if(e.target===overlay)shut()});contentBuilder(dlg,shut);close.focus()}
function message(title,lines){openDialog(title,(dlg)=>{for(const line of lines){const p=document.createElement('p');p.textContent=line;dlg.append(p)}})}
function action(which){switch(which){
 case 'edit':openDialog(cfg.menuTitles[0],(dlg,close)=>{const p=document.createElement('p');p.textContent='نام نمایشی دلخواهت را وارد کن. این تغییر فقط در همین مرورگر ذخیره می‌شود و اطلاعات حساب تلگرام یا سرور را تغییر نمی‌دهد.';dlg.append(p);const label=document.createElement('label');label.textContent='نام نمایشی';const input=document.createElement('input');input.type='text';input.maxLength=70;input.value=getNickname()||data.displayName;label.append(input);dlg.append(label);const b=document.createElement('button');b.className='p77-save';b.textContent='ذخیره نمایشی';b.onclick=()=>{try{localStorage.setItem('p77_nickname',text(input.value,70))}catch(e){}applyData();close();toast('نام نمایشی در این مرورگر ذخیره شد')};dlg.append(b)});break;
 case 'settings':openDialog(cfg.menuTitles[1],(dlg)=>{const label=document.createElement('label');label.className='p77-switch';const chk=document.createElement('input');chk.type='checkbox';chk.checked=getMotion();chk.addEventListener('change',()=>{try{localStorage.setItem('p77_motion',chk.checked?'on':'off')}catch(e){}applyConfig()});label.append(chk,document.createTextNode('فعال بودن انیمیشن‌های سبک'));dlg.append(label);const p=document.createElement('p');p.textContent='تنظیمات نمایشی روی همین دستگاه ذخیره می‌شوند.';dlg.append(p)});break;
 case 'progress':message(cfg.progressTitle,[data.progressPercent!=null?'پیشرفت ثبت‌شده: '+fa(data.progressPercent)+'٪':'هنوز درصد پیشرفت از سامانه دریافت نشده است.','تکمیل مراحل باید توسط سرور معتبر تأیید شود؛ با کلیک روی صفحه، وضعیت مرحله تغییر نمی‌کند.']);break;
 case 'stage':message(cfg.stageTitle,[data.currentStage!=null?`مرحله ${fa(data.currentStage)}: ${data.currentStageTitle||'—'}`:'مرحله جاری هنوز از سامانه دریافت نشده است.']);break;
 case 'account':message(cfg.accountTitle,[data.verified?'حساب فعال و تأیید‌شده است.':'وضعیت تأیید حساب هنوز از سرویس حساب دریافت نشده است.','این بخش فقط اطلاعات تأییدشده سرور را نمایش می‌دهد.']);break;
 case 'plan':message(cfg.planTitle,[data.plan||'پلن چالش هنوز دریافت نشده است.']);break;
 case 'activity':openDialog(cfg.menuTitles[2],dlg=>{if(!data.history.length){const p=document.createElement('p');p.textContent='هنوز تاریخچه فعالیت از سامانه دریافت نشده است.';dlg.append(p)}else data.history.forEach(it=>{const p=document.createElement('p');p.textContent=it.title+' — '+it.date;dlg.append(p)})});break;
 case 'awards':ROOT.querySelector('#p77-awards').scrollIntoView({behavior:'smooth',block:'center'});break;
 case 'support':location.href=cfg.supportHref||'/miniapp/p74/support/support.html';break;
 }}
function bind(){ROOT.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b){e.preventDefault();action(b.dataset.action)}const award=e.target.closest('[data-award]');if(award){const t=award.querySelector('span').textContent;message(t,[data.awards.includes(award.dataset.award)?'این دستاورد برای حساب شما ثبت شده است.':'این دستاورد هنوز برای حساب شما تأیید نشده است.'])}})}
function render(){template();applyConfig();applyData()}
function setUserData(value){data=cleanData({...data,...(value&&typeof value==='object'?value:{})});applyData()}
function setConfig(value){cfg=cleanConfig(value);applyConfig()}
function readBlock(blocks){const matches=(Array.isArray(blocks)?blocks:[]).filter(b=>b?.type==='element'&&b.selector===MARK&&typeof b.text==='string');if(matches.length!==1)return null;try{const obj=JSON.parse(matches[0].text);if(obj.version===77)return obj}catch(_){}return null}
let fetched=false;
function readPublished(){if(DEMO||fetched)return;const initData=window.Telegram?.WebApp?.initData;if(!initData)return;fetched=true;
fetch('/content/page',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug:'profile',initData}),credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(payload=>{p85Load();const p=readBlock(payload.blocks);if(p)setConfig(p);const progress=payload?.progress;const values=[progress?.challenge?.pct,progress?.challengeProgress?.pct,progress?.challenge?.percentage];const pct=values.find(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100);if(pct!==undefined)setUserData({progressPercent:Math.round(pct)})}).catch(()=>{/* Standalone UI remains functional; never replace with spinner */});}
function addTelegram(){const tg=window.Telegram?.WebApp;if(!tg)return;try{tg.ready();tg.expand();const user=tg.initDataUnsafe?.user;if(user&&!DEMO){data.displayName=text([user.first_name,user.last_name].filter(Boolean).join(' '),80)||data.displayName;data.username=text(user.username,80)||data.username;applyData()}}catch(e){}readPublished()}

/* P84_REAL_PROGRESS_BRIDGE */
function loadRealProgress(){
  if(DEMO)return;

  const initData=window.Telegram?.WebApp?.initData;
  if(!initData)return;

  fetch('/progress/path',{
    method:'POST',
    headers:{'content-type':'application/json'},
    credentials:'same-origin',
    body:JSON.stringify({initData})
  })
  .then(r=>{
    if(!r.ok)throw Error('progress_http_'+r.status);
    return r.json();
  })
  .then(result=>{
    p85Load();
    if(!result||result.hasPath!==true)return;

    const p=result.progress||{};
    const stages=Array.isArray(result.stages)?result.stages:[];
    const next=result.nextStep||null;

    const completed=Number.isFinite(p.completedStages)
      ?p.completedStages:null;

    const percentage=Number.isFinite(p.percentage)
      ?Math.max(0,Math.min(100,Math.round(p.percentage))):null;

    const nextIndex=next
      ?stages.findIndex(s=>s.id===next.id):-1;

    const currentStage=nextIndex>=0
      ?nextIndex+1
      :(p.isComplete===true?stages.length:null);

    setUserData({
      progressPercent:percentage,
      completedTasks:completed,
      currentStage,
      currentStageTitle:next?.title||
        (p.isComplete===true?'تمام مراحل تکمیل شده':'')
    });
  })
  .catch(err=>{
    console.warn('P84 progress unavailable',err.message);
  });
}

function startRealProgress(){
  if(DEMO)return;
  if(window.Telegram?.WebApp?.initData){
    loadRealProgress();
  }
}


/* P85R3_PROFILE_LIVE */
let p85Loading = false;
let p85Loaded = false;
let p85Attempts = 0;
/* P85R5_RETRY */

function p85Load(){
  if(DEMO || p85Loading || p85Loaded)return;

  const initData = window.Telegram?.WebApp?.initData;
  if(!initData)return;

  if(p85Attempts >= 3)return;
  p85Attempts++;
  p85Loading = true;

  fetch('/miniapp/profile/p85',{
    method:'POST',
    headers:{'content-type':'application/json'},
    credentials:'same-origin',
    body:JSON.stringify({initData})
  })
  .then(r=>{
    if(!r.ok)throw Error('HTTP_'+r.status);
    return r.json();
  })
  .then(result=>{
    if(!result?.ok)return;

    const values = {};

    for(const key of [
      'displayName','username','activeDays',
      'verified','active','plan','accountStatus','daysMeaning'
    ]){
      if(result[key]!==undefined)
        values[key]=result[key];
    }

    if(typeof result.photoUrl==='string' &&
       /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(
         result.photoUrl
       )){
      values.photoUrl=result.photoUrl;
    } else {
      const sdkPhoto=window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url;
      if(typeof sdkPhoto==='string'&&/^https:\/\//i.test(sdkPhoto)){
        values.photoUrl=sdkPhoto;
      }
    }

    setUserData(values);

    if(result.daysMeaning==='membership'){
      ROOT.querySelectorAll('[data-text="daysTitle"]')
        .forEach(el=>el.textContent='روزهای عضویت');
    }

    p85Loaded=true;
  })
  .catch(e=>console.warn('P85:',e.message))
  .finally(()=>{p85Loading=false});
}

render();bind();
window.addEventListener('mmtrade:verified-profile',function(e){if(e.detail&&typeof e.detail==='object')setUserData(e.detail)});
if(!DEMO){addTelegram();document.addEventListener('DOMContentLoaded',addTelegram,{once:true});window.addEventListener('load',addTelegram,{once:true});setTimeout(addTelegram,1000);p85Load();document.addEventListener('DOMContentLoaded',p85Load,{once:true});window.addEventListener('load',p85Load,{once:true});setTimeout(p85Load,1500);const p85RetryTimer=setInterval(function(){if(p85Loaded||p85Attempts>=3){clearInterval(p85RetryTimer);return;}p85Load();},1500);setTimeout(function(){clearInterval(p85RetryTimer);},30000);startRealProgress();document.addEventListener('DOMContentLoaded',startRealProgress,{once:true});window.addEventListener('load',startRealProgress,{once:true});setTimeout(startRealProgress,1200)}
window.addEventListener('message',e=>{if(!DEMO||e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='P77_CONFIG_PREVIEW')return;setConfig(e.data.config)});
window.P77Profile={version:VERSION,setData:setUserData,setConfig,defaults:clone(CORE),getData:()=>clone(data),getConfig:()=>clone(cfg)};
})();
