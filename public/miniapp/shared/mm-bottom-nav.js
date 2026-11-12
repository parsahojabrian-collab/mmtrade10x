/* MMU R6 — one renderer, database-controlled appearance, smart hide on nested scroll. */
(function(){
 'use strict';
 if(window.__MM_UNIFIED_NAV_R6__)return;
 window.__MM_UNIFIED_NAV_R6__=true;
 window.__MM_UNIFIED_BOTTOM_NAV_R4__=true;
 window.__MM_UNIFIED_BOTTOM_NAV_R2__=true;
 const q=new URLSearchParams(location.search);
 const pathname=location.pathname.replace(/\/+$/,'')||'/';
 const flags=['adminPreview','p74Preview','visualPreview','p62preview','stagePreview','studioPreview','quizPreview','preview','editor','studio','tenx_debug'];
 if(flags.some(k=>q.has(k)&&q.get(k)!=='0'))return;
 if(/\/(?:preview|editor|admin[^/]*|studio)\.html$/i.test(pathname)&&pathname!=='/miniapp/p74/studio/page-runtime.html')return;
 if(/\/p74\/studio\/(?!page-runtime\.html(?:$|\/))/i.test(pathname))return;
 const defaults=[
  {id:'home',label:'خانه',href:'/miniapp',icon:'home',enabled:true,sort:10},
  {id:'academy',label:'آکادمی',href:'/academy',icon:'academy',enabled:true,sort:20},
  {id:'challenge',label:'چالش 10X',href:'/challenge',icon:'trophy',enabled:true,sort:30},
  {id:'support',label:'پشتیبانی',href:'/support',icon:'support',enabled:true,sort:40},
  {id:'profile',label:'پروفایل',href:'/profile',icon:'user',enabled:true,sort:50}
 ];
 const iconData={
  home:['M3 10.5 12 3l9 7.5V21h-6.2v-7h-5.6v7H3z'],
  academy:['M3 6.5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0V20c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0z','M12 6.5V20'],
  trophy:['M7 3h10v6a5 5 0 0 1-10 0z','M7 5H3v3a4 4 0 0 0 4 4','M17 5h4v3a4 4 0 0 1-4 4','M12 14v5','M8 21h8'],
  support:['M3 13v-2a9 9 0 0 1 18 0v2','M3 13h4v7H5a2 2 0 0 1-2-2z','M21 13h-4v7h2a2 2 0 0 0 2-2z','M17 20c0 1.2-2 2-5 2h-2'],
  user:['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z','M4 21v-2a8 8 0 0 1 16 0v2'],
  chart:['M4 20V12h4v8z','M10 20V5h4v15z','M16 20V9h4v11z'],
  book:['M3 4h7a2 2 0 0 1 2 2v15a5 5 0 0 0-5-3H3z','M21 4h-7a2 2 0 0 0-2 2v15a5 5 0 0 1 5-3h4z'],
  star:['m12 2 3 7 7 .7-5.3 5 1.4 7.3L12 18.5 5.2 22l1.4-7.3-5.3-5L9 9z']
 };
 const routeIds={
  home:['/','/miniapp','/miniapp/index.html'],
  academy:['/academy','/miniapp/academy.html','/miniapp/p74/learning/stage1.html','/miniapp/p74/learning/academy-home.html'],
  challenge:['/challenge','/miniapp/challenge.html','/miniapp/p74/learning/stage2.html'],
  support:['/support','/miniapp/support.html','/miniapp/p74/support/support.html'],
  profile:['/profile','/miniapp/profile.html','/miniapp/p74/profile/profile.html']
 };
 const slugIds={home:['home','index'],academy:['academy','learning'],challenge:['challenge','mmtrade10x','10x'],support:['support'],profile:['profile']};
 const skinDefaults={preset:'light',tintOpacity:14,activeOpacity:16,blur:25,glow:18,rim:82,autoHide:true,scrollThreshold:14,idleRevealMs:950,animationMs:310};
 let config={...skinDefaults}, items=defaults.map(x=>({...x}));
 let built=false, mounted=false, queued=false, frame=0, lastDir=0, travel=0, idleTimer=0;
 const positions=new WeakMap();
 const clamp=(v,min,max,def)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):def;
 const safeHref=x=>{
  if(typeof x!=='string'||x.length>160||!x.startsWith('/')||x.startsWith('//')||x.includes('\\')||x.includes('..'))return '';
  try{const u=new URL(x,location.origin);if(u.origin!==location.origin)return '';
   if(/^\/(?:admin|api|auth|internal)(?:\/|$)/i.test(u.pathname))return '';
   return u.pathname+u.search+u.hash;
  }catch{return ''}
 };
 function activeId(){
  const curr=(location.pathname.replace(/\/+$/,'')||'/').toLowerCase();
  const view=(q.get('view')||'').toLowerCase();
  if((routeIds.home.includes(curr))&&view){for(const [id,slugs] of Object.entries(slugIds))if(slugs.includes(view))return id;}
  for(const it of items){if(safeHref(it.href)?.split(/[?#]/)[0].replace(/\/+$/,'').toLowerCase()===curr)return it.id;}
  for(const [id,paths] of Object.entries(routeIds))if(paths.includes(curr))return id;
  const slug=(q.get('slug')||curr.split('/').filter(Boolean).pop()||'').replace(/\.html$/,'');
  for(const [id,slugs] of Object.entries(slugIds))if(slugs.includes(slug))return id;
  return '';
 }
 function icon(name){
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.setAttribute('focusable','false');
  for(const d of iconData[name]||iconData.home){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);s.append(p);}
  return s;
 }
 function draw(){
  const nav=document.getElementById('mmu-bottom-nav');if(!nav)return;
  const enabled=items.filter(x=>x.enabled!==false).sort((a,b)=>a.sort-b.sort).slice(0,5);
  const curr=activeId(),frag=document.createDocumentFragment();
  for(const it of enabled){
   const a=document.createElement('a');a.className='mmu-tab'+(it.id==='challenge'?' mmu-tab--challenge':'')+(it.id===curr?' is-active':'');
   a.href=it.href;a.dataset.mmuId=it.id;a.setAttribute('aria-label',it.label);
   if(it.id===curr)a.setAttribute('aria-current','page');
   const image=document.createElement('span');image.className='mmu-icon';image.append(icon(it.icon));
   const label=document.createElement('span');label.textContent=it.label;
   a.append(image,label);frag.append(a);
  }
  nav.style.setProperty('--mmu-columns',String(Math.max(1,enabled.length)));
  nav.replaceChildren(frag);
 }
 function appearanceApply(){
  const nav=document.getElementById('mmu-bottom-nav');if(!nav)return;
  nav.dataset.mmuSkin=config.preset;
  const css={
   '--mmu-tint-alpha':(config.tintOpacity/100).toFixed(3),
   '--mmu-active-alpha':(config.activeOpacity/100).toFixed(3),
   '--mmu-blur':config.blur+'px',
   '--mmu-glow-alpha':(config.glow/100).toFixed(3),
   '--mmu-rim-alpha':(config.rim/100).toFixed(3),
   '--mmu-duration':config.animationMs+'ms'
  };
  for(const [key,value]of Object.entries(css))nav.style.setProperty(key,value);
  if(!config.autoHide){clearTimeout(idleTimer);reveal();}
 }
 function normalizeConfig(data){
  if(!data||typeof data!=='object')return {...skinDefaults};
  return {
   preset:['light','reference','crystal','minimal','solid'].includes(data.preset)?data.preset:'light',
   tintOpacity:clamp(data.tintOpacity,0,90,14), activeOpacity:clamp(data.activeOpacity,0,90,16),
   blur:clamp(data.blur,0,55,25),glow:clamp(data.glow,0,100,18),rim:clamp(data.rim,0,100,82),
   autoHide:data.autoHide!==false,scrollThreshold:clamp(data.scrollThreshold,6,90,14),idleRevealMs:clamp(data.idleRevealMs,350,3000,950),animationMs:clamp(data.animationMs,150,700,310)
  };
 }
 function mount(){
  if(!document.body||document.body.dataset.preview==='true')return;
  let nav=document.getElementById('mmu-bottom-nav');
  if(!nav){nav=document.createElement('nav');nav.id='mmu-bottom-nav';nav.setAttribute('dir','rtl');nav.setAttribute('aria-label','ناوبری اصلی MMTrade 10X');}
  if(nav.parentNode!==document.body)document.body.append(nav);
  document.querySelectorAll('[id="mmu-bottom-nav"]').forEach(other=>{if(other!==nav)other.remove()});
  if(!nav.dataset.mmuPointer){nav.dataset.mmuPointer='1';nav.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch')return;
    const rect=nav.getBoundingClientRect();if(!rect.width||!rect.height)return;
    nav.style.setProperty('--mmu-light-x',clamp((e.clientX-rect.left)/rect.width*100,0,100,50).toFixed(1)+'%');
    nav.style.setProperty('--mmu-light-y',clamp((e.clientY-rect.top)/rect.height*100,0,100,0).toFixed(1)+'%');
   },{passive:true});
   nav.addEventListener('pointerleave',()=>{nav.style.removeProperty('--mmu-light-x');nav.style.removeProperty('--mmu-light-y')},{passive:true});
   nav.addEventListener('focusin',reveal);
  }
  document.documentElement.classList.add('mmu-nav-ready');
  if(!nav.querySelector('.mmu-tab'))draw();
  appearanceApply();
  if(!mounted){mounted=true;loadConfig();window.addEventListener('pageshow',()=>{reveal();draw();loadConfig()},{passive:true});
   document.addEventListener('visibilitychange',()=>{if(!document.hidden){reveal();loadConfig();}},{passive:true});
  }
 }
 function reveal(){document.getElementById('mmu-bottom-nav')?.classList.remove('mmu-nav-hidden');}
 function hide(){const nav=document.getElementById('mmu-bottom-nav');if(nav&&!nav.contains(document.activeElement))nav.classList.add('mmu-nav-hidden');}
 function onScroll(event){
  if(!config.autoHide||document.hidden)return;
  const t=event?.target;
  const el=t===document||t===window||t===document.documentElement||t===document.body?(document.scrollingElement||document.documentElement):t;
  if(!el||typeof el.scrollTop!=='number')return;
  const top=Math.max(0,el.scrollTop),max=Math.max(0,el.scrollHeight-el.clientHeight);
  if(max<32)return;
  const prev=positions.get(el);
  positions.set(el,top);
  if(top<=4){travel=0;lastDir=0;reveal();return;}
  if(prev===undefined)return;
  const delta=top-prev;
  if(Math.abs(delta)<.3)return;
  clearTimeout(idleTimer);
  idleTimer=setTimeout(reveal,config.idleRevealMs);
  const dir=delta>0?1:-1;
  if(dir!==lastDir){lastDir=dir;travel=0;}
  travel+=Math.min(100,Math.abs(delta));
  if(travel<config.scrollThreshold)return;
  travel=0;
  if(dir===1&&top>Math.max(25,config.scrollThreshold))hide();
  if(dir===-1)reveal();
 }
 function scrollListener(event){
  if(frame)return;
  // Preserve the event target because ScrollEvent dispatch is not necessarily bubbling.
  const target=event.target;
  frame=requestAnimationFrame(()=>{frame=0;onScroll({target});});
 }
 async function loadConfig(){
  if(typeof fetch!=='function')return;
  try{
   const [publicNav,skin]=await Promise.all([
    fetch('/public/bottom-nav',{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch('/public/bottom-nav-appearance',{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?r.json():null).catch(()=>null)
   ]);
   if(publicNav&&Array.isArray(publicNav.items)){
    const normalized=defaults.map(x=>({...x}));
    const aliases={mmtrade10x:'challenge',trophy:'challenge'};
    publicNav.items.forEach(entry=>{
      if(!entry||typeof entry!=='object')return;
      const id=aliases[entry.id]||entry.id;
      const target=normalized.find(x=>x.id===id);if(!target)return;
      if(typeof entry.label==='string'&&entry.label.trim().length<=24&&!/^(آیتم جدید|new item)/i.test(entry.label.trim()))target.label=entry.label.trim();
      const link=safeHref(entry.href);if(link)target.href=link;
      if(Object.hasOwn(iconData,entry.icon))target.icon=entry.icon;
      target.enabled=entry.enabled!==false;
      target.sort=clamp(entry.sort,0,10000,target.sort);
    });
    // Sort by the admin's order when all five ids are explicitly registered;
    // otherwise keep the screenshot's canonical fixed order.
    if(normalized.every(x=>publicNav.items.some(y=>y.id===x.id))){
      normalized.sort((a,b)=>a.sort-b.sort);
    }else normalized.forEach((x,i)=>x.sort=(i+1)*10);
    items=normalized;
   }
   config=normalizeConfig(skin);
   draw();appearanceApply();
  }catch(_){/* default skin and links remain functional during API outages */}
 }
 function init(){
  if(!document.body)return;
  mount();
  const observer=new MutationObserver(mutations=>{
   if(queued||!mutations.some(x=>x.type==='childList'))return;
   queued=true;queueMicrotask(()=>{queued=false;mount()});
  });
  observer.observe(document.body,{childList:true});
  document.addEventListener('scroll',scrollListener,{capture:true,passive:true});
  window.addEventListener('scroll',scrollListener,{passive:true});
  window.addEventListener('popstate',()=>{reveal();draw()},{passive:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
