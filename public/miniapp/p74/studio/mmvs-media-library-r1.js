/* MMTRADE MEDIA LIBRARY R1 -- compatible with the existing secure P62 chunk uploader.
   All actions require the super-admin session already established by Visual Studio.
   No DOM HTML from server filenames is inserted unsafely. */
(()=>{'use strict';
if(window.MMVS_MediaLibrary)return;
const VERSION='MMVS_MEDIA_LIBRARY_R1';
let root=null, grid=null, info=null, search=null, group=null, pageNode=null, pending=null;
let page=1, pages=1, total=0, mode='insert', loading=false, allCount=null, recently=[];
const LIMIT=32, $=id=>document.getElementById(id);
const allowed=['image/png','image/jpeg','image/webp'];
const isUrl=u=>typeof u==='string'&&/^\/(?!\/)[^\s]*\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?[^\s]*)?$/i.test(u);
function el(t,c,txt){const n=document.createElement(t);if(c)n.className=c;if(txt!==undefined)n.textContent=txt;return n}
function token(){return sessionStorage.getItem('tenx_admin_token')||''}
function okay(){if(!token())throw Error('ابتدا با حساب سوپرادمین وارد استودیو شو.');if(!$('workspace')||$('workspace').hidden)throw Error('ابتدا وارد استودیو شو.');if($('release-preview')&&!$('release-preview').hidden)throw Error('نمای تاریخی فقط خواندنی است.');}
function status(t,error=false){if(info){info.textContent=t;info.classList.toggle('error',error)}}
async function getCatalog(refresh=false){okay();let q=new URLSearchParams({page:String(page),limit:String(LIMIT),group:group.value,search:search.value.trim()});if(refresh)q.set('refresh','1');const r=await fetch('/admin/mmvs/media-library?'+q,{headers:{authorization:'Bearer '+token()},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'خطا در دریافت کتابخانه ('+r.status+')');return d}
function option(label,value){let n=el('option','',label);n.value=value;return n}
function input(t,attrs){const n=document.createElement('input');n.type=t;for(const [k,v] of Object.entries(attrs||{}))n.setAttribute(k,v);return n}
async function choose(item){try{okay();if(!isUrl(item.url))throw Error('آدرس تصویر کتابخانه نامعتبر است.');
 if(mode==='copy'){
  try{await navigator.clipboard.writeText(location.origin+item.url)}catch{throw Error('مرورگر اجازه کپی لینک نمی‌دهد.')}status('لینک تصویر کپی شد.');return;
 }
 if(mode==='popup'){
  const dest=$('popup-form')?.elements?.imageUrl;if(!dest)throw Error('فرم پاپ‌آپ پیدا نشد.');dest.value=item.url;dest.dispatchEvent(new Event('change',{bubbles:true}));status('تصویر در فرم پاپ‌آپ قرار گرفت؛ برای ثبت، پاپ‌آپ را ذخیره کن.');close();return;
 }
 if(mode==='replace'){
  let dest=$('props')?.querySelector('input[data-key="src"]');
  if(!dest&&$('block-properties')?.querySelector('input[type=file]'))dest=$('block-properties').querySelector('input[type=url]');
  if(!dest)throw Error('اول یک آیکون یا تصویر موجود را در پیش‌نمایش یا پنل محتوا انتخاب کن.');
  dest.value=item.url;dest.dispatchEvent(new Event('change',{bubbles:true}));status('جایگزین شد؛ تغییرات را ذخیره و منتشر کن.');close();return;
 }
 if(mode==='insert'){
  const type=$('block-type'),add=$('add-block');if(!type||!add)throw Error('ابزار افزودن المان پیدا نشد.');
  if(add.disabled)throw Error('در وضعیت فعلی افزودن تصویر مجاز نیست.');
  const previous=type.value;type.value='image';add.click();type.value=previous;
  const dest=$('block-properties')?.querySelector('input[type=url]');
  if(!dest||!$('block-properties')?.querySelector('input[type=file]'))throw Error('المان تصویری ایجاد نشد؛ وضعیت پیش‌نویس را بررسی کن.');
  dest.value=item.url;dest.dispatchEvent(new Event('change',{bubbles:true}));
  status('تصویر به محتوای همین صفحه افزوده شد؛ ذخیره و انتشار لازم است.');close();return;
 }
 }catch(e){status(e.message,true)}}
/* MMVS_MEDIA_SQUARE_PREVIEW_R4: source hook */
let mmvsR4Viewer=null;
let mmvsR4PreviewItem=null;
let mmvsR4PreviewFocus=null;
function mmvsR4HidePreview(){
 if(!mmvsR4Viewer)return;
 mmvsR4Viewer.hidden=true;
 mmvsR4Viewer.querySelector('.mmvs-r4-preview-image').removeAttribute('src');
 mmvsR4PreviewItem=null;
 if(mmvsR4PreviewFocus&&mmvsR4PreviewFocus.isConnected)mmvsR4PreviewFocus.focus();
 mmvsR4PreviewFocus=null;
}
function mmvsR4CreatePreview(){
 if(mmvsR4Viewer)return mmvsR4Viewer;
 const v=document.createElement('section');v.className='mmvs-r4-preview';v.hidden=true;
 v.setAttribute('role','dialog');v.setAttribute('aria-modal','true');v.setAttribute('aria-label','پیش‌نمایش تصویر');
 const d=document.createElement('div');d.className='mmvs-r4-preview-dialog';
 const top=document.createElement('div');top.className='mmvs-r4-preview-top';
 const title=document.createElement('strong');title.className='mmvs-r4-preview-title';
 const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='mmvs-r4-preview-close';closeButton.textContent='✕ بستن';closeButton.onclick=mmvsR4HidePreview;
 top.append(title,closeButton);
 const stage=document.createElement('div');stage.className='mmvs-r4-preview-stage';
 const img=document.createElement('img');img.className='mmvs-r4-preview-image';img.alt='پیش‌نمایش تصویر';img.decoding='async';
 stage.append(img);
 const bottom=document.createElement('div');bottom.className='mmvs-r4-preview-bottom';
 const meta=document.createElement('div');meta.className='mmvs-r4-preview-details';
 const actions=document.createElement('div');actions.className='mmvs-r4-preview-actions';
 const chooseButton=document.createElement('button');chooseButton.type='button';chooseButton.textContent='انتخاب این تصویر';
 chooseButton.onclick=()=>{if(mmvsR4PreviewItem){const item=mmvsR4PreviewItem;mmvsR4HidePreview();choose(item)}};
 const copyButton=document.createElement('button');copyButton.type='button';copyButton.textContent='کپی لینک';
 copyButton.onclick=async()=>{if(!mmvsR4PreviewItem)return;try{await navigator.clipboard.writeText(mmvsR4PreviewItem.url);meta.textContent='لینک تصویر کپی شد.'}catch(e){meta.textContent='کپی لینک امکان‌پذیر نیست.'}};
 actions.append(chooseButton,copyButton);bottom.append(meta,actions);
 d.append(top,stage,bottom);v.append(d);
 v.addEventListener('click',e=>{if(e.target===v)mmvsR4HidePreview()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!v.hidden){e.preventDefault();e.stopImmediatePropagation();mmvsR4HidePreview()}},true);
 document.body.append(v);mmvsR4Viewer=v;return v;
}
function mmvsR4ShowPreview(item){
 if(!item||!isUrl(item.url))return;
 mmvsR4PreviewFocus=document.activeElement;
 mmvsR4PreviewItem=item;
 const v=mmvsR4CreatePreview();
 v.querySelector('.mmvs-r4-preview-title').textContent=item.name||'تصویر';
 const meta=v.querySelector('.mmvs-r4-preview-details');
 const img=v.querySelector('.mmvs-r4-preview-image');
 meta.textContent='در حال بارگذاری پیش‌نمایش…';
 img.onload=()=>{meta.textContent=img.naturalWidth+' × '+img.naturalHeight+' px'+(item.bytes?' · '+readSize(item.bytes):'')};
 img.onerror=()=>{meta.textContent='بارگذاری تصویر ممکن نیست؛ مسیر فایل را بررسی کنید.'};
 img.src=item.url;
 v.hidden=false;
 v.querySelector('.mmvs-r4-preview-close').focus();
}
function mmvsR4OnScroll(){
 if(!root||root.hidden||!grid||loading||page>=pages)return;
 // R2 uses the outer overlay as the only scroll owner.
 const remaining=root.scrollHeight-root.scrollTop-root.clientHeight;
 if(remaining<650){page++;load()}
}

function render(items, append=false){if(!append)grid.replaceChildren();if(!items.length&&!append)grid.append(el('p','mmvs-media-empty','تصویری با این مشخصات پیدا نشد.'));
 for(const item of items){if(!isUrl(item.url))continue;const card=el('div','mmvs-media-card');
  const pick=el('button','mmvs-media-thumb');pick.type='button';pick.title='انتخاب این تصویر';
  const img=el('img');img.loading='lazy';img.decoding='async';img.src=item.url;img.alt=item.name||'تصویر';pick.append(img);pick.title='نمایش پیش‌نمایش';pick.onclick=()=>mmvsR4ShowPreview(item);img.onerror=()=>pick.classList.add('mmvs-r4-image-error');img.onload=()=>pick.classList.remove('mmvs-r4-image-error');
  const label=el('small','mmvs-media-name',item.name);label.title=item.url;
  const group=el('span','mmvs-media-meta',(item.group==='uploads'?'آپلودشده':item.group==='academy'?'آکادمی':'سایت')+(item.bytes?' · '+readSize(item.bytes):''));
  const actions=el('div','mmvs-media-card-actions');const use=el('button','mmvs-media-use','انتخاب');use.type='button';use.onclick=()=>choose(item);actions.append(use);
  card.append(pick,label,group,actions);grid.append(card);
 }
}
function readSize(bytes){return bytes>1024*1024?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(bytes/1024))+' KB'}
async function load(refresh=false){if(loading)return;loading=true;if(page===1||refresh)grid.replaceChildren(el('p','mmvs-media-empty','در حال دریافت تصاویر…'));try{
 const d=await getCatalog(refresh);total=d.total||0;pages=Math.max(1,Math.ceil(total/LIMIT));
 let visible=Array.isArray(d.items)?d.items:[];
 if(page===1&&group.value==='uploads'&&!search.value.trim()){
   const existing=new Set(visible.map(x=>x.url));
   visible=[...recently.filter(x=>!existing.has(x.url)),...visible].slice(0,LIMIT);
   visible=visible.map(x=>recently.find(r=>r.url===x.url)||x);
 }
 render(visible,page>1&&!refresh);
 pageNode.textContent='نمایش '+grid.querySelectorAll('.mmvs-media-card').length.toLocaleString('fa-IR')+' از '+total.toLocaleString('fa-IR')+' تصویر'+(page<pages?' · برای دیدن ادامه، به پایین بروید':' · همه تصاویر بارگذاری شدند');
 allCount=total;status('کتابخانه آماده است. تصاویر موجود حذف یا بازنویسی نمی‌شوند.');
 }catch(e){grid.replaceChildren(el('p','mmvs-media-empty',e.message));status(e.message,true)}finally{loading=false;setTimeout(mmvsR4OnScroll,60)}}
