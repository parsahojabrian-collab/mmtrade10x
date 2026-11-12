/* MMTrade10X Visual Studio bridge R3. Published data comes only from authenticated Telegram /content/page. */
(()=>{'use strict';if(window.__MMVS_BRIDGE_R1__)return;window.__MMVS_BRIDGE_R1__=true;
const query=new URLSearchParams(location.search),preview=query.get('visualPreview')==='1';
const pathname=location.pathname;const isMain=/\/miniapp\/(?:index\.html)?$/.test(pathname)||pathname==='/miniapp';
/* MMTRADE_AUDIT_FIX_R1_BRIDGE_SLUG: align content bridge with editor page slugs. */
const view=query.get('view');
const slug=pathname.includes('/eplanet/')?'eplanet':pathname.includes('/learning/stage2')?'stage2':pathname.includes('/learning/')?'academy':pathname.includes('/profile/')?'profile':pathname.includes('/support/')?'support':pathname.includes('/copytrade-academy/')?'copytrade-academy':pathname.includes('/mmtrade-r3-preview/')?'mmtrade10x':pathname.includes('/copy-trading')?'copy-trading':pathname.includes('/crypto')?'crypto':pathname.includes('/challenge')?'challenge':view==='mmtrade10x'?'mmtrade10x':view==='academy'?'academy':view==='profile'?'profile':'index';
const accepted=u=>typeof u==='string'&&(/^(https:\/\/\S+)$/.test(u)||/^\/(?!\/)\S*$/.test(u));
const shadow={none:'none',soft:'0 2px 10px rgba(0,0,0,.12)',medium:'0 5px 18px rgba(0,0,0,.2)',strong:'0 10px 30px rgba(0,0,0,.3)'};
const styles={fontSize:v=>v+'px',borderRadius:v=>v+'px',padding:v=>v+'px',margin:v=>v+'px',letterSpacing:v=>v+'px',width:v=>v+'px',maxWidth:v=>v+'px',minHeight:v=>v+'px',fontWeight:v=>v,opacity:v=>v,lineHeight:v=>v,textAlign:v=>v,shadow:v=>shadow[v]};
let previewBlocks=[],selected=null,popupEl=null,observer=null;
function safeSelect(s){if(typeof s!=='string'||!s||s.length>500)return null;try{return document.querySelector(s)}catch(e){return null}}
// Keep only properties controlled by the content editor. Do not reset unrelated spatial styles.
const appliedElements=new Map();
function elementState(el){let state=appliedElements.get(el);if(!state){state={styles:new Map(),attrs:new Map(),texts:new Map()};appliedElements.set(el,state)}return state}
function elementStyle(el,key,value,priority=''){
 const state=elementState(el),old=state.styles.get(key);
 if(!old)state.styles.set(key,{value:el.style.getPropertyValue(key),priority:el.style.getPropertyPriority(key)});
 el.style.setProperty(key,String(value),priority);
 Object.assign(state.styles.get(key),{applied:el.style.getPropertyValue(key),appliedPriority:el.style.getPropertyPriority(key)});
}
function elementAttr(el,key,value){
 const state=elementState(el);if(!state.attrs.has(key))state.attrs.set(key,{value:el.getAttribute(key)});
 el.setAttribute(key,value);state.attrs.get(key).applied=el.getAttribute(key);
}
function elementText(node,value,el){
 const state=elementState(el);if(!state.texts.has(node))state.texts.set(node,{value:node.nodeValue});
 node.nodeValue=value;state.texts.get(node).applied=value;
}
function restoreElements(){
 for(const [el,state] of appliedElements){
  for(const [key,old] of state.styles)if(el.style.getPropertyValue(key)===old.applied&&el.style.getPropertyPriority(key)===old.appliedPriority){if(old.value)el.style.setProperty(key,old.value,old.priority);else el.style.removeProperty(key)}
  for(const [key,old] of state.attrs)if(el.getAttribute(key)===old.applied){if(old.value===null)el.removeAttribute(key);else el.setAttribute(key,old.value)}
  for(const [node,old] of state.texts)if(node.nodeValue===old.applied)node.nodeValue=old.value;
  if(el.dataset.mmvsHidden==='1')delete el.dataset.mmvsHidden;
 }
 appliedElements.clear();
}
function applyOne(b){if(!b||b.type!=='element'||!b.selector||b.selector.startsWith('#p74-home-config')||b.selector.startsWith('#p77-profile-config'))return;
 const el=safeSelect(b.selector);if(!el)return;
 if(b.deleted===true){el.dataset.mmvsHidden='1';elementStyle(el,'display','none','important');return}
 if(typeof b.text==='string'){
  const nodes=[...el.childNodes].filter(n=>n.nodeType===3);
  if(nodes.length){elementText(nodes[0],b.text,el);for(const node of nodes.slice(1))elementText(node,'',el)}
  else if(!el.children.length){const node=document.createTextNode('');el.append(node);elementText(node,b.text,el)}
 }
 if(typeof b.href==='string'&&el.tagName==='A'&&accepted(b.href))elementAttr(el,'href',b.href);
 if(typeof b.src==='string'&&el.tagName==='IMG'&&accepted(b.src))elementAttr(el,'src',b.src);
 if(typeof b.alt==='string'&&el.tagName==='IMG')elementAttr(el,'alt',b.alt);
 for(const [key,target] of [['color','color'],['background','background-color'],['borderColor','border-color']])if(typeof b[key]==='string'&&/^#[0-9a-fA-F]{6}$/.test(b[key]))elementStyle(el,target,b[key]);
 for(const [key,fn] of Object.entries(styles)){
  if(b[key]===undefined||b[key]===null)continue;
  const css=key==='shadow'?'box-shadow':key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
  if(key==='shadow'){if(shadow[b[key]])elementStyle(el,css,fn(b[key]));continue}
  if(['fontWeight','textAlign'].includes(key)){elementStyle(el,css,fn(b[key]));continue}
  const n=Number(b[key]);if(Number.isFinite(n))elementStyle(el,css,fn(n));
 }
 if(b.borderWidth!==undefined&&Number.isFinite(Number(b.borderWidth))){elementStyle(el,'border-width',Number(b.borderWidth)+'px');elementStyle(el,'border-style','solid')}
}
function applyAll(items){if(!Array.isArray(items))return;restoreElements();for(const x of items)applyOne(x)}

/* MMVS R3: render only validated data-driven content blocks; no HTML injection.
   On /miniapp/index.html the existing blocks.js stays the sole live renderer. */
function managedStyle(){if(document.getElementById('mmvs-managed-style'))return;const style=document.createElement('style');style.id='mmvs-managed-style';style.textContent=`
#mmvs-managed-content{direction:rtl;max-width:850px;margin:24px auto;padding:18px;border:1px solid #467960;border-radius:20px;background:linear-gradient(145deg,#102f23,#071c17);color:#f1f2e8;font:14px/1.85 Tahoma,Arial,sans-serif;box-sizing:border-box}
#mmvs-managed-content.mmvs-images-only{background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;padding:0!important;max-width:100%}#mmvs-managed-content .mmvs-c-block.mmvs-c-image{margin:0!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;outline:0!important}#mmvs-managed-content .mmvs-c-image>img{background:transparent!important;border:0!important;box-shadow:none!important;outline:0!important;border-radius:0!important;mix-blend-mode:normal!important}#mmvs-managed-content *{box-sizing:border-box}#mmvs-managed-content .mmvs-c-block{margin:12px 0;padding:10px;overflow-wrap:anywhere}#mmvs-managed-content h2{font-size:22px;color:#f0c494;margin:4px 0}#mmvs-managed-content p{white-space:pre-wrap;margin:5px 0}#mmvs-managed-content img{max-width:100%;max-height:430px;object-fit:contain;border-radius:15px;display:block;margin:auto}#mmvs-managed-content a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:10px 17px;text-decoration:none;border-radius:11px;color:#092018;background:linear-gradient(110deg,#f3d6a5,#c18f62);font-weight:bold}#mmvs-managed-content .mmvs-banner{background:#154331;border:1px solid #88714e;border-radius:14px;padding:15px}#mmvs-managed-content .mmvs-progress{background:#092015;border:1px solid #537762;border-radius:12px;overflow:hidden;height:12px;margin:8px 0}#mmvs-managed-content .mmvs-progress-bar{background:linear-gradient(90deg,#c5a16a,#63edb6);height:100%;transition:width .15s}#mmvs-managed-content hr{border:0;border-top:1px solid #537762}
`;document.head.append(style)}
function renderContent(items,progress){if(!Array.isArray(items))return;const contents=items.filter(x=>x&&x.type!=='element'&&['heading','text','html','image','button','banner','divider','progress','mm10_step'].includes(x.type));let root=document.getElementById('mmvs-managed-content');if(!contents.length){root?.remove();return}managedStyle();if(!root){root=document.createElement('section');root.id='mmvs-managed-content';root.setAttribute('aria-label','محتوای مدیریت‌شده');document.body.append(root)}root.replaceChildren();root.classList.toggle('mmvs-images-only',contents.every(b=>b.type==='image'));
for(const b of contents){const block=document.createElement('div');block.className='mmvs-c-block';if(b.type==='image')block.classList.add('mmvs-c-image');let element=null;
switch(b.type){
case 'heading':element=document.createElement('h2');element.textContent=b.text||'';break;
case 'text':element=document.createElement('p');element.textContent=b.text||'';break;
case 'html':element=document.createElement('section');element.className='tenx-custom-html';if(window.TenxSafeHtml)window.TenxSafeHtml.append(element,b.html||'');else element.textContent=b.html||'';break;
case 'image':if(!accepted(b.url))break;element=document.createElement('img');element.src=b.url;element.alt=b.alt||'';element.loading='lazy';break;
case 'button':if(!accepted(b.url))break;element=document.createElement('a');element.href=b.url;element.textContent=b.text||'';break;
case 'banner':{element=document.createElement('div');element.className='mmvs-banner';const h=document.createElement('h2');h.textContent=b.title||'';element.append(h);if(b.text){const text=document.createElement('p');text.textContent=b.text;element.append(text)}if(accepted(b.url)){const a=document.createElement('a');a.textContent='مشاهده';a.href=b.url;element.append(a)}break;}
case 'progress':{element=document.createElement('div');const h=document.createElement('p');h.textContent=b.title||'پیشرفت';element.append(h);const outer=document.createElement('div');outer.className='mmvs-progress';const inside=document.createElement('div');inside.className='mmvs-progress-bar';const pct=Number(progress?.[b.kind||'academy']?.pct||0);inside.style.width=Math.max(0,Math.min(100,pct))+'%';outer.append(inside);element.append(outer);break;}
case 'mm10_step':{element=document.createElement('div');element.className='mmvs-banner';const h=document.createElement('h2');h.textContent=b.title||'';const text=document.createElement('p');text.textContent=b.body||'';element.append(h,text);break;}
case 'divider':element=document.createElement('hr');break;
}
if(!element)continue;block.append(element);root.append(block)
}}

if(preview)window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='MMVS_SPATIAL_MODE'&&e.data.enabled&&selected)selected.style.removeProperty('outline')});
function uniqueSelector(el){if(!el||el===document.documentElement||el===document.body)return null;
const id=el.id;if(id){const s='#'+CSS.escape(id);if(document.querySelectorAll(s).length===1)return s}
const tag=el.tagName.toLowerCase();const classes=[...el.classList].filter(s=>/^[a-zA-Z_][a-zA-Z0-9_-]{0,80}$/.test(s)).slice(0,3);
for(const c of classes){const s=tag+'.'+CSS.escape(c);if(document.querySelectorAll(s).length===1)return s}
let p=el,segments=[];while(p&&p!==document.body&&segments.length<8){let t=p.tagName.toLowerCase();if(p.id){segments.unshift('#'+CSS.escape(p.id));break}let siblings=[...(p.parentElement?.children||[])].filter(x=>x.tagName===p.tagName);let ix=siblings.indexOf(p)+1;segments.unshift(t+(siblings.length>1?`:nth-of-type(${ix})`:''));let s=segments.join(' > ');if(document.querySelectorAll(s).length===1)return s;p=p.parentElement}return segments.join(' > ')||null}
function pick(e){
/* MMVS R9: visual selection is disabled during spatial edit, preventing app-root race. */
if(window.__MMVS_SPATIAL_EDITING__===true)return;
let target=e.target;if(!(target instanceof Element))return;if(target.closest('#mmvs-overlay'))return;if(target.closest('[data-mmvs-locked]'))return;
if(target.matches?.('#p74-app,#mf62-home,#mmvs-root,#app,main.home-shell,.stage-page,.stage-shell'))return;
const sel=uniqueSelector(target);if(!sel||sel.length>500)return;e.preventDefault();e.stopImmediatePropagation();if(selected)selected.style.removeProperty('outline');selected=target;if(!window.__MMVS_SPATIAL_R4__)selected.style.setProperty('outline','2px dashed #46e7ad','important');
const textNodes=[...target.childNodes].filter(x=>x.nodeType===3);const info={selector:sel,tag:target.tagName,text:textNodes.length?textNodes[0].nodeValue:target.children.length?'':target.textContent?.slice(0,3000),href:target.getAttribute('href'),src:target.getAttribute('src')};window.parent.postMessage({type:'MMVS_SELECT',element:info},location.origin)}



