/* P74_HOME_MATCH_R2: native Telegram Home + same-origin standalone preview. No WebGL, no remote code. */
(function(){'use strict';
if(window.__P74_HOME_LOADED__)return;window.__P74_HOME_LOADED__=true;
const VERSION='P76_DYNAMIC_MOUNTAIN_R1', MARK='#p74-home-config';
const params=new URLSearchParams(location.search), isPreview=params.get('p74Preview')==='1'||/\/p74\/preview\.html$/.test(location.pathname);
const pathname=location.pathname.replace(/\/$/,'');
const isHome=pathname==='/miniapp'||pathname==='/miniapp/index.html';
if(!isPreview&&(!isHome||(params.get('view')&&params.get('view')!=='index')))return;
const DEFAULT={version:74,enabled:true,brand:'MM trade challenge 10x',tagline:'چالش رشد ۱۰ برابری در معاملات',heroEyebrow:'ویدیوی معرفی چالش',heroTitle:'چالش MM',heroSubtitle:'رشد ۱۰ برابری',journeyTitle:'مسیر 10X تو از اینجا شروع می‌شود',journeySubtitle:'یک مسیر مرحله‌به‌مرحله برای رشد مهارت، اعتمادبه‌نفس و سرمایه',videoUrl:'https://dl.namahub.ir/parsahojabrian/W0OGUlGh',videoDuration:'07:46',progressTitle:'پیشرفت شما در چالش',ctaText:'مرحله بعدی چالش',ctaHref:'/miniapp/challenge.html',progressHref:'/miniapp/profile.html',stepCount:5,steps:[{title:'شروع چالش',href:'/miniapp/challenge.html',position:{top:64,right:47,width:51}},{title:'آموزش‌های کلیدی',href:'/miniapp/academy.html',position:{top:49,right:45,width:47}},{title:'تمرین و اجرا',href:'/miniapp/challenge.html',position:{top:34,right:36,width:45}},{title:'مدیریت ریسک',href:'/miniapp/copy-trading.html',position:{top:19,right:25,width:39}},{title:'رشد و مقیاس',href:'/miniapp/profile.html',position:{top:5,right:15,width:33,height:13}},{title:'ماموریت ششم',href:'/miniapp/challenge.html',position:{top:0,right:0,width:37,height:10}},{title:'ماموریت هفتم',href:'/miniapp/challenge.html',position:{top:0,right:0,width:36,height:10}},{title:'ماموریت هشتم',href:'/miniapp/challenge.html',position:{top:0,right:0,width:34,height:10}}],nav:[{title:'خانه',href:'/miniapp/index.html'},{title:'آکادمی',href:'/miniapp/academy.html'},{title:'پروفایل',href:'/miniapp/profile.html'}]};
const copy=x=>JSON.parse(JSON.stringify(x));
function safeText(s,max=120){return String(s==null?'':s).slice(0,max).replace(/[\u0000-\u001f]/g,'').trim()}
function safeUrl(s){s=String(s||'').trim();if(s.startsWith('/')&&!s.startsWith('//')&&!/[\s<>'"]/.test(s))return s;try{const u=new URL(s);if(u.protocol==='https:'&&u.username===''&&u.password==='')return u.href}catch(e){}return''}
function num(v,fallback,min,max){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function countSafe(v){return Math.min(8,Math.max(3,Math.trunc(Number(v)||5)))}
function autoPositions(count){
 count=countSafe(count);const rows=[];
 for(let i=0;i<count;i++){
   const rank=count-1-i;
   const frac=rank/(count-1);
   const width=Math.round(35+13*frac);
   rows.push({top:+(3+rank*(67/(count-1))).toFixed(2),right:Math.round(12+33*frac),width,height:+Math.min(13,66/count).toFixed(2)});
 }
 return rows;
}
function safePosition(value,defaultPos){const v=value&&typeof value==='object'?value:{};
 const width=num(v.width,defaultPos.width,22,85),height=num(v.height,defaultPos.height||13,7,18);
 return {top:num(v.top,defaultPos.top,0,100-height),right:num(v.right,defaultPos.right,0,100-width),width,height};}
function normalized(raw){
 const a=copy(DEFAULT);if(!raw||typeof raw!=='object')return a;
 for(const k of ['brand','tagline','heroEyebrow','heroTitle','heroSubtitle','journeyTitle','journeySubtitle','videoDuration','progressTitle','ctaText'])if(typeof raw[k]==='string')a[k]=safeText(raw[k],k==='journeySubtitle'?180:100)||a[k];
 for(const k of ['ctaHref','progressHref','videoUrl'])if(typeof raw[k]==='string')a[k]=safeUrl(raw[k])||a[k];
 a.stepCount=countSafe(raw.stepCount??(Array.isArray(raw.steps)?raw.steps.length:5));
 const auto=autoPositions(a.stepCount);
 if(Array.isArray(raw.steps)){
   const isLegacy=raw.stepCount===undefined;
   for(let i=0;i<Math.min(a.stepCount,raw.steps.length);i++){
    const v=raw.steps[i];if(!v||typeof v!=='object')continue;
    if(typeof v.title==='string')a.steps[i].title=safeText(v.title,36)||a.steps[i].title;
    if(typeof v.href==='string')a.steps[i].href=safeUrl(v.href)||a.steps[i].href;
    const d=isLegacy?{...auto[i],...v.position}:auto[i];
    a.steps[i].position=safePosition(v.position,d);
   }
 }
 for(let i=0;i<a.stepCount;i++)a.steps[i].position=safePosition(a.steps[i].position,auto[i]);
 a.steps=a.steps.slice(0,a.stepCount);
 if(Array.isArray(raw.nav)){for(let i=0;i<3;i++){if(!raw.nav[i])continue;const v=raw.nav[i];if(typeof v.title==='string')a.nav[i].title=safeText(v.title,25)||a.nav[i].title;if(typeof v.href==='string')a.nav[i].href=safeUrl(v.href)||a.nav[i].href}}
 a.enabled=raw.enabled!==false;return a;
}
function extract(blocks){for(const b of Array.isArray(blocks)?blocks:[]){if(b?.type==='element'&&b.selector===MARK&&typeof b.text==='string'){try{const val=JSON.parse(b.text);if(val.version===74)return val}catch(e){}}}return null}
function elem(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
const SVG={home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',academy:'<path d="m2 9 10-6 10 6-10 6zM5 12v7c4 3 10 3 14 0v-7M22 9v9"/>',profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',play:'<path d="m8 5 11 7-11 7z"/>',arrow:'<path d="m14 5 7 7-7 7"/>'};
function icon(which){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=SVG[which]||SVG.home;return svg}
let current=null,lastPayload=null,lastPreviewCfg=null;
function pctValue(payload){const count=current?.stepCount||5;
 if(isPreview&&!payload)return {pct:40,note:`نمونه: ۲ از ${count} مرحله تکمیل شده`,sample:true};
 const p=payload?.progress;const candidates=[p?.challenge?.pct,p?.challengeProgress?.pct,p?.challenge?.percentage];
 for(const value of candidates){if(typeof value==='number'&&Number.isFinite(value)){const pct=Math.max(0,Math.min(100,Math.round(value)));return {pct,note:`پیشرفت ثبت‌شده: ${pct}٪`,sample:false}}}
 return {pct:null,note:'داده پیشرفت چالش هنوز از سامانه دریافت نشده است',sample:false};
}
function completedStages(payload,count){
 const progress=payload?.progress||{};const c=progress.challenge||{},cp=progress.challengeProgress||{};
 const sources=[c.completedSteps,cp.completedSteps,c.steps,cp.steps,progress.completedChallengeSteps];
 for(const source of sources){if(!Array.isArray(source))continue;const ids=new Set();for(let i=0;i<source.length;i++){
  const v=source[i];if(typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=count)ids.add(v);
  else if(v&&typeof v==='object'&&(v.completed===true||v.status==='COMPLETED'||v.status==='DONE')){
    const id=Number(v.stepNumber??v.step??v.number??v.id??i+1);
    if(Number.isInteger(id)&&id>=1&&id<=count)ids.add(id);
  }
 }return ids}
 // Percentages alone cannot prove that a specific stage was completed.
 return new Set();
}
function wireStepDrag(link,mountain,index){
 link.title='مرحله را بکشید و روی پلهٔ دلخواه رها کنید';
 link.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});
 let active=null;
 link.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const rect=mountain.getBoundingClientRect();if(!rect.width||!rect.height)return;active={id:e.pointerId,x:e.clientX,y:e.clientY,top:parseFloat(link.style.top),right:parseFloat(link.style.right)};link.setPointerCapture(e.pointerId);link.classList.add('p75-drag-active')});
 link.addEventListener('pointermove',e=>{if(!active||e.pointerId!==active.id)return;const box=mountain.getBoundingClientRect(),width=parseFloat(link.style.width)||40;let top=Math.min(100-(parseFloat(link.style.height)||13),Math.max(0,active.top+(e.clientY-active.y)*100/box.height));let right=Math.min(100-width,Math.max(0,active.right-(e.clientX-active.x)*100/box.width));link.style.top=top.toFixed(2)+'%';link.style.right=right.toFixed(2)+'%';current.steps[index].position={top:+top.toFixed(2),right:+right.toFixed(2),width,height:parseFloat(link.style.height)||13};});
 const finish=e=>{if(!active||e.pointerId!==active.id)return;active=null;link.classList.remove('p75-drag-active');if(window.parent!==window)window.parent.postMessage({type:'P75_STEP_POSITION',step:index,position:{...current.steps[index].position}},location.origin)};
 link.addEventListener('pointerup',finish);link.addEventListener('pointercancel',finish);
}
function makeLink(cls,url,label){const x=elem('a',cls,label);x.href=safeUrl(url)||'/miniapp/challenge.html';return x}
function showModal(videoUrl){const root=document.getElementById('p74-app');if(!root)return;root.querySelector('.p74-modal')?.remove();const modal=elem('div','p74-modal'),body=elem('div','p74-modal-body'),head=elem('div','p74-modal-head');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','ویدیوی معرفی چالش');head.append(elem('strong','', 'ویدیوی معرفی چالش'));const close=elem('button','p74-modal-close','بستن ✕');close.type='button';head.append(close);body.append(head);const url=safeUrl(videoUrl);if(url){const video=elem('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.poster='/miniapp/p74/assets/hero_poster.webp';video.src=url;video.addEventListener('error',()=>{if(!body.querySelector('.p74-modal-msg')){const msg=elem('p','p74-modal-msg','پخش داخل تلگرام انجام نشد. می‌توانید ویدیو را از لینک اصلی باز کنید.');const a=makeLink('',url,'باز کردن لینک ویدیو');a.target='_blank';a.rel='noopener noreferrer';msg.append(a);body.append(msg)}});body.append(video);setTimeout(()=>{if(modal.isConnected)video.play().catch(()=>{})},0)}else{body.append(elem('p','p74-modal-msg','لینک ویدیوی معرفی هنوز تنظیم نشده است.'))}modal.append(body);root.append(modal);const shut=()=>{body.querySelector('video')?.pause();modal.remove();document.removeEventListener('keydown',esc)};const esc=e=>{if(e.key==='Escape')shut()};document.addEventListener('keydown',esc);close.addEventListener('click',shut);modal.addEventListener('click',e=>{if(e.target===modal)shut()});close.focus()}
function render(raw,payload){const cfg=normalized(raw);if(!cfg.enabled){document.getElementById('p74-app')?.remove();document.documentElement.classList.remove('p74-enabled');return}current=cfg;lastPayload=payload||lastPayload;let root=document.getElementById('p74-app');if(!root){root=elem('div');root.id='p74-app';root.dataset.version=VERSION;document.body.append(root)}root.replaceChildren();const scroll=elem('div','p74-scroll');const stage=elem('main','p74-page');stage.setAttribute('dir','rtl');scroll.append(stage);root.append(scroll);
stage.style.setProperty('--p76-background',`url('/miniapp/p74/assets/mountain_steps_${cfg.stepCount}.webp')`);stage.dataset.stepCount=String(cfg.stepCount);
const brand=elem('header','p74-brand');const logo=elem('img','p74-emblem');logo.src='/miniapp/p74/assets/emblem.webp';logo.alt='نشان MM';logo.decoding='async';logo.fetchPriority='high';brand.append(logo,elem('strong','p74-brand-name',cfg.brand),elem('p','p74-brand-sub',cfg.tagline));stage.append(brand);
const hero=elem('section','p74-hero');hero.setAttribute('aria-label','معرفی چالش');const copyArea=elem('div','p74-hero-copy');copyArea.append(elem('span','p74-overline',cfg.heroEyebrow),elem('strong','p74-hero-title',cfg.heroTitle),elem('strong','p74-hero-desc',cfg.heroSubtitle),elem('span','p74-hero-underline'));hero.append(copyArea);const play=elem('button','p74-play');play.type='button';play.setAttribute('aria-label','پخش ویدیوی معرفی');play.append(icon('play'));play.addEventListener('click',()=>showModal(cfg.videoUrl));hero.append(play,elem('span','p74-video-badge','▣ '+cfg.videoDuration));stage.append(hero);
const title=elem('h2','p74-journey-title');title.textContent=cfg.journeyTitle;const sub=elem('p','p74-journey-sub',cfg.journeySubtitle);stage.append(title,sub);
const cube=elem('img','p74-decor p74-decor-cube');cube.src='/miniapp/p74/assets/cube.webp';cube.alt='';cube.loading='lazy';cube.decoding='async';stage.append(cube);const coin=elem('img','p74-decor p74-decor-coin');coin.src='/miniapp/p74/assets/coin.webp';coin.alt='';coin.loading='lazy';coin.decoding='async';stage.append(coin);
const mountain=elem('section','p74-mountain-area');mountain.setAttribute('aria-label',`مسیر ${cfg.stepCount} مرحله‌ای چالش`);
const completed=isPreview?new Set([1,2]):completedStages(payload,cfg.stepCount);let currentStep=1;while(currentStep<=cfg.stepCount&&completed.has(currentStep))currentStep++;
const editorDrag=isPreview&&params.get('stepEdit')==='1';if(editorDrag)root.classList.add('p75-editing');else root.classList.remove('p75-editing');
for(let i=cfg.stepCount-1;i>=0;i--){const step=cfg.steps[i];const link=makeLink('p74-step',step.href);const pos=safePosition(step.position,autoPositions(cfg.stepCount)[i]);
link.dataset.step=String(i+1);link.dataset.state=completed.has(i+1)?'completed':(i+1===currentStep?'current':'upcoming');
link.setAttribute('aria-label','مرحله '+(i+1)+': '+step.title);link.style.top=pos.top+'%';link.style.right=pos.right+'%';link.style.width=pos.width+'%';link.style.height=pos.height+'%';
link.append(elem('span','p74-step-number',String(i+1)),elem('span','p74-step-label',step.title),elem('span','p74-step-icon',i===0?'▷':i===1?'▤':i===2?'▥':i===3?'♢':'↗'));
if(editorDrag)wireStepDrag(link,mountain,i);mountain.append(link)}
stage.append(mountain);
const progress=pctValue(payload);const progressCard=makeLink('p74-progress',cfg.progressHref);progressCard.setAttribute('aria-label','مشاهده پیشرفت چالش');const ring=elem('div','p74-ring');ring.style.setProperty('--pct',String(progress.pct??0));ring.append(elem('span','',progress.pct===null?'—':progress.pct+'%'));const pc=elem('div','p74-progress-content');pc.append(elem('strong','',cfg.progressTitle),elem('small','',progress.note));progressCard.append(elem('span','p74-progress-arrow','‹'),pc,ring);stage.append(progressCard);
const cta=makeLink('p74-cta',cfg.ctaHref);cta.append(elem('span','p74-cta-chevron','❯'),elem('span','p74-cta-text',cfg.ctaText),elem('span','p74-cta-icon','🚀'));stage.append(cta);
const nav=elem('nav','p74-nav');nav.setAttribute('aria-label','منوی اصلی Mini App');for(let i=0;i<3;i++){const n=cfg.nav[i];const a=makeLink('',n.href);if(i===0)a.setAttribute('aria-current','page');a.append(icon(['home','academy','profile'][i]),elem('span','',n.title));nav.append(a)}root.append(nav);
if(isPreview)root.dataset.preview='1';return root}
function receivePublished(e){if(isPreview)return;const data=e?.detail||{};const meta=extract(data.blocks);if(!meta){document.getElementById('p74-app')?.remove();document.documentElement.classList.remove('p74-enabled');return}document.documentElement.classList.add('p74-enabled');render(meta,data)}
window.addEventListener('tenx:data',receivePublished);
window.addEventListener('message',e=>{if(!isPreview||e.origin!==location.origin||e.source!==window.parent||!e.data||e.data.type!=='P74_CONFIG_PREVIEW')return;lastPreviewCfg=e.data.config;render(lastPreviewCfg,null)});
function ready(){if(isPreview){render(DEFAULT,null);return} // In production, the current Home stays untouched until the published marker exists.
setTimeout(()=>{if(current||document.getElementById('p74-app'))return;const initData=window.Telegram?.WebApp?.initData;if(!initData)return;fetch('/content/page',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug:'index',initData})}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(d=>{if(!current)receivePublished({detail:d})}).catch(()=>{})},1100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
window.P74={version:VERSION,defaults:copy(DEFAULT),autoPositions,renderPreview:obj=>{if(isPreview)render(obj,null)}};
})();
