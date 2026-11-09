/* MF_NAV_R1_MOUNTAIN_FIRST_STEP */
/* P74_HOME_MATCH_R2: native Telegram Home + same-origin standalone preview. No WebGL, no remote code. */
(function(){'use strict';
if(window.__P74_HOME_LOADED__)return;window.__P74_HOME_LOADED__=true;
const VERSION='P76_TOUCH_RESIZE_R2', MARK='#p74-home-config';
const params=new URLSearchParams(location.search), isPreview=params.get('p74Preview')==='1'||/\/p74\/preview\.html$/.test(location.pathname);
const pathname=location.pathname.replace(/\/$/,'');
const isHome=pathname==='/miniapp'||pathname==='/miniapp/index.html';
if(!isPreview&&(!isHome||(params.get('view')&&params.get('view')!=='index')))return;
let modelPending=null,pendingRender=null;
function ensureObjectModel(){
 if(window.MMTradeObjectModel)return Promise.resolve();
 if(!modelPending)modelPending=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/miniapp/p74/object-model.js?v=OBJECT_STUDIO_R1';
  script.onload=()=>window.MMTradeObjectModel?resolve():reject(Error('object-model missing'));
  script.onerror=()=>reject(Error('object-model unavailable'));document.head.append(script);
 });return modelPending;
}

const DEFAULT={version:74,enabled:true,brand:'MM trade challenge 10x',tagline:'چالش رشد ۱۰ برابری در معاملات',heroEyebrow:'ویدیوی معرفی چالش',heroTitle:'چالش MM',heroSubtitle:'رشد ۱۰ برابری',journeyTitle:'مسیر 10X تو از اینجا شروع می‌شود',journeySubtitle:'یک مسیر مرحله‌به‌مرحله برای رشد مهارت، اعتمادبه‌نفس و سرمایه',videoUrl:'https://dl.namahub.ir/parsahojabrian/W0OGUlGh',videoDuration:'07:46',videoPoster:'/miniapp/p74/assets/hero_poster.webp',videoFrameWidth:92.8,videoFrameHeight:17.1,videoFrameTop:16.5,progressTitle:'پیشرفت شما در چالش',ctaText:'مرحله بعدی چالش',ctaHref:'/miniapp/challenge.html',progressHref:'/miniapp/profile.html',stepCount:5,steps:[{title:'شروع چالش',href:'/miniapp/challenge.html',position:{top:64,right:47,width:51}},{title:'آموزش‌های کلیدی',href:'/miniapp/academy.html',position:{top:49,right:45,width:47}},{title:'تمرین و اجرا',href:'/miniapp/challenge.html',position:{top:34,right:36,width:45}},{title:'مدیریت ریسک',href:'/miniapp/copy-trading.html',position:{top:19,right:25,width:39}},{title:'رشد و مقیاس',href:'/miniapp/profile.html',position:{top:5,right:15,width:33,height:13}},{title:'ماموریت ششم',href:'/miniapp/challenge.html',position:{top:0,right:0,width:37,height:10}},{title:'ماموریت هفتم',href:'/miniapp/challenge.html',position:{top:0,right:0,width:36,height:10}},{title:'ماموریت هشتم',href:'/miniapp/challenge.html',position:{top:0,right:0,width:34,height:10}}],nav:[{title:'خانه',href:'/miniapp/index.html'},{title:'آکادمی',href:'/miniapp/academy.html'},{title:'پروفایل',href:'/miniapp/profile.html'}]};
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
// P76 Step Gesture R2: stage-wide Y range, safe responsive sizing, and touch gestures.
// Mountain controls use % of the mountain region (top 50%, height 28%) for backward compatibility.
const STEP_GEOMETRY={top:50,height:28,widthMin:18,widthMax:95,heightMin:7,heightMax:28};
const stepRound=v=>Math.round(v*100)/100;
function stepPosition(value,defaults={top:0,right:0,width:40,height:13}){
 const v=value&&typeof value==='object'?value:{};
 const width=num(v.width,defaults.width,STEP_GEOMETRY.widthMin,STEP_GEOMETRY.widthMax);
 const height=num(v.height,defaults.height,STEP_GEOMETRY.heightMin,STEP_GEOMETRY.heightMax);
 const topMin=-STEP_GEOMETRY.top/STEP_GEOMETRY.height*100;
 const topMax=(100-STEP_GEOMETRY.top)/STEP_GEOMETRY.height*100-height;
 return {top:stepRound(num(v.top,defaults.top,topMin,topMax)),right:stepRound(num(v.right,defaults.right,0,100-width)),width:stepRound(width),height:stepRound(height)};
}
function stepWithinStage(position,stage,mountain){
 const size=stepPosition(position);
 if(!stage||!mountain||mountain.width<=0||mountain.height<=0)return size;
 const minTop=(stage.top-mountain.top)*100/mountain.height;
 const maxTop=(stage.bottom-mountain.top)*100/mountain.height-size.height;
 return {...size,top:stepRound(num(size.top,0,minTop,Math.max(minTop,maxTop)))};
}
function stepDrag(position,dx,dy,stage,mountain){
 return stepWithinStage({...position,top:position.top+100*dy/mountain.height,right:position.right-100*dx/mountain.width},stage,mountain);
}
function stepResize(position,dx,dy,stage,mountain){
 return stepWithinStage({...position,width:position.width-100*dx/mountain.width,height:position.height+100*dy/mountain.height},stage,mountain);
}
function stepPinch(position,scale,dx,dy,stage,mountain){
 const width=num(position.width*scale,position.width,STEP_GEOMETRY.widthMin,STEP_GEOMETRY.widthMax);
 const height=num(position.height*scale,position.height,STEP_GEOMETRY.heightMin,STEP_GEOMETRY.heightMax);
 return stepWithinStage({...position,width,height,
   top:position.top-(height-position.height)/2+100*dy/mountain.height,
   right:position.right-(width-position.width)/2-100*dx/mountain.width},stage,mountain);
}
function safePosition(value,defaultPos){return stepPosition(value,defaultPos)};

