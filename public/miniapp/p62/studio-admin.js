/* TENX_P62_HOME_STUDIO_ADMIN_V1 - isolated visual editor for the three home presets */
(function(){
'use strict';
const $=(q,root=document)=>root.querySelector(q);
const el=(tag,cls,txt)=>{const a=document.createElement(tag);if(cls)a.className=cls;if(txt!==undefined)a.textContent=String(txt);return a};
const clone=x=>JSON.parse(JSON.stringify(x));
const fields={video:[['title','تیتر ویدیو'],['subtitle','زیرتیتر'],['text','توضیح کوتاه'],['media','آدرس ویدیو'],['poster','تصویر کاور']],headline:[['title','تیتر'],['subtitle','توضیح']],steps:[['title','عنوان مراحل'],['subtitle','شرح مراحل']],button:[['title','متن دکمه'],['url','لینک مقصد'],['icon','آیکون']],features:[['title','عنوان قابلیت‌ها']],progress:[['title','عنوان پیشرفت'],['subtitle','توضیح']],sculpture:[['title','متن سه‌بعدی'],['subtitle','زیرنویس']],image:[['title','شرح تصویر'],['media','آدرس تصویر']],text:[['text','متن']],divider:[],spacer:[]};
const types={video:'ویدیو هدر',headline:'تیتر',steps:'مراحل چالش',button:'دکمه',features:'ویژگی‌ها',progress:'پیشرفت',sculpture:'المان سه‌بعدی',image:'تصویر',text:'متن',divider:'خط جداکننده',spacer:'فاصله'};
let panel,frame,layerBox,inspector,tabs,lab,liveState,working,chosen='1',selected=null,dirty=false,undo=[],redo=[],phone=true,fieldMode='content',status,loading=false;
const auth=()=>sessionStorage.getItem('tenx_admin_token')||'';
async function req(p,opt={}){const headers={authorization:'Bearer '+auth(),...(opt.headers||{})};if(opt.body&&typeof opt.body==='string'&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch('/admin/home-studio'+p,{...opt,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error||('HTTP '+r.status));return d}
function message(text,err){status.textContent=text;status.classList.toggle('error',!!err)}
function checkpoint(){undo.push(clone(working));if(undo.length>45)undo.shift();redo=[]}
function changed(updateList=false){dirty=true;refreshPreview();updateBadge();if(updateList)drawLayers()}
function updateBadge(){let x=$('.mf62-dirty',panel);if(x){x.textContent=dirty?'● تغییرات ذخیره‌نشده':'✓ پیش‌نویس ذخیره‌شده';x.classList.toggle('is-dirty',dirty)}}
function resetScene(t){working=clone(liveState.drafts[t]);chosen=t;selected=working.blocks[0]?.id||null;undo=[];redo=[];dirty=false;drawTabs();drawLayers();drawInspector();refreshPreview();updateBadge()}
function drawTabs(){tabs.replaceChildren();for(const t of ['1','2','3']){let b=el('button','mf62-tpl'+(t===chosen?' selected':''),'قالب '+t);if(String(liveState.active)===t)b.append(el('small','mf62-active','منتشرشده'));b.onclick=()=>{if(t===chosen)return;if(dirty&&!confirm('پیش‌نویس ذخیره نشده است. بدون ذخیره قالب عوض شود؟'))return;resetScene(t)};tabs.append(b)}}
function up(i,d){let j=i+d;if(j<0||j>=working.blocks.length)return;checkpoint();[working.blocks[i],working.blocks[j]]=[working.blocks[j],working.blocks[i]];changed(true);drawInspector()}
function drawLayers(){layerBox.replaceChildren();for(const [i,b] of working.blocks.entries()){let row=el('div','mf62-layer'+(b.id===selected?' selected':''));let sel=el('button','mf62-layer-name',(b.visible===false?'◌ ':'')+(types[b.type]||b.type)+' · '+(b.title||b.id||'المان'));sel.onclick=()=>{selected=b.id;drawLayers();drawInspector()};row.append(sel);for(const [label,act] of [['↑',()=>up(i,-1)],['↓',()=>up(i,1)],['⦸',()=>{checkpoint();b.visible=b.visible===false?true:false;changed(true);drawInspector()}],['×',()=>{if(!confirm('المان حذف شود؟'))return;checkpoint();working.blocks.splice(i,1);selected=working.blocks[Math.max(0,i-1)]?.id||null;changed(true);drawInspector()}]]){let bt=el('button','mf62-icon-btn',label);bt.title=label;bt.onclick=act;row.append(bt)}layerBox.append(row)}
 if(!working.blocks.length)layerBox.append(el('p','mf62-muted','هیچ المانی وجود ندارد.'));
}
function textControl(label,value,commit,kind='text'){const wrap=el('label','mf62-form-control');wrap.append(el('span','',label));let input=el(kind==='textarea'?'textarea':'input');if(kind!=='textarea')input.type=kind==='number'?'number':kind==='color'?'color':'text';input.value=value==null?'':String(value);input.onfocus=()=>{input.dataset.original=input.value;input.__snapshot=clone(working)};input.oninput=()=>{commit(kind==='number'?(input.value===''?'':Number(input.value)):input.value);changed(false)};input.onchange=()=>{if(input.dataset.original!==input.value&&input.__snapshot){undo.push(input.__snapshot);if(undo.length>45)undo.shift();redo=[]}drawLayers()};wrap.append(input);return wrap}
function field(label,val,set,kind='text'){return textControl(label,val,set,kind)}
function drawInspector(){inspector.replaceChildren();let b=working.blocks.find(x=>x.id===selected);if(!b){inspector.append(el('p','mf62-muted','یک المان را برای ویرایش انتخاب کن.'));return}
 let title=el('h3','',types[b.type]||'المان');inspector.append(title);
 const subtabs=el('div','mf62-subtabs');for(const [key,name] of [['content','محتوا'],['style','استایل'],['advanced','پیشرفته']]){const a=el('button',fieldMode===key?'is-active':'',name);a.onclick=()=>{fieldMode=key;drawInspector()};subtabs.append(a)}inspector.append(subtabs);
 const set=(obj,key)=>v=>{obj[key]=v;changed()};
 if(fieldMode==='content'){
  for(const [key,name] of fields[b.type]||[]){inspector.append(field(name,b[key],set(b,key),key==='text'?'textarea':'text'))}
  if(b.type==='video'||b.type==='image'){let buttons=el('div','mf62-upload-buttons');if(b.type==='video'){buttons.append(fileButton('آپلود ویدیو',b,'media','video'),fileButton('آپلود کاور',b,'poster','image'))}else buttons.append(fileButton('آپلود تصویر',b,'media','image'));inspector.append(buttons)}
  if((b.type==='steps'||b.type==='features')){
   let title=el('b','mf62-line-title','ویرایش تک‌تک مراحل و عناصر');inspector.append(title);
   for(const [i,step] of (b.steps||[]).entries()){
    const sec=el('div','mf62-step-editor');sec.append(el('b','',`آیتم ${i+1}`));
    for(const [k,label] of [['title','عنوان'],['subtitle','توضیح'],['icon','آیکون (user, target, chart, …)'],['url','لینک']])sec.append(field(label,step[k],set(step,k)));
    const actions=el('div','mf62-editor-actions');const del=el('button','','حذف آیتم');del.onclick=()=>{checkpoint();b.steps.splice(i,1);changed();drawInspector()};actions.append(del);
    for(const [txt,offset] of [['↑',-1],['↓',1]]){const bt=el('button','',txt);bt.onclick=()=>{const j=i+offset;if(j<0||j>=b.steps.length)return;checkpoint();[b.steps[i],b.steps[j]]=[b.steps[j],b.steps[i]];changed();drawInspector()};actions.append(bt)}sec.append(actions);inspector.append(sec)}
   const add=el('button','mf62-muted-btn','+ افزودن مرحله / ویژگی');add.onclick=()=>{if(b.steps.length>=12)return message('حداکثر ۱۲ آیتم برای هر بلوک',true);checkpoint();b.steps.push({id:'item-'+Date.now(),title:'مرحله جدید',subtitle:'توضیح مرحله',icon:'star',url:'/challenge'});changed();drawInspector()};inspector.append(add);
  }
 }else if(fieldMode==='style'){
  b.style=b.style||{};
  for(const [key,name,kind] of [['color','رنگ متن (HEX)','text'],['bg','پس‌زمینه (HEX)','text'],['radius','گردی گوشه‌ها (۰ تا ۸۰)','number'],['padding','فاصله داخلی (۰ تا ۸۰)','number'],['opacity','شفافیت (۰ تا ۱)','number'],['parallax','شدت حرکت با اسکرول (۰ تا ۶۰)','number']])inspector.append(field(name,b.style[key]??'',v=>{if(v===''||v==null)delete b.style[key];else b.style[key]=v;changed()},kind));
  let align=el('select');for(const x of ['right','center','left']){let o=el('option','',x);o.value=x;align.append(o)}align.value=b.style.align||'right';align.onchange=()=>{checkpoint();b.style.align=align.value;changed()};inspector.append(fieldLabel('تراز متن',align));
  if(b.type==='button'){let selector=el('select');for(const v of ['filled','outline']){let o=el('option','',v);o.value=v;selector.append(o)}selector.value=b.style.variant||'filled';selector.onchange=()=>{checkpoint();b.style.variant=selector.value;changed()};inspector.append(fieldLabel('نوع دکمه',selector))}
 }else{
  inspector.append(field('شناسه ثابت المان',b.id,v=>{b.id=v;selected=v;changed(true)}));
  let visibility=el('button','mf62-muted-btn',b.visible===false?'نمایش المان':'پنهان کردن المان');visibility.onclick=()=>{checkpoint();b.visible=b.visible===false?true:false;changed(true);drawInspector()};inspector.append(visibility);
  let duplicate=el('button','mf62-muted-btn','ساخت کپی از المان');duplicate.onclick=()=>{checkpoint();let copy=clone(b);copy.id='block-'+Date.now();working.blocks.splice(working.blocks.indexOf(b)+1,0,copy);selected=copy.id;changed(true);drawInspector()};inspector.append(duplicate);
  inspector.append(el('p','mf62-muted','عناصر ثابت برند و مسیر لوگوی اصلی تغییر نمی‌کنند؛ تنظیمات این بلوک فقط روی قالب انتخابی اعمال می‌شود.'));
 }
}
function fieldLabel(name,node){const l=el('label','mf62-form-control');l.append(el('span','',name),node);return l}
function fileButton(label,block,key,kind){let wrap=el('label','mf62-upload-button',label);let input=el('input');input.type='file';input.accept=kind==='video'?'video/mp4,video/webm':'image/png,image/webp,image/jpeg';input.hidden=true;input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{checkpoint();const url=await upload(file,kind);block[key]=url;changed();drawInspector();message('بارگذاری رسانه انجام شد')}catch(e){message('خطای بارگذاری: '+e.message,true)}};wrap.append(input);return wrap}
async function upload(file,kind){const max=kind==='video'?180*1024*1024:12*1024*1024;if(file.size>max)throw Error('حجم فایل بیش از حد مجاز است');
 const ini=await req('/media/begin',{method:'POST',body:JSON.stringify({name:file.name,kind,size:file.size,type:file.type})});const chunk=192*1024;let i=0;
 for(let off=0;off<file.size;off+=chunk){let part=file.slice(off,Math.min(off+chunk,file.size));await req('/media/'+encodeURIComponent(ini.uploadId)+'/'+i,{method:'POST',headers:{'content-type':'application/octet-stream'},body:part});i++;message('در حال آپلود '+Math.round(100*Math.min(file.size,off+chunk)/file.size)+'٪')}
 const done=await req('/media/'+encodeURIComponent(ini.uploadId)+'/finish',{method:'POST',body:JSON.stringify({})});return done.url;
}
/* TENX_P67_HOME_PREVIEW_SYNC_V1: use URL+session state so tab switching works even if postMessage is lost */
let previewVersion=0,previewConfirmed=0,previewFallback=null,previewFallbackTheme='';
const previewSessionKey='TENX_P67_EDITOR_PREVIEW';
function storePreview(){try{sessionStorage.setItem(previewSessionKey,JSON.stringify({theme:chosen,draft:working,at:Date.now()}))}catch(e){}}
function previewUrl(){return '/miniapp?p62preview=1&p62theme='+encodeURIComponent(chosen)+'&p67='+Date.now()}
function refreshPreview(){
 if(!frame||!working)return;
 storePreview();
 let shown='';try{shown=new URL(frame.src,location.href).searchParams.get('p62theme')||''}catch(e){}
 if(shown!==chosen){clearTimeout(previewFallback);previewFallbackTheme='';frame.src=previewUrl()}
 else sendPreview();
}
function sendPreview(){
 if(!frame||!working)return;
 storePreview();
 const id=++previewVersion;
 try{frame.contentWindow.postMessage({type:'mf62-preview',theme:Number(chosen),draft:clone(working),revision:id},location.origin)}catch(e){}
 clearTimeout(previewFallback);
 previewFallback=setTimeout(()=>{
  if(previewConfirmed===id)return;
  if(previewFallbackTheme!==chosen){previewFallbackTheme=chosen;frame.src=previewUrl()}
  else message('پیش‌نمایش پاسخ نمی‌دهد؛ فایل home.js و preview-seed.js را بررسی کن.',true);
 },1100);
}
async function save(){if(!dirty)return;message('در حال ذخیره پیش‌نویس…');try{const r=await req('/draft/'+chosen,{method:'PUT',body:JSON.stringify({draft:working})});liveState.drafts[chosen]=clone(r.draft);dirty=false;updateBadge();message('پیش‌نویس ذخیره شد؛ هنوز منتشر نشده است.')}catch(e){message('ذخیره انجام نشد: '+e.message,true);throw e}}
async function publish(){if(loading)return;if(!confirm('قالب '+chosen+' برای همه کاربران Mini App منتشر شود؟'))return;loading=true;try{if(dirty)await save();const x=await req('/publish',{method:'POST',body:JSON.stringify({theme:chosen})});liveState.active=chosen;liveState.revision=x.revision;liveState.history=x.history||[];drawTabs();message('✅ قالب '+chosen+' منتشر شد؛ نسخه '+x.revision);historyDraw()}catch(e){message('انتشار ناموفق: '+e.message,true)}finally{loading=false}}
function historyDraw(){const c=$('.mf62-history',panel);if(!c)return;c.replaceChildren();const entries=(liveState.history||[]).slice().reverse().slice(0,10);for(const v of entries){const row=el('div','mf62-history-row');row.append(el('span','',`نسخه ${v.revision} · قالب ${v.theme} · ${new Date(v.at||Date.now()).toLocaleString('fa-IR')}`));const btn=el('button','','بازگردانی و انتشار');btn.onclick=async()=>{if(!confirm('نسخه '+v.revision+' دوباره منتشر شود؟'))return;try{const r=await req('/restore',{method:'POST',body:JSON.stringify({revision:v.revision})});liveState.active=r.active;liveState.revision=r.revision;liveState.history=r.history;drawTabs();historyDraw();message('نسخه قدیمی با شماره جدید منتشر شد.')}catch(e){message(e.message,true)}};row.append(btn);c.append(row)}if(!entries.length)c.append(el('p','mf62-muted','پس از اولین انتشار، تاریخچه نسخه‌ها در اینجا نمایش داده می‌شود.'))}
function toolbar(){const r=el('div','mf62-toolbar');let header=el('div','mf62-toolbar-top');header.append(el('div','mf62-toolbar-name','10X HOME STUDIO · ۳ طراحی'),el('span','mf62-dirty','پیش‌نویس ذخیره‌شده'));r.append(header);
 const buttons=el('div','mf62-toolbar-actions');const btn=(title,fn,cls)=>{let b=el('button',cls||'',title);b.onclick=fn;buttons.append(b);return b};
 btn('↶ بازگشت',()=>{if(dirty&&!confirm('تغییرات ذخیره‌نشده‌اند. برگردیم؟'))return;window.location.assign('/admin/panel')},'secondary');
 btn('ویرایشگر قبلی',()=>{if(dirty&&!confirm('تغییرات این استودیو ذخیره نشده‌اند. ادامه دهیم؟'))return;window.location.assign('/admin/editor/index')},'secondary');
 btn('Undo',()=>{if(!undo.length)return;redo.push(clone(working));working=undo.pop();selected=working.blocks[0]?.id||null;changed(true);drawInspector()},'secondary');
 btn('Redo',()=>{if(!redo.length)return;undo.push(clone(working));working=redo.pop();selected=working.blocks[0]?.id||null;changed(true);drawInspector()},'secondary');
 btn('ذخیره پیش‌نویس',save,'secondary');btn('انتشار در مینی‌اپ',publish,'primary');r.append(buttons);return r}
function drawUi(){panel=el('div','mf62-studio');panel.id='mf62-studio';const root=$('#view');if(!root)throw Error('ویرایشگر پنل پیدا نشد');root.replaceChildren(panel);const header=toolbar();panel.append(header);
 const tabsHead=el('div','mf62-choice-head');tabsHead.append(el('h2','','قالب هوم'));tabs=el('div','mf62-template-tabs');tabsHead.append(tabs);panel.append(tabsHead);
 const layout=el('div','mf62-studio-layout');const side=el('section','mf62-side');const inspectorHead=el('div','mf62-pane-title','لایه‌ها و ترتیب عناصر');layerBox=el('div','mf62-layer-box');side.append(inspectorHead,layerBox);
 const addBox=el('div','mf62-add-box');let select=el('select');for(const [key,name] of Object.entries(types)){let opt=el('option','',name);opt.value=key;select.append(opt)};let add=el('button','mf62-muted-btn','+ افزودن المان');add.onclick=()=>{if(working.blocks.length>=35)return message('حداکثر ۳۵ المان',true);checkpoint();const type=select.value;const item={id:'new-'+Date.now(),type,title:'المان جدید',text:'متن قابل ویرایش',url:'/challenge',visible:true,style:{radius:20},steps:[]};working.blocks.push(item);selected=item.id;changed(true);drawInspector()};addBox.append(select,add);side.append(addBox,el('div','mf62-pane-title','تنظیمات المان'));inspector=el('div','mf62-inspector');side.append(inspector);
 const view=el('section','mf62-stage');const viewHeader=el('div','mf62-stage-header');viewHeader.append(el('b','','پیش‌نمایش زنده'));const sz=el('button','mf62-muted-btn','◫ تغییر عرض');sz.onclick=()=>{phone=!phone;frame.classList.toggle('mf62-wide',!phone)};viewHeader.append(sz);view.append(viewHeader);frame=el('iframe','mf62-preview-frame');frame.title='پیش‌نمایش هوم';frame.loading='eager';frame.referrerPolicy='same-origin';frame.onload=sendPreview;view.append(frame);layout.append(side,view);panel.append(layout);
 panel.append(el('h2','mf62-history-title','تاریخچه انتشار'),el('div','mf62-history'));
 status=el('div','mf62-status','آماده');status.setAttribute('role','status');panel.append(status);
 frame.src=previewUrl();window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==frame.contentWindow)return;
 if(e.data?.type==='mf62-ready')sendPreview();
 if(e.data?.type==='mf62-applied'&&Number(e.data.theme)===Number(chosen)){
  const revision=Number(e.data.revision||0);
  if(revision>0){previewConfirmed=revision;clearTimeout(previewFallback)}
  if(status)message('قالب '+chosen+' در پیش‌نمایش نمایش داده شد');
 }
});
 drawTabs();drawLayers();drawInspector();historyDraw();updateBadge();
}
async function open(){const role=typeof me!=='undefined'?me?.role:null;if(role!=='SUPER_ADMIN'){alert('ویرایش و انتشار قالب‌های هوم فقط برای سوپرادمین مجاز است.');return}
 try{const x=await req('');if(!x.drafts||!x.drafts['1'])throw Error('قالب‌های اولیه پیدا نشدند');liveState=x;chosen=String(x.active||'1');working=clone(x.drafts[chosen]);selected=working.blocks[0]?.id||null;dirty=false;undo=[];redo=[];const ttl=$('#title');if(ttl)ttl.textContent='ادیتور هوم · سه قالب';drawUi()}catch(e){const target=$('#view');if(target)target.replaceChildren(el('div','mf62-error','خطا در بازکردن ویرایشگر هوم: '+e.message));}}
