/* MMTrade10X Visual Studio R5 — uses existing authenticated content/page and popup APIs. */
(()=>{'use strict';
const $=id=>document.getElementById(id), $all=(s,r=document)=>[...r.querySelectorAll(s)];
const PAGES=[
 ['index','خانه','/miniapp/index.html'],
 ['academy','آکادمی متین فیوچر','/miniapp/p74/learning/academy-home.html'],
 ['stage2','آموزش مرحله دوم','/miniapp/p74/learning/stage2.html'],
 ['profile','پروفایل','/miniapp/p74/profile/profile.html'],
 ['support','پشتیبانی','/miniapp/p74/support/support.html'],
 ['eplanet','مرکز فعال‌سازی ePlanet','/miniapp/p74/eplanet/index.html'],
 ['mmtrade10x','صفحه چالش 10X','/miniapp/p74/mmtrade-r3-preview/index.html?view=mmtrade10x'],
 ['crypto','کریپتو','/miniapp/crypto.html'],
 ['copy-trading','کپی‌ترید','/miniapp/copy-trading.html'],
  ['copytrade-academy','آموزش کپی‌ترید ۱۰ایکس','/miniapp/p74/copytrade-academy/index.html'],
 ['challenge','چالش قدیمی','/miniapp/challenge.html']
];
const MMVS_MISSING_LEGACY_ROUTES=new Set(['crypto','copy-trading','challenge']);
const props=[
 ['text','متن عنصر','textarea'],['href','لینک دکمه','url'],['src','آدرس عکس','url'],['alt','توضیح تصویر','text'],
 ['color','رنگ متن','color'],['background','رنگ پس‌زمینه','color'],['fontSize','اندازه فونت (px)','number'],
 ['fontWeight','ضخامت فونت','weight'],['textAlign','تراز متن','align'],['borderRadius','گردی گوشه (px)','number'],
 ['padding','فاصله داخلی (px)','number'],['margin','فاصله بیرونی (px)','number'],['opacity','شفافیت ۰ تا ۱','number'],
 ['width','عرض (px)','number'],['maxWidth','حداکثر عرض (px)','number'],['minHeight','حداقل ارتفاع (px)','number'],
 ['borderColor','رنگ حاشیه','color'],['borderWidth','ضخامت حاشیه','number'],['shadow','سایه','shadow']
];
let token='',role='',page='academy',editor=null,blocks=[],initial='',title=null,selected='',chosenPopup=null,popups=[],tab='pages',ready=false,busy=false,noticeTimer=0,pendingPopup=null;
let undoStack=[],redoStack=[],selectedBlockIndex=-1,pageRequestId=0,popupBusy=false;
let reviewSnapshot=null,operationLabel='در حال ذخیره…';
let previewPublishedHome=false;
let homeToolsOpen=new URLSearchParams(location.search).get('homeTools')==='1';
const requestedPage=new URLSearchParams(location.search).get('page');if(PAGES.some(p=>p[0]===requestedPage)&&!MMVS_MISSING_LEGACY_ROUTES.has(requestedPage))page=requestedPage;
function clone(x){return JSON.parse(JSON.stringify(x))}
function textEl(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e}
function toast(t,error=false){const n=$('notice');n.textContent=t;n.className='show'+(error?' error':'');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.className='',6500)}
function dirty(){return JSON.stringify({title,blocks})!==initial}
function syncDirty(){
 const spatial=window.MMVS_Spatial,changed=dirty()||!!spatial?.isDirty();
 const pending=!!editor&&(JSON.stringify({title,blocks})!==JSON.stringify({title:editor.published?.title??null,blocks:editor.published?.blocks||[]})||!!spatial?.hasPending());
 const state=reviewSnapshot?'review':busy||spatial?.isBusy()?'busy':changed?'dirty':pending?'draft':'published';
 const labels={review:'پیش‌نمایش نسخه تاریخی · فقط خواندنی',busy:operationLabel,dirty:'تغییرات ذخیره‌نشده',draft:'پیش‌نویس ذخیره‌شده · آماده انتشار',published:'هماهنگ با نسخه عمومی'};
 $('state').textContent=labels[state];$('state').dataset.state=state;$('state').classList.toggle('dirty',changed);return changed;
}
function canWrite(){return role==='SUPER_ADMIN'}
function headers(){return {'authorization':'Bearer '+token,'content-type':'application/json'}}
async function api(path,method='GET',body){if(!token)throw Error('نشست مدیریت در دسترس نیست');const r=await fetch('/admin'+path,{method,headers:headers(),cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401)showLogin();throw Error(data.message||data.error||('HTTP '+r.status))}return data}
function showLogin(){window.MMTradeHomeEditor?.unmount();token='';role='';sessionStorage.removeItem('tenx_admin_token');$('workspace').hidden=true;$('login').hidden=false;$('who').textContent='ورود لازم است'}
async function authenticate(t){token=t;const me=await api('/auth/me');role=me.role||'';if(!canWrite())throw Error('استودیوی یکپارچه فقط برای SUPER_ADMIN فعال است؛ انتشار برای نقش‌های دیگر مجاز نیست.');$('who').textContent=me.email+' · '+role;$('login').hidden=true;$('workspace').hidden=false;sessionStorage.setItem('tenx_admin_token',token);await loadPage(page)}
function chooseTab(t){tab=t;$all('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));for(const x of ['pages','popups','versions'])$(x+'-pane').hidden=x!==t;$('page-toolbar').hidden=t!=='pages';if(t==='popups')loadPopups().catch(e=>toast(e.message,true));if(t==='versions')loadVersions().catch(e=>toast(e.message,true))}
function drawPageList(){const list=$('pages');list.replaceChildren();const query=String($('page-search')?.value||'').trim().toLowerCase();for(const [slug,label] of PAGES){if(query&&!String(label+' '+slug).toLowerCase().includes(query))continue;let b=textEl('button',page===slug?'active':'',label);if(MMVS_MISSING_LEGACY_ROUTES.has(slug)){b.disabled=true;b.title='مسیر عمومی این صفحه هنوز وجود ندارد؛ اطلاعات قبلی حذف نشده است';list.append(b);continue}b.onclick=()=>{if(busy||window.MMVS_Spatial?.isBusy())return toast('عملیات در حال انجام است',true);if((dirty()||window.MMVS_Spatial?.isDirty())&&!confirm('تغییرات ذخیره نشده‌اند. صفحه عوض شود؟'))return;loadPage(slug).catch(e=>toast(e.message,true))};list.append(b)} }
/* MMVS_HOME_PREVIEW_PARITY_R2: published-vs-draft home preview switch */
function isPublishedHomePreview(){return page==='index'&&!reviewSnapshot}
function updatePreviewSourceToggle(){
 const btn=$('preview-source-toggle'),tip=$('preview-source-tip');
 if(!btn)return;
 const home=page==='index',pub=isPublishedHomePreview();
 btn.hidden=!home;
 btn.textContent=pub?'ویرایش پیش‌نویس هوم':'نمایش هوم واقعی';
 btn.setAttribute('aria-pressed',pub?'false':'true');
 if(tip){tip.hidden=!home;tip.textContent=pub?'نمایش دقیق تنظیمات و چیدمان منتشرشده':'نمایش پیش‌نویس؛ تغییرات هنوز عمومی نیستند'}
}
function ensurePreviewSourceToggle(){return;
 if($('preview-source-toggle'))return;
 const refresh=$('refresh-preview');if(!refresh||!refresh.parentElement)return;
 const btn=document.createElement('button');btn.type='button';btn.id='preview-source-toggle';btn.className='minor';
 btn.title='جابجایی بین نسخه منتشرشده کاربران و پیش‌نویس قابل ویرایش';
 btn.addEventListener('click',()=>{
   if(page!=='index')return;
   previewPublishedHome=!previewPublishedHome;
   updatePreviewSourceToggle();reloadFrame();
   toast(previewPublishedHome?'اکنون هوم منتشرشده کاربران نمایش داده می‌شود.':'اکنون پیش‌نویس قابل ویرایش نمایش داده می‌شود.');
 });
 refresh.parentElement.append(btn);
 const tip=document.createElement('small');tip.id='preview-source-tip';
 tip.style.cssText='display:block;max-width:100%;margin:5px 0;color:#9fd9bb;font-size:11px;line-height:1.8';
 refresh.closest('.preview-toolbar')?.after(tip);
 updatePreviewSourceToggle();
}
function layoutHomePanel(){
 const panel=document.querySelector('.inspector');if(!panel)return;
 if(page!=='index'||!homeToolsOpen){panel.style.removeProperty('top');return;}
 const bottom=$('page-toolbar')?.getBoundingClientRect().bottom||0;
 panel.style.setProperty('top',Math.min(Math.max(8,bottom+8),Math.max(8,window.innerHeight-140))+'px','important');
}
function mountHomeTools(){
 const home=page==='index',panel=$('home-object-panel'),toggle=$('home-tools-toggle');
 if(!panel||!toggle)return;
 toggle.hidden=!home;panel.hidden=!home||!homeToolsOpen;
 document.querySelector('.inspector')?.classList.toggle('home-controls-open',home&&homeToolsOpen);
 document.querySelector('#pages-pane .designer')?.classList.toggle('mmvs9-inspector-open',home&&homeToolsOpen);toggle.setAttribute('aria-pressed',String(home&&homeToolsOpen));
 window.MMTradeHomeEditor?.unmount();
 layoutHomePanel();if(!home)return;
 const marker=blocks.find(b=>b.type==='element'&&b.selector==='#p74-home-config');
 let config=null;if(marker?.text){try{config=JSON.parse(marker.text)}catch{throw Error('تنظیمات هوم JSON معتبر نیست')}}
 window.MMTradeHomeEditor?.mount({host:$('home-object-controls'),frame:$('frame'),config,
  isBusy:()=>busy||!!window.MMVS_Spatial?.isBusy(),isReadOnly:()=>Boolean(reviewSnapshot),
  onHide:()=>{document.querySelector('#pages-pane .designer')?.classList.remove('mmvs9-inspector-open');$('mmvs9-studio-inspector')?.setAttribute('aria-expanded','false')},
  onChange:next=>{
   if(page!=='index'||reviewSnapshot||busy)throw Error('ویرایش هوم اکنون مجاز نیست');
   checkpoint();const marker=editBlock('#p74-home-config');marker.text=JSON.stringify(next);
   syncDirty();drawEdits();updateHistoryButtons();
  }
 });
}
function toggleHomeTools(){
 if(page!=='index'||busy||window.MMVS_Spatial?.isBusy()||reviewSnapshot)return;
 homeToolsOpen=!homeToolsOpen;
 if(homeToolsOpen&&$('spatial-mode')?.classList.contains('active'))$('spatial-mode').click();
 $('home-object-panel').hidden=!homeToolsOpen;document.querySelector('.inspector')?.classList.toggle('home-controls-open',homeToolsOpen);document.querySelector('#pages-pane .designer')?.classList.toggle('mmvs9-inspector-open',homeToolsOpen);$('home-tools-toggle').setAttribute('aria-pressed',String(homeToolsOpen));layoutHomePanel();reloadFrame();
}
function previewUrl(){const p=PAGES.find(p=>p[0]===page);const url=new URL(page==='mmtrade10x'?'/miniapp/p74/mmtrade-r3-preview/index.html':page==='profile'?'/miniapp/p74/profile/preview.html':p?.[2]||'/miniapp/index.html',location.origin);if(page==='stage2')url.searchParams.set('view','stage2');if(page==='mmtrade10x')url.searchParams.set('view','mmtrade10x');url.searchParams.set('visualPreview','1');url.searchParams.set('adminPreview','1');if(page==='index'&&(!isPublishedHomePreview()||homeToolsOpen)){url.searchParams.set('p74Preview','1');if(homeToolsOpen&&!reviewSnapshot)url.searchParams.set('stepEdit','1');}url.searchParams.set('vs',Date.now().toString());return url.pathname+url.search}
function postPreview(){if(!ready)return;try{
 const items=reviewSnapshot?.blocks||blocks,target=$('frame').contentWindow;
 for(const [selector,type] of [['#p74-home-config','P74_CONFIG_PREVIEW'],['#p77-profile-config','P77_CONFIG_PREVIEW']]){
  const marker=items.find(b=>b.type==='element'&&b.selector===selector);
  if(marker?.text)target.postMessage({type,config:JSON.parse(marker.text)},location.origin);
 }
 target.postMessage({type:'MMVS_PREVIEW',blocks:clone(items)},location.origin);
 }catch(e){toast('پیش‌نمایش تنظیمات باز نشد: '+e.message,true)}}
function reloadFrame(){ready=false;$('frame').src=previewUrl();window.MMVS_Spatial?.refresh()}
async function loadPage(slug){const request=++pageRequestId;const r=await api('/content/pages/'+encodeURIComponent(slug)+'/editor');if(request!==pageRequestId)return;if(reviewSnapshot)exitReleasePreview();page=slug;previewPublishedHome=false;updatePreviewSourceToggle();editor=r;blocks=clone(r.blocks||[]);title=r.title??null;initial=JSON.stringify({title,blocks});undoStack=[];redoStack=[];selectedBlockIndex=-1;drawPageList();$('current-title').textContent=PAGES.find(x=>x[0]===page)?.[1]||page;$('selected').textContent='روی یک عنصر پیش‌نمایش کلیک کن';selected='';$('props').replaceChildren();$('page-title').value=title??'';syncDirty();drawEdits();drawContentBlocks();mountHomeTools();reloadFrame();window.MMVS_Spatial?.loadPage(slug).catch(e=>toast('موتور چیدمان فعال نیست: '+e.message,true));if(r.hasDraft)toast('پیش‌نویس قبلی این صفحه بارگذاری شد');}
function elementBlock(s){return blocks.find(b=>b.type==='element'&&b.selector===s)}
function editBlock(s){let found=elementBlock(s);if(!found){found={type:'element',selector:s};blocks.push(found)}return found}
function drawEdits(){const list=$('edits');list.replaceChildren();const items=blocks.filter(b=>b.type==='element'&&!b.selector.startsWith('#p74-home-config')&&!b.selector.startsWith('#p77-profile-config')&&!b.selector.startsWith('#mmvs-published-fold-configuration'));for(const b of items){let btn=textEl('button','minor',b.selector+(b.deleted?' (حذف‌شده)':''));btn.onclick=()=>{selected=b.selector;showInspector()};list.append(btn)}if(!items.length)list.append(textEl('p','hint','تغییری ثبت نشده است'));}
function chooseElement(info){if(!info||typeof info.selector!=='string'||info.selector.length>500)return;selected=info.selector;showInspector(info)}
function rowField(parent,label,key,value,kind,callback){
 const lab=textEl('label','',label);let inp;
 if(kind==='textarea'){inp=document.createElement('textarea');inp.rows=3;inp.maxLength=3000;}
 else if(['weight','align','shadow'].includes(kind)){inp=document.createElement('select');let vals=kind==='weight'?['300','400','500','600','700','800','900']:kind==='align'?['right','center','left','justify']:['none','soft','medium','strong'];let empty=document.createElement('option');empty.value='';empty.textContent='پیش‌فرض';inp.append(empty);for(const v of vals){let op=textEl('option','',v);op.value=v;inp.append(op)}}
 else{inp=document.createElement('input');inp.type=kind==='number'?'number':kind==='url'?'url':'text';if(kind==='number')inp.step=key==='opacity'?'0.05':'1';if(kind==='color')inp.placeholder='#RRGGBB'}
 inp.value=value??'';inp.dataset.key=key;inp.addEventListener('change',()=>callback(inp.value));
 if(kind==='color'){const row=textEl('div','mmvs-color-row','');const picker=document.createElement('input');picker.type='color';picker.value=/^#[0-9a-fA-F]{6}$/.test(value||'')?value:'#174733';picker.title='انتخاب رنگ بدون نیاز به کد';picker.addEventListener('change',()=>{inp.value=picker.value;callback(inp.value)});row.append(picker,inp);lab.append(row)}
 else lab.append(inp);
 parent.append(lab)
}
function showInspector(info){const b=elementBlock(selected)||{};$('selected').textContent=selected||'عنصری انتخاب نشده';const box=$('props');box.replaceChildren();if(!selected)return;
 const tag=info?.tag||'';const visibleProps=props.filter(p=>tag==='BODY'? !['text','href','src','alt'].includes(p[0]) : tag!=='IMG'&&['src','alt'].includes(p[0])?false:tag==='IMG'&&p[0]==='text'?false:true);
 for(const [key,label,kind] of visibleProps){let v=b[key];if(v===undefined&&info){if(key==='text')v=info.text;if(key==='href')v=info.href;if(key==='src')v=info.src;}rowField(box,label,key,v,kind,value=>{
 try{checkpoint();if(key==='href'||key==='src'){if(value&&!/^https:\/\/\S+$|^\/(?!\/)\S*$/.test(value))throw Error('فقط لینک HTTPS یا آدرس داخلی مجاز است')}
 if(['color','background','borderColor'].includes(key)&&value&&!/^#[0-9a-fA-F]{6}$/.test(value))throw Error('رنگ باید با فرمت #112233 باشد');
 const q=editBlock(selected);if(value===''){delete q[key];}else if(kind==='number'){const val=Number(value);if(!Number.isFinite(val))throw Error('عدد نامعتبر است');if(key==='opacity'&&(val<0||val>1))throw Error('شفافیت بین صفر و یک است');if(key==='fontSize'&&(val<8||val>96))throw Error('اندازه فونت بین ۸ و ۹۶ است');if(key==='width'||key==='maxWidth'||key==='minHeight'){if(val<0||val>1200)throw Error('عدد خارج از محدوده است')}q[key]=val;}else q[key]=value;
 drawEdits();syncDirty();postPreview();updateHistoryButtons();}catch(e){toast(e.message,true)} });}
 if(tag==='IMG'||typeof b.src==='string'){
  const wrap=textEl('label','','آپلود مستقیم تصویر جایگزین');const input=document.createElement('input');input.type='file';input.accept='image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.gif';const status=textEl('small','mmvs-upload-status','');
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{const url=await uploadImage(file,msg=>status.textContent=msg);checkpoint();editBlock(selected).src=url;drawEdits();syncDirty();postPreview();toast('عکس عنصر ذخیره شد؛ برای نمایش کاربران انتشار لازم است')}catch(e){toast(e.message,true)}};
  wrap.append(input,status);box.append(wrap)
 }
}
function setOperation(value,label='در حال ذخیره…'){busy=value;window.MMTradeHomeEditor?.setReadOnly(value||!!reviewSnapshot);operationLabel=label;for(const id of ['save','publish','reload'])$(id).disabled=value||(!!reviewSnapshot&&id!=='reload');document.querySelector('.toolbar')?.setAttribute('aria-busy',String(value));syncDirty()}
async function saveDraft(){
 if(reviewSnapshot)throw Error('ابتدا از پیش‌نمایش نسخه تاریخی خارج شوید');
 if(!canWrite())throw Error('مجوز انتشار نداری');
 if(busy||window.MMVS_Spatial?.isBusy())throw Error('عملیات دیگری در حال انجام است؛ صبر کنید');
 const slug=page,session=pageRequestId,snapshot=clone({title,blocks});
 setOperation(true);
 try{
  if(dirty()){
   if(snapshot.blocks.length>(page==='copytrade-academy'?220:40))throw Error('حداکثر ۴۰ بلوک در API فعلی پشتیبانی می‌شود');
   validateAllBlocks();
   const result=await api('/content/pages/'+slug+'/draft','PUT',{...snapshot,expectedRevision:editor.revision});
   if(!result.ok)throw Error('ذخیره محتوای صفحه ناموفق بود');
   if(session!==pageRequestId)return false;
   initial=JSON.stringify(snapshot);editor.hasDraft=true;editor.revision=result.revision;
  }
  if(window.MMVS_Spatial&&!(await window.MMVS_Spatial.saveIfDirty()))throw Error('ذخیره چیدمان هنوز کامل نشده است');
  toast('پیش‌نویس ذخیره شد؛ هنوز منتشر نشده');return true;
 }finally{setOperation(false)}
}
async function publish(){
 if(!canWrite())return;
 if(reviewSnapshot)return toast('ابتدا از پیش‌نمایش نسخه تاریخی خارج شوید',true);
 if(busy||window.MMVS_Spatial?.isBusy())return toast('عملیات دیگری در حال انجام است؛ صبر کنید',true);
 if(!confirm('محتوا و چیدمان همین نسخه برای کاربران منتشر شود؟'))return;
 try{
  const spatial=window.MMVS_Spatial;
  if((dirty()||spatial?.isDirty())&&!(await saveDraft()))return;
  if(dirty()||spatial?.isDirty())throw Error('هنگام ذخیره تغییر جدیدی ایجاد شد؛ آن را ذخیره و دوباره منتشر کنید');
  if(!editor?.hasDraft&&!spatial?.hasPending())throw Error('هیچ پیش‌نویسی برای انتشار وجود ندارد');
  setOperation(true,'در حال انتشار محتوا و چیدمان…');spatial?.setPublishing(true);
  const expectedSpatial=spatial?.getRevision();
  const res=await api('/content/pages/'+page+'/publish','POST',{
    expectedRevision:editor.revision,
    ...(expectedSpatial===undefined?{}:{spatialExpectedRevision:expectedSpatial})
  });
  if(!res.ok)throw Error('انتشار صفحه ناموفق بود');
  spatial?.acceptPublished(res.spatialRevision);
  toast('محتوا و چیدمان با هم منتشر شدند');
  // Keep edits made while publication was in flight; only refresh a clean editor.
  if(!dirty()&&!spatial?.isDirty())await loadPage(page);
 }catch(e){toast('انتشار انجام نشد: '+e.message,true)}
 finally{window.MMVS_Spatial?.setPublishing(false);setOperation(false)}
}
async function loadPopups(){const d=await api('/content/popups');popups=d.items||[];drawPopups();if(chosenPopup){const existing=popups.find(p=>p.id===chosenPopup);if(existing)fillPopup(existing)}}
function drawPopups(){const host=$('popup-list');host.replaceChildren();const q=String($('popup-search').value||'').toLowerCase().trim(),fPage=$('popup-filter-page').value,fStatus=$('popup-filter-status').value;for(const p of popups){if(q&&!String(p.title+' '+p.body).toLowerCase().includes(q))continue;if(fPage&&p.pageSlug!==fPage)continue;if(fStatus&&p.status!==fStatus)continue;let row=textEl('div','popup-item'+(p.id===chosenPopup?' active':''));let summary=textEl('div','');summary.append(textEl('b','',p.title),textEl('small','',`${PAGES.find(x=>x[0]===p.pageSlug)?.[1]||p.pageSlug} · ${p.status==='PUBLISHED'?'فعال':'پیش‌نویس'}`));let btn=textEl('button','minor','ویرایش');btn.onclick=()=>{fillPopup(p);drawPopups()};row.append(summary,btn);host.append(row)}if(!popups.length)host.append(textEl('p','hint','پاپ‌آپی ثبت نشده است'))}
function fillPopup(p){chosenPopup=p?.id||null;const form=$('popup-form');for(const key of ['title','body','imageUrl','buttonText','buttonUrl','pageSlug','frequency','status'])form.elements[key].value=p?.[key]??(key==='pageSlug'?page:key==='frequency'?'ONCE':key==='status'?'DRAFT':'');$('popup-delete').disabled=!chosenPopup;$('popup-duplicate').disabled=!chosenPopup;$('popup-disable').disabled=!chosenPopup||p?.status!=='PUBLISHED';}
function popupData(){const el=$('popup-form').elements;const get=k=>String(el[k].value||'').trim();return {title:get('title'),body:get('body'),imageUrl:get('imageUrl')||null,buttonText:get('buttonText')||null,buttonUrl:get('buttonUrl')||null,pageSlug:get('pageSlug'),frequency:get('frequency'),status:get('status')}}
async function savePopup(e){e?.preventDefault();if(!canWrite()||popupBusy)return;popupBusy=true;try{const d=popupData();if(!d.title||!d.body)throw Error('عنوان و متن پاپ‌آپ لازم است');for(const key of ['imageUrl','buttonUrl']){if(d[key]&&!/^https:\/\/\S+$|^\/(?!\/)\S*$/.test(d[key]))throw Error('آدرس عکس/دکمه باید HTTPS یا مسیر داخلی باشد')}
if(d.status==='PUBLISHED'&&popups.some(p=>p.pageSlug===d.pageSlug&&p.status==='PUBLISHED'&&p.id!==chosenPopup)){if(!confirm('پاپ‌آپ فعال دیگری در این صفحه وجود دارد؛ API فعلی اولین مورد را نمایش می‌دهد. ادامه می‌دهی؟'))return}
const saved=await api('/content/popups'+(chosenPopup?'/'+encodeURIComponent(chosenPopup):''),chosenPopup?'PATCH':'POST',d);chosenPopup=saved.id;await loadPopups();fillPopup(saved);toast('پاپ‌آپ با موفقیت ذخیره شد')}catch(e){toast(e.message,true)}finally{popupBusy=false}}
async function deletePopup(){if(!chosenPopup)return;if(!confirm('این پاپ‌آپ و سابقه مشاهده آن برای کاربران حذف شود؟'))return;try{await api('/content/popups/'+encodeURIComponent(chosenPopup),'DELETE');chosenPopup=null;fillPopup(null);await loadPopups();toast('پاپ‌آپ حذف شد')}catch(e){toast(e.message,true)}}
function showReleasePreview(snapshot){
 reviewSnapshot=snapshot;
 const banner=$('release-preview');banner.hidden=false;
 const contentChanged=JSON.stringify({title,blocks})!==JSON.stringify({title:snapshot.title,blocks:snapshot.blocks});
 const layoutChanged=JSON.stringify(window.MMVS_Spatial?.getDraftLayout())!==JSON.stringify(snapshot.layout);
 $('release-preview-title').textContent='پیش‌نمایش نسخه '+snapshot.version+' · فقط خواندنی';
 $('release-preview-detail').textContent=(contentChanged?'محتوا متفاوت است':'محتوا یکسان است')+' · '+(layoutChanged?'چیدمان متفاوت است':'چیدمان یکسان است')+' · پیش‌نویس فعلی حفظ شده است.';
 document.querySelector('.inspector').inert=true;document.querySelector('.mmvs-library').inert=true;$('spatial-panel').inert=true;
 window.MMTradeHomeEditor?.setReadOnly(true);window.MMVS_Spatial?.review(snapshot.layout);chooseTab('pages');reloadFrame();setOperation(false);
}
function exitReleasePreview(){
 reviewSnapshot=null;$('release-preview').hidden=true;
 document.querySelector('.inspector').inert=false;document.querySelector('.mmvs-library').inert=false;$('spatial-panel').inert=false;
 window.MMVS_Spatial?.review(null);window.MMTradeHomeEditor?.setReadOnly(busy);reloadFrame();setOperation(busy);
}
const releaseHistory=window.MMStudioReleaseHistory.create({api,
 context:()=>({page,session:pageRequestId,busy:busy||!!window.MMVS_Spatial?.isBusy(),dirty:dirty()||!!window.MMVS_Spatial?.isDirty(),revision:editor?.revision,spatialRevision:window.MMVS_Spatial?.getRevision()}),
 setBusy:setOperation,onPreview:showReleasePreview,
 onRestored:async()=>{exitReleasePreview();await loadPage(page);chooseTab('pages')},notify:toast});
async function loadVersions(){await releaseHistory.load()}


/* MMVS R3 visual controls, content library and secure media uploads. */
const CONTENT_TYPES={heading:'عنوان',text:'متن',image:'تصویر',button:'دکمه',banner:'بنر',progress:'نوار پیشرفت',divider:'جداکننده',mm10_step:'مرحله چالش'};
const RESERVED_SELECTOR=/^#p\d+[a-z0-9_-]*-(?:home-|profile-)?config$/i;
const safeUrl=x=>/^(https:\/\/\S+|\/(?!\/)\S*)$/.test(String(x||''));
function snapshot(){return JSON.stringify({title,blocks})}
function checkpoint(){if(reviewSnapshot)throw Error('پیش‌نمایش نسخه تاریخی فقط خواندنی است');const v=snapshot();if(undoStack[undoStack.length-1]!==v)undoStack.push(v);if(undoStack.length>55)undoStack.shift();redoStack=[];updateHistoryButtons()}
function updateHistoryButtons(){$('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length}
function restoreLocal(value){const d=JSON.parse(value);title=d.title??null;blocks=d.blocks;$('page-title').value=title??'';selectedBlockIndex=-1;selected='';$('props').replaceChildren();drawEdits();drawContentBlocks();mountHomeTools();syncDirty();reloadFrame();updateHistoryButtons()}
function undo(){if(reviewSnapshot)return;if(!undoStack.length)return;redoStack.push(snapshot());restoreLocal(undoStack.pop())}
function redo(){if(reviewSnapshot)return;if(!redoStack.length)return;undoStack.push(snapshot());restoreLocal(redoStack.pop())}
function isReserved(b){return b?.type==='element'&&RESERVED_SELECTOR.test(String(b.selector||''))}
function contentIndices(){return blocks.map((b,i)=>({b,i})).filter(x=>Object.hasOwn(CONTENT_TYPES,x.b?.type)&&x.b.type!=='element')}
function labelOf(b){return b.type==='heading'||b.type==='text'?String(b.text||'').slice(0,65):b.type==='image'?String(b.url||''):b.type==='button'?String(b.text||''):b.type==='banner'?String(b.title||''):b.type==='progress'?String(b.title||'پیشرفت'):b.type==='mm10_step'?String(b.title||'مرحله'):b.type==='divider'?'خط جداکننده':b.type}
function drawContentBlocks(){
 const list=$('blocks-list');list.replaceChildren();const items=contentIndices();$('block-count').textContent=blocks.length+'/'+(page==='copytrade-academy'?'۲۲۰':'۴۰')+' (محتوا: '+items.length+')';
 for(const {b,i} of items){const row=textEl('div','mmvs-block-item'+(i===selectedBlockIndex?' selected':''));
  const name=textEl('button','mmvs-block-label','');name.append(textEl('strong','',CONTENT_TYPES[b.type]||b.type),textEl('small','',labelOf(b)));name.onclick=()=>{selectedBlockIndex=i;drawContentBlocks();showBlockProperties()};
  const actions=textEl('div','mmvs-item-actions','');
  for(const [text,tip,fn] of [['↑','بالاتر',()=>moveContent(i,-1)],['↓','پایین‌تر',()=>moveContent(i,1)],['⧉','تکثیر',()=>copyContent(i)],['×','حذف',()=>deleteContent(i)]]){const btn=textEl('button','minor',text);btn.title=tip;btn.onclick=fn;actions.append(btn)}
  row.append(name,actions);list.append(row)
 }
 if(!items.length)list.append(textEl('p','hint','هنوز المان محتوایی اضافه نشده است. برای تغییر عناصر موجود روی پیش‌نمایش کلیک کن.'));
 if(selectedBlockIndex>=0&&!items.some(x=>x.i===selectedBlockIndex)){selectedBlockIndex=-1;$('block-properties').replaceChildren(textEl('p','hint','یک المان را انتخاب کن.'))}
}
function makeContent(type){
 switch(type){case 'heading':return {type,text:'عنوان جدید'};
 case 'text':return {type,text:'توضیح جدید را اینجا بنویسید.'};
 case 'image':return {type,url:'/miniapp/mmtrade10x-logo.png',alt:'تصویر MMTrade'};
 case 'button':return {type,text:'مشاهده چالش',url:'/challenge'};
 case 'banner':return {type,title:'بنر جدید',text:'توضیح بنر',url:'/challenge'};
 case 'progress':return {type,kind:'academy',title:'پیشرفت آموزش'};
 case 'divider':return {type};default:throw Error('نوع المان پشتیبانی نمی‌شود');
 }
}
function afterBlockEdit(rebuildProps=true){drawContentBlocks();if(rebuildProps)showBlockProperties();syncDirty();postPreview();updateHistoryButtons()}
function addContent(){if(blocks.length>=(page==='copytrade-academy'?220:40))return toast('ظرفیت ۴۰ بلوک پر شده است.',true);checkpoint();blocks.push(makeContent($('block-type').value));selectedBlockIndex=blocks.length-1;afterBlockEdit();toast('المان به پیش‌نویس اضافه شد')}
function moveContent(index,step){const indices=contentIndices().map(x=>x.i);const cur=indices.indexOf(index),neighbor=indices[cur+step];if(cur<0||neighbor===undefined)return;checkpoint();const temp=blocks[index];blocks[index]=blocks[neighbor];blocks[neighbor]=temp;selectedBlockIndex=neighbor;afterBlockEdit()}
function copyContent(index){if(blocks.length>=(page==='copytrade-academy'?220:40))return toast('ظرفیت ۴۰ بلوک پر شده است.',true);const b=blocks[index];if(!b||!Object.hasOwn(CONTENT_TYPES,b.type))return;checkpoint();const duplicate=clone(b);if(duplicate.type==='mm10_step')duplicate.id='mmvs-'+Date.now();blocks.splice(index+1,0,duplicate);selectedBlockIndex=index+1;afterBlockEdit()}
function deleteContent(index){if(!confirm('این المان از پیش‌نویس حذف شود؟'))return;checkpoint();blocks.splice(index,1);selectedBlockIndex=-1;afterBlockEdit()}
const CONTENT_FIELDS={heading:[['text','عنوان','textarea']],text:[['text','متن','textarea']],image:[['url','آدرس تصویر','url'],['alt','متن جایگزین','text']],button:[['text','عنوان دکمه','text'],['url','لینک دکمه','url']],banner:[['title','عنوان بنر','text'],['text','متن بنر','textarea'],['url','لینک بنر','url']],progress:[['title','عنوان پیشرفت','text'],['kind','نوع پیشرفت','progress']],mm10_step:[['title','عنوان مرحله','text'],['body','توضیحات','textarea']],divider:[]};
function showBlockProperties(){const host=$('block-properties');host.replaceChildren();const b=blocks[selectedBlockIndex];if(!b||!CONTENT_FIELDS[b.type])return host.append(textEl('p','hint','یک المان را انتخاب کن.'));
 host.append(textEl('p','hint','نوع المان: '+CONTENT_TYPES[b.type]));
 for(const [key,label,kind] of CONTENT_FIELDS[b.type]){
  const wrap=textEl('label','',label),field=kind==='textarea'?document.createElement('textarea'):kind==='progress'?document.createElement('select'):document.createElement('input');
  if(kind==='progress'){for(const [k,v] of [['academy','پیشرفت آموزش'],['registration','پیشرفت ثبت‌نام']]){const option=textEl('option','',v);option.value=k;field.append(option)}}
  else if(kind==='textarea'){field.rows=4;field.maxLength=key==='text'?b.type==='banner'?1000:3000:3000}
  else{field.type=kind==='url'?'url':'text';field.maxLength=key==='url'?500:key==='alt'?200:200}
  field.value=b[key]??'';field.onchange=()=>{const value=field.value.trim();if(kind==='url'&&value&&!safeUrl(value))return toast('لینک باید HTTPS یا مسیر داخلی باشد.',true);checkpoint();if(value===''){if(key==='url'&&['image','button'].includes(b.type))return toast('لینک این المان نمی‌تواند خالی باشد.',true);delete b[key]}else b[key]=value;afterBlockEdit(false)};wrap.append(field);host.append(wrap)
 }
 if(b.type==='image'){const wrapper=textEl('label','','آپلود مستقیم عکس');const inp=document.createElement('input');inp.type='file';inp.accept='image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.gif';const stat=textEl('small','mmvs-upload-status','');inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;try{const url=await uploadImage(file,msg=>stat.textContent=msg);checkpoint();b.url=url;afterBlockEdit();toast('تصویر آپلود شد، برای نمایش کاربران انتشار لازم است')}catch(e){toast(e.message,true)}};wrapper.append(inp,stat);host.append(wrapper)}
}
function validateAllBlocks(){if(page==='index'&&window.MMTradeHomeEditor?.hasMounted())window.MMTradeHomeEditor.validate();for(const b of blocks){if(!b||typeof b!=='object')throw Error('بلوک نامعتبر است');if(b.type==='element'){if(!b.selector||b.selector.length>500)throw Error('شناسه عنصر نامعتبر است');continue}if(b.type==='heading'||b.type==='text'){if(!String(b.text||'').trim())throw Error('عنوان/متن خالی است')}if(b.type==='image'&&!safeUrl(b.url))throw Error('آدرس تصویر نامعتبر است');if(b.type==='button'&&(!String(b.text||'').trim()||!safeUrl(b.url)))throw Error('دکمه نامعتبر است');if(b.type==='banner'&&!String(b.title||'').trim())throw Error('عنوان بنر الزامی است')}}
async function uploadImage(file,status=()=>{}){
 // MMTRADE_IMAGE_OPT_R32: library shared optimize
 if(!file)throw Error('تصویری انتخاب نشده');
 if(!window.MMTradeImageOptimizer)throw Error('ماژول بهینه‌سازی تصویر در دسترس نیست؛ صفحه را دوباره باز کن');
 const optimized=await window.MMTradeImageOptimizer.optimize(file,{role:'library',onProgress:status});
 file=optimized.file;
 status(optimized.summary);
 if(file.size<1||file.size>12*1024*1024)throw Error('فایل بهینه‌شده از محدودیت ۱۲ مگابایت بیشتر است');
 const initial=await api('/home-studio/media/begin','POST',{name:file.name.slice(0,180),size:file.size,kind:'image',type:file.type});
 if(!initial.uploadId||!/^[a-f0-9]{32}$/.test(initial.uploadId))throw Error('شناسه آپلود نامعتبر است');
 const chunkSize=Math.min(192*1024,Number(initial.chunkSize)||192*1024);let index=0;
 for(let offset=0;offset<file.size;offset+=chunkSize){const bytes=await file.slice(offset,Math.min(offset+chunkSize,file.size)).arrayBuffer();const response=await fetch('/admin/home-studio/media/'+initial.uploadId+'/'+index,{method:'POST',cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/octet-stream'},body:bytes});if(!response.ok){const d=await response.json().catch(()=>({}));throw Error(d.error||'خطا در آپلود بخش '+(index+1))}index++;status('آپلود '+Math.round(100*Math.min(file.size,offset+chunkSize)/file.size)+'٪')}
 const finish=await api('/home-studio/media/'+initial.uploadId+'/finish','POST',{});if(!finish.url||!safeUrl(finish.url))throw Error('لینک فایل دریافت نشد');status('آپلود کامل؛ '+optimized.summary);return finish.url;
}
function exportJson(){const body={schema:'MMVS_R3',slug:page,title,blocks:clone(blocks),exportedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(body,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mmtrade-'+page+'-draft.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function importJson(file){if(!file)return;if(file.size>300000)throw Error('فایل JSON بیش از حد بزرگ است');const d=JSON.parse(await file.text());if(d.slug!==page||!Array.isArray(d.blocks)||d.blocks.length>(page==='copytrade-academy'?220:40)||!(d.title===null||d.title===undefined||typeof d.title==='string'))throw Error('فایل متعلق به این صفحه نیست یا ساختار اشتباه است');
 const sensitive=blocks.filter(isReserved),incoming=d.blocks.filter(b=>!isReserved(b));
 if(incoming.length+sensitive.length>(page==='copytrade-academy'?220:40))throw Error('تعداد المان‌ها بیش از حد مجاز است');
 if(!confirm('پیش‌نویس فعلی با فایل واردشده جایگزین شود؟ تنظیمات سیستمی داخلی صفحه حفظ می‌شوند.'))return;
 checkpoint();blocks=[...sensitive,...incoming];title=d.title??null;selectedBlockIndex=-1;$('page-title').value=title??'';drawEdits();drawContentBlocks();syncDirty();reloadFrame();toast('فایل وارد شد؛ هنوز منتشر نشده است')}
function bindExtended(){
 $('page-search').addEventListener('input',drawPageList);
 $('page-title').addEventListener('change',e=>{const next=e.target.value.trim()||null;if(next===title)return;checkpoint();title=next;syncDirty()});
 $('undo').onclick=undo;$('redo').onclick=redo;updateHistoryButtons();
 $('add-block').onclick=addContent;
 $('edit-page-root').onclick=()=>{selected='body';showInspector({tag:'BODY'});toast('رنگ و پس‌زمینه کل صفحه را در پنل کناری ویرایش کن')};
 $('export-page').onclick=exportJson;
 $('import-page').onclick=()=>$('import-file').click();
 $('import-file').onchange=async e=>{try{await importJson(e.target.files?.[0])}catch(ex){toast('ورود فایل: '+ex.message,true)}finally{e.target.value=''}};
 window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||!['z','y'].includes(e.key.toLowerCase()))return;const target=e.target;if(target&&['INPUT','TEXTAREA'].includes(target.tagName))return;if(e.key.toLowerCase()==='z'&&e.shiftKey)redo();else if(e.key.toLowerCase()==='z')undo();else redo();e.preventDefault()});
 for(const [slug,label] of PAGES){const o=textEl('option','',label);o.value=slug;$('popup-filter-page').append(o)}
 for(const id of ['popup-search','popup-filter-page','popup-filter-status'])$(id).addEventListener(id==='popup-search'?'input':'change',drawPopups);
 $('popup-upload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const node=$('popup-upload-status');try{const url=await uploadImage(file,text=>node.textContent=text);$('popup-form').elements.imageUrl.value=url;toast('تصویر پاپ‌آپ آماده است؛ برای اعمال، پاپ‌آپ را ذخیره کن')}catch(ex){toast(ex.message,true)}finally{e.target.value=''}};
 $('popup-duplicate').onclick=async()=>{const obj=popups.find(x=>x.id===chosenPopup);if(!obj)return;fillPopup(null);const f=$('popup-form').elements;f.title.value=obj.title+' (کپی)';f.body.value=obj.body;f.imageUrl.value=obj.imageUrl||'';f.buttonText.value=obj.buttonText||'';f.buttonUrl.value=obj.buttonUrl||'';f.pageSlug.value=obj.pageSlug;f.frequency.value=obj.frequency;f.status.value='DRAFT';drawPopups();toast('کپی در فرم آماده شد؛ برای ایجاد، ذخیره پاپ‌آپ را بزن')};
 $('popup-disable').onclick=async()=>{const obj=popups.find(x=>x.id===chosenPopup);if(!obj||obj.status!=='PUBLISHED'||!confirm('این پاپ‌آپ فوراً غیرفعال شود؟'))return;try{await api('/content/popups/'+encodeURIComponent(obj.id),'PATCH',{status:'DRAFT'});await loadPopups();toast('پاپ‌آپ غیرفعال شد')}catch(e){toast(e.message,true)}};
}

/* MMVS_PUBLISHED_FOLD_R1 ADMIN API: existing content draft/publish only. */
 const MMVS_FOLD_MARKER='#mmvs-published-fold-configuration';
 window.MMVS_PublishedFold={
  page:()=>page,
  get:()=>{const b=blocks.find(x=>x?.type==='element'&&x.selector===MMVS_FOLD_MARKER);
   if(!b)return {enabled:false,heightPx:852};
   try{const v=JSON.parse(b.text||'null');if(v?.version===1&&v.enabled===true&&Number.isInteger(v.heightPx)&&v.heightPx>=200&&v.heightPx<=12000)return v}catch(_e){}
   return {enabled:false,heightPx:852};
  },
  set:cfg=>{
   if(!editor||reviewSnapshot||busy||!canWrite())return {ok:false,error:'ویرایش این صفحه فعلاً مجاز نیست'};
   const valid=cfg?.enabled===false||(cfg?.enabled===true&&Number.isInteger(cfg.heightPx)&&cfg.heightPx>=200&&cfg.heightPx<=12000);
   if(!valid)return {ok:false,error:'ارتفاع مرز نامعتبر است'};
   const ix=blocks.findIndex(x=>x?.type==='element'&&x.selector===MMVS_FOLD_MARKER);
   if(cfg.enabled){
    if(ix<0&&blocks.length>=40)return {ok:false,error:'سقف ۴۰ بلوک پر شده؛ ابتدا یک بلوک اضافی را حذف کن'};
    const item={type:'element',selector:MMVS_FOLD_MARKER,text:JSON.stringify({version:1,enabled:true,heightPx:cfg.heightPx})};
    if(ix>=0&&JSON.stringify(blocks[ix])===JSON.stringify(item))return {ok:true};
    checkpoint();if(ix>=0)blocks[ix]=item;else blocks.push(item);
   }else{
    if(ix<0)return {ok:true};checkpoint();blocks.splice(ix,1);
   }
   afterBlockEdit();drawEdits();
   return {ok:true};
  }
 };

async function previewPopup(){
 if(busy||window.MMVS_Spatial?.isBusy())return toast('عملیات در حال انجام است',true);
 const pop=popupData();
 if(pop.pageSlug!==page&&(dirty()||window.MMVS_Spatial?.isDirty())&&!confirm('پیش‌نمایش پاپ‌آپ صفحه دیگری را باز می‌کند؛ تغییرات ذخیره‌نشده کنار گذاشته شوند؟'))return;
 pendingPopup=pop;chooseTab('pages');
 if(pop.pageSlug!==page){await loadPage(pop.pageSlug)}
 else if(ready){$('frame').contentWindow?.postMessage({type:'MMVS_POPUP_PREVIEW',popup:pop},location.origin);pendingPopup=null}
 toast('پیش‌نمایش پاپ‌آپ آماده شد');
}
function bind(){bindExtended();$('home-tools-toggle').onclick=toggleHomeTools;window.addEventListener('resize',layoutHomePanel,{passive:true});window.addEventListener('scroll',layoutHomePanel,{passive:true,capture:true});if(window.ResizeObserver)new ResizeObserver(layoutHomePanel).observe($('page-toolbar'));ensurePreviewSourceToggle();$('release-preview-exit').onclick=exitReleasePreview;$('release-checkpoint').onclick=()=>releaseHistory.checkpoint();$('release-refresh').onclick=loadVersions;window.addEventListener('mmvs:state',syncDirty);for(const b of $all('.tab'))b.onclick=()=>chooseTab(b.dataset.tab);$('reload').onclick=()=>{if(reviewSnapshot){exitReleasePreview();return}if((dirty()||window.MMVS_Spatial?.isDirty())&&!confirm('تغییرات محلی حذف شوند؟'))return;loadPage(page).catch(e=>toast(e.message,true))};$('refresh-preview').onclick=reloadFrame;$('save').onclick=()=>saveDraft().catch(e=>toast(e.message,true));$('publish').onclick=publish;$('view-mobile').onclick=()=>{$('preview-holder').classList.remove('desktop');$('view-mobile').classList.add('active');$('view-desktop').classList.remove('active')};$('view-desktop').onclick=()=>{$('preview-holder').classList.add('desktop');$('view-desktop').classList.add('active');$('view-mobile').classList.remove('active')};$('hide-element').onclick=()=>{if(!selected)return;checkpoint();const b=editBlock(selected);b.deleted=!b.deleted;drawEdits();syncDirty();postPreview();};$('remove-edit').onclick=()=>{if(!selected)return;checkpoint();blocks=blocks.filter(b=>!(b.type==='element'&&b.selector===selected));drawEdits();showInspector();syncDirty();reloadFrame()};$('popup-new').onclick=()=>{fillPopup(null);drawPopups()};$('popup-form').addEventListener('submit',savePopup);$('popup-delete').onclick=deletePopup;$('popup-preview').onclick=()=>previewPopup().catch(e=>toast(e.message,true));$('sign-in').onclick=async()=>{try{const data=await fetch('/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});const r=await data.json();if(!data.ok)throw Error(r.message||r.error||'ورود ناموفق');$('password').value='';await authenticate(r.token)}catch(e){$('login-error').textContent=e.message}};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('frame').contentWindow||!e.data||typeof e.data!=='object')return;if(e.data.type==='MMVS_READY'){ready=true;postPreview();if(pendingPopup){$('frame').contentWindow.postMessage({type:'MMVS_POPUP_PREVIEW',popup:pendingPopup},location.origin);pendingPopup=null}}else if(e.data.type==='MMVS_SELECT'){chooseElement(e.data.element)}});window.MMVSWorkspace={isPublishedHomePreview,isDirty:()=>dirty()||!!window.MMVS_Spatial?.isDirty(),isBusy:()=>busy||!!window.MMVS_Spatial?.isBusy(),publish};window.addEventListener('beforeunload',e=>{if(dirty()||window.MMVS_Spatial?.isDirty()||busy){e.preventDefault();e.returnValue=''}});
for(const [slug,name] of PAGES){const op=textEl('option','',name);op.value=slug;$('popup-page').append(op)}fillPopup(null);}
bind();const saved=sessionStorage.getItem('tenx_admin_token');if(saved)authenticate(saved).catch(e=>{showLogin();toast(e.message,true)});else showLogin();
})();