/* P77_PAGE_ELEMENT_EDITOR_R1 */
function normalizePageLayout(raw){
 const out={};
 if(!raw||typeof raw!=='object')return out;
 for(const [id,v] of Object.entries(raw).slice(0,40)){
  if(!/^[a-z0-9_-]{1,48}$/i.test(id)||!v||typeof v!=='object')continue;
  const x=num(v.x,0,0,99),y=num(v.y,0,0,99);
  out[id]={x,y,w:num(v.w,10,1,100-x),h:num(v.h,5,1,100-y)};
 }
 return out;
}
function normalizePageStyles(raw){
 const out={};
 if(!raw||typeof raw!=='object')return out;
 for(const [id,v] of Object.entries(raw).slice(0,40)){
  if(!/^[a-z0-9_-]{1,48}$/i.test(id)||!v||typeof v!=='object')continue;
  const s={};
  for(const k of ['color','background','borderColor'])
   if(typeof v[k]==='string'&&/^#[0-9a-f]{6}$/i.test(v[k]))s[k]=v[k];
  for(const [k,min,max] of [['fontSize',8,72],['borderRadius',0,60],
    ['opacity',0.1,1],['padding',0,48],['letterSpacing',-2,8]]){
   if(v[k]!==undefined)s[k]=num(v[k],1,min,max);
  }
  if([400,700,800].includes(Number(v.fontWeight)))s.fontWeight=Number(v.fontWeight);
  if(['right','center','left'].includes(v.textAlign))s.textAlign=v.textAlign;
  if(Object.keys(s).length)out[id]=s;
 }
 return out;
}
const P77_PAGE_ITEMS=[
 ['brand','بخش برند','.p74-brand'],
 ['brand-logo','نشان برند','.p74-emblem'],
 ['brand-name','نام برند','.p74-brand-name'],
 ['brand-sub','زیرعنوان برند','.p74-brand-sub'],
 ['hero','کادر معرفی ویدیو','.p74-hero'],
 ['hero-copy','ناحیه متن ویدیو','.p74-hero-copy'],
 ['hero-eyebrow','برچسب ویدیو','.p74-overline'],
 ['hero-title','عنوان ویدیو','.p74-hero-title'],
 ['hero-subtitle','توضیح ویدیو','.p74-hero-desc'],
 ['hero-underline','خط تزئینی ویدیو','.p74-hero-underline'],
 ['hero-play','دکمه پخش ویدیو','.p74-play'],
 ['hero-badge','زمان ویدیو','.p74-video-badge'],
 ['journey-title','عنوان مسیر','.p74-journey-title'],
 ['journey-subtitle','توضیح مسیر','.p74-journey-sub'],
 ['progress-card','کادر پیشرفت','.p74-progress'],
 ['progress-arrow','فلش پیشرفت','.p74-progress-arrow'],
 ['progress-content','متن پیشرفت','.p74-progress-content'],
 ['progress-title','عنوان پیشرفت','.p74-progress-content strong'],
 ['progress-ring','دایره درصد پیشرفت','.p74-ring'],
 ['cta','دکمه اصلی پایین صفحه','.p74-cta'],
 ['cta-chevron','فلش دکمه اصلی','.p74-cta-chevron'],
 ['cta-text','متن دکمه اصلی','.p74-cta-text'],
 ['cta-icon','آیکون دکمه اصلی','.p74-cta-icon'],
 ['nav','نوار منوی پایین','.p74-nav'],
 ['nav-item-1','آیتم اول منو','.p74-nav a:nth-child(1)'],
 ['nav-item-1-text','متن آیتم اول','.p74-nav a:nth-child(1) span'],
 ['nav-item-2','آیتم دوم منو','.p74-nav a:nth-child(2)'],
 ['nav-item-2-text','متن آیتم دوم','.p74-nav a:nth-child(2) span'],
 ['nav-item-3','آیتم سوم منو','.p74-nav a:nth-child(3)'],
 ['nav-item-3-text','متن آیتم سوم','.p74-nav a:nth-child(3) span']
];
function pageNode(stage,selector){try{return stage.querySelector(selector)}catch(e){return null}}
/* TENX_PAGE_GEOMETRY_PADDING_BOX_R1
 * CSS percentage offsets/sizes are relative to the containing block's padding box.
 * Measure against that same box (excluding borders and accounting for scroll).
 */
function pageElementGeometry(node,fallbackStage){
 if(!node)return null;
 const host=node.offsetParent||fallbackStage;
 if(!host||typeof host.getBoundingClientRect!=='function')return null;
 const hostRect=host.getBoundingClientRect(),r=node.getBoundingClientRect();
 const width=Number(host.clientWidth)||Number(hostRect.width)||0;
 const height=Number(host.clientHeight)||Number(hostRect.height)||0;
 if(!width||!height)return null;
 const originLeft=hostRect.left+(Number(host.clientLeft)||0)-(Number(host.scrollLeft)||0);
 const originTop=hostRect.top+(Number(host.clientTop)||0)-(Number(host.scrollTop)||0);
 const clampPct=(value,min,max)=>Math.round(Math.max(min,Math.min(max,value))*100)/100;
 const w=clampPct(r.width*100/width,1,100);
 const h=clampPct(r.height*100/height,1,100);
 const x=clampPct((r.left-originLeft)*100/width,0,100-w);
 const y=clampPct((r.top-originTop)*100/height,0,100-h);
 return{x,y,w,h};
}
function applyPageLayout(stage,cfg){
 for(const item of P77_PAGE_ITEMS){
  const v=cfg.pageLayout?.[item[0]],node=pageNode(stage,item[2]);
  if(!v||!node)continue;
  node.style.position='absolute';
  node.style.left=v.x+'%';node.style.top=v.y+'%';
  node.style.right='auto';node.style.bottom='auto';
  node.style.width=v.w+'%';node.style.height=v.h+'%';
  node.style.transform='none';
  node.style.boxSizing='border-box';
 }
}
function applyPageStyles(stage,cfg){
 for(const item of P77_PAGE_ITEMS){
  const s=cfg.pageStyles?.[item[0]],node=pageNode(stage,item[2]);
  if(!s||!node)continue;
  if(s.color)node.style.color=s.color;
  if(s.background)node.style.backgroundColor=s.background;
  if(s.borderColor){
   node.style.borderColor=s.borderColor;
   if(!node.style.borderStyle)node.style.borderStyle='solid';
   if(!node.style.borderWidth)node.style.borderWidth='1px';
  }
  if(s.fontSize)node.style.fontSize=s.fontSize+'px';
  if(s.fontWeight)node.style.fontWeight=String(s.fontWeight);
  if(s.textAlign)node.style.textAlign=s.textAlign;
  if(s.borderRadius!==undefined)node.style.borderRadius=s.borderRadius+'px';
  if(s.opacity!==undefined)node.style.opacity=String(s.opacity);
  if(s.padding!==undefined)node.style.padding=s.padding+'px';
  if(s.letterSpacing!==undefined)node.style.letterSpacing=s.letterSpacing+'px';
 }
}
function enablePageEditor(stage,cfg){
 applyPageLayout(stage,cfg);applyPageStyles(stage,cfg);
 const layer=elem('div','p77-page-editor-layer');
 layer.setAttribute('aria-label','انتخاب و ویرایش عناصر صفحه');
 const stageRect=()=>stage.getBoundingClientRect();
 const overlays=[];
 const clampPct=(v,min,max)=>Math.round(Math.max(min,Math.min(max,v))*100)/100;
 function hostOf(node){return node.offsetParent||stage}
 function geometry(node){return pageElementGeometry(node,stage)}
 function writeGeometry(node,g){
  node.style.position='absolute';node.style.transform='none';
  node.style.left=g.x+'%';node.style.top=g.y+'%';
  node.style.right='auto';node.style.bottom='auto';
  node.style.width=g.w+'%';node.style.height=g.h+'%';
  node.style.boxSizing='border-box';
 }
 function select(id,notify=true){
  window.__P77_SELECTED_ELEMENT__=id;
  for(const x of overlays)x.hit.classList.toggle('is-selected',x.id===id);
  if(notify){
   const item=overlays.find(x=>x.id===id);
   const g=item?geometry(item.node):null;
   window.parent.postMessage({type:'P74_ELEMENT_SELECTED',id,layout:g},location.origin);
  }
 }
 const found=P77_PAGE_ITEMS.map(item=>{
  const node=pageNode(stage,item[2]);
  if(!node)return null;
  let depth=0,p=node;
  while(p&&p!==stage){depth++;p=p.parentElement}
  return{id:item[0],node,depth};
 }).filter(Boolean).sort((a,b)=>a.depth-b.depth);
 for(const item of found){
  const hit=elem('div','p77-page-editor-hitbox');
  hit.dataset.elementId=item.id;
  hit.title=(P77_PAGE_ITEMS.find(x=>x[0]===item.id)||[])[1]||item.id;
  hit.style.zIndex=String(100+item.depth);
  const grip=elem('button','p77-page-editor-resize','↘');
  grip.type='button';grip.setAttribute('aria-label','تغییر اندازه');
  hit.append(grip);layer.append(hit);
  const entry={...item,hit,grip,gesture:null};
  overlays.push(entry);
  function sync(){
   const sr=stageRect(),r=item.node.getBoundingClientRect();
   if(!sr.width||!sr.height)return;
   hit.style.left=((r.left-sr.left)*100/sr.width)+'%';
   hit.style.top=((r.top-sr.top)*100/sr.height)+'%';
   hit.style.width=Math.max(.5,r.width*100/sr.width)+'%';
   hit.style.height=Math.max(.5,r.height*100/sr.height)+'%';
  }
  entry.sync=sync;
  hit.addEventListener('pointerdown',e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   e.preventDefault();e.stopPropagation();select(item.id,true);
   const host=hostOf(item.node),hr=host.getBoundingClientRect(),g=geometry(item.node);
   const hostWidth=Number(host.clientWidth)||hr.width;
   const hostHeight=Number(host.clientHeight)||hr.height;
   if(!g||!hostWidth||!hostHeight)return;
   entry.gesture={pointer:e.pointerId,mode:e.target===grip?'resize':'move',
    startX:e.clientX,startY:e.clientY,hostWidth,hostHeight,
    original:{...g},changed:false};
   try{hit.setPointerCapture(e.pointerId)}catch(_){}
  });
  hit.addEventListener('pointermove',e=>{
   const d=entry.gesture;if(!d||d.pointer!==e.pointerId)return;
   const dx=(e.clientX-d.startX)*100/d.hostWidth;
   const dy=(e.clientY-d.startY)*100/d.hostHeight;
   let g={...d.original};
   if(d.mode==='resize'){
    g.w=clampPct(d.original.w+dx,1,100-d.original.x);
    g.h=clampPct(d.original.h+dy,1,100-d.original.y);
   }else{
    g.x=clampPct(d.original.x+dx,0,100-d.original.w);
    g.y=clampPct(d.original.y+dy,0,100-d.original.h);
   }
   if(Math.abs(dx)+Math.abs(dy)>.15)d.changed=true;
   writeGeometry(item.node,g);sync();
  });
  const finish=e=>{
   const d=entry.gesture;if(!d||d.pointer!==e.pointerId)return;
   entry.gesture=null;
   if(d.changed){
    const g=geometry(item.node);
    if(g)window.parent.postMessage({type:'P74_ELEMENT_LAYOUT',id:item.id,layout:g},location.origin);
   }
  };
  hit.addEventListener('pointerup',finish);
  hit.addEventListener('pointercancel',finish);
  sync();
 }
 stage.append(layer);
 if(window.__P77_SELECTED_ELEMENT__)
  select(window.__P77_SELECTED_ELEMENT__,false);
 if(typeof ResizeObserver!=='undefined'){
  const observer=new ResizeObserver(()=>overlays.forEach(x=>x.sync()));
  observer.observe(stage);
 }
}


