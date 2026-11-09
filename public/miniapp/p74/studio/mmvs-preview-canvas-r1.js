/* MMVS_PREVIEW_CANVAS_R1: editor-only adjustable viewport and whole-page inspection. */
(()=>{'use strict';
 const VERSION='MMVS_PREVIEW_CANVAS_R1';
 if(window.__MMVS_PREVIEW_CANVAS_R1__)return;
 window.__MMVS_PREVIEW_CANVAS_R1__=true;
 const $=id=>document.getElementById(id);
 const presetList=[
   ['375x667','آیفون کوچک · 375×667',375,667],
   ['393x852','آیفون معمولی · 393×852',393,852],
   ['430x932','آیفون بزرگ · 430×932',430,932],
   ['360x800','اندروید · 360×800',360,800],
   ['1024x768','دسکتاپ · 1024×768',1024,768]
 ];
 const minW=280,maxW=1440,minH=440,maxH=2000;
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 const num=(v,d,lo,hi)=>Number.isFinite(Number(v))?clamp(Math.round(Number(v)),lo,hi):d;
 const defaults=()=>({width:393,height:852,mode:'device'});
 let state=defaults(),modeBeforeFull='device',pageKey='';
 const holder=$('preview-holder'),frame=$('frame');
 if(!holder||!frame)return;
 const host=document.querySelector('#pages-pane .preview-area');
 if(!host)return;
 const toolbar=host.querySelector('.preview-toolbar');
 if(!toolbar)return;
 const panel=document.createElement('details');panel.id='mmvs-preview-canvas-panel';panel.open=true;
 panel.innerHTML=`<summary>⌗ ابعاد نمایش کاربر و دسترسی به کل پیش‌نمایش</summary>
 <div class="mmvs-pc-grid">
  <label>قالب گوشی / نمایشگر<select id="mmvs-pc-preset"></select></label>
  <label>عرض قاب (px)<input id="mmvs-pc-width" type="number" inputmode="numeric" min="280" max="1440" step="1" value="393"></label>
  <label>ارتفاع دید کاربر (px)<input id="mmvs-pc-height" type="number" inputmode="numeric" min="440" max="2000" step="1" value="852"></label>
 </div>
 <div class="mmvs-pc-mode" role="group" aria-label="حالت پیش‌نمایش">
  <button type="button" id="mmvs-pc-device" class="active">قاب واقعی گوشی</button>
  <button type="button" id="mmvs-pc-full">نمای کلی تمام صفحه</button>
  <button type="button" id="mmvs-pc-update">به‌روزرسانی ارتفاع</button>
 </div>
 <div class="mmvs-pc-navigation" role="group" aria-label="پیمایش صفحه در پیش‌نمایش">
  <button type="button" data-mmvs-scroll="start">ابتدای صفحه</button>
  <button type="button" data-mmvs-scroll="up">↑ یک صفحه</button>
  <button type="button" data-mmvs-scroll="down">↓ یک صفحه</button>
  <button type="button" data-mmvs-scroll="end">انتهای صفحه</button>
 </div>
 <p class="mmvs-pc-readout" id="mmvs-pc-readout" role="status">در حال بررسی پیش‌نمایش…</p>
 <p class="mmvs-pc-hint">در «قاب واقعی گوشی»، خط پایان دید کاربر همان انتهای قاب است؛ محتوای پایین با اسکرول دیده می‌شود. در «نمای کلی»، جای عناصر چسبیده به صفحه (fixed) ممکن است با نمایش واقعی گوشی متفاوت باشد. این تنظیمات فقط برای ویرایشگر هستند و ارتفاع واقعی گوشی کاربران را تغییر نمی‌دهند.</p>`;
 toolbar.after(panel);
 holder.classList.add('mmvs-canvas-active');
 const guide=document.createElement('div');guide.id='mmvs-pc-fold';guide.hidden=true;guide.textContent='پایان دید اولیه کاربر';holder.append(guide);
 const preset=$('mmvs-pc-preset'),wInput=$('mmvs-pc-width'),hInput=$('mmvs-pc-height');
 const device=$('mmvs-pc-device'),full=$('mmvs-pc-full'),readout=$('mmvs-pc-readout');
 const notify=(s,bad=false)=>{readout.textContent=s;readout.classList.toggle('mmvs-pc-error',bad)};
 for(const [key,label] of presetList){const option=document.createElement('option');option.value=key;option.textContent=label;preset.append(option)}
 const custom=document.createElement('option');custom.value='custom';custom.textContent='اندازه دلخواه';preset.append(custom);
 function currentKey(){return $('current-title')?.textContent?.trim()||new URLSearchParams(location.search).get('page')||'default'}
 function storageKey(){return 'mmvs-preview-canvas-r1:'+pageKey}
 function save(){try{localStorage.setItem(storageKey(),JSON.stringify({width:state.width,height:state.height}))}catch{}}
 function restore(){
  pageKey=currentKey();let data=null;
  try{data=JSON.parse(localStorage.getItem(storageKey())||'null')}catch{}
  state.width=num(data?.width,393,minW,maxW);state.height=num(data?.height,852,minH,maxH);state.mode='device';
  renderInputs();applyDevice();
 }
 function presetKey(){return presetList.find(x=>x[2]===state.width&&x[3]===state.height)?.[0]||'custom'}
 function renderInputs(){wInput.value=state.width;hInput.value=state.height;preset.value=presetKey()}
 function applySize(h){
  holder.style.setProperty('--mmvs-pc-width',state.width+'px');
  holder.style.setProperty('--mmvs-pc-height',Math.round(h)+'px');
  holder.dataset.mode=state.mode;
  device.classList.toggle('active',state.mode==='device');full.classList.toggle('active',state.mode==='full');
  guide.hidden=state.mode!=='full';
  positionGuide();
 }
 function applyDevice(){state.mode='device';applySize(state.height);notify(`قاب ${state.width}×${state.height}؛ صفحه داخل قاب قابل اسکرول و ویرایش است.`)}
 function inspect(){
  try{
   const doc=frame.contentDocument,win=frame.contentWindow;
   if(!doc||!win||!doc.documentElement||doc.readyState==='loading')return null;
   const body=doc.body,root=doc.documentElement,se=doc.scrollingElement||root;
   const allHeight=Math.max(root.scrollHeight,root.offsetHeight,body?.scrollHeight||0,body?.offsetHeight||0,se.scrollHeight);
   const shortError=(doc.title||'').toLowerCase().includes('404') || (body?.textContent?.trim()||'').slice(0,110)==='404 Not Found';
   return {doc,win,allHeight,scroll:se,broken:shortError};
  }catch{return null}
 }
 function scrollOwner(snapshot){
  const doc=snapshot.doc,root=snapshot.scroll;let winner=root,space=Math.max(0,root.scrollHeight-root.clientHeight);
  for(const el of doc.body?.querySelectorAll('*')||[]){
    if(!el.clientHeight||el.clientHeight<100||el.scrollHeight-el.clientHeight<=space+100)continue;
    const style=snapshot.win.getComputedStyle(el);
    if(!/^(auto|scroll|overlay)$/.test(style.overflowY))continue;
    const amount=el.scrollHeight-el.clientHeight;
    if(amount>space){space=amount;winner=el}
  }
  return winner;
 }
 function positionGuide(){
  if(guide.hidden)return;
  const r=frame.getBoundingClientRect(),p=holder.getBoundingClientRect();
  const left=r.left-p.left+holder.scrollLeft;
  const top=r.top-p.top+holder.scrollTop+state.height;
  guide.style.left=left+'px';guide.style.top=top+'px';guide.style.width=Math.round(r.width)+'px';
  guide.textContent='پایان دید اولیه کاربر · '+state.height+'px';
 }
 function applyFull(){
  // Measure at genuine device viewport first, otherwise vh-dependent pages can grow indefinitely.
  applyDevice();
  requestAnimationFrame(()=>{
   const view=inspect();if(!view){notify('پیش‌نمایش بارگذاری نشده یا دسترسی به محتوای قاب ممکن نیست.',true);return}
   if(view.broken){notify('صفحه داخل قاب 404 است؛ ابتدا مسیر صفحه را اصلاح کن.',true);return}
   const height=clamp(Math.ceil(view.allHeight+16),state.height,12000);
   state.mode='full';applySize(height);
   notify(`نمای کلی: ${state.width}×${height}px | مرز دید اولیه کاربر: ${state.height}px${view.allHeight>12000?' | ارتفاع بیشتر از سقف نمایش': ''}`);
  });
 }
 function update(){if(state.mode==='full')applyFull();else applyDevice()}
 function scrollPage(action){
  const view=inspect();if(!view)return notify('پیش‌نمایش هنوز آماده نیست یا قابل دسترس نیست.',true);
  if(view.broken)return notify('پیش‌نمایش این صفحه 404 است؛ مسیر صفحه را اصلاح کن.',true);
  const el=scrollOwner(view),max=Math.max(0,el.scrollHeight-el.clientHeight);
  const current=el.scrollTop,step=Math.max(240,Math.round(state.height*.8));
  const top=action==='start'?0:action==='end'?max:clamp(current+(action==='up'?-step:step),0,max);
  try{el.scrollTo({top,behavior:'smooth'})}catch{el.scrollTop=top}
  if(el===view.scroll){try{view.win.scrollTo({top,behavior:'smooth'})}catch{}}
  notify(max>0?`اسکرول پیش‌نمایش: حدود ${Math.round(top/max*100)}٪ | ارتفاع محتوا: ${view.allHeight}px`:'در این صفحه فضای قابل‌اسکرول تشخیص داده نشد.');
 }
 preset.addEventListener('change',()=>{
  const next=presetList.find(x=>x[0]===preset.value);if(!next)return;
  state.width=next[2];state.height=next[3];renderInputs();save();update();
 });
 function inputsChanged(){
  const width=Number(wInput.value),height=Number(hInput.value);
  if(!Number.isInteger(width)||width<minW||width>maxW||!Number.isInteger(height)||height<minH||height>maxH){notify(`عرض باید ${minW} تا ${maxW} و ارتفاع ${minH} تا ${maxH} پیکسل باشد.`,true);return}
  state.width=width;state.height=height;preset.value=presetKey();save();update();
 }
 wInput.addEventListener('change',inputsChanged);hInput.addEventListener('change',inputsChanged);
 device.addEventListener('click',applyDevice);full.addEventListener('click',applyFull);
 $('mmvs-pc-update').addEventListener('click',update);
 panel.querySelectorAll('[data-mmvs-scroll]').forEach(b=>b.addEventListener('click',()=>scrollPage(b.dataset.mmvsScroll)));
 $('view-mobile')?.addEventListener('click',()=>{const p=presetList[1];state.width=p[2];state.height=p[3];save();renderInputs();applyDevice()});
 $('view-desktop')?.addEventListener('click',()=>{const p=presetList[4];state.width=p[2];state.height=p[3];save();renderInputs();applyDevice()});
 frame.addEventListener('load',()=>{setTimeout(()=>{if(state.mode==='full')applyFull();else{const v=inspect();if(v?.broken)notify('مسیر این صفحه در پیش‌نمایش 404 است.',true);else if(!v)notify('پیش‌نمایش در حال بارگذاری یا غیرقابل دسترس است.',true);else notify(`قاب ${state.width}×${state.height} | ارتفاع محتوای صفحه: ${v.allHeight}px | برای بررسی پایین صفحه از دکمه‌های پیمایش استفاده کن.`)}},240)});
 let titleObserver=null;
 if($('current-title')){
  titleObserver=new MutationObserver(()=>{if(currentKey()!==pageKey)restore()});
  titleObserver.observe($('current-title'),{childList:true,characterData:true,subtree:true});
 }
 holder.addEventListener('scroll',positionGuide,{passive:true});window.addEventListener('resize',positionGuide,{passive:true});
 restore();
})();
