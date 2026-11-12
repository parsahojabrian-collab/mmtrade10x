/* MMVS_R98_SECTION_AND_PERMANENT_DELETE */
/* MMVS_R97_SECTION_BACKGROUNDS */
/* MMVS_R96_COPYTRADE_BACKDROP */
/* MMVS_R95_UNDERLAY_HOST_FIX */
/* MMVS_R94_LIBRARY_BACKMOST_LOCK_SCOPE */
/* MMVS_DRAG_ENGINE_R10 */
/* MMTrade10X Spatial Bridge R9: precise picking & non-destructive additive animations. */
/* MMVS_PAGE_BOUNDARY_R3 */
/* MMVS_PAGE_BOUNDARY_R2 */
(()=>{'use strict';if(window.__MMVS_SPATIAL_R4__)return;window.__MMVS_SPATIAL_R4__=true;
const query=new URLSearchParams(location.search),preview=query.get('visualPreview')==='1';
const path=location.pathname;const view=query.get('view');
 const mmvsIsEplanetPath=p=>
 p==='/miniapp/p74/eplanet'||
 p.startsWith('/miniapp/p74/eplanet/')||
 p==='/miniapp/marhale2'||
 p.startsWith('/miniapp/marhale2/');
const slug=mmvsIsEplanetPath(path)?'eplanet':path.includes('/learning/stage2')?'stage2':path.includes('/learning/')?'academy':path.includes('/profile/')?'profile':path.includes('/support/')?'support':path.includes('/crypto')?'crypto':path.includes('/copytrade-academy/')?'copytrade-academy':path.includes('/copy-trading')?'copy-trading':path.includes('/challenge')?'challenge':view==='academy'?'academy':view==='profile'?'profile':view==='mmtrade10x'?'mmtrade10x':'index';
const root=document.documentElement;
 if(preview)root.classList.add('mmvs-preview-editor');
Object.defineProperty(window,'__MMVS_SPATIAL_EDITING__',{configurable:true,get:()=>editing});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const safeLayout=l=>{
 const raw=Array.isArray(l?.items)?l.items:[];
 const boundary=mmvsIsEplanetPath(path)?null:raw.find(x=>x&&x.selector==='html'&&Number.isFinite(x.x)&&x.x>=200&&x.x<=4000);
 const items=raw.filter(x=>x&&typeof x.selector==='string'&&x.selector.length<=500&&Number.isFinite(x.x)&&Number.isFinite(x.y)&&Number.isFinite(x.scale)&&Math.abs(x.x)<=4000&&Math.abs(x.y)<=4000&&x.scale>=.2&&x.scale<=4&&
 (x.locked===undefined||typeof x.locked==='boolean')&&(x.hidden===undefined||typeof x.hidden==='boolean')&&
 (x.zIndex===undefined||(Number.isInteger(x.zIndex)&&x.zIndex>=-1000&&x.zIndex<=20000))&&
  (x.widthPx===undefined||(Number.isInteger(x.widthPx)&&x.widthPx>=24&&x.widthPx<=1600))&&
  (x.heightPx===undefined||(Number.isInteger(x.heightPx)&&x.heightPx>=16&&x.heightPx<=1600))&&
  (x.opacity===undefined||(Number.isFinite(x.opacity)&&x.opacity>=.05&&x.opacity<=1))&&
  (x.layerId===undefined||(typeof x.layerId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x.layerId)))&&
  (x.groupId===undefined||(typeof x.groupId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x.groupId)))&&
  (x.rank===undefined||(Number.isInteger(x.rank)&&x.rank>=1&&x.rank<=500))&&
  (x.renderPlane===undefined||x.renderPlane==='native'||x.renderPlane==='free')&&
  (x.sectionBackground===undefined||mmvsBgValid(x.sectionBackground))&&
  (x.animation===undefined||(x.animation&&['float','spin','sway','pulse'].includes(x.animation.kind)&&Number.isInteger(x.animation.durationMs)&&x.animation.durationMs>=400&&x.animation.durationMs<=30000&&Number.isFinite(x.animation.amplitude)&&x.animation.amplitude>=1&&x.animation.amplitude<=150&&Number.isInteger(x.animation.delayMs)&&x.animation.delayMs>=0&&x.animation.delayMs<=10000&&typeof x.animation.loop==='boolean'))).slice(0,500);
 const domMoves=(Array.isArray(l?.domMoves)?l.domMoves:[]).filter(x=>x&&typeof x.selector==='string'&&x.selector.length>0&&x.selector.length<=500&&typeof x.reference==='string'&&x.reference.length>0&&x.reference.length<=500&&['before','after','inside'].includes(x.placement)).slice(0,80);
 return {items,domMoves,boundary:boundary?Math.round(boundary.x):0};
};
const original=new Map();let layout={items:[]},selected=null,selector='',editing=false,grid=false,overlay=null,handle=null,toolbar=null,toolbarButtons={},active=new Map(),gesture=null,raf=0,gestureChanged=false,gestureStart=null,animationsPlaying=true;
const animations=new Map();
// MMVS_DOM_ORDER_R85: stable native DOM anchor registry; no HTML rewriting.
const mmvsDomAnchor=new Map(),mmvsDomOrigin=new WeakMap(),mmvsDomNative=new Map();
let mmvsDomSig=null,mmvsDomRenderedShape='';
function mmvsDomIdentity(el){
 if(!(el instanceof Element))return null;
 if(el.id){const id='#'+CSS.escape(el.id);if(document.querySelectorAll(id).length===1)return id}
 const parts=[];let node=el;
 while(node&&node instanceof Element&&parts.length<25){
  if(node.id){const id='#'+CSS.escape(node.id);if(document.querySelectorAll(id).length===1){parts.unshift(id);break}}
  const tag=node.tagName.toLowerCase();let i=1;for(let x=node.previousElementSibling;x;x=x.previousElementSibling)if(x.tagName===node.tagName)i++;
  parts.unshift(tag+':nth-of-type('+i+')');if(node===document.documentElement)break;node=node.parentElement;
 }
 const selector=parts.join(' > ');return selector.length<=500?selector:null;
}
function mmvsDomIndex(){
 if(!document.body)return;
 for(const [s,el] of mmvsDomAnchor)if(!el?.isConnected)mmvsDomAnchor.delete(s);
 for(const el of [document.documentElement,...document.querySelectorAll('*')].slice(0,6500)){
  if(mmvsDomOrigin.has(el))continue;
  const s=mmvsDomIdentity(el);if(!s)continue;
  mmvsDomOrigin.set(el,s);
  if(!mmvsDomAnchor.has(s)||!mmvsDomAnchor.get(s)?.isConnected)mmvsDomAnchor.set(s,el);
 }
}
function mmvsDomSafeNode(el){
 if(!(el instanceof Element)||!el.isConnected||el.matches('html,body,script,style,link,meta,noscript,template,head,title,#p74-app,#mf62-home,#mmvs-root,#app,#page-root,.home-shell,.stage-page,.stage-shell,.p74-scroll,.p74-page,[data-mmvs-app-root]'))return false;
 if(el.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-v2-image-plane,script,template,svg,canvas,[contenteditable="true"],[data-reactroot],[data-v-app],[ng-version]'))return false;
 if(el.tagName.includes('-')||el.matches('form,iframe,video,audio,dialog'))return false;
 return true;
}
function mmvsDomCapture(parent){if(parent&&!mmvsDomNative.has(parent))mmvsDomNative.set(parent,Array.from(parent.children))}
function mmvsDomShape(){
 const parts=[];
 for(const [parent] of mmvsDomNative){
  if(!parent.isConnected)continue;
  parts.push([...parent.children].map(n=>mmvsDomOrigin.get(n)||n.id||n.tagName).join('>'));
 }
 return parts.join('|');
}
function mmvsDomRestore(){
 for(const [parent,children] of mmvsDomNative){
  if(!parent.isConnected)continue;
  // Restore using reverse order and a stable successor; avoid unnecessary mutations.
  let after=null;
  for(let i=children.length-1;i>=0;i--){
    const node=children[i];if(!node.isConnected)continue;
    if(node.parentElement!==parent||(after&&node.nextElementSibling!==after))parent.insertBefore(node,after);
    after=node;
  }
 }
}
function mmvsDomApply(){
 const moves=Array.isArray(layout.domMoves)?layout.domMoves:[];
 const sig=JSON.stringify(moves);
 if(mmvsDomSig===sig&&mmvsDomRenderedShape===mmvsDomShape()&&[...mmvsDomAnchor.values()].every(el=>el?.isConnected))return;
 mmvsDomRestore();
 // Identity is captured before the first move; subsequent operations use the same nodes.
 mmvsDomIndex();
 for(const rule of moves){
  const a=get(rule.selector),b=get(rule.reference);
  if(!mmvsDomSafeNode(a)||!mmvsDomSafeNode(b)||a===b||a.contains(b))continue;
  const parent=rule.placement==='inside'?b:b.parentElement;
  if(!(parent instanceof Element)||a.contains(parent))continue;
  if(rule.placement==='inside'&&!b.matches('div,section,article,aside,header,footer,main,nav,ul,ol,li,figure,figcaption,blockquote,details'))continue;
  if(rule.placement==='inside'&&b.closest('form,[contenteditable="true"]'))continue;
  mmvsDomCapture(a.parentElement);mmvsDomCapture(parent);
  const next=rule.placement==='before'?b:rule.placement==='after'?b.nextSibling:null;
  if(a.parentElement!==parent||a.nextSibling!==next)parent.insertBefore(a,next);
 }
 mmvsDomSig=sig;mmvsDomRenderedShape=mmvsDomShape();
}
window.__MMVS_DOM_BASE_SELECTOR__=el=>mmvsDomOrigin.get(el)||mmvsDomIdentity(el);
window.__MMVS_DOM_GET__=s=>mmvsDomAnchor.get(s)?.isConnected?mmvsDomAnchor.get(s):get(s);

function get(s){if(typeof s!=='string'||s.length>500)return null;const anchor=mmvsDomAnchor.get(s);if(anchor?.isConnected)return anchor;try{return document.querySelector(s)}catch{return null}}
// MMVS_R11_SAFE_PICK: prohibit moving page roots and multi-child, viewport-sized layout wrappers.
function mmvsR11Unsafe(el){
 if(!(el instanceof Element))return true;
 if(el===document.body||el===document.documentElement)return true;
 if(el.matches?.('html,body,main,#app,#root,#page-root,#p74-app,#mf62-home,#mmvs-root,.home-shell,.stage-shell,.stage-page,[data-mmvs-app-root]'))return true;
 // A group spanning most of the viewport should be edited via its individual children.
 if(el.matches?.('.lesson-panel'))return false;
 if(el.children?.length>1&&!el.hasAttribute('data-mmvs-layer')){
  const r=el.getBoundingClientRect(),w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);
  if(r.width>=w*.87&&r.height>=h*.52)return true;
  if(el.children.length>3&&r.width*r.height>=w*h*.63)return true;
 }
 return false;
}
function eligible(el){if(mmvsR11Unsafe(el))return false;return el instanceof Element&&!protectedRoot(el)&&!el.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-overlay,#mmvs-v2-image-plane')&&!['HTML','BODY','SCRIPT','STYLE','LINK','META','TITLE','NOSCRIPT'].includes(el.tagName)}
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
const graphicSelector='img,svg,canvas,video,figure,.lesson-panel,[data-mmvs-layer],[class*="sphere"],[class*="globe"],[class*="planet"],[class*="earth"],[class*="decor"],[class*="float"],[class*="coin"],[class*="crown"],[class*="ring"],[class*="cube"],[class*="orb"],[class*="particle"],[class*="sculpt"],[class*="mountain"],[style*="background-image"], [style*="background:"]';
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
 if(el.matches?.('.lesson-panel'))return ['پنل درس','◈','glass'];
 if(el.hasAttribute('data-mmvs-layer'))return [el.getAttribute('data-mmvs-layer-label')||'لایه سفارشی','◈','custom'];
 return ['پس‌زمینه یا گروه گرافیکی','▦','background'];
}
function hasVisual(el){
 if(!eligible(el)||el.closest('#mmvs-managed-content,#mmvs-overlay'))return false;
 if(el.hasAttribute('data-mmvs-layer')||el.matches?.('.lesson-panel'))return true;
 const c=getComputedStyle(el),b=el.getBoundingClientRect();
 if(c.display==='none'||(c.visibility==='hidden'&&!el.dataset.mmvsSpatialHidden&&!el.dataset.mmvsV2Plane)||Number(c.opacity)<.05||b.width<5||b.height<5)return false;
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
  opacity:el.style.opacity,width:el.style.width,height:el.style.height,flex:el.style.flex
 });
 const old=original.get(el);
 // Individual CSS translate/scale properties don't overwrite animated transform keyframes.
 el.style.translate=p.x+'px '+p.y+'px';el.style.scale=String(p.scale);
 el.style.width=p.widthPx!==undefined?p.widthPx+'px':old.width;
 el.style.height=p.heightPx!==undefined?p.heightPx+'px':old.height;
 if(el.matches?.('.lesson-panel'))el.style.flex=(p.widthPx!==undefined||p.heightPx!==undefined)?'0 0 auto':old.flex;
 if(p.zIndex!==undefined){
  if(getComputedStyle(el).position==='static')el.style.position='relative';
  el.style.zIndex=String(p.zIndex);
 }else{el.style.zIndex=old.zIndex;el.style.position=old.position}
 el.style.opacity=p.opacity!==undefined?String(p.opacity):old.opacity;
 if(p.hidden&&!protectedRoot(el)){el.style.visibility='hidden';el.style.pointerEvents='none';el.dataset.mmvsSpatialHidden='1'}
 else{el.style.visibility=old.visibility;el.style.pointerEvents=old.pointerEvents;delete el.dataset.mmvsSpatialHidden}
 el.dataset.mmvsSpatial='1';
 if(p.locked){el.dataset.mmvsLocked='1';if(preview)el.style.removeProperty('outline')}else delete el.dataset.mmvsLocked;
 ensureAnimation(el,p);
}
function clearFor(el){
 stopAnimation(el);
 const o=original.get(el);if(!o)return;
 for(const k of ['translate','scale','visibility','pointerEvents','zIndex','position','opacity','width','height'])el.style[k]=o[k];
 delete el.dataset.mmvsSpatial;delete el.dataset.mmvsSpatialHidden;delete el.dataset.mmvsLocked;
 original.delete(el);
}
function applyOne(s){mmvsUnderlayRestore();mmvsV2Restore();const el=get(s);if(!eligible(el))return;const p=layout.items.find(x=>x.selector===s);if(p)styleFor(el,p);else clearFor(el);mmvsV2Sync();mmvsUnderlaySync();scheduleOutline()}
// MMVS_HOME_BOUNDARY_R13: document-flow clipping and fixed P74 home support.
const boundaryOriginal={html:null,body:null};
 const mmvsEplanetNativeScroll=mmvsIsEplanetPath(path);
