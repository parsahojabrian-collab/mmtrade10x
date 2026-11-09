/* MMVS_GLOBAL_IMAGE_SPATIAL_R2 — resilient same-origin library-image handoff. */
(()=>{
 'use strict';
 if(window.__MMVS_GLOBAL_IMAGE_HANDOFF_R2__)return;
 window.__MMVS_GLOBAL_IMAGE_HANDOFF_R2__=true;
 const $=id=>document.getElementById(id);
 const VERSION='MMVS_GLOBAL_IMAGE_SPATIAL_R2';
 const CHILD='/miniapp/p74/studio/mmvs-global-image-child-r2.js?v='+VERSION;
 const BRIDGE='/miniapp/p74/studio/bridge.js?v='+VERSION;
 const SPATIAL='/miniapp/p74/studio/spatial-bridge.js?v='+VERSION;
 let pending=null,serial=0;
 const states=new WeakMap();
 function note(s,isError=false){
   const el=$('notice');if(!el)return;
   el.textContent=s;el.className='show'+(isError?' error':'');
 }
 function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
 function annotate(doc){
   const images=[...doc.querySelectorAll('#mmvs-managed-content .mmvs-c-block > img')];
   const seen=new Map();
   for(const img of images){
     const src=img.getAttribute('src')||'';
     const no=(seen.get(src)||0)+1;seen.set(src,no);
     img.id='mmvs-library-image-'+hash(src)+'-'+no;
     img.dataset.mmvsLayer='library-image';
     img.dataset.mmvsLayerLabel=img.getAttribute('alt')||'تصویر کتابخانه';
   }
   return images;
 }
 function cancel(message){if(!pending)return;pending=null;note(message,true)}
 function srcMatches(img,src){return (img.getAttribute('src')||'')===src}
 function previewState(frame){
   try{
     const doc=frame.contentDocument,win=frame.contentWindow;
     return doc&&win&&doc.documentElement?{doc,win}:null;
   }catch{return null}
 }
 function inject(doc,url){
   return new Promise((resolve,reject)=>{
     const script=doc.createElement('script');script.src=url;script.async=false;
     script.onload=()=>resolve(true);script.onerror=()=>reject(Error('script_load_failed: '+url));
     (doc.head||doc.body||doc.documentElement).appendChild(script);
   });
 }
 async function checkUrl(url){
   const r=await fetch(url,{method:'HEAD',cache:'no-store',credentials:'same-origin'});
   if(r.status===405||r.status===501){const g=await fetch(url,{method:'GET',cache:'no-store',credentials:'same-origin'});return g.status}
   return r.status;
 }
 async function ensureBridges(frame,doc,win){
   let state=states.get(doc);
   if(state)return state;
   const process=(async()=>{
     // Never inject a fake editor into an HTTP 404 or failed preview route.
     const address=frame.src;
     if(!address||!address.startsWith(location.origin+'/'))throw Error('PREVIEW_INVALID_URL');
     const code=await checkUrl(address);
     if(code<200||code>=400)throw Error('PREVIEW_HTTP_'+code);
     if(!doc.isConnected)throw Error('FRAME_NAVIGATED');
     if(!win.__MMVS_BRIDGE_R1__)await inject(doc,BRIDGE);
     if(!win.__MMVS_SPATIAL_R4__)await inject(doc,SPATIAL);
     if(!win.__MMVS_GLOBAL_IMAGE_CHILD_R2__)await inject(doc,CHILD);
     return true;
   })();
   states.set(doc,process);
   try{return await process}catch(e){states.delete(doc);throw e}
 }
 function next(seq,delay=130){if(pending?.seq===seq)setTimeout(()=>attempt(seq),delay)}
 async function attempt(seq){
   const p=pending;
   if(!p||p.seq!==seq)return;
   const frame=$('frame');if(!frame){cancel('قاب پیش‌نمایش استودیو پیدا نشد.');return}
   if(Date.now()-p.start>11000){cancel('عکس در پیش‌نویس ثبت شد ولی پیش‌نمایش طی زمان مجاز آماده نشد. مسیر صفحه و خطاهای مرورگر را بررسی کن.');return}
   const page=previewState(frame);
   if(!page||page.doc.readyState==='loading'){next(seq,180);return}
   const {doc,win}=page;
   if(doc!==p.doc){p.doc=doc;p.checked=false;p.booting=false}
   if(!p.checked&&!p.booting){
     p.booting=true;
     ensureBridges(frame,doc,win).then(()=>{
       if(!pending||pending.seq!==seq)return;
       p.checked=true;p.booting=false;
       try{window.MMVS_Spatial?.refresh?.()}catch{}
       next(seq,80);
     }).catch(e=>{
       if(!pending||pending.seq!==seq)return;
       if(String(e.message).startsWith('PREVIEW_HTTP_')){
         cancel('مسیر پیش‌نمایش این صفحه خطای '+e.message.slice(13)+' دارد: '+new URL(frame.src).pathname+'؛ ابتدا باید مسیر صفحه اصلاح شود.');
       }else if(e.message==='FRAME_NAVIGATED'){
         p.booting=false;next(seq,180);
       }else{
         cancel('بارگذاری پل تصویری در این پیش‌نمایش ناموفق بود: '+e.message);
       }
     });
     return;
   }
   if(!p.checked)return;
   const images=annotate(doc);
   const matches=images.filter(im=>srcMatches(im,p.src));
   const image=matches[matches.length-1];
   if(!image||!image.id){next(seq,150);return}
   pending=null;
   const selector='#'+image.id;
   const mode=$('spatial-mode');
   if(mode&&!mode.disabled&&!mode.classList.contains('active'))mode.click();
   try{window.MMVS_Spatial?.refresh?.()}catch{}
   try{image.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'})}catch{}
   try{$('preview-holder')?.scrollIntoView({block:'start',behavior:'auto'})}catch{}
   // Child acknowledges both the object inspector and the spatial editor selection.
   win.postMessage({type:'MMVS_SPATIAL_PICK',selector},location.origin);
   win.postMessage({type:'MMVS_GLOBAL_IMAGE_FOCUS_R2',selector},location.origin);
   note('تصویر داخل پیش‌نمایش انتخاب شد؛ حالا آن را جابه‌جا و کوچک/بزرگ کن. برای اعمال عمومی ذخیره و انتشار لازم است.');
 }
 function onChange(event){
   const input=event.target;
   if(!(input instanceof HTMLInputElement)||input.type!=='url')return;
   if(!input.closest('#block-properties')?.querySelector('input[type=file]'))return;
   const src=input.value.trim();if(!src)return;
   const frame=$('frame');if(!frame)return;
   const seq=++serial;
   pending={seq,src,start:Date.now(),checked:false,booting:false,doc:null};
   next(seq,60);
 }
 function onMessage(event){
   const frame=$('frame');if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
   if(['MMVS_READY','MMVS_SPATIAL_READY','MMVS_GLOBAL_IMAGES_RENDERED_R1'].includes(event.data?.type)){
     if(pending)next(pending.seq,60);
   }
 }
 document.addEventListener('change',onChange,true);
 window.addEventListener('message',onMessage);
})();
