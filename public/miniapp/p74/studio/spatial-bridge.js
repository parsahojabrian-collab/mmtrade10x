/* MMTrade10X Spatial Bridge R9: precise picking & non-destructive additive animations. */
(()=>{'use strict';if(window.__MMVS_SPATIAL_R4__)return;window.__MMVS_SPATIAL_R4__=true;
const query=new URLSearchParams(location.search),preview=query.get('visualPreview')==='1';
const path=location.pathname;const view=query.get('view');
const slug=path.includes('/learning/')?'academy':path.includes('/profile/')?'profile':path.includes('/support/')?'support':path.includes('/crypto')?'crypto':path.includes('/copy-trading')?'copy-trading':path.includes('/challenge')?'challenge':view==='academy'?'academy':view==='profile'?'profile':view==='mmtrade10x'?'mmtrade10x':'index';
const root=document.documentElement;
Object.defineProperty(window,'__MMVS_SPATIAL_EDITING__',{configurable:true,get:()=>editing});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const safeLayout=l=>({items:Array.isArray(l?.items)?l.items.filter(x=>x&&typeof x.selector==='string'&&x.selector.length<=500&&Number.isFinite(x.x)&&Number.isFinite(x.y)&&Number.isFinite(x.scale)&&Math.abs(x.x)<=4000&&Math.abs(x.y)<=4000&&x.scale>=.2&&x.scale<=4&&
 (x.locked===undefined||typeof x.locked==='boolean')&&(x.hidden===undefined||typeof x.hidden==='boolean')&&
 (x.zIndex===undefined||(Number.isInteger(x.zIndex)&&x.zIndex>=-1000&&x.zIndex<=20000))&&
  (x.opacity===undefined||(Number.isFinite(x.opacity)&&x.opacity>=.05&&x.opacity<=1))&&
  (x.animation===undefined||(x.animation&&['float','spin','sway','pulse'].includes(x.animation.kind)&&Number.isInteger(x.animation.durationMs)&&x.animation.durationMs>=400&&x.animation.durationMs<=30000&&Number.isFinite(x.animation.amplitude)&&x.animation.amplitude>=1&&x.animation.amplitude<=150&&Number.isInteger(x.animation.delayMs)&&x.animation.delayMs>=0&&x.animation.delayMs<=10000&&typeof x.animation.loop==='boolean'))).slice(0,250):[]});
const original=new Map();let layout={items:[]},selected=null,selector='',editing=false,grid=false,overlay=null,handle=null,toolbar=null,toolbarButtons={},active=new Map(),gesture=null,raf=0,gestureChanged=false,gestureStart=null,animationsPlaying=true;
const animations=new Map();
function get(s){if(typeof s!=='string'||s.length>500)return null;try{return document.querySelector(s)}catch{return null}}
function eligible(el){return el instanceof Element&&!protectedRoot(el)&&!el.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-overlay')&&!['HTML','BODY','SCRIPT','STYLE','LINK','META','TITLE','NOSCRIPT'].includes(el.tagName)}
function protectedRoot(el){return el===document.body||el===document.documentElement||!!el?.matches?.('#p74-app,#mf62-home,#mmvs-root,#app,main.home-shell,#page-root,.stage-page,.stage-shell')}
function isBroadContainer(el){if(!el||!el.children?.length)return false;const r=el.getBoundingClientRect();return r.width>=innerWidth*.93&&r.height>=innerHeight*.75}
function deepCandidate(x,y){
  // Transparent/untouchable artwork is selected from its real geometry, not its app wrapper.
  const found=[];
  const candidates=cachedLayers.length?cachedLayers:allVisuals();
  for(const item of candidates){const el=get(item.selector);if(!eligible(el))continue;
    const r=el.getBoundingClientRect(),area=r.width*r.height;
    if(r.width<7||r.height<7||area>innerWidth*innerHeight*.8)continue;
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom){
      const z=zOf(el);found.push({el,area,z,depth:item.selector.split(/[ >]/).length});
    }
  }
  found.sort((a,b)=>a.area-b.area||b.z-a.z||b.depth-a.depth);
  return found[0]?.el||null;
}
function targetForPoint(e){
 const el=e.target instanceof Element?e.target:null;
 const hit=el?.closest?.('svg,canvas,[data-mmvs-layer],.mf62-float,.p74-decor')||el;
 const visual=deepCandidate(e.clientX,e.clientY);
 if(eligible(hit)&&!isBroadContainer(hit)){
   if(visual&&visual!==hit&&!hit.closest('a,button,input,textarea,select,[role=button]')){
     const h=hit.getBoundingClientRect(),v=visual.getBoundingClientRect();
     // Background containers often swallow taps on pointer-events:none graphics.
     if(h.width*h.height>v.width*v.height*1.7)return visual;
   }
   return hit;
 }
 if(visual)return visual;
 for(const other of document.elementsFromPoint(e.clientX,e.clientY)){if(eligible(other)&&!isBroadContainer(other))return other}
 return null;
}
function selectorOf(el){if(!eligible(el))return null;if(el.id){const s='#'+CSS.escape(el.id);if(document.querySelectorAll(s).length===1)return s}
const tag=el.tagName.toLowerCase();for(const c of [...el.classList].filter(s=>/^[a-zA-Z_][\w-]{0,60}$/.test(s)).slice(0,3)){const s=tag+'.'+CSS.escape(c);if(document.querySelectorAll(s).length===1)return s}
let p=el,parts=[];while(p&&p!==document.body&&parts.length<10){if(p.id){parts.unshift('#'+CSS.escape(p.id));break}const sib=[...p.parentElement.children].filter(x=>x.tagName===p.tagName),ix=sib.indexOf(p)+1;parts.unshift(p.tagName.toLowerCase()+(sib.length>1?':nth-of-type('+ix+')':''));const s=parts.join(' > ');if(document.querySelectorAll(s).length===1&&s.length<=500)return s;p=p.parentElement}const result=parts.join(' > ');return result.length<=500?result:null}
// R5: discover visual DOM layers including pointer-events:none graphics, CSS backgrounds and canvas/svgs.
let cachedLayers=[],layerRefreshTimer=0;
const graphicSelector='img,svg,canvas,video,figure,[data-mmvs-layer],[class*="sphere"],[class*="globe"],[class*="planet"],[class*="earth"],[class*="decor"],[class*="float"],[class*="coin"],[class*="crown"],[class*="ring"],[class*="cube"],[class*="orb"],[class*="particle"],[class*="sculpt"],[class*="mountain"],[style*="background-image"], [style*="background:"]';
function graphicKind(el){
 const n=el.tagName.toLowerCase(),c=String(typeof el.className==='string'?el.className:(el.className?.baseVal||'')).toLowerCase(), id=String(el.id||'').toLowerCase(),joined=c+' '+id;
 if(n==='canvas')return ['Canvas (کل صحنه)','🖼️','canvas'];
 if(n==='svg')return ['SVG','◇','svg'];
 if(n==='img')return ['تصویر','🏞️','image'];
 if(n==='video')return ['ویدیو','▶','video'];
 if(/globe|sphere|earth|planet/.test(joined))return ['کره / سیاره','🌍','globe'];
 if(/coin/.test(joined))return ['سکه','🪙','coin'];
 if(/crown/.test(joined))return ['تاج','♛','crown'];
 if(/cube/.test(joined))return ['مکعب','▣','cube'];
 if(/ring|orb|particle/.test(joined))return ['افکت گرافیکی','✧','effect'];
 if(/sculpt/.test(joined))return ['آبجکت سه‌بعدی نمایشی','◈','sculpt'];
 if(/decor|float|mountain/.test(joined))return ['آبجکت تزئینی','✦','decor'];
 if(el.hasAttribute('data-mmvs-layer'))return [el.getAttribute('data-mmvs-layer-label')||'لایه سفارشی','◈','custom'];
 return ['پس‌زمینه یا گروه گرافیکی','▦','background'];
}
function hasVisual(el){
 if(!eligible(el)||el.closest('#mmvs-managed-content,#mmvs-overlay'))return false;
 if(el.hasAttribute('data-mmvs-layer'))return true;
 const c=getComputedStyle(el),b=el.getBoundingClientRect();
 if(c.display==='none'||(c.visibility==='hidden'&&!el.dataset.mmvsSpatialHidden)||Number(c.opacity)<.05||b.width<5||b.height<5)return false;
 const tag=el.tagName.toLowerCase();
 if(['img','svg','canvas','video'].includes(tag))return true;
 if(/(?:sphere|globe|planet|earth|decor|float|coin|crown|ring|cube|orb|particle|sculpt|mountain)/i.test(String(typeof el.className==='string'?el.className:(el.className?.baseVal||''))+' '+el.id))return true;
 return c.backgroundImage!=='none' && c.backgroundImage.includes('url(');
}
function allVisuals(){
 const candidates=new Set();
 document.querySelectorAll(graphicSelector).forEach(e=>candidates.add(e));
 // Some styled graphics have non-descriptive class names and rely on CSS background URLs.
 const remainder=document.body?.querySelectorAll('*')||[];
 for(let i=0;i<Math.min(2200,remainder.length);i++){
  const el=remainder[i];if(candidates.has(el)||!el.className)continue;
  if(el.children.length>12)continue;
  candidates.add(el);
 }
 const result=[],seen=new Set();
 for(const el of candidates){
  if(result.length>=350)break;
  if(!hasVisual(el))continue;
  const s=selectorOf(el);if(!s||seen.has(s))continue;
  const [base,icon,kind]=graphicKind(el),b=el.getBoundingClientRect();
  if(kind==='background'&&(b.width>innerWidth*.92&&b.height>innerHeight*.93))continue;
  seen.add(s);
  const className=String(typeof el.className==='string'?el.className:(el.className?.baseVal||'')).split(/\s+/).filter(Boolean).slice(0,2).join(' · ');
  const label=(el.getAttribute('data-mmvs-layer-label')||base)+(className?' · '+className:'');
  result.push({selector:s,label:label.slice(0,125),kind,icon});
 }
 return result;
}
function sendVisuals(){if(!preview)return;cachedLayers=allVisuals();window.parent.postMessage({type:'MMVS_SPATIAL_LAYERS',items:cachedLayers},location.origin);if(selector)reportOverlaps()}
function scheduleVisuals(){if(layerRefreshTimer)clearTimeout(layerRefreshTimer);layerRefreshTimer=setTimeout(()=>{layerRefreshTimer=0;sendVisuals()},340)}
function reveal(s){activate(s,true);const el=get(s);if(el){if(!entry(s).hidden)el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});scheduleOutline()}}