function stylePopup(){
 if(document.getElementById('mmvs-popup-style'))return;
 const css=document.createElement('style');
 css.id='mmvs-popup-style';
 css.textContent=`
 #mmvs-overlay{
  position:fixed;inset:0;z-index:2147483600;
  display:grid;place-items:center;padding:14px;
  direction:rtl;overflow-y:auto;
  background:rgba(0,8,5,.76);
  backdrop-filter:blur(15px) saturate(130%);
  -webkit-backdrop-filter:blur(15px) saturate(130%);
 }
 #mmvs-overlay .mmvs-box{
  box-sizing:border-box;width:min(100%,470px);
  max-height:92dvh;overflow-y:auto;
  padding:24px;border-radius:27px;
  color:#f5f8f5;
  background:rgba(10,37,28,.88);
  border:1px solid rgba(225,190,125,.7);
  box-shadow:0 25px 90px rgba(0,0,0,.65);
  font:14px/1.9 Tahoma,Arial,sans-serif;
 }
 #mmvs-overlay.org-overlay{
  background:
   radial-gradient(ellipse at 50% 0%,rgba(0,255,155,.13),transparent 55%),
   rgba(0,7,5,.78);
 }
 #mmvs-overlay .org-box{
  position:relative;isolation:isolate;
  width:min(100%,760px);
  max-height:min(93dvh,1100px);
  overflow-y:auto;overflow-x:hidden;
  padding:clamp(19px,3.2vw,34px);
  border-radius:34px;
  border:1px solid rgba(115,255,197,.8);
  background:
   linear-gradient(135deg,
    rgba(14,75,53,.76),
    rgba(3,25,19,.82) 48%,
    rgba(7,48,35,.72));
  backdrop-filter:blur(32px) saturate(190%);
  -webkit-backdrop-filter:blur(32px) saturate(190%);
  box-shadow:
   0 0 2px #fff,
   0 0 25px rgba(0,255,160,.24),
   0 0 70px rgba(0,255,160,.13),
   inset 0 2px 2px rgba(255,255,255,.3),
   inset 0 -2px 15px rgba(0,255,150,.13),
   0 35px 100px #000c;
  animation:orgGlassEnter .65s cubic-bezier(.2,.8,.2,1) both;
  scrollbar-width:thin;
  scrollbar-color:rgba(76,255,177,.5) transparent;
 }
 #mmvs-overlay .org-box::before{
  content:"";position:absolute;inset:0;
  z-index:-1;pointer-events:none;border-radius:inherit;
  background:
   linear-gradient(125deg,
    rgba(255,255,255,.20),
    transparent 16%,
    transparent 72%,
    rgba(255,222,155,.13)),
   radial-gradient(ellipse at 90% 10%,
    rgba(0,255,165,.18),transparent 45%);
 }
 #mmvs-overlay .org-box::after{
  content:"";position:absolute;top:-55%;left:-35%;
  width:70%;height:65%;border-radius:50%;
  pointer-events:none;z-index:-1;
  background:rgba(255,255,255,.055);
  filter:blur(35px);
 }
 #mmvs-overlay .org-box>*{
  position:relative;z-index:1;
 }
 @keyframes orgGlassEnter{
  from{opacity:0;transform:translateY(22px) scale(.96);filter:blur(8px)}
  to{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}
 }
 #mmvs-overlay .org-head{text-align:center;margin-bottom:22px}
 #mmvs-overlay .org-kicker{
  display:inline-block;padding:5px 25px;
  border-radius:30px;
  color:#55ffc0;font-size:12px;font-weight:900;
  letter-spacing:2px;
  background:rgba(0,255,155,.09);
  border:1px solid rgba(105,255,196,.5);
  box-shadow:0 0 20px rgba(0,255,155,.16),
             inset 0 1px rgba(255,255,255,.2);
 }
 #mmvs-overlay .org-head h2{
  margin:17px 0 8px;
  color:#ffdfae;
  font-size:clamp(23px,4vw,38px);
  line-height:1.6;
  text-shadow:0 2px 22px rgba(255,192,110,.22);
 }
 #mmvs-overlay .org-subtitle{
  color:#b7d0c5;font-size:14px;line-height:2;margin:0
 }
 #mmvs-overlay .org-intro{
  text-align:center;color:#eef8f2;
  line-height:2.1;font-size:14px;
  margin:20px auto 27px;
  max-width:650px;
 }
 #mmvs-overlay .org-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:17px;margin:20px 0 28px;
 }
 #mmvs-overlay .org-person{
  min-width:0;position:relative;
  padding:19px 12px 17px;
  text-align:center;border-radius:27px;
  border:1px solid rgba(91,255,190,.37);
  background:
   linear-gradient(145deg,
    rgba(255,255,255,.105),
    rgba(0,45,32,.28) 48%,
    rgba(0,10,8,.37));
  backdrop-filter:blur(23px) saturate(175%);
  -webkit-backdrop-filter:blur(23px) saturate(175%);
  box-shadow:
   inset 0 1px 2px rgba(255,255,255,.24),
   inset 0 -10px 25px rgba(0,255,160,.045),
   0 12px 32px rgba(0,0,0,.2);
  transition:transform .3s ease,border-color .3s,box-shadow .3s;
 }
 #mmvs-overlay .org-person:hover{
  transform:translateY(-5px);
  border-color:rgba(90,255,190,.85);
  box-shadow:0 12px 40px rgba(0,255,160,.16),
             inset 0 1px 3px #ffffff55;
 }
 #mmvs-overlay .org-avatar{
  width:104px;height:104px;
  object-fit:cover;border-radius:50%;
  display:block;margin:0 auto 13px;
  border:2px solid #54ffc0;
  box-shadow:
   0 0 0 4px rgba(0,255,160,.10),
   0 0 18px rgba(0,255,160,.48),
   inset 0 0 12px #fff;
 }
 #mmvs-overlay .org-avatar-empty{
  display:grid;place-items:center;
  background:linear-gradient(145deg,#174d38,#071b14);
  color:#73ffc2;font-weight:1000;font-size:24px;
 }
 #mmvs-overlay .org-name{
  display:block;color:#fff;
  font-size:17px;font-weight:900;
  overflow-wrap:anywhere;
  text-shadow:0 2px 12px #0008;
 }
 #mmvs-overlay .org-role{
  display:inline-block;margin-top:9px;
  padding:5px 13px;border-radius:30px;
  color:#ffe1ad;font-size:11px;font-weight:800;
  background:linear-gradient(120deg,
   rgba(0,255,155,.14),rgba(255,204,120,.09));
  border:1px solid rgba(255,218,160,.45);
  box-shadow:inset 0 1px #ffffff25;
  overflow-wrap:anywhere;
 }
 #mmvs-overlay .org-bio{
  margin:13px 0 0;color:#d1e0d8;
  font-size:12px;line-height:2;
  white-space:pre-wrap;overflow-wrap:anywhere;
 }
 #mmvs-overlay .org-close{
  display:block;width:min(100%,500px);
  min-height:66px;margin:30px auto 0!important;
  border-radius:28px!important;
  padding:14px 25px!important;
  color:#eafff5!important;
  font-size:21px!important;font-weight:900!important;
  background:
   linear-gradient(115deg,
    rgba(0,255,153,.38),
    rgba(0,105,66,.55),
    rgba(0,255,170,.30))!important;
  border:2px solid rgba(94,255,191,.95)!important;
  box-shadow:
   0 0 12px rgba(0,255,160,.4),
   0 0 32px rgba(0,255,160,.2),
   inset 0 2px 5px rgba(255,255,255,.4),
   inset 0 -8px 15px rgba(0,0,0,.17)!important;
  text-shadow:0 2px 12px #004b32;
  transition:transform .2s,filter .2s;
 }
 #mmvs-overlay .org-close:hover{
  filter:brightness(1.2);
  transform:translateY(-2px);
 }
 #mmvs-overlay .org-close:active{transform:scale(.98)}
 @media(max-width:420px){
  #mmvs-overlay{padding:9px}
  #mmvs-overlay .org-box{padding:19px 13px;border-radius:26px}
  #mmvs-overlay .org-grid{gap:10px;margin:16px 0 22px}
  #mmvs-overlay .org-person{padding:14px 8px;border-radius:21px}
  #mmvs-overlay .org-avatar{width:76px;height:76px}
  #mmvs-overlay .org-name{font-size:14px}
  #mmvs-overlay .org-role{font-size:10px;padding:4px 8px}
  #mmvs-overlay .org-bio{font-size:11px;line-height:1.85}
  #mmvs-overlay .org-close{min-height:57px;font-size:18px!important}
 }
 @media(prefers-reduced-motion:reduce){
  #mmvs-overlay .org-box{animation:none}
  #mmvs-overlay .org-person{transition:none}
 }
 `;
 document.head.append(css);
}

