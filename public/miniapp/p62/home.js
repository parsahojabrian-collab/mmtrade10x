/* TENX_P62_HOME_STUDIO_RUNTIME_V1 - real DOM, mobile first, no generated-HTML execution */
(function(){
'use strict';
const path=location.pathname.replace(/\/+$/,'')||'/';
if(!['/miniapp','/miniapp/index.html'].includes(path))return;
const query=new URLSearchParams(location.search);
if(query.get('view'))return;
const isPreview=query.get('p62preview')==='1';
let current=null, template=1, host=null, player=null;
const make=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e};
const safe=(url)=>typeof url==='string' && (/^\/(?!\/)[a-zA-Z0-9_./?=&%#-]*$/.test(url)||/^https:\/\/[\w.-]+(?::\d{2,5})?(?:\/[\w~!$&'()*+,;=:@%/?#.-]*)?$/.test(url)||url==='#video')?url:'#';
const icon=(name)=>({'user':'♙','layers':'▱','chart':'▥','trophy':'♕','shield':'◇','bolt':'ϟ','infinity':'∞','play':'▷','book':'▤','target':'◎','rocket':'↗','arrow':'←','star':'✦','gem':'◇'}[name]||'✦');
const decorative=(parent,what,depth)=>{const o=make('div','mf62-float '+what);o.dataset.depth=String(depth||20);o.setAttribute('aria-hidden','true');parent.append(o);return o};
function applyStyle(node,s){if(!s||typeof s!=='object')return;
 if(/^#[\da-f]{6}$/i.test(s.color||''))node.style.color=s.color;
 if(/^#[\da-f]{6}$/i.test(s.bg||''))node.style.backgroundColor=s.bg;
 for(const [key,css,min,max] of [['radius','borderRadius',0,80],['padding','padding',0,80]])if(Number.isFinite(Number(s[key])))node.style[css]=Math.max(min,Math.min(max,Number(s[key])))+'px';
 if(Number.isFinite(Number(s.opacity)))node.style.opacity=String(Math.max(.05,Math.min(1,Number(s.opacity))));
 if(['right','center','left'].includes(s.align))node.style.textAlign=s.align;
}
function link(href,cls,title){const a=make('a',cls,title);a.href=safe(href||'/challenge');return a}
function buildVideo(item){const outer=make('section','mf62-block mf62-video-card mf62-scene-fade');applyStyle(outer,item.style);
 outer.id='mf62-hero';let art=make('div','mf62-video-art');art.style.backgroundImage=`linear-gradient(90deg,rgba(0,11,8,.05),rgba(0,17,11,.3)),url("${safe(item.poster||'/miniapp/p62/assets/hero-1.webp')}")`;outer.append(art);
 let under=make('div','mf62-video-content');const over=make('div','mf62-video-eyebrow','MATIN FUTURE · 10X');under.append(over,make('h1','mf62-video-title',item.title||'چالش ۱۰X'),make('p','mf62-video-subtitle',item.subtitle||''));outer.append(under);
 const btn=make('button','mf62-video-play');btn.type='button';btn.ariaLabel='پخش ویدیو';btn.textContent='▶';btn.addEventListener('click',()=>playVideo(item));outer.append(btn);
 if(item.text)outer.append(make('div','mf62-video-caption',item.text));
 decorative(outer,'mf62-video-orbit',14);return outer;
}
function playVideo(item){const src=safe(item.media||'');if(src==='#'||!item.media){const b=document.querySelector('#mf62-hero .mf62-video-play');if(b){b.textContent='ویدیو هنوز بارگذاری نشده';b.classList.add('mf62-video-empty');setTimeout(()=>{b.textContent='▶';b.classList.remove('mf62-video-empty')},2300)}return;}
 if(player)player.remove();player=make('div','mf62-player-overlay');const frame=make('div','mf62-player-box');const close=make('button','mf62-player-close','×');close.ariaLabel='بستن ویدیو';const video=make('video','');video.src=src;video.poster=safe(item.poster||'');video.controls=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';close.addEventListener('click',()=>{video.pause();player.remove();player=null});player.addEventListener('click',e=>{if(e.target===player)close.click()});frame.append(close,video);player.append(frame);document.body.append(player);video.play().catch(()=>{});
}
function addHeading(item){let root=make('section','mf62-block mf62-headline');applyStyle(root,item.style);let x=make('h2','',item.title||'');root.append(x);if(item.subtitle)root.append(make('p','',item.subtitle));return root}
function addButton(item){const root=make('section','mf62-block mf62-button-block');applyStyle(root,item.style);let a=link(item.url||'#', 'mf62-main-cta'+(item.style&&item.style.variant==='outline'?' is-outline':''));const i=make('span','mf62-cta-icon',icon(item.icon||'arrow'));a.append(make('b','',item.title||'بیشتر بدانید'),i);root.append(a);a.addEventListener('click',e=>{if(item.url==='#video'){e.preventDefault();const hero=current?.blocks?.find(b=>b.type==='video'&&b.visible!==false);if(hero)playVideo(hero)}});return root}
function addSteps(item){const root=make('section','mf62-block mf62-steps-wrap');root.dataset.parallax=String(Math.max(0,Math.min(60,Number(item.style?.parallax)||18)));applyStyle(root,item.style);
 const head=make('div','mf62-steps-heading');head.append(make('h2','',item.title||'مراحل چالش'),make('p','',item.subtitle||''));root.append(head);
 const scene=make('div','mf62-step-scene');const sky=make('div','mf62-sky');scene.append(sky);decorative(scene,'mf62-arch',13);decorative(scene,'mf62-coin',28);decorative(scene,'mf62-sphere',20);
 if(template===1){const sculpture=make('div','mf62-sculpt-mini','10X');sculpture.dataset.depth='12';sculpture.classList.add('mf62-float');scene.append(sculpture)}
 const steps=make('div','mf62-step-list');for(const [idx,x] of (item.steps||[]).entries()){const a=link(x.url||'/challenge','mf62-step-card');a.style.setProperty('--step-index',String(idx));a.append(make('span','mf62-step-index',String(idx+1)),make('span','mf62-step-icon',icon(x.icon)),make('strong','',x.title||''),make('small','',x.subtitle||''));steps.append(a)}scene.append(steps);root.append(scene);return root;
}
function addFeatures(item){const root=make('section','mf62-block mf62-features');applyStyle(root,item.style);for(const x of (item.steps||[])){const a=link(x.url||'/support','mf62-feature');a.append(make('i','',icon(x.icon)),make('strong','',x.title||''));if(x.subtitle)a.append(make('small','',x.subtitle));root.append(a)}return root}
function addProgress(item){const root=make('section','mf62-block mf62-progress');applyStyle(root,item.style);const progress=make('div','mf62-progress-ring');const val=make('b','mf62-progress-value','—');progress.append(val);const label=make('div','mf62-progress-text');label.append(make('strong','',item.title||'پیشرفت من'),make('small','',item.subtitle||''));root.append(progress,label,link('/profile','mf62-progress-arrow','‹'));
 const source=document.querySelector('#progress-percent');const update=()=>{let t=source?.textContent?.trim()||'—';let n=Number(t.replace(/[%٪\s]/g,''));val.textContent=/^\d/.test(t)?t.replace('%','')+'٪':'—';progress.style.setProperty('--mf62-percent',Number.isFinite(n)?Math.min(100,Math.max(0,n))+'%':'0%')};update();if(source){new MutationObserver(update).observe(source,{subtree:true,childList:true,characterData:true})};return root}
function addSculpture(item){const root=make('section','mf62-block mf62-final-sculpt');applyStyle(root,item.style);decorative(root,'mf62-big-ring',34);root.append(make('div','mf62-sculpt-title',item.title||'10X'),make('div','mf62-sculpt-label',item.subtitle||'MATIN FUTURE'));return root}
function addImage(item){const root=make('section','mf62-block mf62-custom-image');applyStyle(root,item.style);const image=make('img');image.src=safe(item.media||item.poster||'');image.loading='lazy';image.alt=item.title||'';root.append(image);if(item.title)root.append(make('p','',item.title));return root}
function block(item){if(!item||item.visible===false)return null;switch(item.type){case 'video':return buildVideo(item);case 'headline':return addHeading(item);case 'steps':return addSteps(item);case 'button':return addButton(item);case 'features':return addFeatures(item);case 'progress':return addProgress(item);case 'sculpture':return addSculpture(item);case 'image':return addImage(item);case 'text':{let d=make('section','mf62-block mf62-custom-text',item.text||item.title||'');applyStyle(d,item.style);return d}case 'divider':return make('hr','mf62-block mf62-divider');case 'spacer':{const d=make('div','mf62-block');d.style.height=Math.max(8,Math.min(200,Number(item.style?.padding)||30))+'px';return d}default:return null}}
function render(d,t){if(!d||!Array.isArray(d.blocks))return;current=d;template=Number(t)||1;
 if(!host){host=make('div','mf62-home');host.id='mf62-home';host.dir='rtl';const main=document.querySelector('main.home-shell');if(!main)return;main.prepend(host)}
 host.className='mf62-home mf62-theme-'+template;host.replaceChildren();document.body.classList.add('mf62-home-active');
 const frame=make('div','mf62-home-frame');const brand=make('header','mf62-brand');const a=link('/miniapp','mf62-brand-link');const logo=make('img','mf62-brand-image');logo.src=safe(d.logo||'/uploads/challenge-organizers/mmtrade-logo-custom-p45.png');logo.alt='لوگوی رسمی 10X';logo.loading='eager';a.append(logo);const label=make('span','mf62-brand-text');label.append(make('b','','MATIN FUTURE'),make('small','','10X CHALLENGE'));a.append(label);brand.append(a,link('/profile','mf62-user-link','◉'));frame.append(brand);
 const main=make('div','mf62-content');for(const item of d.blocks){const el=block(item);if(el){el.dataset.p62id=item.id||'';main.append(el)}}frame.append(main);host.append(frame);
 const nav=document.querySelector('.tenx-bottom-nav');if(nav){nav.classList.add('mf62-retained-bottom-nav')}
 window.requestAnimationFrame(()=>paintScroll());}
let ticking=false;
const reducedMotion=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function paintScroll(){if(!host||reducedMotion)return;const box=host.getBoundingClientRect();const view=window.innerHeight||700;host.querySelectorAll('.mf62-float').forEach(el=>{const p=el.closest('.mf62-block')||el.closest('.mf62-step-scene')||host;const rect=p.getBoundingClientRect();const center=(rect.top+rect.height/2-view/2)/view;const depth=Math.max(0,Math.min(60,Number(el.dataset.depth)||15));const amount=Math.max(-depth,Math.min(depth,center*depth*2));el.style.setProperty('--mf62-scroll-y',amount.toFixed(1)+'px')});ticking=false}
window.addEventListener('scroll',()=>{if(ticking)return;ticking=true;requestAnimationFrame(paintScroll)},{passive:true});
window.addEventListener('resize',()=>{if(!ticking){ticking=true;requestAnimationFrame(paintScroll)}},{passive:true});
/* TENX_P67_HOME_PREVIEW_SYNC_V1: explicit theme on URL and working-draft session fallback */
window.addEventListener('message',e=>{
 if(!isPreview||e.origin!==location.origin||e.data?.type!=='mf62-preview')return;
 const p=e.data?.draft,t=Number(e.data?.theme),rev=Number(e.data?.revision||0);
 if(p&&Array.isArray(p.blocks)&&[1,2,3].includes(t)){
  render(p,t);
  window.parent?.postMessage({type:'mf62-applied',theme:t,revision:rev},location.origin);
 }
});
if(isPreview){
 const param=query.get('p62theme');const selected=/^[123]$/.test(param||'')?param:'1';
 const script=document.createElement('script');script.src='/miniapp/p62/preview-seed.js?v=p67';
 script.onload=()=>{
  const preset=window.MF62_PRESETS?.drafts?.[selected];let draft=preset;
  try{
   const saved=JSON.parse(sessionStorage.getItem('TENX_P67_EDITOR_PREVIEW')||'null');
   if(saved?.theme===selected&&Date.now()-Number(saved.at)<180000&&Array.isArray(saved?.draft?.blocks))draft=saved.draft;
  }catch(e){}
  if(draft)render(draft,Number(selected));
  window.parent?.postMessage({type:'mf62-applied',theme:Number(selected),revision:0},location.origin);
  window.parent?.postMessage({type:'mf62-ready',theme:Number(selected)},location.origin);
 };
 script.onerror=()=>{
  const n=document.createElement('p');n.style.cssText='color:#ffb6a9;padding:22px;text-align:center';
  n.textContent='خطا در بارگذاری پیش‌نمایش: preview-seed.js';
  document.body.prepend(n);
  window.parent?.postMessage({type:'mf62-preview-error',reason:'seed_not_loaded'},location.origin);
 };
 document.head.append(script);return;
}
fetch('/public/home-studio',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('fetch'))).then(x=>{if(x?.active&&x?.published)render(x.published,x.active)}).catch(()=>{ /* preserve original homepage on failure */ });
})();