let boundaryFrame=0;
function mmvsBoundaryRemember(el,props){
 const original={};
 for(const key of props)original[key]=[el.style.getPropertyValue(key),el.style.getPropertyPriority(key)];
 return original;
}
function mmvsBoundaryRestore(el,original){
 if(!original)return;
 for(const [key,value] of Object.entries(original)){
  if(value[0])el.style.setProperty(key,value[0],value[1]);
  else el.style.removeProperty(key);
 }
}
// MMVS_HOME_BOUNDARY_R13: P74 home is fixed; its scroll is #p74-app .p74-scroll.
// Clip the *stage* without resizing it, so percentage-positioned steps stay put.
// Do not reparent the stage: that would break stored CSS selectors in the editor.
const mmvsHomeOriginal=new WeakMap();
function mmvsHomeNodes(){
 const scroller=document.querySelector('#p74-app > .p74-scroll');
 const stage=scroller?.querySelector(':scope > .p74-page');
 return scroller&&stage?{scroller,stage}:null;
}
function mmvsHomeScrollLimit(){
 const h=Number(layout.boundary)||0;
 const nodes=mmvsHomeNodes();
 if(!nodes||h<200||h>4000)return;
 const full=nodes.stage.getBoundingClientRect().height||nodes.stage.offsetHeight||0;
 const last=Math.max(0,Math.min(h,full)-nodes.scroller.clientHeight);
 if(nodes.scroller.scrollTop>last+1)nodes.scroller.scrollTop=last;
}
function mmvsHomeApply(h){
 const nodes=mmvsHomeNodes();
 if(!nodes)return false;
 const stage=nodes.stage;
 if(!mmvsHomeOriginal.has(stage))mmvsHomeOriginal.set(stage,mmvsBoundaryRemember(stage,['clip-path','-webkit-clip-path']));
 if(h>=200&&h<=4000){
  const full=stage.getBoundingClientRect().height||stage.offsetHeight||0;
  const trim=Math.max(0,Math.ceil(full-h));
  const cut='inset(0px 0px '+trim+'px 0px)';
  stage.style.setProperty('clip-path',cut,'important');
  stage.style.setProperty('-webkit-clip-path',cut,'important');
  mmvsHomeScrollLimit();
 }else{
  mmvsBoundaryRestore(stage,mmvsHomeOriginal.get(stage));
 }
 return true;
}
// A newly rendered P74 root is created after the bridge is initialized.
// Watch only added home roots/scrollers, never style changes (no observer loop).
function mmvsHomeWatch(){
 const observer=new MutationObserver(records=>{
  if(records.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(
   n.matches?.('#p74-app,.p74-scroll,.p74-page')||n.querySelector?.('.p74-scroll,.p74-page')
  ))))applyBoundary();
 });
 observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mmvsHomeWatch,{once:true});