function renderPopup(p,seen){
 if(!p||typeof p.title!=='string')return;

 const isOrganizer=Array.isArray(p.organizers);
 if(!isOrganizer&&typeof p.body!=='string')return;

 popupEl?.remove();
 stylePopup();

 const over=document.createElement('div');
 over.id='mmvs-overlay';
 over.setAttribute('role','dialog');
 over.setAttribute('aria-modal','true');
 over.setAttribute('data-mmvs-locked','');

 const box=document.createElement('div');

 const close=()=>{
  over.remove();
  if(popupEl===over)popupEl=null;
  if(typeof seen==='function')seen();
 };

 if(isOrganizer){
  over.className='org-overlay';
  box.className='mmvs-box org-box';

  const head=document.createElement('div');
  head.className='org-head';

  const kicker=document.createElement('span');
  kicker.className='org-kicker';
  kicker.textContent='10X CHALLENGE';

  const heading=document.createElement('h2');
  heading.textContent=p.title||'برگزارکنندگان چالش 10X';

  const subtitle=document.createElement('p');
  subtitle.className='org-subtitle';
  subtitle.textContent=p.subtitle||'';

  head.append(kicker,heading,subtitle);
  box.append(head);

  if(p.body){
   const intro=document.createElement('p');
   intro.className='org-intro';
   intro.textContent=p.body;
   box.append(intro);
  }

  const grid=document.createElement('div');
  grid.className='org-grid';

  p.organizers.forEach(o=>{
   if(!o||typeof o!=='object')return;

   const card=document.createElement('article');
   card.className='org-person';

   if(o.imageUrl&&accepted(o.imageUrl)){
    const img=document.createElement('img');
    img.className='org-avatar';
    img.src=o.imageUrl;
    img.alt=o.name||'';
    img.loading='lazy';
    card.append(img);
   }else{
    const empty=document.createElement('div');
    empty.className='org-avatar org-avatar-empty';
    empty.textContent='10X';
    card.append(empty);
   }

   const name=document.createElement('strong');
   name.className='org-name';
   name.textContent=o.name||'';

   const role=document.createElement('span');
   role.className='org-role';
   role.textContent=o.role||'';

   card.append(name,role);

   if(o.bio){
    const bio=document.createElement('p');
    bio.className='org-bio';
    bio.textContent=o.bio;
    card.append(bio);
   }

   grid.append(card);
  });

  box.append(grid);

  const button=document.createElement('button');
  button.className='org-close';
  button.textContent='متوجه شدم';
  button.onclick=close;
  box.append(button);

 }else{
  box.className='mmvs-box';

  const heading=document.createElement('h2');
  heading.textContent=p.title;
  box.append(heading);

  if(p.imageUrl&&accepted(p.imageUrl)){
   const img=document.createElement('img');
   img.src=p.imageUrl;
   img.alt='';
   box.append(img);
  }

  const body=document.createElement('p');
  body.textContent=p.body;
  box.append(body);

  const actions=document.createElement('div');
  actions.className='mmvs-actions';

  if(p.buttonText&&p.buttonUrl&&accepted(p.buttonUrl)){
   const link=document.createElement('a');
   link.textContent=p.buttonText;
   link.href=p.buttonUrl;

   if(link.href.startsWith('https://')){
    link.target='_blank';
    link.rel='noopener noreferrer';
   }

   link.addEventListener('click',close);
   actions.append(link);
  }

  const button=document.createElement('button');
  button.textContent='بستن';
  button.onclick=close;
  actions.append(button);

  box.append(actions);
 }

 over.append(box);
 document.body.append(over);
 popupEl=over;
}