window.MF62OpenHomeStudio=open;
function injectEntry(){try{
 if(typeof VIEWS==='object'&&typeof VIEWS.pages==='function'&&!VIEWS.pages.__mf62){let original=VIEWS.pages;let wrapper=async function(){const box=await original.call(this);if((typeof me==='undefined'||me?.role!=='SUPER_ADMIN'))return box;const card=el('div','mf62-entry-card');card.append(el('b','','ویرایشگر هوم · سه طراحی ۳بعدی'),el('p','','طراحی ۱ / ۲ / ۳، مدیریت ویدیو و تصویر، ویرایش بلوک‌ها و انتشار انتخابی.'));const go=el('button','','باز کردن ادیتور هوم');go.onclick=open;card.append(go);box.prepend(card);return box};wrapper.__mf62=true;VIEWS.pages=wrapper}
 }catch(e){console.warn('MF62 editor entry:',e)}}
injectEntry();
if(location.pathname==='/admin/editor/index'){
 const observer=new MutationObserver(()=>{const view=$('#view');if(!view||$('.mf62-inline-entry',view))return;const link=el('button','mf62-inline-entry','ویرایش سه قالب جدید هوم');link.onclick=open;view.prepend(link)});const node=$('#view');if(node)observer.observe(node,{childList:true});
}
window.addEventListener('beforeunload',e=>{if(!dirty)return;e.preventDefault();e.returnValue=''})
})();