else mmvsHomeWatch();
document.addEventListener('scroll',e=>{
 if(e.target instanceof Element&&e.target.matches('#p74-app > .p74-scroll'))mmvsHomeScrollLimit();
},true);

function mmvsBoundaryLimitScroll(){
 if(mmvsEplanetNativeScroll)return;
 const h=Number(layout.boundary)||0;
 if(mmvsHomeNodes()){mmvsHomeScrollLimit();return;}
 if(h<200||h>4000)return;
 // Out-of-flow visual effects may extend document.scrollHeight. Clamp them too.
 const maxY=Math.max(0,h-window.innerHeight);
 const y=window.scrollY||document.documentElement.scrollTop||0;
 if(y>maxY+1)window.scrollTo(0,maxY);
}
function applyBoundary(){
 // MMVS_RESTORE_R1: disable forced page boundaries.
 return;

 if(boundaryFrame)cancelAnimationFrame(boundaryFrame);
 boundaryFrame=requestAnimationFrame(()=>{
  boundaryFrame=0;
  const body=document.body;
  if(!body)return;
  if(!boundaryOriginal.html)boundaryOriginal.html=mmvsBoundaryRemember(root,['overflow','overflow-y']);
  if(!boundaryOriginal.body)boundaryOriginal.body=mmvsBoundaryRemember(body,['overflow','min-height','max-height']);
    if(mmvsEplanetNativeScroll){
     mmvsBoundaryRestore(root,boundaryOriginal.html);
     mmvsBoundaryRestore(body,boundaryOriginal.body);
     return;
    }
  const h=Number(layout.boundary)||0;
  if(mmvsHomeApply(h)){
   // P74 owns the viewport and scroll container. Leave document flow untouched.
   mmvsBoundaryRestore(root,boundaryOriginal.html);
   mmvsBoundaryRestore(body,boundaryOriginal.body);
   return;
  }
  if(h>=200&&h<=4000){
   // Body overflow:clip removes content past the boundary from page scrolling;
   // overflow-y:auto on the root keeps the portion above the boundary scrollable.
   root.style.setProperty('overflow-y','auto','important');
   body.style.setProperty('min-height','0px','important');
   body.style.setProperty('max-height',h+'px','important');
   body.style.setProperty('overflow',CSS.supports('overflow','clip')?'clip':'hidden','important');
   mmvsBoundaryLimitScroll();
  }else{
   mmvsBoundaryRestore(root,boundaryOriginal.html);
   mmvsBoundaryRestore(body,boundaryOriginal.body);
  }
 });
}
window.addEventListener('scroll',mmvsBoundaryLimitScroll,{passive:true});
window.addEventListener('resize',()=>{applyBoundary();mmvsBoundaryLimitScroll()},{passive:true});

// MMVS_R92_LIBRARY_UNDERLAY: library decoration rendered as page-host background,
// rather than a high-z-index portal or reparented interactive DOM node.
const mmvsUnderlaySource=new Map(),mmvsUnderlayHosts=new Map(),mmvsUnderlayPointers=new Map();
const mmvsUnderlayChrome=new Map();
let mmvsUnderlayFrame=0,mmvsUnderlayFailure='';
const mmvsUnderlayKey='mmvs_underlay';
function mmvsUnderlayRestore(){
 for(const [host,props] of mmvsUnderlayHosts){
  if(!host.isConnected)continue;
  for(const [prop,save] of Object.entries(props)){
   if(save[0])host.style.setProperty(prop,save[0],save[1]);
   else host.style.removeProperty(prop);
  }
 }
 mmvsUnderlayHosts.clear();
 for(const [el,old] of mmvsUnderlayPointers){
  if(!el.isConnected)continue;
  if(old[0])el.style.setProperty('pointer-events',old[0],old[1]);
  else el.style.removeProperty('pointer-events');
 }
 mmvsUnderlayPointers.clear();
 for(const [el,old] of mmvsUnderlaySource){
  if(!el.isConnected)continue;
  if(old[0])el.style.setProperty('visibility',old[0],old[1]);
  else el.style.removeProperty('visibility');
 }
 mmvsUnderlaySource.clear();
 for(const [el,props] of mmvsUnderlayChrome){
  if(!el.isConnected)continue;
  for(const [prop,old] of Object.entries(props)){
   if(old[0])el.style.setProperty(prop,old[0],old[1]);
   else el.style.removeProperty(prop);
  }
 }
 mmvsUnderlayChrome.clear();

}
// MMVS_R96_COPYTRADE_BACKDROP: choose actual native content roots, not a single guessed host.
// A background on its own root paints above that root's background but beneath descendants.
function mmvsUnderlayHostsFor(el){
 const r=el.getBoundingClientRect();
 if(r.width<8||r.height<8)return [];
 const nativeRootSelectors='#p74-app .p74-page,#p74-app .p74-stage,#p74-app,.p74-stage,.p74-page,main.stage,main.home-shell,main#app,main,.stage-page,.stage-shell,#app,#page-root,.copytrade-page,.copytrade-stage,.copy-trading-page,[data-mmvs-page-root],[data-page-root]';
 const rootSet=new Set(document.querySelectorAll(nativeRootSelectors));
 // Include large native ancestors of objects underneath the managed artwork.
 for(const [rx,ry] of [[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){
  const x=r.left+r.width*rx,y=r.top+r.height*ry;
  if(x<0||x>innerWidth||y<0||y>innerHeight)continue;
  for(const n of document.elementsFromPoint(x,y)){
   if(n.closest('#mmvs-managed-content,#mmvs-spatial-toolbar,#mmvs-spatial-outline,#mmvs-v2-image-plane'))continue;
   let p=n;
   while(p&&p!==document.body){
    if(p.matches?.(nativeRootSelectors))rootSet.add(p);
    p=p.parentElement;
   }
   break;
  }
 }
 const ranked=[];
 for(const h of rootSet){
  if(!h?.isConnected||h.contains(el)||h.closest('#mmvs-managed-content'))continue;
  const b=h.getBoundingClientRect(),cs=getComputedStyle(h);
  if(b.width<120||b.height<120||cs.display==='none'||cs.visibility==='hidden')continue;
  const ox=Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left));
  const oy=Math.max(0,Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top));
  const share=ox*oy/Math.max(1,r.width*r.height);
  if(share<.22)continue;
  // Prefer page artboards to wrappers, but paint on both when the foreground
  // stage has its own opaque background that would cover its parent's background.
  const depth=(()=>{let n=0,p=h;while((p=p.parentElement)&&n<30)n++;return n})();
  const priority=h.matches('.p74-stage,.p74-page,main.stage,.stage-page,.stage-shell,.copytrade-stage,.copytrade-page')?5:h.matches('main,main#app,#app,#p74-app,#page-root')?3:0;
  ranked.push({h,share,score:share*10+priority+depth*.08});
 }
 ranked.sort((a,b)=>b.score-a.score);
 // Draw in at most three substantial native artboards, all aligned to the same
 // screen coordinates. Never use body: it is often concealed by a solid page shell.
 return ranked.slice(0,3).map(x=>x.h);
}