function close(){mmvsR4HidePreview();if(root){root.hidden=true;document.body.classList.remove('mmvs-media-open')}}
function open(nextMode='insert'){try{okay()}catch(e){window.alert(e.message);return}build();mode=nextMode;$('mmvs-media-mode').value=mode;root.hidden=false;document.body.classList.add('mmvs-media-open');page=1;load();}
function makeBtn(label,fn,cls=''){const b=el('button',cls,label);b.type='button';b.onclick=fn;return b}
function build(){if(root)return;
 root=el('section','mmvs-media-overlay');root.id='mmvs-media-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','کتابخانه تصاویر MMTrade');root.hidden=true;
 const panel=el('div','mmvs-media-panel');root.append(panel);const head=el('header','mmvs-media-header');const title=el('div');title.append(el('h2','','کتابخانه هوشمند تصاویر'),el('p','','آپلود، فشرده‌سازی و استفاده مجدد در تمام صفحات'));
 const x=makeBtn('✕',close,'mmvs-media-x');x.setAttribute('aria-label','بستن کتابخانه');head.append(title,x);panel.append(head);
 const controls=el('div','mmvs-media-controls');search=input('search',{placeholder:'جست‌وجوی تصویر، آیکون یا مسیر…','aria-label':'جست‌وجوی تصاویر'});
 group=document.createElement('select');group.append(option('همه تصاویر','all'),option('آپلودشده‌ها','uploads'),option('آکادمی','academy'),option('بقیه سایت','site'));
 const usage=document.createElement('select');usage.id='mmvs-media-mode';usage.append(option('افزودن به صفحه','insert'),option('جایگزینی تصویر انتخاب‌شده','replace'),option('تصویر پاپ‌آپ','popup'),option('کپی لینک','copy'));usage.onchange=()=>{mode=usage.value};
 const refresh=makeBtn('↻ به‌روزرسانی',()=>load(true));controls.append(search,group,usage,refresh);panel.append(controls);
 let pendingSearch=0;search.oninput=()=>{clearTimeout(pendingSearch);pendingSearch=setTimeout(()=>{page=1;load()},320)};group.onchange=()=>{page=1;load()};
 const uploadBox=el('div','mmvs-media-upload');const file=input('file',{accept:'image/png,image/jpeg,image/webp',multiple:''});file.id='mmvs-media-file';
 const settings=el('div','mmvs-media-upload-settings');const size=document.createElement('select');size.id='mmvs-media-preset';size.append(option('هوشمند · تا ۱۶۰۰px','smart'),option('آیکون · تا ۶۴۰px','icon'),option('کارت · تا ۱۱۰۰px','card'),option('بنر · تا ۲۰۰۰px','hero'));
 const preserve=el('label','','حفظ PNG شفافِ اصلی');const check=input('checkbox',{});check.id='mmvs-media-preserve';check.checked=true;preserve.prepend(check);
 settings.append(size,preserve);const uploadName=el('strong','','تصویر جدید اضافه کن');const uploadTip=el('small','','PNG / JPEG / WebP · هر فایل حداکثر ۱۲ MB؛ خودکار کم‌حجم می‌شود');
 uploadBox.append(uploadName,uploadTip,file,settings);panel.append(uploadBox);
 info=el('p','mmvs-media-status','');info.setAttribute('role','status');panel.append(info);
 grid=el('div','mmvs-media-grid');panel.append(grid);
 const footer=el('footer','mmvs-media-footer');const previous=makeBtn('قبلی',()=>{if(page>1){page--;load()}});const next=makeBtn('بعدی',()=>{if(page<pages){page++;load()}});pageNode=el('span','','');footer.append(previous,pageNode,next);panel.append(footer);
 file.onchange=async()=>{const files=[...file.files||[]];file.disabled=true;let uploaded=0,error=null;for(const f of files){try{status('آماده‌سازی '+f.name+'…');const after=await optimize(f,status);if(!after)continue;const url=await upload(after,status);if(!isUrl(url))throw Error('آدرس تصویر آپلودشده نامعتبر است.');recently.unshift({url,name:f.name,group:'uploads',bytes:after.size});recently=recently.slice(0,15);uploaded++;}
 catch(e){error='آپلود '+f.name+': '+e.message;break}}file.value='';file.disabled=false;page=1;group.value='uploads';search.value='';await load(true);if(error)status(error,true);else if(uploaded)status(uploaded.toLocaleString('fa-IR')+' تصویر با موفقیت به کتابخانه اضافه شد.');};
 root.addEventListener('scroll',mmvsR4OnScroll,{passive:true});root.addEventListener('click',e=>{if(e.target===root)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)close()});document.body.append(root);
}
function decode(file){return createImageBitmap(file)}
function toBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('پردازش تصویر ناموفق بود.')),type,quality))}
async function optimize(file,progress=()=>{}){
 if(!allowed.includes(file?.type))throw Error('فرمت مجاز: PNG، JPEG یا WebP');
 if(!file.size||file.size>12*1048576)throw Error('حجم تصویر باید کمتر از ۱۲ مگابایت باشد.');
 if(!window.createImageBitmap||!HTMLCanvasElement.prototype.toBlob)return file;
 let bitmap;try{bitmap=await decode(file);const w=bitmap.width,h=bitmap.height;
 if(w<1||h<1||w*h>42000000)throw Error('ابعاد تصویر بیش از حد مجاز است.');
 const preset=$('mmvs-media-preset')?.value||'smart';
 const maxDim=({icon:640,card:1100,hero:2000,smart:1600})[preset]||1600;
 const scale=Math.min(1,maxDim/Math.max(w,h));
 const nw=Math.max(1,Math.round(w*scale)),nh=Math.max(1,Math.round(h*scale));
 const cv=document.createElement('canvas');cv.width=nw;cv.height=nh;
 const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)return file;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,nw,nh);
 let transparent=false;if(file.type==='image/png'){
  for(let yy=0;yy<9&&!transparent;yy++)for(let xx=0;xx<9;xx++){
    const px=Math.round((nw-1)*xx/8),py=Math.round((nh-1)*yy/8);
    if(ctx.getImageData(px,py,1,1).data[3]<250){transparent=true;break}
  }
 }
 const preserve=$('mmvs-media-preserve')?.checked!==false;
 if(transparent&&preserve){progress('PNG شفاف بدون تغییر حفظ شد.');return file}
 const quality=transparent?.94:(preset==='icon'?.87:.81);
 const blob=await toBlob(cv,'image/webp',quality);
 if(blob.type!=='image/webp'||blob.size>=file.size*.97){progress('نسخه اصلی سبک‌تر یا هم‌حجم بود؛ فایل اصلی حفظ شد.');return file}
 const base=file.name.replace(/\.[^.]+$/,'').replace(/[^\w\u0600-\u06ff-]/g,'-').slice(0,70)||'mmtrade';
 progress('بهینه‌سازی: '+Math.round(100*(1-blob.size/file.size))+'٪ کاهش حجم');
 return new File([blob],base+'-opt.webp',{type:'image/webp',lastModified:Date.now()});
 }catch(e){if(e?.message?.includes('ابعاد تصویر'))throw e;progress('تصویر اصلی حفظ شد: امکان تبدیل در این مرورگر نبود.');return file}
 finally{bitmap?.close?.()}
}
async function upload(file,progress=()=>{}){
 okay();const headers={'authorization':'Bearer '+token(),'content-type':'application/json'};
 const base='/admin/home-studio/media';
 const res=await fetch(base+'/begin',{method:'POST',headers,cache:'no-store',body:JSON.stringify({name:file.name.slice(0,180),kind:'image',size:file.size,type:file.type})});
 const start=await res.json().catch(()=>({}));if(!res.ok||!start.uploadId||!/^[a-f0-9]{32}$/.test(start.uploadId))throw Error(start.error||'شروع آپلود ناموفق بود');
 const chunk=Math.min(192*1024,Number(start.chunkSize)||192*1024);let n=0;
 for(let off=0;off<file.size;off+=chunk){const b=await file.slice(off,Math.min(off+chunk,file.size)).arrayBuffer();
 const r=await fetch(base+'/'+start.uploadId+'/'+n,{method:'POST',headers:{authorization:'Bearer '+token(),'content-type':'application/octet-stream'},body:b,cache:'no-store'});
 if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||'خطا در آپلود بخش '+(n+1))}n++;progress('آپلود '+Math.round(100*Math.min(file.size,off+chunk)/file.size)+'٪')}
 const final=await fetch(base+'/'+start.uploadId+'/finish',{method:'POST',headers,body:'{}',cache:'no-store'});
 const result=await final.json().catch(()=>({}));if(!final.ok||!isUrl(result.url))throw Error(result.error||'تکمیل آپلود ناموفق بود');return result.url;
}
function addButton(host,modeName,label,key){if(!host||host.querySelector('[data-mmvs-media-key="'+key+'"]'))return;
 const btn=makeBtn(label,()=>open(modeName),'mmvs-media-open-btn');btn.dataset.mmvsMediaKey=key;host.append(btn);
}
function embed(){
 const toolbar=document.querySelector('.preview-toolbar > div')||document.querySelector('.preview-toolbar');addButton(toolbar,'insert','▣ کتابخانه تصاویر','toolbar');
 const side=document.querySelector('nav.side');if(side&&!side.querySelector('[data-mmvs-media-key="side"]')){
  const b=makeBtn('▣ کتابخانه تصاویر · آپلود و انتخاب',()=>open('insert'),'mmvs-media-side');b.dataset.mmvsMediaKey='side';side.append(b)
 }
 const props=$('props');if(props?.querySelector('input[type=file]'))addButton(props,'replace','▣ انتخاب از کتابخانه','inspector');
 const blocks=$('block-properties');if(blocks?.querySelector('input[type=file]'))addButton(blocks,'replace','▣ انتخاب از کتابخانه','content');
 const popup=$('popup-upload')?.parentElement;if(popup)addButton(popup,'popup','▣ انتخاب از کتابخانه','popup');
}
function init(){if(!document.body)return;embed();const observe=new MutationObserver(()=>embed());for(const id of ['props','block-properties']){const x=$(id);if(x)observe.observe(x,{subtree:true,childList:true})}}
window.MMVS_MediaLibrary={open,optimize,upload,version:VERSION};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
