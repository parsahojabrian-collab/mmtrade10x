/* MMVS_R98_SECTION_AND_PERMANENT_DELETE */
/* MMVS_R97_SECTION_BACKGROUNDS: Section-owned backgrounds, not floating images. */
(()=>{
'use strict';
if(window.MMVS_SectionBackground)return;
const $=id=>document.getElementById(id);
const LABEL='🎨 پس‌زمینه بخش‌ها';
let active=null,sectionChoices=[],selectedSource='',selectedSourceSelector='',selectedSourceName='';
let highlighted=null,oldOutline='';
const imageFormat=/\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i;
const badNode='html,body,head,script,style,link,meta,noscript,template,svg,canvas,iframe,form,input,button,select,textarea,[contenteditable="true"]';
const sectionNodes='main,section,article,header,footer,aside,figure,nav,div,[data-mmvs-section],[class*="section"],[class*="step"],[class*="card"],[class*="panel"],[class*="page"],[class*="hero"],[class*="content"]';
function note(message,bad=false){const n=$('mmvs-bg-status');if(n){n.textContent=message;n.classList.toggle('bad',bad)}}
function frame(){try{return $('frame')?.contentDocument||null}catch{return null}}
function stableSelector(el,d){
 if(!(el instanceof d.defaultView.Element))return null;
 const native=d.defaultView.__MMVS_DOM_BASE_SELECTOR__?.(el);
 if(typeof native==='string'&&native.length&&native.length<=500)return native;
 if(el.id){const s='#'+CSS.escape(el.id);if(d.querySelectorAll(s).length===1)return s}
 let n=el,parts=[];
 while(n&&n!==d.body&&parts.length<24){
  if(n.id){parts.unshift('#'+CSS.escape(n.id));break}
  const tag=n.tagName.toLowerCase();let index=1;
  for(let p=n.previousElementSibling;p;p=p.previousElementSibling)if(p.tagName===n.tagName)index++;
  parts.unshift(tag+':nth-of-type('+index+')');
  const s=parts.join(' > ');
  try{if(s.length<=500&&d.querySelectorAll(s).length===1)return s}catch{}
  n=n.parentElement;
 }
 const s=parts.join(' > ');return s.length<=500?s:null;
}
function displayName(el){
 const heading=el.querySelector?.('h1,h2,h3,h4,[data-mmvs-title]');
 const summary=(heading?.textContent||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,48);
 const cls=typeof el.className==='string'?el.className.split(/\s+/).slice(0,2).join('.'):'',tag=el.tagName.toLowerCase();
 const base=el.id?'#'+el.id:cls?tag+'.'+cls:tag;
 return (summary?summary+' · ':'')+base;
}
function validImage(url){
 if(typeof url!=='string'||url.length>2048||!imageFormat.test(url)||url.startsWith('//'))return false;
 try{const u=new URL(url,location.origin);return (u.protocol==='https:'||u.protocol==='http:'&&u.origin===location.origin)}catch{return false}
}
function fillSections(){
 const d=frame(),select=$('mmvs-bg-section');if(!d||!select){note('پیش‌نمایش در دسترس نیست؛ صفحه را انتخاب کن.',true);return}
 const previous=select.value,items=[];
 const chosen=$('frame')&&window.MMVS_Spatial?.getSelected?.();
 // Include large containers, card-level sections and children with their own background.
 for(const el of [...d.querySelectorAll(sectionNodes)].slice(0,5500)){
  if(el.matches(badNode)||el.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-managed-content,#mmvs-v2-image-plane,#mmvs-overlay'))continue;
  const st=d.defaultView.getComputedStyle(el),r=el.getBoundingClientRect();
  if(st.display==='none'||st.visibility==='hidden'||r.width<90||r.height<38||el.children.length===0)continue;
  const s=stableSelector(el,d);if(!s||s.length>500||items.some(x=>x.selector===s))continue;
  items.push({selector:s,name:displayName(el).slice(0,105),node:el});
  if(items.length>=350)break;
 }
 sectionChoices=items;
 select.replaceChildren(new Option('بخش موردنظر را انتخاب کن',''));
 for(const item of items){const option=new Option(item.name,item.selector);select.add(option)}
 if(items.some(x=>x.selector===previous))select.value=previous;
 else if(chosen&&items.some(x=>x.selector===chosen))select.value=chosen;
 else if(items.length)select.value=items[0].selector;
 showSectionState();
 note(items.length+' بخش پیدا شد. پس‌زمینه روی خود همان بخش اعمال می‌شود.');
}
function showSectionState(){
 const s=$('mmvs-bg-section')?.value||'',d=frame();if(highlighted?.isConnected)highlighted.style.outline=oldOutline;
 highlighted=null;
 let node=null;try{node=d?.querySelector(s)}catch{}
 if(node){highlighted=node;oldOutline=node.style.outline;node.style.outline='2px dashed #edca84';}
 const saved=window.MMVS_Spatial?.getSectionBackground?.(s)||null;
 if(saved){
  $('mmvs-bg-url').value=saved.url||'';
  $('mmvs-bg-fit').value=saved.fit||'cover';
  $('mmvs-bg-position').value=saved.position||'center';
  $('mmvs-bg-dim').value=String(saved.dim??0);
  $('mmvs-bg-dim-value').textContent=Math.round((saved.dim??0)*100)+'٪';
 }else{$('mmvs-bg-url').value=selectedSource||'';$('mmvs-bg-fit').value='cover';$('mmvs-bg-position').value='center';$('mmvs-bg-dim').value='0';$('mmvs-bg-dim-value').textContent='۰٪'}
 // Preserve selected source URL across section changes until explicit selection.
}
function pickFromPage(){
 const d=frame(),images=[...(d?.querySelectorAll('#mmvs-managed-content img')||[])];
 if(!images.length){note('تصویری از کتابخانه در پیش‌نمایش پیدا نشد. از «انتخاب از کتابخانه» استفاده کن.',true);return}
 const s=window.MMVS_Spatial?.getSelected?.(),matches=images.filter(img=>stableSelector(img,d)===s||img.parentElement&&stableSelector(img.parentElement,d)===s);
 const img=matches[0]||images[0];const url=img.getAttribute('src')||img.src;
 if(!validImage(url)){note('آدرس تصویر معتبر نیست؛ از کتابخانه انتخاب کن.',true);return}
 selectedSource=url;selectedSourceSelector=stableSelector(img,d)||'';selectedSourceName=img.alt||'تصویر موجود';
 $('mmvs-bg-url').value=url;note('تصویر موجود انتخاب شد؛ بخش مقصد را تعیین و «اعمال» را بزن.');
}
function apply(){
 const s=$('mmvs-bg-section')?.value,url=$('mmvs-bg-url')?.value.trim();
 if(!s||!sectionChoices.some(x=>x.selector===s))return note('اول یک بخش معتبر را انتخاب کن.',true);
 if(!validImage(url))return note('اول یک تصویر معتبر از کتابخانه انتخاب کن.',true);
 const data={url,fit:$('mmvs-bg-fit').value,position:$('mmvs-bg-position').value,dim:Number($('mmvs-bg-dim').value)};
 // An image previously inserted in the page can become this section's background.
 // Keep the image block in stored content, but hide its floating rendering.
 if($('mmvs-bg-hide-old').checked){
   const d=frame();
   const urlKey=new URL(url,location.origin).href;
   const images=[...(d?.querySelectorAll('#mmvs-managed-content .mmvs-c-block > img')||[])];
   const match=images.find(img=>{try{return new URL(img.getAttribute('src')||img.src,location.origin).href===urlKey}catch{return false}});
   if(match)data.sourceSelector=stableSelector(match,d)||undefined;
   else if(selectedSourceSelector&&selectedSource===url)data.sourceSelector=selectedSourceSelector;
 }
 const result=window.MMVS_Spatial?.setSectionBackground?.(s,data);
 if(result!==true)return note('تغییر مجاز نیست؛ حالت ویرایش Draft را فعال کن.',true);
 note('پس‌زمینه روی بخش اعمال شد. برای ماندگاری «ذخیره چیدمان» را بزن.');
}
function clear(){
 const s=$('mmvs-bg-section')?.value;
 if(!s)return note('بخش را انتخاب کن.',true);
 if(window.MMVS_Spatial?.clearSectionBackground?.(s)===true){showSectionState();note('پس‌زمینه این بخش حذف شد؛ Draft را ذخیره کن.')}else note('امکان حذف در این حالت وجود ندارد.',true)
}
// MMVS_R98_PICK_SECTION: select an HTML section directly from iframe preview.
let mmvsR98Picking=false,mmvsR98PickDoc=null,mmvsR98PrevCursor='';
function mmvsR98StopPick(){
 if(mmvsR98PickDoc){mmvsR98PickDoc.removeEventListener('click',mmvsR98Picked,true);mmvsR98PickDoc.documentElement.style.cursor=mmvsR98PrevCursor;}
 mmvsR98PickDoc=null;mmvsR98Picking=false;
 const b=$('mmvs-r98-pick-section');if(b)b.textContent='🎯 انتخاب بخش از روی پیش‌نمایش';
}
function mmvsR98Picked(event){
 if(!mmvsR98Picking)return;
 event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
 const d=frame();if(!d){mmvsR98StopPick();return;}
 let node=event.target;
 if(node?.nodeType!==1)node=node?.parentElement;
 const found=node?.closest?.('section,main,article,aside,header,footer,figure,[class*="section"],[class*="hero"],[class*="panel"],[class*="content"],[class*="step"]');
 node=found||node?.parentElement||node;
 const options=[node,...(node?.parentElement?[node.parentElement]:[])];
 let item=null;
 for(const x of options){const selector=stableSelector(x,d);item=sectionChoices.find(y=>y.selector===selector);if(item)break;}
 if(item){$('mmvs-bg-section').value=item.selector;showSectionState();note('بخش انتخاب شد: '+item.name+'. اکنون تصویر را اعمال کن.');}
 else note('این قسمت قابل‌ویرایش نیست؛ بخش والد را از فهرست انتخاب کن.',true);
 mmvsR98StopPick();
}
function mmvsR98StartPick(){
 if(mmvsR98Picking){mmvsR98StopPick();return;}
 const d=frame();if(!d)return note('پیش‌نمایش در دسترس نیست.',true);
 fillSections();mmvsR98PickDoc=d;mmvsR98PrevCursor=d.documentElement.style.cursor;
 d.documentElement.style.cursor='crosshair';d.addEventListener('click',mmvsR98Picked,true);mmvsR98Picking=true;
 $('mmvs-r98-pick-section').textContent='لغو انتخاب از روی پیش‌نمایش';
 note('روی بخش موردنظر در پیش‌نمایش کلیک کن. فقط همان بخش انتخاب می‌شود.');
}

function makeUI(){
 const root=document.createElement('div');root.id='mmvs-section-background-r97';root.dir='rtl';
 root.innerHTML=`<button id="mmvs-bg-toggle" type="button" aria-expanded="false">${LABEL}</button>
 <section id="mmvs-bg-panel" hidden aria-label="ویرایش پس‌زمینه بخش‌ها">
 <header><strong>پس‌زمینه مستقل هر بخش</strong><button id="mmvs-bg-close" type="button" aria-label="بستن">✕</button></header>
 <label>بخش HTML <select id="mmvs-bg-section"></select></label>
 <button type="button" id="mmvs-bg-refresh">↻ بازخوانی بخش‌های صفحه</button>
 <button type="button" id="mmvs-r98-pick-section">🎯 انتخاب بخش از روی پیش‌نمایش</button>
 <p class="mmvs-bg-hint">بخش موردنظر را انتخاب کن؛ متن‌ها و دکمه‌ها روی تصویر می‌مانند.</p>
 <button type="button" id="mmvs-bg-library">▣ انتخاب تصویر از کتابخانه</button>
 <button type="button" id="mmvs-bg-from-page">استفاده از تصویر فعلی صفحه</button>
 <label>آدرس تصویر <input id="mmvs-bg-url" type="text" inputmode="url" dir="ltr" placeholder="/media/image.webp"></label>
 <div class="mmvs-bg-double"><label>نمایش <select id="mmvs-bg-fit"><option value="cover">پُرکردن بخش (Cover)</option><option value="contain">نمایش کامل (Contain)</option></select></label>
 <label>موقعیت <select id="mmvs-bg-position"><option value="center">وسط</option><option value="top">بالا</option><option value="bottom">پایین</option></select></label></div>
 <label>تیرگی تصویر <span id="mmvs-bg-dim-value">۰٪</span><input id="mmvs-bg-dim" type="range" min="0" max="0.8" step="0.05" value="0"></label>
 <label class="mmvs-bg-check"><input id="mmvs-bg-hide-old" type="checkbox" checked> عکس شناور قبلی با همین تصویر مخفی شود</label>
 <div class="mmvs-bg-actions"><button type="button" id="mmvs-bg-apply">اعمال در پیش‌نمایش</button><button type="button" id="mmvs-bg-clear">حذف پس‌زمینه</button></div>
 <button type="button" id="mmvs-bg-save" class="mmvs-bg-save">ذخیره چیدمان در Draft</button>
 <p id="mmvs-bg-status" role="status">ابتدا صفحه را باز کن و یک بخش را انتخاب کن.</p>
 <p class="mmvs-bg-hint">فقط Draft تغییر می‌کند. پس از ذخیره چیدمان و انتشار، کاربران تغییر را می‌بینند.</p>
 </section>`;
 document.body.append(root);
 const toggle=(show)=>{$('mmvs-bg-panel').hidden=!show;$('mmvs-bg-toggle').setAttribute('aria-expanded',String(show));if(show)fillSections();else if(highlighted?.isConnected){highlighted.style.outline=oldOutline;highlighted=null}};
 $('mmvs-bg-toggle').onclick=()=>toggle($('mmvs-bg-panel').hidden);
 $('mmvs-bg-close').onclick=()=>toggle(false);
 $('mmvs-bg-refresh').onclick=fillSections;
 $('mmvs-r98-pick-section').onclick=mmvsR98StartPick;
 $('mmvs-bg-section').onchange=showSectionState;
 $('mmvs-bg-library').onclick=()=>window.MMVS_MediaLibrary?.open?.('background');
 $('mmvs-bg-from-page').onclick=pickFromPage;
 $('mmvs-bg-apply').onclick=apply;
 $('mmvs-bg-clear').onclick=clear;
 $('mmvs-bg-save').onclick=async()=>{
   try{const ok=await window.MMVS_Spatial?.saveIfDirty?.();note(ok===false?'ذخیره انجام نشد؛ وضعیت Draft را بررسی کن.':'Draft ذخیره شد. برای نمایش کاربران، انتشار جداگانه لازم است.',ok===false)}
   catch(e){note('خطای ذخیره Draft: '+(e?.message||e),true)}
 };
 $('mmvs-bg-dim').oninput=()=>{$('mmvs-bg-dim-value').textContent=Math.round(Number($('mmvs-bg-dim').value)*100)+'٪'};
 window.addEventListener('mmvs:background-image-picked',e=>{const url=e.detail?.url;if(!validImage(url))return note('آدرس تصویر نامعتبر است.',true);selectedSource=url;selectedSourceSelector='';selectedSourceName=e.detail?.name||'';$('mmvs-bg-url').value=url;note('تصویر کتابخانه انتخاب شد؛ حالا «اعمال در پیش‌نمایش» را بزن.')});
 $('frame')?.addEventListener('load',()=>{mmvsR98StopPick();if(!$('mmvs-bg-panel').hidden)setTimeout(fillSections,350)});
 // When the selected page changes, refresh section choices without resetting edits mid-typing.
 window.MMVS_SectionBackground={refresh:fillSections,open:()=>toggle(true),version:'R97'};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',makeUI,{once:true});else makeUI();
})();