function mmvsUnderlayFailureNotice(selector){
 if(!preview||mmvsUnderlayFailure===selector)return;
 mmvsUnderlayFailure=selector;
 window.parent.postMessage({type:'MMVS_UNDERLAY_UNAVAILABLE',selector,slug},location.origin);
}
function mmvsUnderlaySync(){
 mmvsUnderlayRestore();
 mmvsUnderlayFailure='';
 const layers=layout.items.filter(x=>x.layerId===mmvsUnderlayKey&&!x.hidden&&x.renderPlane!=='free');
 const byHost=new Map(),painted=new Set();
 for(const item of layers){
  const el=get(item.selector);
  if(!el||el.tagName!=='IMG'||!el.matches('#mmvs-managed-content .mmvs-c-block > img, #mmvs-managed-content .mmvs-c-image > img')||!el.isConnected)continue;
  if(!el.complete||!el.naturalWidth){el.addEventListener('load',mmvsUnderlaySchedule,{once:true});continue}
  if(el.getAnimations?.().length||item.animation){mmvsUnderlayFailureNotice(item.selector);continue}
  const hosts=mmvsUnderlayHostsFor(el);
  if(!hosts.length){mmvsUnderlayFailureNotice(item.selector);continue}
  const b=el.getBoundingClientRect();
  const url=el.currentSrc||el.src;
  if(!/^https?:\/\//.test(url)&&!url.startsWith(location.origin+'/')){mmvsUnderlayFailureNotice(item.selector);continue}
  for(const host of hosts){
   const h=host.getBoundingClientRect();
   const sx=host.offsetWidth>0?h.width/host.offsetWidth:1;
   const sy=host.offsetHeight>0?h.height/host.offsetHeight:1;
   if(!(sx>0&&sy>0&&Number.isFinite(sx)&&Number.isFinite(sy)))continue;
   const left=(b.left-h.left)/sx+host.scrollLeft-host.clientLeft;
   const top=(b.top-h.top)/sy+host.scrollTop-host.clientTop;
   const width=b.width/sx,height=b.height/sy;
   if(width<8||height<8||!Number.isFinite(left+top+width+height))continue;
   const rule={item,el,url,left,top,width,height};
   if(!byHost.has(host))byHost.set(host,[]);
   byHost.get(host).push(rule);
  }
 }
 for(const [host,rules] of byHost){
  const props={};
  for(const prop of ['background-image','background-position','background-size','background-repeat','background-attachment'])
   props[prop]=[host.style.getPropertyValue(prop),host.style.getPropertyPriority(prop)];
  const computed=getComputedStyle(host);
  const order=[...rules].sort((a,b)=>(b.item.rank??1)-(a.item.rank??1));
  const urls=order.map(x=>'url('+JSON.stringify(x.url)+')');
  const pos=order.map(x=>x.left.toFixed(2)+'px '+x.top.toFixed(2)+'px');
  const sizes=order.map(x=>x.width.toFixed(2)+'px '+x.height.toFixed(2)+'px');
  const existing=computed.backgroundImage==='none'?'':','+computed.backgroundImage;
  host.style.setProperty('background-image',urls.join(',')+existing,'important');
  host.style.setProperty('background-position',pos.join(',')+','+computed.backgroundPosition,'important');
  host.style.setProperty('background-size',sizes.join(',')+','+computed.backgroundSize,'important');
  host.style.setProperty('background-repeat',order.map(()=> 'no-repeat').join(',')+','+computed.backgroundRepeat,'important');
  host.style.setProperty('background-attachment',order.map(()=> 'scroll').join(',')+','+computed.backgroundAttachment,'important');
  mmvsUnderlayHosts.set(host,props);
  for(const rule of order)painted.add(rule.el);
 }
 // Do not make the original image disappear unless a native page host was painted.
 for(const item of layers){
  const el=get(item.selector);
  if(!painted.has(el))continue;
  const wrapper=el.parentElement;
  const hideNode=wrapper?.matches('.mmvs-c-block,.mmvs-c-image')&&wrapper.children.length===1?wrapper:el;
  if(!mmvsUnderlaySource.has(hideNode)){
   mmvsUnderlaySource.set(hideNode,[hideNode.style.getPropertyValue('visibility'),hideNode.style.getPropertyPriority('visibility')]);
   hideNode.style.setProperty('visibility','hidden','important');
  }
  for(const node of [el,wrapper]){
   if(!node||mmvsUnderlayPointers.has(node))continue;
   mmvsUnderlayPointers.set(node,[node.style.getPropertyValue('pointer-events'),node.style.getPropertyPriority('pointer-events')]);
   node.style.setProperty('pointer-events','none','important');
  }
  window.parent.postMessage({type:'MMVS_UNDERLAY_APPLIED',selector:item.selector,slug},location.origin);
 }
 // The managed-content panel has its own painted backdrop. When it contains
 // only underlaid image blocks, that backdrop must not remain over the page.
 const panel=document.querySelector('#mmvs-managed-content');
 if(panel){
  const blocks=[...panel.children].filter(x=>x.classList?.contains('mmvs-c-block'));
  const onlyImages=blocks.length>0&&blocks.length===panel.children.length&&
   blocks.every(b=>b.childElementCount===1&&b.firstElementChild?.tagName==='IMG'&&painted.has(b.firstElementChild));
  if(onlyImages){
   const props={};
   for(const prop of ['background','border','border-color','box-shadow','pointer-events'])
    props[prop]=[panel.style.getPropertyValue(prop),panel.style.getPropertyPriority(prop)];
   mmvsUnderlayChrome.set(panel,props);
   panel.style.setProperty('background','transparent','important');
   panel.style.setProperty('border','0','important');
   panel.style.setProperty('box-shadow','none','important');
   panel.style.setProperty('pointer-events','none','important');
  }
 }
}


function mmvsUnderlaySchedule(){
 if(mmvsUnderlayFrame)return;
 mmvsUnderlayFrame=requestAnimationFrame(()=>{mmvsUnderlayFrame=0;mmvsUnderlaySync()});
}
window.addEventListener('scroll',()=>{if(mmvsUnderlaySource.size)mmvsUnderlaySchedule()},{passive:true,capture:true});
window.addEventListener('resize',()=>{if(mmvsUnderlaySource.size)mmvsUnderlaySchedule()},{passive:true});

// MMVS_LAYER_V2_PILOT: opt-in visual-only portal for static decorative IMG elements.
// A cloned image is painted in a common *top* plane, without moving the real DOM node.
// This does not make interactive / animated / transformed elements globally reorderable.
const mmvsV2Nodes=new Map();
let mmvsV2Host=null,mmvsV2Raf=0;
function mmvsV2HostNode(){
 if(mmvsV2Host?.isConnected)return mmvsV2Host;
 const e=document.createElement('div');e.id='mmvs-v2-image-plane';e.setAttribute('aria-hidden','true');
 e.style.cssText='position:fixed!important;inset:0!important;width:0!important;height:0!important;overflow:visible!important;pointer-events:none!important;z-index:2140000000!important;isolation:isolate!important';
 document.body.append(e);mmvsV2Host=e;return e;
}
function mmvsV2Allowed(el){
 if(!(el instanceof HTMLImageElement)||!eligible(el)||!el.isConnected)return false;
 if(el.closest('a,button,form,label,[role="button"],[contenteditable="true"]'))return false;
 const s=getComputedStyle(el),r=el.getBoundingClientRect();
 if(s.display==='none'||s.visibility==='hidden'||s.position==='fixed'||s.position==='sticky'||r.width<8||r.height<8||r.width>innerWidth*.9||r.height>innerHeight*2)return false;
 if((s.transform&&s.transform!=='none')||(s.rotate&&s.rotate!=='none')||
  (s.scale&&s.scale!=='none'&&s.scale!=='1')||(s.filter&&s.filter!=='none'&&s.filter!=='blur(0px)')||
  (s.mixBlendMode&&s.mixBlendMode!=='normal')||(s.clipPath&&s.clipPath!=='none'))return false;
 if(el.getAnimations?.().length)return false;
 for(let p=el.parentElement;p&&p!==document.documentElement;p=p.parentElement){
  const a=getComputedStyle(p);
  if(Number(a.opacity)<1||(a.filter&&a.filter!=='none')||(a.mixBlendMode&&a.mixBlendMode!=='normal')||(a.clipPath&&a.clipPath!=='none')||p.getAnimations?.().length)return false;
  if(a.transform&&a.transform!=='none'&&/matrix\(([^)]+)\)/.test(a.transform)){
   const m=a.transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
   if(m.length===6&&(Math.abs(m[1])>.001||Math.abs(m[2])>.001))return false;
  }
 }
 return true;
}
function mmvsV2Restore(){
 for(const [el,data] of mmvsV2Nodes){
  if(data.previousVisibility)el.style.setProperty('visibility',data.previousVisibility,data.previousPriority);
  else el.style.removeProperty('visibility');
  data.clone.remove();delete el.dataset.mmvsV2Plane;
 }
 mmvsV2Nodes.clear();
 if(mmvsV2Host){mmvsV2Host.remove();mmvsV2Host=null}
}
function mmvsV2Clip(el,rect){
 let left=0,top=0,right=innerWidth,bottom=innerHeight;
 for(let p=el.parentElement;p;p=p.parentElement){
  const s=getComputedStyle(p);
  if(/(?:hidden|scroll|auto|clip)/.test(`${s.overflowX} ${s.overflowY}`)){
   const r=p.getBoundingClientRect();left=Math.max(left,r.left);top=Math.max(top,r.top);
   right=Math.min(right,r.right);bottom=Math.min(bottom,r.bottom);
  }
 }
 const t=Math.max(0,top-rect.top),l=Math.max(0,left-rect.left),b=Math.max(0,rect.bottom-bottom),r=Math.max(0,rect.right-right);
 return `inset(${t}px ${r}px ${b}px ${l}px)`;
}
function mmvsV2Paint(){
 if(!mmvsV2Nodes.size)return;
 for(const [el,data] of [...mmvsV2Nodes]){
  if(!el.isConnected){data.clone.remove();mmvsV2Nodes.delete(el);continue}
  const item=layout.items.find(x=>x.selector===data.selector);
  if(!item||item.renderPlane!=='free'||item.hidden){mmvsV2Sync();return}
  const rect=el.getBoundingClientRect(),s=getComputedStyle(el);
  const c=data.clone;
  // Source is visibility:hidden during overlay rendering; size remains in normal flow.
  const url=el.currentSrc||el.src;if(c.src!==url)c.src=url;
  c.style.left=rect.left+'px';c.style.top=rect.top+'px';
  c.style.width=rect.width+'px';c.style.height=rect.height+'px';
  c.style.objectFit=s.objectFit;c.style.objectPosition=s.objectPosition;
  c.style.borderRadius=s.borderRadius;c.style.boxShadow=s.boxShadow;
  c.style.opacity=s.opacity;c.style.zIndex=String(item.rank??1);
  c.style.clipPath=mmvsV2Clip(el,rect);
 }
}
function mmvsV2Schedule(){if(mmvsV2Raf)return;mmvsV2Raf=requestAnimationFrame(()=>{mmvsV2Raf=0;mmvsV2Paint()})}
function mmvsV2Sync(){
 mmvsV2Restore();
 const wanted=layout.items.filter(x=>x.renderPlane==='free'&&!x.hidden);
 if(!wanted.length)return;
 for(const item of wanted){
  const el=get(item.selector);
  if(!mmvsV2Allowed(el))continue;
  const c=document.createElement('img');c.dataset.mmvsV2Image='1';c.alt='';c.draggable=false;c.decoding='async';
  c.style.cssText='position:fixed!important;pointer-events:none!important;display:block!important;margin:0!important;padding:0!important;border:0!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;animation:none!important;transition:none!important;box-sizing:border-box!important';
  mmvsV2HostNode().append(c);
  const v=el.style.getPropertyValue('visibility'),pr=el.style.getPropertyPriority('visibility');
  mmvsV2Nodes.set(el,{selector:item.selector,clone:c,previousVisibility:v,previousPriority:pr});
  el.dataset.mmvsV2Plane='1';
  el.style.setProperty('visibility','hidden','important');
 }
 mmvsV2Paint();
}
window.addEventListener('scroll',mmvsV2Schedule,true);
window.addEventListener('resize',mmvsV2Schedule,{passive:true});
// MMVS_R97_SECTION_BACKGROUNDS — draw directly on target sections, beneath children.
const mmvsBgOriginals=new Map(),mmvsBgHiddenSources=new Map(),mmvsBgHiddenContainers=new Map();
function mmvsBgRestore(){
 for(const [node,props] of mmvsBgOriginals){
  if(!node.isConnected)continue;
  for(const [prop,old] of Object.entries(props)){
   if(old[0])node.style.setProperty(prop,old[0],old[1]);
   else node.style.removeProperty(prop);
  }
 }
 mmvsBgOriginals.clear();
 for(const [node,old] of mmvsBgHiddenSources){
  if(!node.isConnected)continue;
  if(old[0])node.style.setProperty('display',old[0],old[1]);
  else node.style.removeProperty('display');
 }
 mmvsBgHiddenSources.clear();
 for(const [node,old] of mmvsBgHiddenContainers){
  if(!node.isConnected)continue;
  if(old[0])node.style.setProperty('display',old[0],old[1]);
  else node.style.removeProperty('display');
 }
 mmvsBgHiddenContainers.clear();
}