function entry(s) {return layout.items.find(x=>x.selector===s)||{selector:s,x:0,y:0,scale:1}}
function zOf(el){const z=parseInt(getComputedStyle(el).zIndex,10);return Number.isFinite(z)?z:0}
function stopAnimation(el){const a=animations.get(el);if(a){try{a.effect.cancel()}catch(_e){}animations.delete(el)}}
function ensureAnimation(el,p){
 const a=p.animation;if(!a||!['float','spin','sway','pulse'].includes(a.kind)){stopAnimation(el);return}
 const sig=JSON.stringify(a),old=animations.get(el);if(old&&old.sig===sig)return;
 stopAnimation(el);
 if(typeof el.animate!=='function'||(!preview&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))return;
 const amount=a.amplitude,scale=1+amount/100;
 const frames={
  float:[{translate:'0px 0px'},{translate:'0px '+(-amount)+'px'},{translate:'0px 0px'}],
  spin:[{rotate:'0deg'},{rotate:'360deg'}],
  sway:[{rotate:(-amount)+'deg'},{rotate:amount+'deg'},{rotate:(-amount)+'deg'}],
  pulse:[{scale:'1'},{scale:String(scale)},{scale:'1'}]
 }[a.kind];
 try{
  // Composite 'add' keeps existing CSS transform animation and spatial translate/scale.
  const effect=el.animate(frames,{duration:a.durationMs,delay:a.delayMs,iterations:a.loop?Infinity:1,easing:'ease-in-out',composite:'add',fill:'none'});
  if(preview&&!animationsPlaying)effect.pause();
  animations.set(el,{sig,effect});
 }catch(_e){}
}
function styleFor(el,p){
 if(!original.has(el))original.set(el,{
  translate:el.style.translate,scale:el.style.scale,visibility:el.style.visibility,
  pointerEvents:el.style.pointerEvents,zIndex:el.style.zIndex,position:el.style.position,
  opacity:el.style.opacity
 });
 const old=original.get(el);
 // Individual CSS translate/scale properties don't overwrite animated transform keyframes.
 el.style.translate=p.x+'px '+p.y+'px';el.style.scale=String(p.scale);
 if(p.zIndex!==undefined){
  if(getComputedStyle(el).position==='static')el.style.position='relative';
  el.style.zIndex=String(p.zIndex);
 }else{el.style.zIndex=old.zIndex;el.style.position=old.position}
 el.style.opacity=p.opacity!==undefined?String(p.opacity):old.opacity;
 if(p.hidden&&!protectedRoot(el)){el.style.visibility='hidden';el.style.pointerEvents='none';el.dataset.mmvsSpatialHidden='1'}
 else{el.style.visibility=old.visibility;el.style.pointerEvents=old.pointerEvents;delete el.dataset.mmvsSpatialHidden}
 el.dataset.mmvsSpatial='1';
 if(p.locked)el.dataset.mmvsLocked='1';else delete el.dataset.mmvsLocked;
 ensureAnimation(el,p);
}
function clearFor(el){
 stopAnimation(el);
 const o=original.get(el);if(!o)return;
 for(const k of ['translate','scale','visibility','pointerEvents','zIndex','position','opacity'])el.style[k]=o[k];
 delete el.dataset.mmvsSpatial;delete el.dataset.mmvsSpatialHidden;delete el.dataset.mmvsLocked;
 original.delete(el);
}
function applyOne(s){const el=get(s);if(!eligible(el))return;const p=layout.items.find(x=>x.selector===s);if(p)styleFor(el,p);else clearFor(el);scheduleOutline()}
function apply(){
 const seen=new Set();
 for(const item of layout.items){const el=get(item.selector);if(!eligible(el))continue;seen.add(el);styleFor(el,item)}
 for(const el of [...original.keys()])if(!seen.has(el)||!el.isConnected)clearFor(el);
 scheduleOutline();
}
function reportOverlaps(){
 if(!preview||!selected||!selector)return;
 const rect=selected.getBoundingClientRect();const found=[];
 if(rect.width<3||rect.height<3)return;
 for(const item of cachedLayers.length?cachedLayers:allVisuals()){
  if(item.selector===selector)continue;
  const el=get(item.selector);if(!el||el===selected||el.contains(selected)||selected.contains(el))continue;
  const r=el.getBoundingClientRect();if(r.width<5||r.height<5)continue;
  const dx=Math.min(rect.right,r.right)-Math.max(rect.left,r.left);
  const dy=Math.min(rect.bottom,r.bottom)-Math.max(rect.top,r.top);
  if(dx>4&&dy>4)found.push({...item,z:zOf(el)});
 }
 found.sort((a,b)=>b.z-a.z);
 window.parent.postMessage({type:'MMVS_SPATIAL_OVERLAPS',selector,items:found.slice(0,28),slug},location.origin);
}
function drawOutline(){
 if(!preview||!overlay)return;
 if(selector&&(!selected||!selected.isConnected))selected=get(selector);
 if(!selected){overlay.hidden=true;if(toolbar)toolbar.hidden=true;return;}
 const b=selected.getBoundingClientRect(),p=entry(selector);
 overlay.style.left=b.left+'px';overlay.style.top=b.top+'px';
 overlay.style.width=b.width+'px';overlay.style.height=b.height+'px';overlay.hidden=false;
 overlay.classList.toggle('mmvs-is-locked',!!p.locked);
 overlay.classList.toggle('mmvs-is-hidden',!!p.hidden);
 if(handle)handle.hidden=!editing||!!p.locked||!!p.hidden;
 const grab=overlay.querySelector('#mmvs-spatial-grab');if(grab)grab.hidden=!editing||!!p.locked||!!p.hidden;
 if(toolbar){
  toolbar.hidden=!editing;
  const width=Math.min(innerWidth-12,400);
  toolbar.style.width=width+'px';
  const height=Math.max(42,toolbar.getBoundingClientRect().height||42);
  const left=clamp(b.left,6,Math.max(6,innerWidth-width-6));
  const above=b.top-height-9,below=b.bottom+9;
  const top=above>=6?above:below+height<=innerHeight-6?below:clamp(b.top+9,6,Math.max(6,innerHeight-height-6));
  toolbar.style.left=left+'px';toolbar.style.top=top+'px';
  toolbarButtons.lock.textContent=p.locked?'🔒 بازکردن':'🔓 قفل';
  toolbarButtons.hide.textContent=p.hidden?'↩ نمایش':'◉ حذف/مخفی';
 }
}
function scheduleOutline(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;drawOutline()})}
function activate(s,report){
 const el=get(s);if(!eligible(el))return;
 selected=el;selector=s;scheduleOutline();
 reportOverlaps();
 if(report){
  const text=[...el.childNodes].find(n=>n.nodeType===3)?.nodeValue||'';
  window.parent.postMessage({type:'MMVS_SELECT',element:{selector:s,tag:el.tagName,text:text.slice(0,3000),href:el.getAttribute('href'),src:el.getAttribute('src')}},location.origin);
  window.parent.postMessage({type:'MMVS_SPATIAL_SELECTED',item:{...entry(s),baseZ:zOf(el)},slug},location.origin);
 }
}
function makeOverlay(){
 const style=document.createElement('style');style.id='mmvs-spatial-ui-r7';
 style.textContent=`
 #mmvs-spatial-outline{position:fixed;pointer-events:none;border:2px solid #49eeb8;box-shadow:0 0 0 1px #061b12;outline:1px dashed #1119;z-index:2147483200;box-sizing:border-box}
 #mmvs-spatial-outline.mmvs-is-locked{border-color:#f5ba70;border-style:dashed}
 #mmvs-spatial-outline.mmvs-is-hidden{border-color:#ed8a85;border-style:dotted;background:#75202012}
 #mmvs-spatial-grab{position:absolute;inset:0;pointer-events:auto;touch-action:none!important;cursor:grab;background:transparent}
 #mmvs-spatial-handle{position:absolute;left:-12px;bottom:-12px;width:30px;height:30px;border-radius:9px;background:#e8bd83;color:#092719;border:2px solid #092719;pointer-events:auto;z-index:2;touch-action:none;display:grid;place-items:center;font:bold 20px Arial;cursor:nwse-resize}
 #mmvs-spatial-grab[hidden],#mmvs-spatial-handle[hidden],#mmvs-spatial-toolbar[hidden]{display:none!important}
 #mmvs-spatial-toolbar{position:fixed;z-index:2147483210;pointer-events:auto;touch-action:manipulation;padding:5px;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;align-items:center;direction:rtl;background:#071f19f7;border:1px solid #c8a06b;border-radius:12px;box-shadow:0 8px 30px #000a;max-width:calc(100vw - 12px);box-sizing:border-box}
 #mmvs-spatial-toolbar button{min-width:55px;flex:1 1 60px;white-space:normal;line-height:1.5;overflow:visible;padding:8px 4px;border:1px solid #497461;background:#174b39;color:#f0e5d2;border-radius:8px;font:11px Tahoma,Arial,sans-serif;cursor:pointer;touch-action:manipulation;min-height:38px}
 @media(max-width:400px){#mmvs-spatial-toolbar button{flex:1 1 30%;font-size:10px}}
 #mmvs-spatial-toolbar button:focus-visible{outline:2px solid #ffcb82}
 html.mmvs-spatial-on,html.mmvs-spatial-on body{touch-action:none!important;overscroll-behavior:none!important}
 html.mmvs-spatial-on .mf62-float,html.mmvs-spatial-on #p74-app .p74-decor,html.mmvs-spatial-on [data-mmvs-layer]{pointer-events:auto!important;cursor:grab!important}
 `;
 document.head.append(style);
 overlay=document.createElement('div');overlay.id='mmvs-spatial-outline';overlay.hidden=true;
 const grab=document.createElement('div');grab.id='mmvs-spatial-grab';grab.setAttribute('aria-label','کشیدن عنصر انتخاب‌شده');overlay.append(grab);
 handle=document.createElement('div');handle.id='mmvs-spatial-handle';handle.textContent='⤡';handle.title='بکش تا بزرگ یا کوچک شود';
 overlay.append(handle);document.body.append(overlay);
 toolbar=document.createElement('div');toolbar.id='mmvs-spatial-toolbar';toolbar.hidden=true;
 const actions=[['lock','قفل'],['hide','مخفی/حذف'],['front','جلوترین'],['back','عقب‌ترین'],['animation','✦ انیمیشن'],['reset','بازنشانی']];
 for(const [id,label] of actions){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.title=label;
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(selector)window.parent.postMessage({type:'MMVS_SPATIAL_ACTION',action:id,selector,slug},location.origin)});
  toolbarButtons[id]=b;toolbar.append(b);
 }
 document.body.append(toolbar);
 window.addEventListener('scroll',scheduleOutline,true);window.addEventListener('resize',scheduleOutline);
 if(typeof ResizeObserver==='function')new ResizeObserver(scheduleOutline).observe(document.documentElement);
 // Animated CSS transforms keep moving; reposition the editor outline periodically.
 setInterval(()=>{if(editing&&selected&&selected.isConnected)scheduleOutline()},120);
}
function update(p,report){
 const prev=entry(p.selector);
 const fixed={...prev,selector:p.selector,
  x:Math.round(clamp(p.x,-4000,4000)*10)/10,
  y:Math.round(clamp(p.y,-4000,4000)*10)/10,
  scale:Math.round(clamp(p.scale,.2,4)*1000)/1000};
 if(p.locked!==undefined)fixed.locked=!!p.locked;
 if(p.hidden!==undefined)fixed.hidden=!!p.hidden;
 if(p.zIndex!==undefined)fixed.zIndex=clamp(Math.round(p.zIndex),-1000,20000);
 if(p.opacity!==undefined)fixed.opacity=clamp(p.opacity,.05,1);
 if(p.animation!==undefined)fixed.animation=p.animation;
 const index=layout.items.findIndex(x=>x.selector===fixed.selector);
 if(index>=0)layout.items[index]=fixed;else if(layout.items.length<250)layout.items.push(fixed);else return;
 applyOne(fixed.selector);if(report)window.parent.postMessage({type:'MMVS_SPATIAL_COMMIT',item:fixed,slug},location.origin);
}
function points(){return [...active.values()]}
function begin(){
 const pts=points(),p=entry(selector);if(!pts.length)return;
 const mid=pts.length>=2?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:{x:pts[0].x,y:pts[0].y};
 gesture={x0:p.x,y0:p.y,s0:p.scale,startMid:mid,
  dist:pts.length>=2?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0,kind:pts[0].kind};
}
function move(){
 if(!gesture||!selector||entry(selector).locked)return;
 const pts=points();if(!pts.length)return;
 const mid=pts.length>=2?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:pts[0];
 let scale=gesture.s0;
 if(pts.length>=2&&gesture.dist>12)scale=clamp(gesture.s0*Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)/gesture.dist,.2,4);
 else if(pts[0].kind==='handle')scale=clamp(gesture.s0*(1+(mid.x-gesture.startMid.x+mid.y-gesture.startMid.y)/220),.2,4);
 let x=gesture.x0+mid.x-gesture.startMid.x,y=gesture.y0+mid.y-gesture.startMid.y;
 if(grid){x=Math.round(x/8)*8;y=Math.round(y/8)*8}
 const prev=entry(selector);if(Math.abs(prev.x-x)+Math.abs(prev.y-y)+Math.abs(prev.scale-scale)*200<.05)return;gestureChanged=true;
 update({selector,x,y,scale},false);
}
function pointerDown(e){
 if(!editing)return;
 if(e.target instanceof Element && e.target.closest('#mmvs-spatial-toolbar'))return;
 const fromHandle=e.target===handle;const fromGrab=e.target instanceof Element&&e.target.id==='mmvs-spatial-grab';
 let hit=targetForPoint(e);
 const s=(fromHandle||fromGrab||active.size)?selector:selectorOf(hit);if(!s)return;
 if(!fromHandle&&!fromGrab&&!active.size)activate(s,true);
 e.preventDefault();e.stopImmediatePropagation();
 if(entry(s).locked||entry(s).hidden)return;
 if(!active.size){gestureChanged=false;gestureStart={...entry(s)}}
 active.set(e.pointerId,{x:e.clientX,y:e.clientY,kind:fromHandle?'handle':'move'});
 try{document.documentElement.setPointerCapture(e.pointerId)}catch{}
 begin();
}
function pointerMove(e){
 if(!active.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();
 const p=active.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;move();
}
function pointerUp(e){
 if(!active.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();
 const result=entry(selector);active.delete(e.pointerId);
 try{if(document.documentElement.hasPointerCapture(e.pointerId))document.documentElement.releasePointerCapture(e.pointerId)}catch{}
 if(active.size)begin();else{gesture=null;if(gestureChanged){window.parent.postMessage({type:'MMVS_SPATIAL_COMMIT',item:result,slug},location.origin);reportOverlaps()}gestureChanged=false;gestureStart=null}
}
function setup(){
 if(preview){
  makeOverlay();document.addEventListener('pointerdown',pointerDown,true);
  document.addEventListener('pointermove',pointerMove,true);
  document.addEventListener('pointerup',pointerUp,true);
  document.addEventListener('pointercancel',pointerUp,true);
  window.addEventListener('message',e=>{
   if(e.origin!==location.origin||e.source!==window.parent||!e.data)return;
   const d=e.data;if(d.slug&&d.slug!==slug)return;
   if(d.type==='MMVS_SPATIAL_MODE'){
    editing=!!d.enabled;grid=!!d.grid;root.classList.toggle('mmvs-spatial-on',editing);
    if(!editing){active.clear();gesture=null;gestureChanged=false}
    scheduleOutline();
   }else if(d.type==='MMVS_SPATIAL_ANIMATION_PLAY'){
    animationsPlaying=!!d.playing;
    for(const a of animations.values()){try{animationsPlaying?a.effect.play():a.effect.pause()}catch(_e){}}
   }else if(d.type==='MMVS_SPATIAL_PREVIEW'){
    layout=safeLayout(d.layout);apply();if(selector)activate(selector,false);
   }else if(d.type==='MMVS_SPATIAL_PICK')activate(d.selector,false);
   else if(d.type==='MMVS_SPATIAL_SET'){
    if(d.item&&typeof d.item.selector==='string'){
     const next=safeLayout({items:[d.item]}).items[0];if(next){const i=layout.items.findIndex(x=>x.selector===next.selector);if(i>=0)layout.items[i]=next;else if(layout.items.length<250)layout.items.push(next);apply();activate(next.selector,false);sendVisuals();reportOverlaps()}
    }
   }else if(d.type==='MMVS_SPATIAL_CLEAR'){
    layout.items=layout.items.filter(x=>x.selector!==d.selector);apply();scheduleOutline();sendVisuals();reportOverlaps();
   }else if(d.type==='MMVS_SPATIAL_SCAN')sendVisuals();
   else if(d.type==='MMVS_SPATIAL_REVEAL')reveal(d.selector);
  });
  window.addEventListener('keydown',e=>{
   if(!editing||!selector||entry(selector).locked||e.altKey||e.ctrlKey||e.metaKey)return;
   if(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable]'))return;
   const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};const d=dirs[e.key];if(!d)return;
   e.preventDefault();e.stopPropagation();window.parent.postMessage({type:'MMVS_SPATIAL_ACTION',action:'nudge',selector,dx:d[0]*(e.shiftKey?10:1),dy:d[1]*(e.shiftKey?10:1),slug},location.origin);
  });
  window.parent.postMessage({type:'MMVS_SPATIAL_READY',slug},location.origin);
  scheduleVisuals();
  new MutationObserver(ms=>{
   if(ms.some(m=>Array.from(m.addedNodes||[]).some(x=>x.nodeType===1&&x.id!=='mmvs-spatial-outline'&&x.id!=='mmvs-spatial-toolbar')))scheduleVisuals();
  }).observe(document.body,{childList:true,subtree:true});
 }else{
  fetch('/public/mmvs/layout/'+encodeURIComponent(slug),{cache:'no-store'})
   .then(r=>r.ok?r.json():null).then(d=>{
    if(!d?.layout)return;
    layout=safeLayout(d.layout);apply();let pending=false;
    new MutationObserver(ms=>{
     if(pending||!ms.some(m=>m.addedNodes.length))return;
     pending=true;setTimeout(()=>{pending=false;apply()},120);
    }).observe(document.body,{subtree:true,childList:true});
   }).catch(()=>{});
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
