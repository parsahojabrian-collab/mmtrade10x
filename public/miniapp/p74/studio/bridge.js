/* MMTrade10X Visual Studio bridge R3. Published data comes only from authenticated Telegram /content/page. */
(()=>{'use strict';if(window.__MMVS_BRIDGE_R1__)return;window.__MMVS_BRIDGE_R1__=true;
const query=new URLSearchParams(location.search),preview=query.get('visualPreview')==='1';
const pathname=location.pathname;const isMain=/\/miniapp\/(?:index\.html)?$/.test(pathname)||pathname==='/miniapp';
const slug=pathname.includes('/learning/')?'academy':pathname.includes('/profile/')?'profile':pathname.includes('/support/')?'support':pathname.includes('/copytrade-academy/')?'copytrade-academy':pathname.includes('/copy-trading')?'copy-trading':pathname.includes('/crypto')?'crypto':pathname.includes('/challenge')?'challenge':'index';
const accepted=u=>typeof u==='string'&&(/^(https:\/\/\S+)$/.test(u)||/^\/(?!\/)\S*$/.test(u));
const shadow={none:'none',soft:'0 2px 10px rgba(0,0,0,.12)',medium:'0 5px 18px rgba(0,0,0,.2)',strong:'0 10px 30px rgba(0,0,0,.3)'};
const styles={fontSize:v=>v+'px',borderRadius:v=>v+'px',padding:v=>v+'px',margin:v=>v+'px',letterSpacing:v=>v+'px',width:v=>v+'px',maxWidth:v=>v+'px',minHeight:v=>v+'px',fontWeight:v=>v,opacity:v=>v,lineHeight:v=>v,textAlign:v=>v,shadow:v=>shadow[v]};
let previewBlocks=[],selected=null,popupEl=null,observer=null;
function safeSelect(s){if(typeof s!=='string'||!s||s.length>500)return null;try{return document.querySelector(s)}catch(e){return null}}
function applyOne(b){if(!b||b.type!=='element'||!b.selector||b.selector.startsWith('#p74-home-config')||b.selector.startsWith('#p77-profile-config'))return;
const el=safeSelect(b.selector);if(!el)return;if(b.deleted===true){el.dataset.mmvsHidden='1';el.style.setProperty('display','none','important');return}if(el.dataset.mmvsHidden==='1'){el.style.removeProperty('display');delete el.dataset.mmvsHidden}
if(typeof b.text==='string'){const nodes=[...el.childNodes].filter(n=>n.nodeType===3);if(nodes.length){if(nodes[0].nodeValue!==b.text)nodes[0].nodeValue=b.text;for(const n of nodes.slice(1))if(n.nodeValue!=='')n.nodeValue=''}else if(!el.children.length&&el.textContent!==b.text)el.textContent=b.text;}
if(typeof b.href==='string'&&el.tagName==='A'&&accepted(b.href))el.setAttribute('href',b.href);
if(typeof b.src==='string'&&el.tagName==='IMG'&&accepted(b.src))el.setAttribute('src',b.src);
if(typeof b.alt==='string'&&el.tagName==='IMG')el.setAttribute('alt',b.alt);
for(const [key,target] of [['color','color'],['background','backgroundColor'],['borderColor','borderColor']])if(typeof b[key]==='string'&&/^#[0-9a-fA-F]{6}$/.test(b[key]))el.style[target]=b[key];
for(const [key,fn] of Object.entries(styles)){if(b[key]===undefined||b[key]===null)continue;if(key==='shadow'){if(shadow[b[key]])el.style.boxShadow=fn(b[key]);continue}if(['fontWeight','textAlign'].includes(key)){el.style[key]=fn(b[key]);continue}let n=Number(b[key]);if(!Number.isFinite(n))continue;const css=key==='shadow'?'boxShadow':key;el.style[css]=fn(n)}
if(b.borderWidth!==undefined){let n=Number(b.borderWidth);if(Number.isFinite(n))el.style.borderWidth=n+'px';el.style.borderStyle='solid'}
}
function applyAll(items){if(!Array.isArray(items))return;for(const x of items)applyOne(x)}

/* MMVS R3: render only validated data-driven content blocks; no HTML injection.
   On /miniapp/index.html the existing blocks.js stays the sole live renderer. */
function managedStyle(){if(document.getElementById('mmvs-managed-style'))return;const style=document.createElement('style');style.id='mmvs-managed-style';style.textContent=`
#mmvs-managed-content{direction:rtl;max-width:850px;margin:24px auto;padding:18px;border:1px solid #467960;border-radius:20px;background:linear-gradient(145deg,#102f23,#071c17);color:#f1f2e8;font:14px/1.85 Tahoma,Arial,sans-serif;box-sizing:border-box}
#mmvs-managed-content *{box-sizing:border-box}#mmvs-managed-content .mmvs-c-block{margin:12px 0;padding:10px;overflow-wrap:anywhere}#mmvs-managed-content h2{font-size:22px;color:#f0c494;margin:4px 0}#mmvs-managed-content p{white-space:pre-wrap;margin:5px 0}#mmvs-managed-content img{max-width:100%;max-height:430px;object-fit:contain;border-radius:15px;display:block;margin:auto}#mmvs-managed-content a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:10px 17px;text-decoration:none;border-radius:11px;color:#092018;background:linear-gradient(110deg,#f3d6a5,#c18f62);font-weight:bold}#mmvs-managed-content .mmvs-banner{background:#154331;border:1px solid #88714e;border-radius:14px;padding:15px}#mmvs-managed-content .mmvs-progress{background:#092015;border:1px solid #537762;border-radius:12px;overflow:hidden;height:12px;margin:8px 0}#mmvs-managed-content .mmvs-progress-bar{background:linear-gradient(90deg,#c5a16a,#63edb6);height:100%;transition:width .15s}#mmvs-managed-content hr{border:0;border-top:1px solid #537762}
`;document.head.append(style)}
function renderContent(items,progress){if(!Array.isArray(items))return;const contents=items.filter(x=>x&&x.type!=='element'&&['heading','text','image','button','banner','divider','progress','mm10_step'].includes(x.type));let root=document.getElementById('mmvs-managed-content');if(!contents.length){root?.remove();return}managedStyle();if(!root){root=document.createElement('section');root.id='mmvs-managed-content';root.setAttribute('aria-label','محتوای مدیریت‌شده');document.body.append(root)}root.replaceChildren();
for(const b of contents){const block=document.createElement('div');block.className='mmvs-c-block';let element=null;
switch(b.type){
case 'heading':element=document.createElement('h2');element.textContent=b.text||'';break;
case 'text':element=document.createElement('p');element.textContent=b.text||'';break;
case 'image':if(!accepted(b.url))break;element=document.createElement('img');element.src=b.url;element.alt=b.alt||'';element.loading='lazy';break;
case 'button':if(!accepted(b.url))break;element=document.createElement('a');element.href=b.url;element.textContent=b.text||'';break;
case 'banner':{element=document.createElement('div');element.className='mmvs-banner';const h=document.createElement('h2');h.textContent=b.title||'';element.append(h);if(b.text){const text=document.createElement('p');text.textContent=b.text;element.append(text)}if(accepted(b.url)){const a=document.createElement('a');a.textContent='مشاهده';a.href=b.url;element.append(a)}break;}
case 'progress':{element=document.createElement('div');const h=document.createElement('p');h.textContent=b.title||'پیشرفت';element.append(h);const outer=document.createElement('div');outer.className='mmvs-progress';const inside=document.createElement('div');inside.className='mmvs-progress-bar';const pct=Number(progress?.[b.kind||'academy']?.pct||0);inside.style.width=Math.max(0,Math.min(100,pct))+'%';outer.append(inside);element.append(outer);break;}
case 'mm10_step':{element=document.createElement('div');element.className='mmvs-banner';const h=document.createElement('h2');h.textContent=b.title||'';const text=document.createElement('p');text.textContent=b.body||'';element.append(h,text);break;}
case 'divider':element=document.createElement('hr');break;
}
if(!element)continue;block.append(element);root.append(block)
}}

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
const sel=uniqueSelector(target);if(!sel||sel.length>500)return;e.preventDefault();e.stopImmediatePropagation();if(selected)selected.style.removeProperty('outline');selected=target;selected.style.setProperty('outline','2px dashed #46e7ad','important');
const textNodes=[...target.childNodes].filter(x=>x.nodeType===3);const info={selector:sel,tag:target.tagName,text:textNodes.length?textNodes[0].nodeValue:target.children.length?'':target.textContent?.slice(0,3000),href:target.getAttribute('href'),src:target.getAttribute('src')};window.parent.postMessage({type:'MMVS_SELECT',element:info},location.origin)}
function stylePopup(){if(document.getElementById('mmvs-popup-style'))return;const css=document.createElement('style');css.id='mmvs-popup-style';css.textContent='#mmvs-overlay{position:fixed;inset:0;z-index:2147483600;background:#000c;display:grid;place-items:center;padding:20px;direction:rtl}#mmvs-overlay .mmvs-box{width:min(100%,470px);max-height:92vh;overflow:auto;background:#0d2920;border:1px solid #d7aa79;border-radius:22px;color:#fff;padding:20px;box-shadow:0 26px 80px #0009;font:14px/1.9 Tahoma,sans-serif}#mmvs-overlay h2{margin:0 0 10px;color:#f3c79c}#mmvs-overlay img{display:block;max-width:100%;max-height:270px;object-fit:contain;border-radius:12px;margin:12px auto}#mmvs-overlay a,#mmvs-overlay button{border:1px solid #dfb781;background:#134534;color:#fff;padding:10px 16px;margin:8px 5px 0;border-radius:10px;text-decoration:none;font:inherit;cursor:pointer}#mmvs-overlay .mmvs-actions{display:flex;flex-wrap:wrap}';document.head.append(css)}
function renderPopup(p,seen){if(!p||typeof p.title!=='string'||typeof p.body!=='string')return;popupEl?.remove();stylePopup();const over=document.createElement('div');over.id='mmvs-overlay';over.setAttribute('role','dialog');over.setAttribute('aria-modal','true');const box=document.createElement('div');box.className='mmvs-box';const heading=document.createElement('h2');heading.textContent=p.title;box.append(heading);if(p.imageUrl&&accepted(p.imageUrl)){const img=document.createElement('img');img.src=p.imageUrl;img.alt='';box.append(img)}const body=document.createElement('p');body.textContent=p.body;box.append(body);const actions=document.createElement('div');actions.className='mmvs-actions';if(p.buttonText&&p.buttonUrl&&accepted(p.buttonUrl)){const link=document.createElement('a');link.textContent=p.buttonText;link.href=p.buttonUrl;if(link.href.startsWith('https://')){link.target='_blank';link.rel='noopener noreferrer'}actions.append(link)}const close=document.createElement('button');close.textContent='بستن';close.onclick=()=>{over.remove();if(typeof seen==='function')seen()};actions.append(close);box.append(actions);over.append(box);document.body.append(over);popupEl=over}
/* MMVS_PUBLISHED_FOLD_R1 LIVE: uses published blocks returned by existing authenticated API. */
 const MMVS_PUBLISHED_FOLD_MARKER='#mmvs-published-fold-configuration';
 function mmvsPublishedFoldApply(items){
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
function main(){if(preview)mountPreview();else startLive()}
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