function mmvsBgValidUrl(url){
 if(typeof url!=='string'||!url||url.length>2048||
   url.startsWith('//')||
   !/\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i.test(url))return false;
 try{
  const u=new URL(url,location.origin);
  return u.protocol==='https:'||
    (u.protocol==='http:'&&u.origin===location.origin);
 }catch{return false}
}
function mmvsBgValidStop(stop){
 return !!stop&&/^#[0-9a-f]{6}$/i.test(stop.color||'')&&
  Number.isFinite(stop.at)&&stop.at>=0&&stop.at<=100&&
  (stop.alpha===undefined||
   (Number.isFinite(stop.alpha)&&stop.alpha>=0&&stop.alpha<=1));
}
function mmvsBgValidLayer(layer){
 if(!layer||
   !/^bg-[A-Za-z0-9_-]{1,80}$/.test(layer.id||'')||
   typeof layer.enabled!=='boolean'||
   !Number.isFinite(layer.opacity)||layer.opacity<0||layer.opacity>1||
   !Number.isFinite(layer.blur)||layer.blur<0||layer.blur>30||
   !['normal','screen','multiply','overlay','soft-light'].includes(layer.blend)
 )return false;

 if(layer.type==='solid')
  return /^#[0-9a-f]{6}$/i.test(layer.color||'');

 const validStops=Array.isArray(layer.stops)&&
  layer.stops.length>=2&&layer.stops.length<=5&&
  layer.stops.every(mmvsBgValidStop);

 if(layer.type==='linear')
  return Number.isFinite(layer.angle)&&
   layer.angle>=0&&layer.angle<=360&&validStops;

 if(layer.type==='radial')
  return Number.isFinite(layer.centerX)&&layer.centerX>=0&&layer.centerX<=100&&
   Number.isFinite(layer.centerY)&&layer.centerY>=0&&layer.centerY<=100&&
   (layer.shape===undefined||['circle','ellipse'].includes(layer.shape))&&validStops;

 if(layer.type==='image')
  return mmvsBgValidUrl(layer.url)&&
   ['cover','contain','fill'].includes(layer.fit)&&
   Number.isFinite(layer.positionX)&&layer.positionX>=0&&layer.positionX<=100&&
   Number.isFinite(layer.positionY)&&layer.positionY>=0&&layer.positionY<=100;

 return false;
}
function mmvsBgValid(entry){
 if(!entry||typeof entry!=='object')return false;

 const legacy=
  entry.url!==undefined&&entry.fit!==undefined&&
  entry.position!==undefined&&entry.dim!==undefined&&
  mmvsBgValidUrl(entry.url)&&
  ['cover','contain'].includes(entry.fit)&&
  ['center','top','bottom'].includes(entry.position)&&
  Number.isFinite(entry.dim)&&entry.dim>=0&&entry.dim<=.8;

 const layered=Array.isArray(entry.layers)&&
  entry.layers.length>=1&&entry.layers.length<=8&&
  entry.layers.every(mmvsBgValidLayer);

 if(entry.url!==undefined&&!mmvsBgValidUrl(entry.url))return false;
 if(entry.fit!==undefined&&!['cover','contain'].includes(entry.fit))return false;
 if(entry.position!==undefined&&!['center','top','bottom'].includes(entry.position))return false;
 if(entry.dim!==undefined&&
   (!Number.isFinite(entry.dim)||entry.dim<0||entry.dim>.8))return false;

 if(entry.sourceSelector!==undefined&&
   (typeof entry.sourceSelector!=='string'||
    !entry.sourceSelector.length||entry.sourceSelector.length>500))return false;

 return legacy||layered;
}