/* MMVS_PUBLISHED_FOLD_R1 LIVE: uses published blocks returned by existing authenticated API. */
 const MMVS_PUBLISHED_FOLD_MARKER='#mmvs-published-fold-configuration';
 function mmvsPublishedFoldApply(items){
 // MMVS_RESTORE_R1: disable forced published fold.
 return;

  if(preview||!Array.isArray(items))return;
  const marker=items.find(x=>x?.type==='element'&&x.selector===MMVS_PUBLISHED_FOLD_MARKER);
  let enabled=false,height=0;
  try{const d=JSON.parse(marker?.text||'null');if(d?.version===1&&d.enabled===true&&Number.isInteger(d.heightPx)&&d.heightPx>=200&&d.heightPx<=12000){enabled=true;height=d.heightPx}}catch(_e){}
  const root=document.documentElement;
  if(!enabled){window.__MMVS_FOLD_CURRENT_HEIGHT__=null;root.classList.remove('mmvs-published-fold-active');root.style.removeProperty('--mmvs-published-fold-h');return;}
  let style=document.getElementById('mmvs-published-fold-live-style');
  if(!style){style=document.createElement('style');style.id='mmvs-published-fold-live-style';style.textContent=`
  html.mmvs-published-fold-active body{box-sizing:border-box!important;height:var(--mmvs-published-fold-h)!important;max-height:var(--mmvs-published-fold-h)!important;min-height:0!important;overflow-x:hidden!important;overflow-y:hidden!important;clip-path:inset(0 0 0 0)!important;-webkit-clip-path:inset(0 0 0 0)!important;}
  html.mmvs-published-fold-active{scroll-behavior:auto!important;overscroll-behavior-y:contain!important}
  `;document.head.append(style)}
  window.__MMVS_FOLD_CURRENT_HEIGHT__=height;root.style.setProperty('--mmvs-published-fold-h',height+'px');root.classList.add('mmvs-published-fold-active');
  // Protect against descendant elements extending the scrolling root past the limit.
  const clampScroll=()=>{const h=window.__MMVS_FOLD_CURRENT_HEIGHT__;if(!h||!document.documentElement.classList.contains('mmvs-published-fold-active'))return;const max=Math.max(0,h-window.innerHeight);if(window.scrollY>max+2)window.scrollTo(0,max)};
  if(!window.__MMVS_FOLD_SCROLL_GUARD__){window.__MMVS_FOLD_SCROLL_GUARD__=true;window.addEventListener('scroll',clampScroll,{passive:true});}
  clampScroll();
 }
 if(!preview){
  window.addEventListener('tenx:data',e=>mmvsPublishedFoldApply(e.detail?.blocks));
  // Main miniapp can fetch its data before the deferred bridge finishes loading.
  if(Array.isArray(window.__MMVS_FOLD_EARLY_BLOCKS__))mmvsPublishedFoldApply(window.__MMVS_FOLD_EARLY_BLOCKS__);
 }