function normalized(raw){
 const a=copy(DEFAULT);if(!raw||typeof raw!=='object'){a.objects=window.MMTradeObjectModel.normalizeObjects();a.backgrounds={};a.pageLayout={};a.pageStyles={};return a;}
 for(const k of ['brand','tagline','heroEyebrow','heroTitle','heroSubtitle','journeyTitle','journeySubtitle','videoDuration','progressTitle','ctaText'])if(typeof raw[k]==='string')a[k]=safeText(raw[k],k==='journeySubtitle'?180:100)||a[k];
 for(const k of ['ctaHref','progressHref','videoUrl'])if(typeof raw[k]==='string')a[k]=safeUrl(raw[k])||a[k];
 if(typeof raw.videoPoster==='string')a.videoPoster=window.MMTradeObjectModel.assetUrl(raw.videoPoster)||DEFAULT.videoPoster;
 for(const [k,min,max] of [['videoFrameWidth',60,100],['videoFrameHeight',8,32],['videoFrameTop',4,42]]){
  a[k]=num(raw[k],DEFAULT[k],min,max);
 }
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
 a.enabled=raw.enabled!==false;
 a.objects=window.MMTradeObjectModel.normalizeObjects(raw.objects);
 a.backgrounds=window.MMTradeObjectModel.backgrounds(raw.backgrounds);
 a.pageLayout=normalizePageLayout(raw.pageLayout);a.pageStyles=normalizePageStyles(raw.pageStyles);
 return a;
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
 link.title='بکشید؛ برای تغییر اندازه از گوشهٔ چپ پایین یا دو انگشت استفاده کنید';
 link.setAttribute('tabindex','0');
 link.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});
 const grip=elem('span','p76-step-resize-grip','⤡');grip.setAttribute('aria-hidden','true');link.append(grip);
 const fingers=new Map();let base=null;
 const read=()=>({top:parseFloat(link.style.top),right:parseFloat(link.style.right),width:parseFloat(link.style.width),height:parseFloat(link.style.height)});
 const paint=p=>{const box=mountain.getBoundingClientRect(),stage=mountain.closest('.p74-page')?.getBoundingClientRect();
   if(!box.width||!box.height||!stage)return;
   const v=stepWithinStage(p,stage,box);
   for(const k of ['top','right','width','height'])link.style[k]=v[k]+'%';
   current.steps[index].position=v;
 };
 const snapshot=()=>{const a=[...fingers.values()];const p=read();if(a.length>=2){
   const v=a[0],w=a[1];base={mode:'pinch',p,d:Math.max(1,Math.hypot(w.x-v.x,w.y-v.y)),x:(v.x+w.x)/2,y:(v.y+w.y)/2};
 }else if(a.length){base={mode:a[0].grip?'resize':'drag',p,x:a[0].x,y:a[0].y}}else base=null;};
 const report=()=>{if(window.parent!==window)window.parent.postMessage({type:'P75_STEP_POSITION',step:index,position:{...current.steps[index].position}},location.origin)};
 link.addEventListener('pointerdown',e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   e.preventDefault();e.stopPropagation();
   const box=mountain.getBoundingClientRect();if(!box.width||!box.height)return;
   const isGrip=Boolean(e.target.closest?.('.p76-step-resize-grip'));
   fingers.set(e.pointerId,{x:e.clientX,y:e.clientY,grip:isGrip});
   try{link.setPointerCapture(e.pointerId)}catch(_){}
   link.classList.add('p75-drag-active');snapshot();
 });
 link.addEventListener('pointermove',e=>{
   if(!fingers.has(e.pointerId)||!base)return;
   e.preventDefault();fingers.set(e.pointerId,{...fingers.get(e.pointerId),x:e.clientX,y:e.clientY});
   const box=mountain.getBoundingClientRect(),stage=mountain.closest('.p74-page')?.getBoundingClientRect();if(!box.width||!box.height||!stage)return;
   let pos;const a=[...fingers.values()];
   if(a.length>=2&&base.mode==='pinch'){
     const v=a[0],w=a[1],d=Math.hypot(w.x-v.x,w.y-v.y),cx=(v.x+w.x)/2,cy=(v.y+w.y)/2;
     pos=stepPinch(base.p,d/base.d,cx-base.x,cy-base.y,stage,box);
   }else if(a.length===1&&base.mode==='resize'){
     pos=stepResize(base.p,e.clientX-base.x,e.clientY-base.y,stage,box);
   }else if(a.length===1&&base.mode==='drag'){
     pos=stepDrag(base.p,e.clientX-base.x,e.clientY-base.y,stage,box);
   }
   if(pos)paint(pos);
 });
 const finish=e=>{if(!fingers.has(e.pointerId))return;e.preventDefault();
   fingers.delete(e.pointerId);
   if(fingers.size){snapshot();return}
   base=null;link.classList.remove('p75-drag-active');report();
 };
 link.addEventListener('pointerup',finish);link.addEventListener('pointercancel',finish);
 link.addEventListener('keydown',e=>{
   const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
   const box=mountain.getBoundingClientRect(),stage=mountain.closest('.p74-page')?.getBoundingClientRect();if(!stage||!box.width||!box.height)return;
   let p;if(delta){p=stepDrag(read(),delta[0]*(e.shiftKey?10:2),delta[1]*(e.shiftKey?10:2),stage,box)}
   else if(e.key==='+'||e.key==='=')p=stepPinch(read(),1.08,0,0,stage,box);
   else if(e.key==='-')p=stepPinch(read(),.92,0,0,stage,box);
   else return;
   e.preventDefault();paint(p);report();
 });
}
function makeLink(cls,url,label){const x=elem('a',cls,label);x.href=safeUrl(url)||'/miniapp/challenge.html';return x}
function showModal(videoUrl,posterUrl){const root=document.getElementById('p74-app');if(!root)return;root.querySelector('.p74-modal')?.remove();const modal=elem('div','p74-modal'),body=elem('div','p74-modal-body'),head=elem('div','p74-modal-head');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','ویدیوی معرفی چالش');head.append(elem('strong','', 'ویدیوی معرفی چالش'));const close=elem('button','p74-modal-close','بستن ✕');close.type='button';head.append(close);body.append(head);const url=safeUrl(videoUrl);if(url){const video=elem('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.poster=window.MMTradeObjectModel.assetUrl(posterUrl)||DEFAULT.videoPoster;video.src=url;video.addEventListener('error',()=>{if(!body.querySelector('.p74-modal-msg')){const msg=elem('p','p74-modal-msg','پخش داخل تلگرام انجام نشد. می‌توانید ویدیو را از لینک اصلی باز کنید.');const a=makeLink('',url,'باز کردن لینک ویدیو');a.target='_blank';a.rel='noopener noreferrer';msg.append(a);body.append(msg)}});body.append(video);setTimeout(()=>{if(modal.isConnected)video.play().catch(()=>{})},0)}else{body.append(elem('p','p74-modal-msg','لینک ویدیوی معرفی هنوز تنظیم نشده است.'))}modal.append(body);root.append(modal);const shut=()=>{body.querySelector('video')?.pause();modal.remove();document.removeEventListener('keydown',esc)};const esc=e=>{if(e.key==='Escape')shut()};document.addEventListener('keydown',esc);close.addEventListener('click',shut);modal.addEventListener('click',e=>{if(e.target===modal)shut()});close.focus()}
function renderObjects(stage,cfg,editMode){
 const model=window.MMTradeObjectModel;
 const layer=elem('div','p74-objects-layer');layer.setAttribute('aria-label','آبجکت‌های صحنه');
 for(const item of cfg.objects){if(!model.allowedOn(item,cfg.stepCount))continue;
  const outer=elem('div','p74-object');outer.dataset.objectId=item.id;outer.dataset.objectType=item.type;
  outer.style.left=item.x+'%';outer.style.top=item.y+'%';outer.style.width=item.w+'%';outer.style.height=item.h+'%';
  outer.style.opacity=String(item.opacity);outer.style.zIndex=String(item.z);
  outer.style.transform='rotate('+item.rotation+'deg)';
  outer.style.setProperty('--mm-duration',item.duration+'s');outer.style.setProperty('--mm-delay',item.delay+'s');
  const motion=elem('div','p74-object-motion mm-anim-'+item.animation);
  let content;
  if(item.type==='image'){content=elem('img','p74-object-image');content.src=item.src;content.alt='';content.loading='lazy';content.decoding='async';}
  else if(item.type==='text'){content=elem('span','p74-object-text',item.content);content.style.color=item.color;}
  else if(item.type==='flag'){content=elem('div','p74-object-flag');content.append(elem('span','',item.content||'10X'));content.style.color=item.color;}
  else if(item.type==='light'){content=elem('div','p74-object-light');content.style.setProperty('--light-color',item.color);}
  else {content=elem('div','p74-object-shape mm-shape-'+item.shape);content.style.backgroundColor=item.color;}
  motion.append(content);outer.append(motion);layer.append(outer);
  if(editMode){
    outer.tabIndex=0;outer.setAttribute('role','button');outer.setAttribute('aria-label','جابجایی آبجکت '+item.name);
    outer.title=item.name+' — جابه‌جایی با لمس یا کلیدهای جهت';
    const notify=()=>window.parent.postMessage({type:'P74_OBJECT_SELECTED',id:item.id},location.origin);
    let drag=null;
    outer.addEventListener('pointerdown',e=>{if(e.button!==0)return;const box=stage.getBoundingClientRect();
       if(!box.width||!box.height)return;e.preventDefault();e.stopPropagation();notify();
       drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:item.x,y:item.y};outer.setPointerCapture(e.pointerId);outer.classList.add('mm-dragging');});
    outer.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;
      const box=stage.getBoundingClientRect();const x=Math.min(100-item.w,Math.max(0,drag.x+100*(e.clientX-drag.startX)/box.width));
      const y=Math.min(100-item.h,Math.max(0,drag.y+100*(e.clientY-drag.startY)/box.height));
      outer.style.left=x.toFixed(2)+'%';outer.style.top=y.toFixed(2)+'%';});
    const done=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;outer.classList.remove('mm-dragging');
       const x=Number.parseFloat(outer.style.left),y=Number.parseFloat(outer.style.top);
       window.parent.postMessage({type:'P74_OBJECT_MOVE',id:item.id,x,y},location.origin)};
    outer.addEventListener('pointerup',done);outer.addEventListener('pointercancel',done);
    outer.addEventListener('keydown',e=>{const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const d=dirs[e.key];if(!d)return;e.preventDefault();
       const mult=e.shiftKey?5:1,x=Math.min(100-item.w,Math.max(0,parseFloat(outer.style.left)+d[0]*mult)),y=Math.min(100-item.h,Math.max(0,parseFloat(outer.style.top)+d[1]*mult));
       outer.style.left=x+'%';outer.style.top=y+'%';notify();window.parent.postMessage({type:'P74_OBJECT_MOVE',id:item.id,x,y},location.origin)});
  }
 }
 if(editMode){layer.classList.add('p74-objects-edit');stage.classList.add('p74-page-objects-edit');}
 stage.append(layer);
}
function render(raw,payload){
 if(!window.MMTradeObjectModel){pendingRender={raw,payload};ensureObjectModel().then(()=>{const r=pendingRender;pendingRender=null;if(r)render(r.raw,r.payload)}).catch(()=>{console.warn('MMTrade Object Studio unavailable');if(!isPreview)document.documentElement.classList.remove('p74-enabled')});return;}
const cfg=normalized(raw);if(!cfg.enabled){document.getElementById('p74-app')?.remove();document.documentElement.classList.remove('p74-enabled');return}current=cfg;lastPayload=payload||lastPayload;let root=document.getElementById('p74-app');if(!root){root=elem('div');root.id='p74-app';root.dataset.version=VERSION;document.body.append(root)}root.replaceChildren();const scroll=elem('div','p74-scroll');const stage=elem('main','p74-page');stage.setAttribute('dir','rtl');scroll.append(stage);root.append(scroll);
const bg=cfg.backgrounds[String(cfg.stepCount)]||`/miniapp/p74/assets/mountain_steps_${cfg.stepCount}.webp`;
stage.style.setProperty('--p76-background',`url('${bg}')`);stage.dataset.stepCount=String(cfg.stepCount);
const brand=elem('header','p74-brand');const logo=elem('img','p74-emblem');logo.src='/miniapp/p74/assets/emblem.webp';logo.alt='نشان MM';logo.decoding='async';logo.fetchPriority='high';brand.append(logo,elem('strong','p74-brand-name',cfg.brand),elem('p','p74-brand-sub',cfg.tagline));stage.append(brand);
const hero=elem('section','p74-hero');hero.setAttribute('aria-label','معرفی چالش');
 const poster=window.MMTradeObjectModel.assetUrl(cfg.videoPoster)||DEFAULT.videoPoster;
 hero.style.backgroundImage=`url("${poster}")`;
 hero.style.width=cfg.videoFrameWidth+'%';hero.style.height=cfg.videoFrameHeight+'%';hero.style.top=cfg.videoFrameTop+'%';
 hero.style.left=((100-cfg.videoFrameWidth)/2)+'%';const copyArea=elem('div','p74-hero-copy');copyArea.append(elem('span','p74-overline',cfg.heroEyebrow),elem('strong','p74-hero-title',cfg.heroTitle),elem('strong','p74-hero-desc',cfg.heroSubtitle),elem('span','p74-hero-underline'));hero.append(copyArea);const play=elem('button','p74-play');play.type='button';play.setAttribute('aria-label','پخش ویدیوی معرفی');play.append(icon('play'));play.addEventListener('click',()=>showModal(cfg.videoUrl,cfg.videoPoster));hero.append(play,elem('span','p74-video-badge','▣ '+cfg.videoDuration));stage.append(hero);
const title=elem('h2','p74-journey-title');title.textContent=cfg.journeyTitle;const sub=elem('p','p74-journey-sub',cfg.journeySubtitle);stage.append(title,sub);
// Decorative cube and coin are now independent, configurable object layers.
const mountain=elem('section','p74-mountain-area');mountain.setAttribute('aria-label',`مسیر ${cfg.stepCount} مرحله‌ای چالش`);
const completed=isPreview?new Set([1,2]):completedStages(payload,cfg.stepCount);let currentStep=1;while(currentStep<=cfg.stepCount&&completed.has(currentStep))currentStep++;
const editorDrag=isPreview&&params.get('stepEdit')==='1';if(editorDrag)root.classList.add('p75-editing');else root.classList.remove('p75-editing');
for(let i=cfg.stepCount-1;i>=0;i--){const step=cfg.steps[i];const link=makeLink('p74-step',i===0?'/miniapp/p74/learning/academy-home.html':i===1?'/miniapp/p74/learning/stage2.html':step.href);const pos=safePosition(step.position,autoPositions(cfg.stepCount)[i]);
link.dataset.step=String(i+1);link.dataset.state=completed.has(i+1)?'completed':(i+1===currentStep?'current':'upcoming');
link.setAttribute('aria-label','مرحله '+(i+1)+': '+step.title);link.style.top=pos.top+'%';link.style.right=pos.right+'%';link.style.width=pos.width+'%';link.style.height=pos.height+'%';
link.append(elem('span','p74-step-number',String(i+1)),elem('span','p74-step-label',step.title),elem('span','p74-step-icon',i===0?'▷':i===1?'▤':i===2?'▥':i===3?'♢':'↗'));
if(editorDrag)wireStepDrag(link,mountain,i);mountain.append(link)}
stage.append(mountain);renderObjects(stage,cfg,editorDrag);
const progress=pctValue(payload);const progressCard=makeLink('p74-progress',cfg.progressHref);progressCard.setAttribute('aria-label','مشاهده پیشرفت چالش');const ring=elem('div','p74-ring');ring.style.setProperty('--pct',String(progress.pct??0));ring.append(elem('span','',progress.pct===null?'—':progress.pct+'%'));const pc=elem('div','p74-progress-content');pc.append(elem('strong','',cfg.progressTitle),elem('small','',progress.note));progressCard.append(elem('span','p74-progress-arrow','‹'),pc,ring);stage.append(progressCard);
const cta=makeLink('p74-cta',cfg.ctaHref);cta.append(elem('span','p74-cta-chevron','❯'),elem('span','p74-cta-text',cfg.ctaText),elem('span','p74-cta-icon','🚀'));stage.append(cta);
if(isPreview){const nav=elem('nav','p74-nav');nav.setAttribute('aria-label','منوی اصلی Mini App');for(let i=0;i<3;i++){const n=cfg.nav[i];const a=makeLink('',n.href);if(i===0)a.setAttribute('aria-current','page');a.append(icon(['home','academy','profile'][i]),elem('span','',n.title));nav.append(a)}root.append(nav);}
if(isPreview&&editorDrag)enablePageEditor(stage,cfg);
 if(isPreview)root.dataset.preview='1';return root}
