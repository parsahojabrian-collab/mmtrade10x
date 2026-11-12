/* MMVS_R99_BACKGROUND_STUDIO — layered backgrounds, gradients and media-library images. */
(()=>{
'use strict';
if(window.MMVS_SectionBackground?.version==='R100')return;
const $=id=>document.getElementById(id);
const LABEL='🎨 استودیوی پس‌زمینه';
let sectionChoices=[],currentLayers=[],pendingImageLayerId='',highlighted=null,oldOutline='',previewTimer=0,idCounter=0;
const blendOptions=[['normal','عادی'],['screen','روشن‌کننده'],['multiply','ضربی'],['overlay','Overlay'],['soft-light','Soft Light']];
const typeNames={solid:'رنگ ساده',linear:'گرادیانت خطی',radial:'گرادیانت شعاعی',image:'تصویر کتابخانه'};
const frame=()=>{try{return $('frame')?.contentDocument||null}catch{return null}};
const note=(message,bad=false)=>{const n=$('mmvs-bg-status');if(n){n.textContent=message;n.classList.toggle('bad',bad)}};
const makeId=()=>`bg-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
const validImage=url=>{if(typeof url!=='string'||url.length>2048||url.startsWith('//')||! /\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i.test(url))return false;try{const u=new URL(url,location.origin);return u.protocol==='https:'||(u.protocol==='http:'&&u.origin===location.origin)}catch{return false}};
function stableSelector(el,d){
 const native=d.defaultView.__MMVS_DOM_BASE_SELECTOR__?.(el);if(typeof native==='string'&&native.length&&native.length<=500)return native;
 if(el.id){const q='#'+CSS.escape(el.id);if(d.querySelectorAll(q).length===1)return q}
 let n=el,parts=[];while(n&&n!==d.body&&parts.length<24){if(n.id){parts.unshift('#'+CSS.escape(n.id));break}const tag=n.tagName.toLowerCase();let i=1;for(let p=n.previousElementSibling;p;p=p.previousElementSibling)if(p.tagName===n.tagName)i++;parts.unshift(tag+':nth-of-type('+i+')');const q=parts.join(' > ');try{if(q.length<=500&&d.querySelectorAll(q).length===1)return q}catch{}n=n.parentElement}const q=parts.join(' > ');return q.length<=500?q:null;
}
function displayName(el){const h=el.querySelector?.('h1,h2,h3,h4,[data-mmvs-title]');const label=(h?.textContent||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,48);return (label?label+' · ':'')+(el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+(typeof el.className==='string'?el.className.split(/\s+/).slice(0,2).join('.'):''));}
function fillSections(){
 const d=frame(),select=$('mmvs-bg-section');if(!d||!select){note('پیش‌نمایش در دسترس نیست؛ ابتدا صفحه آموزش کپی‌ترید را باز کن.',true);return}
 const previous=select.value,items=[],seen=new Set();
 const add=el=>{if(!el||seen.has(el))return;const selector=stableSelector(el,d);if(!selector||selector.length>500)return;seen.add(el);items.push({selector,name:displayName(el).slice(0,100),node:el})};
 // Explicit presets are included even when #D (lesson view) is currently hidden.
 add(d.querySelector('#course-index'));add(d.querySelector('#D'));
 const selectors='main,section,article,header,footer,aside,figure,nav,div,[data-mmvs-section],[class*="section"],[class*="step"],[class*="card"],[class*="panel"],[class*="page"],[class*="hero"],[class*="content"]';
 for(const el of [...d.querySelectorAll(selectors)].slice(0,5500)){
  if(el.matches('html,body,head,script,style,link,meta,noscript,template,svg,canvas,iframe,form,input,button,select,textarea,[contenteditable="true"]')||el.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-managed-content,#mmvs-v2-image-plane,#mmvs-overlay'))continue;
  const st=d.defaultView.getComputedStyle(el),r=el.getBoundingClientRect();if(st.display==='none'||st.visibility==='hidden'||r.width<90||r.height<38||el.children.length===0)continue;add(el);if(items.length>=350)break;
 }
 sectionChoices=items;select.replaceChildren(new Option('بخش موردنظر را انتخاب کن',''));
 for(const x of items)select.add(new Option((x.selector==='#course-index'?'فهرست هفت درس · ':x.selector==='#D'?'داخل درس‌ها · ':'')+x.name,x.selector));
 if(items.some(x=>x.selector===previous))select.value=previous;else if(items.some(x=>x.selector==='#course-index'))select.value='#course-index';else if(items.length)select.value=items[0].selector;
 loadSection();note(items.length+' بخش پیدا شد.');
}
function cleanClone(v){return JSON.parse(JSON.stringify(v))}
function legacyToLayers(bg){if(!bg?.url)return[];const out=[{id:makeId(),type:'image',enabled:true,opacity:1,blur:0,blend:'normal',url:bg.url,fit:bg.fit||'cover',positionX:bg.position==='left'?0:bg.position==='right'?100:50,positionY:bg.position==='top'?0:bg.position==='bottom'?100:50}];if(Number(bg.dim)>0)out.push({id:makeId(),type:'solid',enabled:true,opacity:Number(bg.dim),blur:0,blend:'normal',color:'#000000'});return out}
function splitCssList(value){
 const out=[];let start=0,depth=0,quote='';
 for(let i=0;i<value.length;i++){const c=value[i];if(quote){if(c===quote&&value[i-1]!=='\\')quote='';continue}if(c==='"'||c==="'"){quote=c;continue}if(c==='(')depth++;else if(c===')')depth=Math.max(0,depth-1);else if(c===','&&depth===0){out.push(value.slice(start,i).trim());start=i+1}}
 const last=value.slice(start).trim();if(last)out.push(last);return out;
}
function splitCssWords(value){const out=[];let start=0,depth=0,quote='';for(let i=0;i<value.length;i++){const c=value[i];if(quote){if(c===quote&&value[i-1]!=='\\')quote='';continue}if(c==='"'||c==="'"){quote=c;continue}if(c==='(')depth++;else if(c===')')depth=Math.max(0,depth-1);else if(/\s/.test(c)&&depth===0){const part=value.slice(start,i).trim();if(part)out.push(part);start=i+1}}const last=value.slice(start).trim();if(last)out.push(last);return out}
function cssColor(value){
 const v=String(value||'').trim().toLowerCase();if(v==='transparent')return{color:'#000000',alpha:0};
 if(/^#[0-9a-f]{3}$/i.test(v))return{color:'#'+v.slice(1).split('').map(x=>x+x).join(''),alpha:1};
 if(/^#[0-9a-f]{6}$/i.test(v))return{color:v,alpha:1};
 const m=v.match(/^rgba?\(([^)]+)\)$/);if(!m)return null;
 const a=m[1].split(',').map(x=>x.trim());if(a.length<3)return null;
 const rgb=a.slice(0,3).map(x=>{const n=parseFloat(x);return Math.max(0,Math.min(255,Math.round(x.endsWith('%')?n*2.55:n))) });
 const alpha=a.length>3?Math.max(0,Math.min(1,parseFloat(a[3]))):1;
 if(rgb.some(x=>!Number.isFinite(x))||!Number.isFinite(alpha))return null;
 return{color:'#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join(''),alpha};
}
function parseGradient(raw){
 const m=String(raw||'').trim().match(/^(linear|radial)-gradient\((.*)\)$/i);if(!m)return null;
 const type=m[1].toLowerCase(),parts=splitCssList(m[2]);let prelude='';
 if(parts.length&& !/(?:rgba?\(|#[0-9a-f]{3,8}\b|\btransparent\b)/i.test(parts[0]))prelude=parts.shift();
 let angle=180,shape='circle',centerX=50,centerY=50;
 if(type==='linear'){
  const deg=prelude.match(/(-?\d+(?:\.\d+)?)deg/i);if(deg)angle=((Number(deg[1])%360)+360)%360;
  else if(/to\s+top/i.test(prelude))angle=0;else if(/to\s+right/i.test(prelude))angle=90;else if(/to\s+bottom/i.test(prelude))angle=180;else if(/to\s+left/i.test(prelude))angle=270;
 }else{
  shape=/\bellipse\b/i.test(prelude)?'ellipse':'circle';const at=prelude.match(/\bat\s+([\d.]+)%\s+([\d.]+)%/i);if(at){centerX=Number(at[1]);centerY=Number(at[2])}
 }
 let stops=parts.map(part=>{
  const hit=part.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b)(?:\s+([\d.]+)%)?/i);if(!hit)return null;
  const c=cssColor(hit[1]);if(!c)return null;return{color:c.color,alpha:c.alpha,at:hit[2]===undefined?null:Number(hit[2])};
 }).filter(Boolean);
 if(stops.length<2)return null;
 if(stops[0].at===null)stops[0].at=0;if(stops[stops.length-1].at===null)stops[stops.length-1].at=100;
 for(let i=1;i<stops.length-1;){if(stops[i].at!==null){i++;continue}let j=i;while(j<stops.length&&stops[j].at===null)j++;const left=stops[i-1].at,right=stops[j].at,count=j-i;for(let k=0;k<count;k++)stops[i+k].at=left+(right-left)*(k+1)/(count+1);i=j+1}
 stops=stops.slice(0,5).map(x=>({color:x.color,alpha:x.alpha,at:Math.max(0,Math.min(100,x.at))}));
 return type==='linear'?{id:makeId(),type:'linear',enabled:true,opacity:1,blur:0,blend:'normal',angle,stops}:{id:makeId(),type:'radial',enabled:true,opacity:1,blur:0,blend:'normal',shape,centerX,centerY,stops};
}
function parseCssImage(raw,style){
 const g=parseGradient(raw);if(g)return g;
 const m=String(raw||'').trim().match(/^url\((.*)\)$/i);if(!m)return null;
 let rawUrl=m[1].trim().replace(/^['"]|['"]$/g,'');let url='';try{url=new URL(rawUrl,frame()?.location?.href||location.href).href}catch{return null}
 if(!validImage(url))return null;
 const size=style?.backgroundSize||'cover',pos=(style?.backgroundPosition||'50% 50%').split(/\s+/);
 const coord=(v,axis)=>{if(!v)return 50;if(v.endsWith('%'))return Math.max(0,Math.min(100,Number.parseFloat(v)));if(v==='left'||v==='top')return 0;if(v==='right'||v==='bottom')return 100;return 50};
 const blur=Number(style?.filter?.match(/blur\(([\d.]+)px\)/i)?.[1]||0);
 const opacity=Number.parseFloat(style?.opacity||'1');
 return{id:makeId(),type:'image',enabled:true,opacity:Number.isFinite(opacity)?Math.max(0,Math.min(1,opacity)):1,blur:Number.isFinite(blur)?Math.min(30,blur):0,blend:'normal',url,fit:size==='100% 100%'?'fill':size==='contain'?'contain':'cover',positionX:coord(pos[0]),positionY:coord(pos[1]||pos[0])};
}
function readStyleLayers(style){
 const raw=style?.backgroundImage||'none';if(raw==='none')return[];
 const parsed=splitCssList(raw).map(x=>parseCssImage(x,style)).filter(Boolean);
 return parsed.reverse(); // CSS lists are top-to-bottom; editor order is bottom-to-top.
}
function readCurrentCssLayers(node,selector){
 if(!node)return[];const win=node.ownerDocument.defaultView,out=[];
 const base=win.getComputedStyle(node);out.push(...readStyleLayers(base));
 const bg=base.backgroundColor;if(!out.length&&bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent'){const c=cssColor(bg);if(c)out.unshift({id:makeId(),type:'solid',enabled:true,opacity:c.alpha,blur:0,blend:'normal',color:c.color})}
 // Preserve the index's existing artwork and overlay pseudo-elements as editable layers.
 for(const pseudo of ['::before','::after']){const ps=win.getComputedStyle(node,pseudo);out.push(...readStyleLayers(ps))}
 return out.slice(0,8);
}
function loadSection(){
 const s=$('mmvs-bg-section')?.value||'',d=frame();if(highlighted?.isConnected)highlighted.style.outline=oldOutline;highlighted=null;
 let node=null;try{node=d?.querySelector(s)}catch{}if(node){highlighted=node;oldOutline=node.style.outline;node.style.outline='2px dashed #edca84'}
 const saved=window.MMVS_Spatial?.getSectionBackground?.(s)||null;
 if(Array.isArray(saved?.layers))currentLayers=cleanClone(saved.layers);
 else if(saved?.url)currentLayers=legacyToLayers(saved);
 else {currentLayers=readCurrentCssLayers(node,s);if(currentLayers.length)note('پس‌زمینه فعلی CSS خوانده شد؛ اکنون همه لایه‌های آن قابل ویرایش‌اند. برای ذخیره، پیش‌نمایش و Draft را اجرا کن.');}
 renderLayers();
}
function field(label,html){return `<label class="mmvs-bg-field"><span>${label}</span>${html}</label>`}
function renderLayers(){
 const host=$('mmvs-bg-layers');if(!host)return;host.replaceChildren();
 if(!currentLayers.length){const empty=document.createElement('p');empty.className='mmvs-bg-empty';empty.textContent='هنوز لایه‌ای اضافه نشده است. از دکمه‌های پایین یک رنگ، گرادیانت یا تصویر اضافه کن.';host.append(empty);return}
 currentLayers.forEach((layer,index)=>{
  const card=document.createElement('article');card.className='mmvs-bg-layer-card';card.dataset.id=layer.id;
  const top=document.createElement('div');top.className='mmvs-bg-layer-head';
  const title=document.createElement('strong');title.textContent=(index+1)+' · '+(typeNames[layer.type]||'لایه');
  const enabled=document.createElement('label');enabled.className='mmvs-bg-enable';const chk=document.createElement('input');chk.type='checkbox';chk.checked=layer.enabled;chk.dataset.field='enabled';chk.dataset.id=layer.id;enabled.append(chk,document.createTextNode('فعال'));
  const up=button('↑','move-up',layer.id,index===0),down=button('↓','move-down',layer.id,index===currentLayers.length-1),del=button('حذف','delete',layer.id,false,'danger');top.append(title,enabled,up,down,del);card.append(top);
  const controls=document.createElement('div');controls.className='mmvs-bg-layer-controls';
  controls.innerHTML=field('شفافیت '+Math.round(layer.opacity*100)+'٪',`<input type="range" min="0" max="1" step="0.01" value="${layer.opacity}" data-id="${layer.id}" data-field="opacity">`)+field('Blur '+layer.blur+'px',`<input type="range" min="0" max="30" step="1" value="${layer.blur}" data-id="${layer.id}" data-field="blur">`)+field('ترکیب رنگ',`<select data-id="${layer.id}" data-field="blend">${blendOptions.map(([v,t])=>`<option value="${v}" ${v===(layer.blend||'normal')?'selected':''}>${t}</option>`).join('')}</select>`);
  if(layer.type==='solid')controls.innerHTML+=field('رنگ لایه',`<input type="color" value="${layer.color}" data-id="${layer.id}" data-field="color">`);
  if(layer.type==='linear')controls.innerHTML+=field('زاویه گرادیانت',`<input type="range" min="0" max="360" step="1" value="${layer.angle}" data-id="${layer.id}" data-field="angle">`)+stopFields(layer);
  if(layer.type==='radial')controls.innerHTML+=field('شکل گرادیانت',`<select data-id="${layer.id}" data-field="shape"><option value="circle" ${layer.shape!=='ellipse'?'selected':''}>دایره‌ای</option><option value="ellipse" ${layer.shape==='ellipse'?'selected':''}>بیضی</option></select>`)+field('مرکز افقی',`<input type="range" min="0" max="100" value="${layer.centerX}" data-id="${layer.id}" data-field="centerX">`)+field('مرکز عمودی',`<input type="range" min="0" max="100" value="${layer.centerY}" data-id="${layer.id}" data-field="centerY">`)+stopFields(layer);
  if(layer.type==='image'){
   const img=field('تصویر',`<button type="button" data-action="pick-image" data-id="${layer.id}" class="mmvs-bg-pick">▣ انتخاب / آپلود از کتابخانه</button><small class="mmvs-bg-url">${esc(layer.url||'هنوز تصویری انتخاب نشده')}</small>`);
   controls.innerHTML+=img+field('نحوه نمایش',`<select data-id="${layer.id}" data-field="fit"><option value="cover" ${layer.fit==='cover'?'selected':''}>Cover</option><option value="contain" ${layer.fit==='contain'?'selected':''}>Contain</option><option value="fill" ${layer.fit==='fill'?'selected':''}>Fill / کشیده</option></select>`)+field('موقعیت افقی',`<input type="range" min="0" max="100" value="${layer.positionX}" data-id="${layer.id}" data-field="positionX">`)+field('موقعیت عمودی',`<input type="range" min="0" max="100" value="${layer.positionY}" data-id="${layer.id}" data-field="positionY">`);
  }
  card.append(controls);host.append(card);
 });
}
function stopFields(layer){
 return layer.stops.map((stop,i)=>field('توقف رنگ '+(i+1),`<div class="mmvs-bg-stop"><input type="color" value="${stop.color}" data-id="${layer.id}" data-field="stop-color" data-stop-index="${i}"><input type="range" min="0" max="100" value="${stop.at}" title="موقعیت رنگ" data-id="${layer.id}" data-field="stop-at" data-stop-index="${i}"><input type="range" min="0" max="1" step="0.01" value="${stop.alpha??1}" title="آلفای رنگ" data-id="${layer.id}" data-field="stop-alpha" data-stop-index="${i}"><button type="button" data-action="remove-stop" data-id="${layer.id}" data-stop-index="${i}" ${layer.stops.length<=2?'disabled':''}>−</button></div>`)).join('')+`<button type="button" data-action="add-stop" data-id="${layer.id}" ${layer.stops.length>=5?'disabled':''}>+ افزودن نقطه رنگ</button>`;
}
function button(text,action,id,disabled=false,cls=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.action=action;b.dataset.id=id;b.disabled=disabled;if(cls)b.className=cls;return b}
function makeLayer(type){const base={id:makeId(),type,enabled:true,opacity:1,blur:0,blend:'normal'};if(type==='solid')return {...base,color:'#0b3224'};if(type==='linear')return {...base,angle:180,stops:[{color:'#0b3224',at:0},{color:'#010604',at:100}]};if(type==='radial')return {...base,shape:'ellipse',centerX:50,centerY:30,stops:[{color:'#18a86b',at:0},{color:'#010604',at:100}]};return {...base,url:'',fit:'cover',positionX:50,positionY:50}}
function validateLayers(){
 if(!currentLayers.length)return 'حداقل یک لایه اضافه کن.';if(currentLayers.length>8)return 'حداکثر ۸ لایه قابل مدیریت است.';
 for(const l of currentLayers){if(l.type==='image'&&(!validImage(l.url)||!['cover','contain','fill'].includes(l.fit)))return 'برای لایه تصویر، ابتدا از کتابخانه یک عکس انتخاب کن.';if(!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1||!Number.isFinite(l.blur)||l.blur<0||l.blur>30)return 'تنظیم شفافیت یا Blur معتبر نیست.';if((l.type==='linear'||l.type==='radial')&&(!Array.isArray(l.stops)||l.stops.length<2||l.stops.length>5||l.stops.some(t=>!/^#[0-9a-f]{6}$/i.test(t.color)||!Number.isFinite(t.at)||t.at<0||t.at>100||(t.alpha!==undefined&&(!Number.isFinite(t.alpha)||t.alpha<0||t.alpha>1)))))return 'توقف‌های رنگی معتبر نیستند.'}
 return '';
}
function applyPreview(){
 const s=$('mmvs-bg-section')?.value;if(!s||!sectionChoices.some(x=>x.selector===s))return note('ابتدا بخش مقصد را انتخاب کن.',true);
 const err=validateLayers();if(err)return note(err,true);
 const layers=cleanClone(currentLayers);const ok=window.MMVS_Spatial?.setSectionBackground?.(s,{layers});
 if(ok!==true)return note('اعمال نشد؛ مطمئن شو در حالت ویرایش Draft هستی.',true);
 note('پیش‌نمایش به‌روزرسانی شد. برای ماندگاری، Draft را ذخیره کن.');
}
function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(()=>{if(validateLayers()==='')applyPreview()},180)}
function addPreset(kind){
 const target=kind==='index'?'#course-index':'#D';if(!$('mmvs-bg-section')?.querySelector(`option[value="${target}"]`))fillSections();$('mmvs-bg-section').value=target;loadSection();
 note(currentLayers.length?'وضعیت فعلی این بخش بارگذاری شد؛ می‌توانی لایه‌های موجود را ویرایش کنی.':'برای این بخش پس‌زمینه CSS قابل تبدیل پیدا نشد؛ از افزودن لایه استفاده کن.');
}
function makeUI(){
 if($('mmvs-section-background-r97'))return;
 const root=document.createElement('div');root.id='mmvs-section-background-r97';root.dir='rtl';
 root.innerHTML=`<button id="mmvs-bg-toggle" type="button" aria-expanded="false">${LABEL}</button>
 <section id="mmvs-bg-panel" hidden aria-label="استودیوی مدیریت پس‌زمینه">
 <header><strong>استودیوی کامل پس‌زمینه</strong><button id="mmvs-bg-close" type="button" aria-label="بستن">✕</button></header>
 <label class="mmvs-bg-field"><span>بخش مقصد</span><select id="mmvs-bg-section"></select></label>
 <div class="mmvs-bg-presets"><button type="button" id="mmvs-bg-index-preset">فهرست هفت درس</button><button type="button" id="mmvs-bg-lesson-preset">داخل درس‌ها</button><button type="button" id="mmvs-bg-refresh">↻ بازخوانی</button></div>
 <button type="button" id="mmvs-r98-pick-section">🎯 انتخاب بخش از روی پیش‌نمایش</button>
 <p class="mmvs-bg-hint">وضعیت فعلی CSS هنگام انتخاب بخش خوانده می‌شود؛ هر لایه مستقل است و نوشته‌ها و کارت‌ها واضح می‌مانند.</p>
 <div id="mmvs-bg-layers" class="mmvs-bg-layers"></div>
 <div class="mmvs-bg-add"><strong>افزودن لایه</strong><div><button data-add="solid" type="button">+ رنگ</button><button data-add="linear" type="button">+ گرادیانت خطی</button><button data-add="radial" type="button">+ گرادیانت شعاعی</button><button data-add="image" type="button">+ تصویر</button></div></div>
 <div class="mmvs-bg-actions"><button type="button" id="mmvs-bg-apply">اعمال پیش‌نمایش</button><button type="button" id="mmvs-bg-clear">حذف پس‌زمینه</button></div>
 <button type="button" id="mmvs-bg-save" class="mmvs-bg-save">ذخیره تنظیمات در Draft</button>
 <p id="mmvs-bg-status" role="status">ابتدا صفحه را باز کن و بخش مقصد را انتخاب کن.</p>
 <p class="mmvs-bg-hint">انتشار عمومی از دکمه «انتشار چیدمان» در نوار اصلی استودیو انجام می‌شود.</p>
 </section>`;
 document.body.append(root);
 const toggle=show=>{$('mmvs-bg-panel').hidden=!show;$('mmvs-bg-toggle').setAttribute('aria-expanded',String(show));if(show)fillSections();else if(highlighted?.isConnected){highlighted.style.outline=oldOutline;highlighted=null}};
 $('mmvs-bg-toggle').onclick=()=>toggle($('mmvs-bg-panel').hidden);$('mmvs-bg-close').onclick=()=>toggle(false);$('mmvs-bg-refresh').onclick=fillSections;$('mmvs-bg-section').onchange=loadSection;
 $('mmvs-bg-index-preset').onclick=()=>addPreset('index');$('mmvs-bg-lesson-preset').onclick=()=>addPreset('lesson');$('mmvs-r98-pick-section').onclick=pickSection;
 $('mmvs-bg-apply').onclick=applyPreview;$('mmvs-bg-clear').onclick=()=>{const s=$('mmvs-bg-section').value;if(window.MMVS_Spatial?.clearSectionBackground?.(s)===true){currentLayers=[];renderLayers();note('پس‌زمینه پاک شد؛ Draft را ذخیره کن.')}else note('حذف در این وضعیت مجاز نیست.',true)};
 $('mmvs-bg-save').onclick=async()=>{try{const ok=await window.MMVS_Spatial?.saveIfDirty?.();note(ok===false?'ذخیره انجام نشد؛ وضعیت Draft را بررسی کن.':'Draft ذخیره شد. برای کاربران، انتشار جداگانه لازم است.',ok===false)}catch(e){note('خطای ذخیره: '+(e?.message||e),true)}};
 $('mmvs-bg-panel').addEventListener('click',e=>{
  const add=e.target.closest('[data-add]');if(add){const type=add.dataset.add;if(currentLayers.length>=8)return note('حداکثر ۸ لایه مجاز است.',true);const layer=makeLayer(type);currentLayers.push(layer);renderLayers();if(type==='image')pickImage(layer.id);else{applyPreview()}return}
  const action=e.target.closest('[data-action]');if(!action)return;const i=currentLayers.findIndex(x=>x.id===action.dataset.id);if(i<0)return;
  if(action.dataset.action==='delete')currentLayers.splice(i,1);
  if(action.dataset.action==='move-up'&&i>0)[currentLayers[i-1],currentLayers[i]]=[currentLayers[i],currentLayers[i-1]];
  if(action.dataset.action==='move-down'&&i<currentLayers.length-1)[currentLayers[i+1],currentLayers[i]]=[currentLayers[i],currentLayers[i+1]];
  if(action.dataset.action==='pick-image')return pickImage(action.dataset.id);
  if(action.dataset.action==='add-stop'){const stops=currentLayers[i].stops;if(stops.length<5){const last=stops[stops.length-1];stops.splice(stops.length-1,0,{color:'#23dc9d',at:Math.round((stops[stops.length-2].at+last.at)/2)})}}
  if(action.dataset.action==='remove-stop'){const ix=Number(action.dataset.stopIndex);if(currentLayers[i].stops.length>2)currentLayers[i].stops.splice(ix,1)}
  renderLayers();if(currentLayers.length===0){const sec=$('mmvs-bg-section').value;window.MMVS_Spatial?.clearSectionBackground?.(sec)}else if(validateLayers()==='')applyPreview();
 });
 $('mmvs-bg-layers').addEventListener('input',onField);$('mmvs-bg-layers').addEventListener('change',onField);
 window.addEventListener('mmvs:background-image-picked',e=>{const url=e.detail?.url;if(!validImage(url))return note('آدرس تصویر نامعتبر است.',true);const l=currentLayers.find(x=>x.id===pendingImageLayerId);if(!l)return note('لایه مقصد تصویر پیدا نشد؛ دوباره انتخاب کن.',true);l.url=url;pendingImageLayerId='';renderLayers();applyPreview();note('تصویر از کتابخانه به لایه اضافه شد.')});
 $('frame')?.addEventListener('load',()=>{if(!$('mmvs-bg-panel').hidden)setTimeout(fillSections,350)});
 window.MMVS_SectionBackground={refresh:fillSections,open:()=>toggle(true),version:'R100'};
}
function onField(e){const el=e.target,id=el.dataset.id,key=el.dataset.field;if(!id||!key)return;const l=currentLayers.find(x=>x.id===id);if(!l)return;let v=el.type==='checkbox'?el.checked:el.type==='range'||el.type==='number'?Number(el.value):el.value;
 if(key==='stop-color'){const ix=Number(el.dataset.stopIndex);if(l.stops[ix])l.stops[ix].color=v}
 else if(key==='stop-at'){const ix=Number(el.dataset.stopIndex);if(l.stops[ix])l.stops[ix].at=v}
 else if(key==='stop-alpha'){const ix=Number(el.dataset.stopIndex);if(l.stops[ix])l.stops[ix].alpha=v}
 else l[key]=v;
 if(key==='opacity'||key==='blur') {const label=el.closest('label')?.querySelector('span');if(label)label.textContent=(key==='opacity'?'شفافیت ':'Blur ')+(key==='opacity'?Math.round(v*100)+'٪':v+'px')}
 schedulePreview();
}
function pickImage(id){pendingImageLayerId=id;if(window.MMVS_MediaLibrary?.open)window.MMVS_MediaLibrary.open('background');else note('کتابخانه تصاویر در دسترس نیست.',true)}
let picking=false,pickDoc=null,prevCursor='';
function stopPick(){if(pickDoc){pickDoc.removeEventListener('click',picked,true);pickDoc.documentElement.style.cursor=prevCursor}pickDoc=null;picking=false;const b=$('mmvs-r98-pick-section');if(b)b.textContent='🎯 انتخاب بخش از روی پیش‌نمایش'}
function picked(e){if(!picking)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const d=frame();let node=e.target?.nodeType===1?e.target:e.target?.parentElement;const found=node?.closest?.('section,main,article,aside,header,footer,figure,[class*="section"],[class*="hero"],[class*="panel"],[class*="content"]');node=found||node?.parentElement||node;let item=null;for(const x of [node,node?.parentElement].filter(Boolean)){const q=stableSelector(x,d);item=sectionChoices.find(y=>y.selector===q);if(item)break}if(item){$('mmvs-bg-section').value=item.selector;loadSection();note('بخش انتخاب شد: '+item.name)}else note('این عنصر قابل انتخاب نیست؛ از فهرست استفاده کن.',true);stopPick()}
function pickSection(){if(picking){stopPick();return}const d=frame();if(!d)return note('پیش‌نمایش در دسترس نیست.',true);fillSections();pickDoc=d;prevCursor=d.documentElement.style.cursor;d.documentElement.style.cursor='crosshair';d.addEventListener('click',picked,true);picking=true;$('mmvs-r98-pick-section').textContent='لغو انتخاب';note('روی بخش موردنظر در پیش‌نمایش کلیک کن.')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',makeUI,{once:true});else makeUI();
})();