// MMVS_R98_SECTION_BACKDROP: a child layer inside the selected section;
// independent of the global CSS z-index and the managed-content sibling.
const mmvsR98Layers=new Map();
function mmvsR98RestoreLayers(){
 for(const [host,record] of mmvsR98Layers){
   record.layer.remove();
   for(const [node,styles] of record.children){
     if(!node.isConnected)continue;
     for(const [prop,old] of Object.entries(styles)){
       if(old[0])node.style.setProperty(prop,old[0],old[1]);
       else node.style.removeProperty(prop);
     }
   }
 }
 mmvsR98Layers.clear();
}

function mmvsBgStopCss(stop){
 const hex=stop.color.slice(1);
 const r=parseInt(hex.slice(0,2),16);
 const g=parseInt(hex.slice(2,4),16);
 const b=parseInt(hex.slice(4,6),16);
 const alpha=stop.alpha===undefined?1:stop.alpha;
 return `rgba(${r},${g},${b},${alpha}) ${stop.at}%`;
}

function mmvsBgMakeLayer(layer,index){
 const node=document.createElement('div');
 node.className='mmvs-r98-section-backdrop-layer';
 node.setAttribute('aria-hidden','true');

 node.style.cssText=
  'position:absolute!important;inset:0!important;' +
  'display:block!important;pointer-events:none!important;' +
  `z-index:${index}!important;` +
  'background-repeat:no-repeat!important;';

 node.style.opacity=String(layer.opacity);
 node.style.filter=layer.blur>0?`blur(${layer.blur}px)`:'none';
 node.style.mixBlendMode=layer.blend;

 if(layer.type==='solid'){
  node.style.backgroundColor=layer.color;
 }

 else if(layer.type==='linear'){
  const stops=layer.stops.map(mmvsBgStopCss).join(',');
  node.style.backgroundImage=`linear-gradient(${layer.angle}deg,${stops})`;
 }

 else if(layer.type==='radial'){
  const stops=layer.stops.map(mmvsBgStopCss).join(',');
  const shape=layer.shape||'ellipse';
  node.style.backgroundImage=
   `radial-gradient(${shape} at ${layer.centerX}% ${layer.centerY}%,${stops})`;
 }

 else if(layer.type==='image'){
  const url=new URL(layer.url,location.origin);
  node.style.backgroundImage=`url("${url.href}")`;
  node.style.backgroundSize=
   layer.fit==='fill'?'100% 100%':layer.fit;
  node.style.backgroundPosition=
   `${layer.positionX}% ${layer.positionY}%`;
 }

 return node;
}