function receivePublished(e){if(isPreview)return;Promise.resolve(window.__MM_PAGE_GATE_READY__).then(()=>{if(window.__MM_PAGE_GATE_REDIRECT__||window.__MM_PAGE_ENGINE__!=='p74')return;const data=e?.detail||{};const meta=extract(data.blocks);if(!meta){document.getElementById('p74-app')?.remove();document.documentElement.classList.remove('p74-enabled');return}document.documentElement.classList.add('p74-enabled');render(meta,data)});}
window.addEventListener('tenx:data',receivePublished);
/* MM_P74_ENTRY_R103_CLIENT_BEGIN */
// Recover the published home even when Telegram initData is absent or
// the initial tenx:data event precedes this script's listener.
(function bootstrapPublishedP74(){
  if (isPreview) return;
  const diag = { status: 'waiting_for_page_gate' };
  window.__MM_P74_ENTRY_DIAG__ = diag;
  const run = function(){
    if (window.__MM_PAGE_GATE_REDIRECT__) { diag.status='redirecting'; return; }
    if (window.__MM_PAGE_ENGINE__ && window.__MM_PAGE_ENGINE__ !== 'p74') {
      diag.status='another_engine_selected'; return;
    }
    if (document.getElementById('p74-app')) { diag.status='already_rendered'; return; }
    diag.status='fetching_published_home';
    fetch('/public/p74-home-config',{cache:'no-store',credentials:'same-origin'})
      .then(function(res){if(!res.ok)throw Error('HTTP_'+res.status);return res.json()})
      .then(function(data){
        if (document.getElementById('p74-app')) { diag.status='already_rendered'; return; }
        if (!data || data.enabled !== true || !data.config || data.config.version !== 74) {
          diag.status = 'not_published'; return;
        }
        receivePublished({detail:{blocks:[{
          type:'element',selector:MARK,text:JSON.stringify(data.config)
        }]}});
        diag.status = document.getElementById('p74-app') ? 'rendered' : 'render_failed';
      }).catch(function(e){diag.status='fetch_failed';diag.error=String(e?.message||e).slice(0,150);console.warn('P74 published home bootstrap failed', e)});
  };
  const gate = window.__MM_PAGE_GATE_READY__;
  if (gate && typeof gate.then === 'function') gate.then(run,run);
  else run();
})();
/* MM_P74_ENTRY_R103_CLIENT_END */