function mountPreview(){document.addEventListener('click',pick,true);window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||!e.data)return;if(e.data.type==='MMVS_PREVIEW'){previewBlocks=Array.isArray(e.data.blocks)?e.data.blocks:[];applyAll(previewBlocks);renderContent(previewBlocks,null)}else if(e.data.type==='MMVS_POPUP_PREVIEW')renderPopup(e.data.popup)});
let pending=false;observer=new MutationObserver(ms=>{if(!ms.some(m=>m.addedNodes?.length)||pending)return;pending=true;setTimeout(()=>{pending=false;applyAll(previewBlocks)},120)});observer.observe(document.body,{subtree:true,childList:true});window.parent.postMessage({type:'MMVS_READY'},location.origin)}
function mountLive(data,initData){mmvsPublishedFoldApply(data.blocks);if(Array.isArray(data.blocks)){applyAll(data.blocks);renderContent(data.blocks,data.progress);let pending=false;observer=new MutationObserver(ms=>{if(!ms.some(m=>m.addedNodes?.length)||pending)return;pending=true;setTimeout(()=>{pending=false;applyAll(data.blocks)},120)});observer.observe(document.body,{subtree:true,childList:true})}if(data.popup&&data.popup.id)renderPopup(data.popup,()=>fetch('/content/popup/'+encodeURIComponent(data.popup.id)+'/seen',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData})}).catch(()=>{}))}
async function startLive(){if(isMain||document.querySelector('script[src*="/miniapp/blocks.js"]'))return;let initData='';for(let n=0;n<12;n++){initData=window.Telegram?.WebApp?.initData||'';if(initData)break;await new Promise(r=>setTimeout(r,350))}if(!initData)return;try{const res=await fetch('/content/page',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({initData,slug})});if(!res.ok)return;const data=await res.json();mountLive(data,initData)}catch(e){}}
function main(){
 const mount=()=>{if(preview)mountPreview();else startLive()};
 if(window.TenxSafeHtml){mount();return}
 const script=document.createElement('script');script.src='/miniapp/safe-html.js?v=BOT_PREVIEW_FIX_20261111';
 script.onload=mount;script.onerror=mount;document.head.append(script);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',main,{once:true});else main();
})();
/* MMVS_GLOBAL_IMAGE_SPATIAL_R1: shared bridge extension START */
/* MMVS_GLOBAL_IMAGE_SPATIAL_R1 — stable selectors for managed image blocks.
 * Shared across every page that loads /miniapp/p74/studio/bridge.js.
 * Does not write data or modify scrolling. */