function mmvsBgSync(){
 mmvsBgRestore();
 mmvsR98RestoreLayers();

 for(const item of layout.items){
  const bg=item.sectionBackground;
  if(!mmvsBgValid(bg))continue;

  const target=get(item.selector);

  if(!(target instanceof Element)||!target.isConnected||
    target.matches('html,body,head,script,style,button,input,textarea,select,svg,canvas')||
    target.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-managed-content,#mmvs-v2-image-plane'))continue;

  const host=document.createElement('div');
  host.className='mmvs-r98-section-backdrop';
  host.setAttribute('aria-hidden','true');

  host.style.cssText=
   'position:absolute!important;inset:0!important;' +
   'display:block!important;pointer-events:none!important;' +
   'z-index:0!important;overflow:hidden!important;' +
   'border-radius:inherit!important;';

  let imageSource=null;

  if(Array.isArray(bg.layers)){
   bg.layers.forEach((layer,index)=>{
    if(!layer.enabled)return;

    const node=mmvsBgMakeLayer(layer,index);
    host.append(node);

    if(!imageSource&&layer.type==='image')
     imageSource=layer.url;
   });
  }else{
   const node=document.createElement('div');
   node.className='mmvs-r98-section-backdrop-layer';
   node.setAttribute('aria-hidden','true');

   const u=new URL(bg.url,location.origin);
   const dim=Number(bg.dim).toFixed(2);

   node.style.cssText=
    'position:absolute!important;inset:0!important;' +
    'display:block!important;pointer-events:none!important;' +
    'z-index:0!important;overflow:hidden!important;' +
    'background-image:linear-gradient(rgba(0,0,0,'+
    dim+'),rgba(0,0,0,'+dim+')),url('+JSON.stringify(u.href)+')!important;' +
    'background-position:'+bg.position+'!important;' +
    'background-size:cover,'+bg.fit+'!important;' +
    'background-repeat:no-repeat,no-repeat!important;';

   host.append(node);
   imageSource=bg.url;
  }

  // Disabled layers mean no visible backdrop is needed.
  if(!host.childNodes.length)continue;

  const props={};
  for(const p of ['position','isolation']){
   props[p]=[
    target.style.getPropertyValue(p),
    target.style.getPropertyPriority(p)
   ];
  }

  mmvsBgOriginals.set(target,props);

  if(getComputedStyle(target).position==='static')
   target.style.setProperty('position','relative','important');

  target.style.setProperty('isolation','isolate','important');

  const children=[];

  for(const child of [...target.children]){
   if(child.matches('script,style,link,template'))continue;

   const st=getComputedStyle(child);
   const styles={};

   if(st.position==='static'){
    styles.position=[
     child.style.getPropertyValue('position'),
     child.style.getPropertyPriority('position')
    ];
    child.style.setProperty('position','relative','important');
   }

   if(st.zIndex==='auto'||Number(st.zIndex)<=0){
    styles['z-index']=[
     child.style.getPropertyValue('z-index'),
     child.style.getPropertyPriority('z-index')
    ];
    child.style.setProperty('z-index','1','important');
   }

   if(Object.keys(styles).length)
    children.push([child,styles]);
  }

  target.insertBefore(host,target.firstChild);
  mmvsR98Layers.set(target,{layer:host,children});

  // Preserve the existing library-image-to-background behavior.
  const source=typeof bg.sourceSelector==='string'
   ?get(bg.sourceSelector):null;

  if(imageSource&&source?.matches?.(
   '#mmvs-managed-content .mmvs-c-block > img,'+
   '#mmvs-managed-content .mmvs-c-image > img'
  )){
   const wrapper=source.closest('.mmvs-c-block');
   const test=new Image();

   test.onload=()=>{
    if(mmvsR98Layers.get(target)?.layer!==host||
       !wrapper?.isConnected)return;

    if(!mmvsBgHiddenSources.has(wrapper)){
     mmvsBgHiddenSources.set(wrapper,[
      wrapper.style.getPropertyValue('display'),
      wrapper.style.getPropertyPriority('display')
     ]);
    }

    wrapper.style.setProperty('display','none','important');

    const managed=document.getElementById('mmvs-managed-content');

    if(managed){
     const kids=[...managed.children];

     if(kids.length&&kids.every(
      n=>getComputedStyle(n).display==='none'
     )){
      mmvsBgHiddenContainers.set(managed,[
       managed.style.getPropertyValue('display'),
       managed.style.getPropertyPriority('display')
      ]);
      managed.style.setProperty('display','none','important');
     }
    }
   };

   test.onerror=()=>{
    window.parent?.postMessage?.({
     type:'MMVS_SECTION_BG_LOAD_FAILED',
     selector:item.selector,
     slug
    },location.origin);
   };

   test.src=new URL(imageSource,location.origin).href;
  }
 }
}

function apply(){
 mmvsBgRestore();
 mmvsDomApply();
 mmvsUnderlayRestore();
 mmvsV2Restore();
 applyBoundary();
 const seen=new Set();
 for(const item of layout.items){const el=get(item.selector);if(!eligible(el))continue;seen.add(el);styleFor(el,item)}
 for(const el of [...original.keys()])if(!seen.has(el)||!el.isConnected)clearFor(el);
 mmvsV2Sync();
 mmvsUnderlaySync();
 mmvsBgSync();
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

// MMVS_MULTI_R1: editing-only group selection; separate from persisted layout.
let groupMode=false,groupSelectors=[],groupStart=null;
function groupValid(list){
 const result=[];
 for(const s of Array.isArray(list)?list:[]){
  const el=get(s);
  if(typeof s!=='string'||s.length>500||!eligible(el)||entry(s).locked||entry(s).hidden||result.includes(s))continue;
  // Prevent nested parent+child transforms (the cause of double movement).
  if(result.some(other=>{const node=get(other);return node?.contains(el)||el.contains(node)}))continue;
  result.push(s);if(result.length>=32)break;
 }
 return result;
}
function setGroup(list,report=false){
 groupSelectors=groupValid(list);
 if(groupSelectors.length){selector=groupSelectors[groupSelectors.length-1];selected=get(selector)}
 else if(groupMode){selector='';selected=null}
 if(report)window.parent.postMessage({type:'MMVS_SPATIAL_GROUP_SELECTED',selectors:groupSelectors,slug},location.origin);
 scheduleOutline();
}
function groupChange(s){setGroup(groupSelectors.includes(s)?groupSelectors.filter(x=>x!==s):[...groupSelectors,s],true)}
function groupEntries(){return groupSelectors.map(s=>({selector:s,...entry(s)})).filter(x=>!x.locked&&!x.hidden)}
function shiftGroup(dx,dy,report){
 if(!groupMode||groupSelectors.length<2||!Number.isFinite(dx)||!Number.isFinite(dy))return;
 const items=groupEntries();if(items.length!==groupSelectors.length)return;
 for(const p of items)update({selector:p.selector,x:clamp(p.x+dx,-4000,4000),y:clamp(p.y+dy,-4000,4000)},false);
 if(report)window.parent.postMessage({type:'MMVS_SPATIAL_GROUP_COMMIT',items:groupEntries(),slug},location.origin);
 scheduleOutline();
}
function groupBox(){
 const rects=groupSelectors.map(s=>get(s)?.getBoundingClientRect()).filter(b=>b&&b.width>1&&b.height>1);
 if(!rects.length)return null;
 const left=Math.min(...rects.map(b=>b.left)),top=Math.min(...rects.map(b=>b.top));
 const right=Math.max(...rects.map(b=>b.right)),bottom=Math.max(...rects.map(b=>b.bottom));
 return {left,top,right,bottom,width:right-left,height:bottom-top};
}

function drawOutline(){
 if(!preview||!overlay)return;
 if(selector&&(!selected||!selected.isConnected))selected=get(selector);
 if(!selected){overlay.hidden=true;if(toolbar)toolbar.hidden=true;return;}
 const multi=groupMode&&groupSelectors.length>1;
 const b=multi?groupBox():selected.getBoundingClientRect(),p=entry(selector);if(!b){overlay.hidden=true;return;}
 if(p.locked){overlay.hidden=true;if(toolbar)toolbar.hidden=true;return;}
 overlay.style.left=b.left+'px';overlay.style.top=b.top+'px';
 overlay.style.width=b.width+'px';overlay.style.height=b.height+'px';overlay.hidden=false;
 overlay.classList.toggle('mmvs-is-locked',!!p.locked);
 overlay.classList.toggle('mmvs-is-hidden',!!p.hidden);
 if(handle)handle.hidden=multi||!editing||!!p.locked||!!p.hidden;
 const grab=overlay.querySelector('#mmvs-spatial-grab');if(grab)grab.hidden=!editing||!!p.locked||!!p.hidden;
 if(toolbar){
  toolbar.hidden=!editing||multi;
  const width=Math.min(innerWidth-12,400);
  toolbar.style.width=width+'px';
  const height=Math.max(42,toolbar.getBoundingClientRect().height||42);
  const left=clamp(b.left,6,Math.max(6,innerWidth-width-6));
  const above=b.top-height-9,below=b.bottom+9;
  const top=above>=6?above:below+height<=innerHeight-6?below:clamp(b.top+9,6,Math.max(6,innerHeight-height-6));
  toolbar.style.left=left+'px';toolbar.style.top=top+'px';
  if(toolbarButtons.underlay){toolbarButtons.underlay.hidden=!((selected instanceof HTMLImageElement&&selected.matches('#mmvs-managed-content .mmvs-c-block > img, #mmvs-managed-content .mmvs-c-image > img')||selected?.matches?.('#mmvs-managed-content .mmvs-c-block')&&!!selected.querySelector('img')));toolbarButtons.underlay.textContent=p.layerId==='mmvs_underlay'?'↩ روی صفحه':'⬇ پشت صفحه';}
  toolbarButtons.lock.textContent=p.locked?'🔒 بازکردن':'🔓 قفل';
  toolbarButtons.hide.textContent=p.hidden?'↩ نمایش':'◉ حذف/مخفی';
 }
}
function scheduleOutline(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;drawOutline()})}
function activate(s,report){
 if(report&&entry(s).locked)return;
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
 html.mmvs-preview-editor [data-mmvs-locked]{outline:none!important}
  #mmvs-spatial-outline{position:fixed;pointer-events:none;border:2px solid #49eeb8;box-shadow:none!important;outline:none!important;z-index:2147483200;box-sizing:border-box}
 #mmvs-spatial-outline.mmvs-is-locked{display:none!important}
 #mmvs-spatial-outline.mmvs-is-hidden{border-color:#ed8a85;border-style:dotted;background:#75202012}
 #mmvs-spatial-grab{position:absolute;inset:0;pointer-events:auto;touch-action:none!important;user-select:none;-webkit-user-select:none;cursor:grab;background:transparent}
 #mmvs-spatial-handle{position:absolute;left:-12px;bottom:-12px;width:30px;height:30px;border-radius:9px;background:#e8bd83;color:#092719;border:2px solid #092719;pointer-events:auto;z-index:2;touch-action:none;display:grid;place-items:center;font:bold 20px Arial;cursor:nwse-resize}
 #mmvs-spatial-grab[hidden],#mmvs-spatial-handle[hidden],#mmvs-spatial-toolbar[hidden]{display:none!important}
 #mmvs-spatial-toolbar{position:fixed;z-index:2147483210;pointer-events:auto;touch-action:manipulation;padding:5px;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;align-items:center;direction:rtl;background:#071f19f7;border:1px solid #c8a06b;border-radius:12px;box-shadow:0 8px 30px #000a;max-width:calc(100vw - 12px);box-sizing:border-box}
 #mmvs-spatial-toolbar button{min-width:55px;flex:1 1 60px;white-space:normal;line-height:1.5;overflow:visible;padding:8px 4px;border:1px solid #497461;background:#174b39;color:#f0e5d2;border-radius:8px;font:11px Tahoma,Arial,sans-serif;cursor:pointer;touch-action:manipulation;min-height:38px}
 @media(max-width:400px){#mmvs-spatial-toolbar button{flex:1 1 30%;font-size:10px}}
 #mmvs-spatial-toolbar button:focus-visible{outline:2px solid #ffcb82}
 html.mmvs-spatial-on,html.mmvs-spatial-on body{touch-action:pan-y!important;user-select:none!important;-webkit-user-select:none!important;overscroll-behavior:none!important}
 html.mmvs-spatial-on .mf62-float,html.mmvs-spatial-on #p74-app .p74-decor,html.mmvs-spatial-on [data-mmvs-layer]{pointer-events:auto!important;cursor:grab!important}
 `;
 document.head.append(style);
 overlay=document.createElement('div');overlay.id='mmvs-spatial-outline';overlay.hidden=true;
 const grab=document.createElement('div');grab.id='mmvs-spatial-grab';grab.setAttribute('aria-label','کشیدن عنصر انتخاب‌شده');overlay.append(grab);
 handle=document.createElement('div');handle.id='mmvs-spatial-handle';handle.textContent='⤡';handle.title='بکش تا بزرگ یا کوچک شود';
 overlay.append(handle);document.body.append(overlay);
 toolbar=document.createElement('div');toolbar.id='mmvs-spatial-toolbar';toolbar.hidden=true;
 const actions=[['lock','قفل'],['hide','مخفی/حذف'],['front','جلوترین'],['back','عقب‌ترین'],['underlay','⬇ پشت صفحه'],['animation','✦ انیمیشن'],['reset','بازنشانی']];
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
 if(p.widthPx!==undefined)fixed.widthPx=Math.round(clamp(p.widthPx,24,1600));
 if(p.heightPx!==undefined)fixed.heightPx=Math.round(clamp(p.heightPx,16,1600));
 if(p.animation!==undefined)fixed.animation=p.animation;
 const index=layout.items.findIndex(x=>x.selector===fixed.selector);
 if(index>=0)layout.items[index]=fixed;else if(layout.items.length<500)layout.items.push(fixed);else return;
 applyOne(fixed.selector);if(report)window.parent.postMessage({type:'MMVS_SPATIAL_COMMIT',item:fixed,slug},location.origin);
}
function points(){return [...active.values()]}
function begin(){
 const pts=points(),p=entry(selector);if(!pts.length)return;
 if(groupMode&&groupSelectors.length>1)groupStart=groupEntries();
 const mid=pts.length>=2?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:{x:pts[0].x,y:pts[0].y};
 gesture={x0:p.x,y0:p.y,s0:p.scale,startMid:mid,
  dist:pts.length>=2?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0,kind:pts[0].kind};
}
function move(){
 if(!gesture||!selector||entry(selector).locked)return;
 if(groupMode&&groupSelectors.length>1&&groupStart?.length===groupSelectors.length){
  const pts=points();if(!pts.length)return;
  const mid=pts.length>=2?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:pts[0];
  let dx=mid.x-gesture.startMid.x,dy=mid.y-gesture.startMid.y;
  if(grid){dx=Math.round(dx/8)*8;dy=Math.round(dy/8)*8}
  if(Math.abs(dx)+Math.abs(dy)<.1)return;gestureChanged=true;
  for(const p of groupStart)update({selector:p.selector,x:clamp(p.x+dx,-4000,4000),y:clamp(p.y+dy,-4000,4000)},false);
  scheduleOutline();return;
 }
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
 if(editing){
  const __mmctHit=targetForPoint(e);
  const __mmctSel=__mmctHit?selectorOf(__mmctHit):null;
  if((__mmctSel&&entry(__mmctSel).locked)||((e.target===handle||e.target?.id==='mmvs-spatial-grab')&&selector&&entry(selector).locked)){
   e.preventDefault();e.stopImmediatePropagation();return;
  }
 }

 if(!editing)return;
 if(e.target instanceof Element && e.target.closest('#mmvs-spatial-toolbar'))return;
 const fromHandle=e.target===handle;const fromGrab=e.target instanceof Element&&e.target.id==='mmvs-spatial-grab';
 let hit=targetForPoint(e);
 const s=(fromHandle||fromGrab||active.size)?selector:selectorOf(hit);
 if(!s||mmvsR11Unsafe(get(s)))return; // R11: never move an app wrapper
if(!s)return;
 if(!fromHandle&&!fromGrab&&!active.size){
  if(groupMode)groupChange(s);else activate(s,true);
  e.preventDefault();e.stopImmediatePropagation();return;
 }
 e.preventDefault();e.stopImmediatePropagation();
 if(entry(s).locked||entry(s).hidden)return;
 if(!active.size){gestureChanged=false;gestureStart={...entry(s)}}
 const captureEl=e.target instanceof Element?e.target:document.documentElement;
 active.set(e.pointerId,{x:e.clientX,y:e.clientY,kind:fromHandle?'handle':'move',captureEl});
 try{captureEl.setPointerCapture(e.pointerId)}catch{
  try{document.documentElement.setPointerCapture(e.pointerId)}catch{}
 }
 begin();
}
function pointerMove(e){
 if(!active.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();
 const p=active.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;move();
}
function pointerUp(e){
 // R11: cancelled touch reverts local preview and never persists a partial drag.
 if(e.type==='pointercancel'&&active.has(e.pointerId)){
   e.preventDefault();e.stopImmediatePropagation();
   active.clear();gesture=null;
   if(groupMode&&groupStart?.length>1){for(const p of groupStart)update(p,false)}else if(gestureChanged&&gestureStart&&selector)update(gestureStart,false);groupStart=null;
   gestureChanged=false;gestureStart=null;scheduleOutline();return;
 }

 if(!active.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();
 const result=entry(selector);const p=active.get(e.pointerId);active.delete(e.pointerId);
 try{if(p.captureEl?.hasPointerCapture(e.pointerId))p.captureEl.releasePointerCapture(e.pointerId)}catch{}
 try{if(document.documentElement.hasPointerCapture(e.pointerId))document.documentElement.releasePointerCapture(e.pointerId)}catch{}
 if(active.size)begin();else{gesture=null;if(gestureChanged){if(groupMode&&groupSelectors.length>1){window.parent.postMessage({type:'MMVS_SPATIAL_GROUP_COMMIT',items:groupEntries(),slug},location.origin)}else{window.parent.postMessage({type:'MMVS_SPATIAL_COMMIT',item:result,slug},location.origin);reportOverlaps()}}gestureChanged=false;gestureStart=null;groupStart=null}
}
function setup(){
 mmvsDomIndex();
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
    if(!editing){active.clear();gesture=null;gestureChanged=false;groupMode=false;groupSelectors=[]}
    scheduleOutline();
   }else if(d.type==='MMVS_SPATIAL_GROUP_MODE'){
    groupMode=!!d.enabled&&editing;if(!groupMode)setGroup([]);scheduleOutline();
   }else if(d.type==='MMVS_SPATIAL_GROUP_SET'){
    if(groupMode)setGroup(d.selectors);
   }else if(d.type==='MMVS_SPATIAL_GROUP_NUDGE'){
    if(groupMode&&Array.isArray(d.selectors)&&d.selectors.length===groupSelectors.length&&d.selectors.every((s,i)=>s===groupSelectors[i])&&Math.abs(d.dx)<=100&&Math.abs(d.dy)<=100)shiftGroup(d.dx,d.dy,true);
   }else if(d.type==='MMVS_SPATIAL_ANIMATION_PLAY'){
    animationsPlaying=!!d.playing;
    for(const a of animations.values()){try{animationsPlaying?a.effect.play():a.effect.pause()}catch(_e){}}
   }else if(d.type==='MMVS_SPATIAL_PREVIEW'){
    layout=safeLayout(d.layout);apply();if(selector)activate(selector,false);
   }else if(d.type==='MMVS_SPATIAL_PICK')activate(d.selector,false);
   else if(d.type==='MMVS_SPATIAL_SET'){
    if(d.item&&typeof d.item.selector==='string'){
     const next=safeLayout({items:[d.item]}).items[0];if(next){const i=layout.items.findIndex(x=>x.selector===next.selector);if(i>=0)layout.items[i]=next;else if(layout.items.length<500)layout.items.push(next);apply();activate(next.selector,false);sendVisuals();reportOverlaps()}
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
   if(ms.some(m=>Array.from(m.addedNodes||[]).some(x=>x.nodeType===1&&x.id!=='mmvs-spatial-outline'&&x.id!=='mmvs-spatial-toolbar'&&x.id!=='mmvs-v2-image-plane'&&!x.hasAttribute?.('data-mmvs-v2-image')&&!x.closest?.('#mmvs-v2-image-plane')&&!x.matches?.('.mmvs-r98-section-backdrop')&&!x.closest?.('.mmvs-r98-section-backdrop')))){apply();scheduleVisuals();}
  }).observe(document.body,{childList:true,subtree:true});
 }else{
  fetch('/public/mmvs/layout/'+encodeURIComponent(slug),{cache:'no-store'})
   .then(r=>r.ok?r.json():null).then(d=>{
    if(!d?.layout)return;
    layout=safeLayout(d.layout);apply();let pending=false;
    new MutationObserver(ms=>{
     if(pending||!ms.some(m=>Array.from(m.addedNodes).some(x=>x.nodeType===1&&x.id!=='mmvs-v2-image-plane'&&!x.hasAttribute?.('data-mmvs-v2-image')&&!x.closest?.('#mmvs-v2-image-plane')&&!x.matches?.('.mmvs-r98-section-backdrop')&&!x.closest?.('.mmvs-r98-section-backdrop'))))return;
     pending=true;setTimeout(()=>{pending=false;apply()},120);
    }).observe(document.body,{subtree:true,childList:true});
   }).catch(()=>{});
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