window.addEventListener('message',e=>{
 if(!isPreview||e.origin!==location.origin||e.source!==window.parent||!e.data)return;
 if(e.data.type==='P74_PAGE_ELEMENT_SELECT'){
  window.__P77_SELECTED_ELEMENT__=String(e.data.id||'');
  const layer=document.querySelector('.p77-page-editor-layer');
  if(layer)for(const hit of layer.querySelectorAll('.p77-page-editor-hitbox'))
   hit.classList.toggle('is-selected',hit.dataset.elementId===window.__P77_SELECTED_ELEMENT__);
  const hit=layer?.querySelector('[data-element-id="'+window.__P77_SELECTED_ELEMENT__+'"]');
  if(hit){
   const item=P77_PAGE_ITEMS.find(x=>x[0]===window.__P77_SELECTED_ELEMENT__);
   const node=item?pageNode(document.querySelector('.p74-page'),item[2]):null;
   if(node){
    const layout=pageElementGeometry(node,document.querySelector('.p74-page'));
    window.parent.postMessage({type:'P74_ELEMENT_SELECTED',id:window.__P77_SELECTED_ELEMENT__,layout},location.origin);
   }
  }
  return;
 }
 if(e.data.type!=='P74_CONFIG_PREVIEW')return;
 window.__P77_SELECTED_ELEMENT__=String(e.data.selectedElementId||'');
 lastPreviewCfg=e.data.config;render(lastPreviewCfg,null);
});
function ready(){if(isPreview){render(DEFAULT,null);return} // In production, the current Home stays untouched until the published marker exists.
setTimeout(()=>{if(current||document.getElementById('p74-app'))return;const initData=window.Telegram?.WebApp?.initData;if(!initData)return;fetch('/content/page',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug:'index',initData})}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(d=>{if(!current)receivePublished({detail:d})}).catch(()=>{})},1100)}
/* MMTRADE_PAGE_LIFECYCLE_R10_HOME_GUARD */
const gatedReady=()=>Promise.resolve(window.__MM_PAGE_GATE_READY__).then(()=>{if(!window.__MM_PAGE_GATE_REDIRECT__&&(isPreview||window.__MM_PAGE_ENGINE__==='p74'))ready()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',gatedReady);else gatedReady();
window.P74StepGeometry={STEP_GEOMETRY,stepPosition,stepWithinStage,stepDrag,stepResize,stepPinch};
window.P74={version:VERSION,defaults:copy(DEFAULT),autoPositions,renderPreview:obj=>{if(isPreview)render(obj,null)}};
})();