(()=>{
  'use strict';
  if(window.__MMVS_GLOBAL_IMAGE_IDS_R1__)return;
  window.__MMVS_GLOBAL_IMAGE_IDS_R1__=true;
  const isPreview=new URLSearchParams(location.search).get('visualPreview')==='1';
  let previous=[],scheduled=false;
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
  function refresh(){
    scheduled=false;
    const root=document.getElementById('mmvs-managed-content');
    const images=root?Array.from(root.querySelectorAll('.mmvs-c-block > img')):[];
    const instances=new Map();
    for(const image of images){
      const source=image.getAttribute('src')||'';
      const number=(instances.get(source)||0)+1;
      instances.set(source,number);
      image.id='mmvs-library-image-'+hash(source)+'-'+number;
      image.dataset.mmvsLayer='library-image';
      image.dataset.mmvsLayerLabel=image.getAttribute('alt')||'تصویر کتابخانه';
    }
    const changed=images.length!==previous.length||images.some((image,i)=>previous[i]!==image);
    previous=images;
    if(changed&&isPreview&&window.parent!==window){
      window.parent.postMessage({type:'MMVS_GLOBAL_IMAGES_RENDERED_R1',count:images.length},location.origin);
    }
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(refresh)}
  function relevant(record){
    const target=record.target;
    if(target instanceof Element&&(target.id==='mmvs-managed-content'||target.closest('#mmvs-managed-content')))return true;
    return Array.from(record.addedNodes).some(node=>node.nodeType===1&&
      (node.id==='mmvs-managed-content'||node.querySelector?.('#mmvs-managed-content')));
  }
  function start(){
    schedule();
    new MutationObserver(records=>{if(records.some(relevant))schedule()})
      .observe(document.body,{subtree:true,childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
/* MMVS_GLOBAL_IMAGE_SPATIAL_R1: shared bridge extension END */


/* MMVS_LIQUID_GLASS_BOOST_R1 */
(()=>{
'use strict';
if(document.getElementById('mmvs-liquid-glass-boost'))return;
const style=document.createElement('style');
style.id='mmvs-liquid-glass-boost';
style.textContent=`
#mmvs-overlay{
 background:rgba(1,8,6,.58)!important;
 backdrop-filter:blur(24px) saturate(165%)!important;
 -webkit-backdrop-filter:blur(24px) saturate(165%)!important;
}
#mmvs-overlay .mmvs-box{
 position:relative!important;
 isolation:isolate;
 background:linear-gradient(145deg,
 rgba(25,65,49,.65),rgba(5,24,19,.58))!important;
 border:1px solid rgba(244,199,151,.75)!important;
 border-radius:30px!important;
 box-shadow:
 0 28px 90px rgba(0,0,0,.62),
 inset 0 1px 0 rgba(255,255,255,.23),
 inset 0 -1px 0 rgba(255,255,255,.06)!important;
 backdrop-filter:blur(32px) saturate(180%)!important;
 -webkit-backdrop-filter:blur(32px) saturate(180%)!important;
}
#mmvs-overlay .mmvs-box:before{
 content:"";
 position:absolute;
 inset:1px;
 border-radius:inherit;
 pointer-events:none;
 z-index:0;
 background:linear-gradient(125deg,
 rgba(255,255,255,.15),transparent 38%,
 transparent 70%,rgba(77,255,177,.09));
}
#mmvs-overlay .mmvs-box>*{
 position:relative;
 z-index:1;
}
#mmvs-overlay h2{
 color:#ffd2a8!important;
 text-shadow:0 0 24px rgba(255,190,125,.24);
}
#mmvs-overlay .mmvs-actions{
 display:flex;
 flex-wrap:wrap;
 gap:12px;
 margin-top:22px;
}
#mmvs-overlay .mmvs-actions button,
#mmvs-overlay .org-close{
 border:1px solid rgba(255,255,255,.25)!important;
 background:linear-gradient(135deg,#70ffb1,#19d985)!important;
 color:#052b1c!important;
 border-radius:15px!important;
 padding:13px 25px!important;
 font-weight:900!important;
 box-shadow:0 8px 30px rgba(30,245,150,.23);
 transition:transform .2s,box-shadow .2s;
}
#mmvs-overlay .mmvs-actions a{
 border:1px solid rgba(255,211,157,.8)!important;
 background:rgba(255,255,255,.07)!important;
 color:#ffe0bd!important;
 border-radius:15px!important;
 padding:13px 22px!important;
 backdrop-filter:blur(12px);
}
#mmvs-overlay .org-person{
 background:rgba(255,255,255,.055)!important;
 border:1px solid rgba(255,255,255,.16)!important;
 border-radius:20px!important;
 backdrop-filter:blur(16px);
 -webkit-backdrop-filter:blur(16px);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.1);
 transition:transform .25s,background .25s;
}
#mmvs-overlay .org-person:hover{
 transform:translateY(-4px);
 background:rgba(255,255,255,.1)!important;
}
#mmvs-overlay .org-avatar{
 border-color:rgba(110,255,185,.75)!important;
 box-shadow:0 0 22px rgba(60,255,170,.17);
}
@media(max-width:420px){
 #mmvs-overlay{padding:13px!important}
 #mmvs-overlay .mmvs-box{
  padding:22px!important;
  border-radius:26px!important;
 }
}
`;
document.head.append(style);
})();
