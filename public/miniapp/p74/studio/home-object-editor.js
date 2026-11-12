
/* P76 dynamic stage editor: 3..8 stage overlays, existing P74 Home draft/publish only. */
(function(){'use strict';if(window.__P74_STUDIO__)return;window.__P74_STUDIO__=true;
const MARK='#p74-home-config',TOKEN='tenx_admin_token';
if(!window.MMTradeObjectModel)throw Error('Object Studio model was not loaded');
const SEED=[
 ['شروع چالش','https://mmtrade10x.ir/mmtrade10x'],['آموزش‌های کلیدی','/copytrade-academy'],
 ['تمرین و اجرا','/miniapp/challenge.html'],['مدیریت ریسک','/eplanet'],
 ['رشد و مقیاس','/miniapp/profile.html'],['ماموریت ششم','/miniapp/challenge.html'],
 ['ماموریت هفتم','/miniapp/challenge.html'],['ماموریت هشتم','/miniapp/challenge.html']];
const DEF={version:74,stepLinksVersion:1,enabled:true,brand:'MM trade challenge 10x',tagline:'چالش رشد ۱۰ برابری در معاملات',
 heroEyebrow:'ویدیوی معرفی چالش',heroTitle:'چالش MM',heroSubtitle:'رشد ۱۰ برابری',
 journeyTitle:'مسیر 10X تو از اینجا شروع می‌شود',journeySubtitle:'یک مسیر مرحله‌به‌مرحله برای رشد مهارت، اعتمادبه‌نفس و سرمایه',
 videoUrl:'https://dl.namahub.ir/parsahojabrian/W0OGUlGh',videoDuration:'07:46',
 videoPoster:'/miniapp/p74/assets/hero_poster.webp',videoFrameWidth:92.8,videoFrameHeight:17.1,videoFrameTop:16.5,
 progressTitle:'پیشرفت شما در چالش',progressHref:'/miniapp/profile.html',ctaText:'مرحله بعدی چالش',ctaHref:'/miniapp/challenge.html',
 stepCount:5,steps:[],nav:[{title:'خانه',href:'/miniapp/index.html'},{title:'آکادمی',href:'/miniapp/academy.html'},{title:'پروفایل',href:'/miniapp/profile.html'}]};
const el=(t,c='',txt)=>{let a=document.createElement(t);if(c)a.className=c;if(txt!==undefined)a.textContent=txt;return a};
const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number(x)||a));
const count=v=>Math.min(8,Math.max(3,Math.trunc(Number(v)||5)));
function layout(n){n=count(n);return Array.from({length:n},(_,i)=>{const rank=n-1-i,f=rank/(n-1),width=Math.round(35+13*f);
return{top:+(3+rank*67/(n-1)).toFixed(2),right:Math.round(12+33*f),width,height:+Math.min(13,66/n).toFixed(2)}})}
DEF.steps=SEED.map((v,i)=>({title:v[0],href:v[1],position:layout(8)[i]}));
function urlValid(s){s=String(s||'').trim();if(s.startsWith('/')&&!s.startsWith('//')&&!/[\s<>'"]/.test(s))return s;
try{const u=new URL(s);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href}catch(e){}throw Error('لینک باید HTTPS یا با / شروع شود')}
function token(){try{return sessionStorage.getItem(TOKEN)||''}catch(e){return''}}
async function api(route,options={}){if(!token())throw Error('ابتدا وارد پنل شوید');const r=await fetch('/admin'+route,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+token()}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error||'HTTP '+r.status);return d}
function decodeMarker(blocks){const m=(Array.isArray(blocks)?blocks:[]).filter(b=>b?.type==='element'&&b.selector===MARK);
if(m.length>1)throw Error('تنظیمات تکراری Home');if(!m.length)return null;let v;try{v=JSON.parse(m[0].text)}catch(e){throw Error('تنظیمات ذخیره‌شده معتبر نیست')};if(v.version!==74)throw Error('نسخه تنظیمات ناسازگار');return v}

/* P77 page editor config normalization */
function normalizePageLayout(raw){
 const out={};if(!raw||typeof raw!=='object')return out;
 for(const [id,v] of Object.entries(raw).slice(0,40)){
  if(!/^[a-z0-9_-]{1,48}$/i.test(id)||!v||typeof v!=='object')continue;
  const x=clamp(v.x,0,99),y=clamp(v.y,0,99);
  out[id]={x,y,w:clamp(v.w,1,100-x),h:clamp(v.h,1,100-y)};
 }
 return out;
}
function normalizePageStyles(raw){
 const out={};if(!raw||typeof raw!=='object')return out;
 for(const [id,v] of Object.entries(raw).slice(0,40)){
  if(!/^[a-z0-9_-]{1,48}$/i.test(id)||!v||typeof v!=='object')continue;
  const s={};
  for(const k of ['color','background','borderColor'])
   if(typeof v[k]==='string'&&/^#[0-9a-f]{6}$/i.test(v[k]))s[k]=v[k];
  for(const [k,min,max] of [['fontSize',8,72],['borderRadius',0,60],
   ['opacity',0.1,1],['padding',0,48],['letterSpacing',-2,8]]){
   if(v[k]!==undefined)s[k]=clamp(v[k],min,max);
  }
  if([400,700,800].includes(Number(v.fontWeight)))s.fontWeight=Number(v.fontWeight);
  if(['right','center','left'].includes(v.textAlign))s.textAlign=v.textAlign;
  if(Object.keys(s).length)out[id]=s;
 }
 return out;
}
const PAGE_EDITOR_ITEMS=[
 {id:'brand',title:'بخش برند'},
 {id:'brand-logo',title:'نشان برند'},
 {id:'brand-name',title:'نام برند',key:'brand'},
 {id:'brand-sub',title:'زیرعنوان برند',key:'tagline'},
 {id:'hero',title:'کادر معرفی ویدیو'},
 {id:'hero-copy',title:'ناحیه متن ویدیو'},
 {id:'hero-eyebrow',title:'برچسب ویدیو',key:'heroEyebrow'},
 {id:'hero-title',title:'عنوان ویدیو',key:'heroTitle'},
 {id:'hero-subtitle',title:'توضیح ویدیو',key:'heroSubtitle'},
 {id:'hero-underline',title:'خط تزئینی ویدیو'},
 {id:'hero-play',title:'دکمه پخش ویدیو'},
 {id:'hero-badge',title:'زمان ویدیو',key:'videoDuration'},
 {id:'journey-title',title:'عنوان مسیر',key:'journeyTitle'},
 {id:'journey-subtitle',title:'توضیح مسیر',key:'journeySubtitle'},
 {id:'progress-card',title:'کادر پیشرفت',linkKey:'progressHref'},
 {id:'progress-arrow',title:'فلش پیشرفت',linkKey:'progressHref'},
 {id:'progress-content',title:'متن پیشرفت'},
 {id:'progress-title',title:'عنوان پیشرفت',key:'progressTitle'},
 {id:'progress-ring',title:'دایره درصد پیشرفت'},
 {id:'cta',title:'دکمه اصلی پایین صفحه',linkKey:'ctaHref'},
 {id:'cta-chevron',title:'فلش دکمه اصلی',linkKey:'ctaHref'},
 {id:'cta-text',title:'متن دکمه اصلی',key:'ctaText',linkKey:'ctaHref'},
 {id:'cta-icon',title:'آیکون دکمه اصلی',linkKey:'ctaHref'},
 {id:'nav',title:'نوار منوی پایین'},
 {id:'nav-item-1',title:'آیتم اول منو',navIndex:0},
 {id:'nav-item-1-text',title:'متن آیتم اول',navIndex:0,key:'title'},
 {id:'nav-item-2',title:'آیتم دوم منو',navIndex:1},
 {id:'nav-item-2-text',title:'متن آیتم دوم',navIndex:1,key:'title'},
 {id:'nav-item-3',title:'آیتم سوم منو',navIndex:2},
 {id:'nav-item-3-text',title:'متن آیتم سوم',navIndex:2,key:'title'}
];
function selectedPageItem(){return PAGE_EDITOR_ITEMS.find(x=>x.id===selectedPageElementId)||null}
function pageElementObject(def){return def?.navIndex!==undefined?config.nav[def.navIndex]:config}
function selectPageElement(id){
 selectedPageElementId=id;selectedPageGeometry=config.pageLayout?.[id]||null;
 refreshPageElementEditor();
 frame?.contentWindow?.postMessage({type:'P74_PAGE_ELEMENT_SELECT',id},location.origin);
}
function refreshPageElementEditor(){
 if(!pageElementList||!pageElementInspector||!config)return;
 pageElementList.replaceChildren();pageElementInspector.replaceChildren();
 for(const def of PAGE_EDITOR_ITEMS){
  const row=el('div','mm-page-element-row');
  const pick=objectButton(def.title,()=>selectPageElement(def.id),
   'mm-object-pick'+(selectedPageElementId===def.id?' mm-selected':''));
  row.append(pick);pageElementList.append(row);
 }
 const def=selectedPageItem();
 if(!def){
  pageElementInspector.append(el('p','p74admin-info',
   'یک عنصر را از فهرست انتخاب کن یا مستقیماً روی پیش‌نمایش آن را لمس کن.'));
  return;
 }
 pageElementInspector.append(el('strong','mm-page-selected-title','انتخاب‌شده: '+def.title));
 const contentGroup=heading(pageElementInspector,'محتوا و لینک');
 const obj=pageElementObject(def);
 if(def.key)input(contentGroup,'متن یا عنوان',obj,def.key);
 if(def.linkKey)input(contentGroup,'لینک مقصد',config,def.linkKey,'url');
 if(def.navIndex!==undefined)input(contentGroup,'لینک مقصد',obj,'href','url');
 const geometryGroup=heading(pageElementInspector,'موقعیت و اندازه');
 geometryGroup.append(el('p','p74admin-info',
  'مقادیر درصدی‌اند. موقعیت نسبت به والد عنصر ذخیره می‌شود و با اندازه صفحه تطبیق پیدا می‌کند.'));
 const g=selectedPageGeometry||config.pageLayout?.[def.id];
 if(g){
  const grid=el('div','mm-page-editor-grid');
  for(const [key,label,min,max] of [
   ['x','موقعیت افقی X (%)',0,99],['y','موقعیت عمودی Y (%)',0,99],
   ['w','عرض (%)',1,100],['h','ارتفاع (%)',1,100]
  ]){
   const lab=el('label','p74admin-field');lab.append(el('span','',label));
   const field=el('input');field.type='number';field.step='0.1';
   field.min=String(min);field.max=String(max);field.value=String(g[key]);
   field.addEventListener('change',()=>{
    const current={...(config.pageLayout[def.id]||g)};
    current[key]=clamp(field.value,min,max);
    current.w=clamp(current.w,1,100-current.x);
    current.h=clamp(current.h,1,100-current.y);
    config.pageLayout[def.id]=current;selectedPageGeometry=current;
    refreshPageElementEditor();preview();
   });
   lab.append(field);grid.append(lab);
  }
  geometryGroup.append(grid);
 }else{
  geometryGroup.append(el('p','p74admin-info',
   'برای خواندن مختصات فعلی، عنصر را یک‌بار در پیش‌نمایش انتخاب کن.'));
 }
 const style=config.pageStyles[def.id]||(config.pageStyles[def.id]={});
 const appearance=heading(pageElementInspector,'رنگ و ظاهر');
 for(const [key,label,fallback] of [
  ['color','رنگ متن یا عنصر','#ffffff'],
  ['background','رنگ پس‌زمینه','#123b2c'],
  ['borderColor','رنگ کادر','#d7b17d']
 ]){
  const lab=el('label','p74admin-field');lab.append(el('span','',label));
  const pick=el('input');pick.type='color';pick.value=style[key]||fallback;
  pick.addEventListener('input',()=>{style[key]=pick.value;preview()});
  lab.append(pick);appearance.append(lab);
 }
 const typography=heading(pageElementInspector,'تایپوگرافی و افکت');
 const addNumber=(key,label,min,max,step)=>{
  const lab=el('label','p74admin-field');lab.append(el('span','',label));
  const field=el('input');field.type='number';field.min=String(min);
  field.max=String(max);field.step=String(step);
  field.value=style[key]===undefined?'':String(style[key]);
  field.placeholder='بدون تغییر';
  field.addEventListener('change',()=>{
   if(field.value===''){delete style[key]}else style[key]=clamp(field.value,min,max);
   preview();
  });
  lab.append(field);typography.append(lab);
 };
 addNumber('fontSize','اندازه فونت (px)',8,72,1);
 addNumber('borderRadius','گردی گوشه‌ها (px)',0,60,1);
 addNumber('opacity','شفافیت (۰٫۱ تا ۱)',0.1,1,0.05);
 addNumber('padding','فاصله داخلی (px)',0,48,1);
 addNumber('letterSpacing','فاصله حروف (px)',-2,8,0.1);
 const weight=el('label','p74admin-field');weight.append(el('span','','ضخامت فونت'));
 const select=el('select','mm-object-select');
 for(const [value,label] of [['400','معمولی'],['700','ضخیم'],['800','خیلی ضخیم']]){
  const option=el('option','',label);option.value=value;select.append(option);
 }
 select.value=String(style.fontWeight||700);
 select.addEventListener('change',()=>{style.fontWeight=Number(select.value);preview()});
 weight.append(select);typography.append(weight);
 const align=el('label','p74admin-field');align.append(el('span','','تراز متن'));
 const alignSelect=el('select','mm-object-select');
 for(const [value,label] of [['right','راست'],['center','وسط'],['left','چپ']]){
  const option=el('option','',label);option.value=value;alignSelect.append(option);
 }
 alignSelect.value=style.textAlign||'right';
 alignSelect.addEventListener('change',()=>{style.textAlign=alignSelect.value;preview()});
 align.append(alignSelect);typography.append(align);
}
function buildPageElementEditor(){
 const group=heading(form,'ویرایش مستقیم عناصر صفحه');group.classList.add('mm-page-editor');
 group.append(el('p','p74admin-info',
  'عنصر را مستقیماً از پیش‌نمایش انتخاب کن. با کشیدن آن جابه‌جا می‌شود و دستگیره گوشه، اندازه را تغییر می‌دهد.'));
 pageElementList=el('div','mm-page-element-list');group.append(pageElementList);
 pageElementInspector=el('section','mm-page-element-inspector');group.append(pageElementInspector);
 refreshPageElementEditor();
}

function normalize(raw){const a=clone(DEF);if(!raw||typeof raw!=='object'){a.steps=a.steps.slice(0,5).map((s,i)=>({...s,position:layout(5)[i]}));a.objects=window.MMTradeObjectModel.normalizeObjects();a.backgrounds={};a.pageLayout={};a.pageStyles={};return a}
 for(const key of ['enabled','brand','tagline','heroEyebrow','heroTitle','heroSubtitle','journeyTitle','journeySubtitle','videoUrl','videoDuration','videoPoster','progressTitle','progressHref','ctaText','ctaHref'])if(raw[key]!==undefined)a[key]=raw[key];
 a.videoPoster=OBJECT.assetUrl(raw.videoPoster)||DEF.videoPoster;
 for(const [k,min,max] of [['videoFrameWidth',60,100],['videoFrameHeight',8,32],['videoFrameTop',4,42]]){
  const v=Number(raw[k]);a[k]=Number.isFinite(v)&&raw[k]!==undefined?Math.max(min,Math.min(max,v)):DEF[k];
 }
 a.stepCount=count(raw.stepCount??(Array.isArray(raw.steps)?raw.steps.length:5));
 const auto=layout(a.stepCount);
 a.steps=Array.from({length:a.stepCount},(_,i)=>{
 const seed=clone(DEF.steps[i]);
 const v=Array.isArray(raw.steps)?raw.steps[i]:null;
 const step={...seed,...(v||{}),position:{...auto[i],...(v?.position||{})}};
 if(raw.stepLinksVersion!==1&&[0,1,3].includes(i))step.href=SEED[i][1];
 return step;
});
 if(Array.isArray(raw.nav))a.nav=a.nav.map((v,i)=>({...v,...(raw.nav[i]||{})}));a.objects=window.MMTradeObjectModel.normalizeObjects(raw.objects);a.backgrounds=window.MMTradeObjectModel.backgrounds(raw.backgrounds);a.pageLayout=normalizePageLayout(raw.pageLayout);a.pageStyles=normalizePageStyles(raw.pageStyles);return a}
let modal=null,frame=null,dataLoaded=false,config=null,statusNode=null,form=null,stepZone=null,stageCounter=null;
let savedConfig='',operation=false,openSession=0,adapter=null,lastEmitted='';
const objectDirty=()=>false; // The enclosing visual workspace owns the draft and dirty state.

/* Object Studio: editable layers, per-step backgrounds, animations and authenticated upload. */
const OBJECT=window.MMTradeObjectModel;
let selectedObjectId=null,objectList=null,objectInspector=null,backgroundLabel=null;
let selectedPageElementId=null,selectedPageGeometry=null,pageElementList=null,pageElementInspector=null;
const objectTypes={image:'تصویر',text:'متن',shape:'شکل',light:'نور',flag:'پرچم'};
const motionNames={none:'بدون انیمیشن',float:'شناور',pulse:'ضربان',spin:'چرخش',glow:'درخشش',sway:'تاب خوردن',drift:'حرکت آرام', 'fade-in':'ظاهر شدن','slide-up':'ورود از پایین',twinkle:'چشمک'};
function selectedObject(){return config?.objects?.find(o=>o.id===selectedObjectId)||null;}
function objectButton(text,handler,style=''){const b=el('button',style,text);b.type='button';b.addEventListener('click',handler);return b;}
function objectNumber(parent,caption,obj,key,min,max,step){
 const label=el('label','p74admin-field');label.append(el('span','',caption));const input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(obj[key]);
 input.addEventListener('input',()=>{if(input.value==='')return;obj[key]=Math.min(max,Math.max(min,Number(input.value)||0));preview()});
 input.addEventListener('change',()=>{const v=OBJECT.normalizeObject(obj,0);if(v){Object.assign(obj,v);input.value=String(obj[key]);preview();}});
 label.append(input);parent.append(label);
}
function objectText(parent,caption,obj,key,max=120){
 const label=el('label','p74admin-field');label.append(el('span','',caption));const input=el('input');input.value=obj[key]||'';input.maxLength=max;input.addEventListener('input',()=>{obj[key]=input.value;preview()});label.append(input);parent.append(label);
}
function objectSelect(parent,caption,obj,key,items){
 const label=el('label','p74admin-field');label.append(el('span','',caption));const select=el('select','mm-object-select');
 for(const [key,labelText] of items){const option=el('option','',labelText);option.value=key;select.append(option)}
 select.value=obj[key];select.addEventListener('change',()=>{obj[key]=select.value;preview()});label.append(select);parent.append(label);
}
function refreshObjects(){if(!objectList||!objectInspector||!config)return;
 objectList.replaceChildren();objectInspector.replaceChildren();
 for(const obj of [...config.objects].sort((a,b)=>b.z-a.z)){
  const row=el('div','mm-object-row'+(selectedObjectId===obj.id?' mm-selected':''));
  const choose=objectButton((obj.visible?'◉ ':'○ ')+obj.name,()=>{selectedObjectId=obj.id;refreshObjects();preview()},'mm-object-pick');
  const eye=objectButton(obj.visible?'مخفی':'نمایش',()=>{obj.visible=!obj.visible;refreshObjects();preview()});
  const up=objectButton('↑',()=>{obj.z=Math.min(99,obj.z+1);refreshObjects();preview()});
  const down=objectButton('↓',()=>{obj.z=Math.max(0,obj.z-1);refreshObjects();preview()});
  row.append(choose,eye,up,down);objectList.append(row);
 }
 const obj=selectedObject();if(!obj){objectInspector.append(el('p','p74admin-info','یک آبجکت را از فهرست انتخاب کن یا آبجکت جدید بساز.'));return}
 objectInspector.append(el('h3','',obj.name+' — '+objectTypes[obj.type]));
 objectText(objectInspector,'نام آبجکت',obj,'name',48);
 if(obj.type==='text'||obj.type==='flag')objectText(objectInspector,'متن',obj,'content',120);
 if(obj.type==='image')objectText(objectInspector,'آدرس تصویر در سرور',obj,'src',360);
 if(['text','light','shape','flag'].includes(obj.type)){
  const lab=el('label','p74admin-field');lab.append(el('span','','رنگ'));const pick=el('input');pick.type='color';pick.value=obj.color;pick.addEventListener('input',()=>{obj.color=pick.value;preview()});lab.append(pick);objectInspector.append(lab);
 }
 if(obj.type==='shape')objectSelect(objectInspector,'شکل',obj,'shape',[['rectangle','مستطیل'],['circle','دایره'],['line','خط']]);
 const row=el('div','mm-object-numbers');objectInspector.append(row);
 for(const [key,title,min,max,step] of [['x','افقی X (%)',0,98,.5],['y','عمودی Y (%)',0,99,.5],['w','عرض (%)',2,100,.5],['h','ارتفاع (%)',1,100,.5],['rotation','چرخش (°)',-360,360,1],['opacity','شفافیت',0,1,.05],['z','ترتیب لایه',0,99,1]])objectNumber(row,title,obj,key,min,max,step);
 objectSelect(objectInspector,'انیمیشن',obj,'animation',OBJECT.ANIMATIONS.map(a=>[a,motionNames[a]]));
 objectNumber(objectInspector,'مدت انیمیشن (ثانیه)',obj,'duration',.3,30,.1);
 objectNumber(objectInspector,'تأخیر انیمیشن (ثانیه)',obj,'delay',0,30,.1);
 const vis=el('section','mm-object-stage');vis.append(el('strong','','نمایش در نسخه‌های کوه'));
 const all=el('label','');const allbox=el('input');allbox.type='checkbox';allbox.checked=obj.stages==='all';allbox.addEventListener('change',()=>{obj.stages=allbox.checked?'all':[config.stepCount];refreshObjects();preview()});all.append(allbox,el('span','','همه مراحل'));vis.append(all);
 if(obj.stages!=='all')for(const n of OBJECT.sequence()){
  const lab=el('label','');const cb=el('input');cb.type='checkbox';cb.checked=obj.stages.includes(n);
  cb.addEventListener('change',()=>{obj.stages=cb.checked?[...new Set([...obj.stages,n])].sort():obj.stages.filter(x=>x!==n);preview()});
  lab.append(cb,el('span','',n+' پله'));vis.append(lab);
 }
 objectInspector.append(vis);
 const actions=el('div','mm-object-buttons');
 actions.append(objectButton('کپی آبجکت',()=>{if(config.objects.length>=48)return status('حداکثر ۴۸ آبجکت', 'warn');
  const duplicate=OBJECT.normalizeObject({...obj,id:'o'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:obj.name+' (کپی)',x:Math.min(100-obj.w,obj.x+3),y:Math.min(100-obj.h,obj.y+3),z:Math.min(99,obj.z+1)},config.objects.length);
  if(!duplicate)return;config.objects.push(duplicate);selectedObjectId=duplicate.id;refreshObjects();preview();}));
 actions.append(objectButton('حذف آبجکت',()=>{if(!confirm('آبجکت «'+obj.name+'» حذف شود؟'))return;
  config.objects=config.objects.filter(x=>x.id!==obj.id);selectedObjectId=null;refreshObjects();preview()},'p76-danger'));
 objectInspector.append(actions);
}
async function uploadObjectMedia(file, role='object'){
 const session=openSession;
 if(!window.MMTradeImageOptimizer)throw Error('ماژول بهینه‌سازی تصویر بارگذاری نشده؛ پنل را دوباره باز کن');
 const optimized=await window.MMTradeImageOptimizer.optimize(file,{role,onProgress:msg=>status(msg)});
 file=optimized.file;
 if(file.size>12*1024*1024)throw Error('حجم تصویر پس از بهینه‌سازی بیش از ۱۲ مگابایت است');
 status(optimized.summary+'؛ در حال آپلود…');
 const init=await api('/home-studio/media/begin',{method:'POST',body:JSON.stringify({name:file.name,kind:'image',size:file.size,type:file.type})});
 if(!init.uploadId)throw Error('خطای شروع بارگذاری');
 const chunkSize=Math.min(192*1024,Number(init.chunkSize)||192*1024);let i=0;
 for(let start=0;start<file.size;start+=chunkSize,i++){
  const bytes=file.slice(start,start+chunkSize);
  const response=await fetch('/admin/home-studio/media/'+init.uploadId+'/'+i,{method:'POST',headers:{authorization:'Bearer '+token(),'content-type':'application/octet-stream'},body:bytes});
  if(!response.ok)throw Error('بارگذاری قطعه '+(i+1)+' ناموفق بود: HTTP '+response.status);
 }
 const finished=await api('/home-studio/media/'+init.uploadId+'/finish',{method:'POST',body:'{}'});
 if(session!==openSession||!modal?.isConnected)throw Error('صفحه هنگام آپلود تغییر کرد؛ تصویر به صفحه جدید اضافه نشد');
 if(!OBJECT.assetUrl(finished.url))throw Error('آدرس تصویر برگشتی قابل استفاده نیست');return {url:finished.url,summary:optimized.summary};
}

/* MMVS_P74_PREVIEW_LIBRARY_R4: keep P74 desktop scene fitted to iframe. */
function mmvsP74FitPreview(previewFrame,screenNode){
 try{
  const doc=previewFrame?.contentDocument;
  if(!doc?.head)return;
  let style=doc.getElementById('mmvs-p74-preview-fit-r4');
  if(!style){
   style=doc.createElement('style');style.id='mmvs-p74-preview-fit-r4';
   style.textContent='html.mmvs-p74-wide-r4 #p74-app .p74-page{width:100%!important;max-width:none!important;min-height:0!important;margin:0!important;}html.mmvs-p74-wide-r4 #p74-app .p74-scroll{width:100%!important;}';
   doc.head.append(style);
  }
  doc.documentElement.classList.toggle('mmvs-p74-wide-r4',screenNode?.dataset.previewMode==='wide');
 }catch(error){console.warn('MMVS P74 R4 preview fit:',error)}
}
/* Accept same-origin absolute and root-relative URLs returned by the catalog.
   The shared ObjectModel still enforces public image directory/extension rules. */
function mmvsP74CatalogImageUrl(value){
 try{
  const raw=String(value||'').trim();if(!raw||raw.startsWith('//'))return '';
  const u=new URL(raw,location.origin);if(u.origin!==location.origin)return '';
  const path=decodeURIComponent(u.pathname);
  return OBJECT.assetUrl(path);
 }catch(_){return ''}
}
function mmvsP74ConfirmImage(url){
 return new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve();
  image.onerror=()=>reject(Error('فایل تصویر در آدرس انتخاب‌شده بارگذاری نشد. تصویر دیگری انتخاب کن.'));
  image.src=url;
 });
}
/* MMVS_P74_PREVIEW_LIBRARY_R4 HELPERS END */

/* MMVS_P74_BG_LIBRARY_R3: reuse catalog API (not another storage system). */
function mmvsP74OpenBackgroundLibrary(onPick){
 const LIMIT=36;
 let currentPage=1, seq=0, total=0;
 const host=el('section','');host.id='mmvs-p74-library';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');
 host.setAttribute('aria-label','کتابخانه مشترک تصاویر پس‌زمینه');
 const panel=el('div','mmvs-p74-lib-panel');host.append(panel);
 const head=el('div','mmvs-p74-lib-head');const title=el('strong','','انتخاب پس‌زمینه کوه از کتابخانه تصاویر');
 const closeButton=el('button','','بستن ✕');head.append(title,closeButton);panel.append(head);
 const info=el('p','mmvs-p74-lib-status','تصاویر از کتابخانه فعلی MMTrade خوانده می‌شوند؛ با انتخاب، فایل جدید ساخته نمی‌شود.');panel.append(info);
 const controls=el('div','mmvs-p74-lib-controls');const query=el('input');query.type='search';query.placeholder='جست‌وجوی تصویر';query.setAttribute('aria-label','جست‌وجوی کتابخانه');
 const group=el('select');for(const [value,name] of [['all','همه تصاویر'],['uploads','آپلودشده'],['academy','آکادمی'],['site','سایت']]){
  const option=el('option','',name);option.value=value;group.append(option);
 }controls.append(query,group);panel.append(controls);
 const grid=el('div','mmvs-p74-lib-grid');panel.append(grid);
 const footer=el('div','mmvs-p74-lib-footer');const count=el('span','mmvs-p74-lib-status','');const prev=el('button','','صفحه قبل');const next=el('button','','صفحه بعد');footer.append(count,prev,next);panel.append(footer);
 function close(){seq++;host.remove();document.removeEventListener('keydown',onKey,true);}
 host.addEventListener('mm-home-close',close,{once:true});
 function onKey(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}}
 closeButton.onclick=close;host.onclick=event=>{if(event.target===host)close()};document.addEventListener('keydown',onKey,true);
 function message(text,isError){info.textContent=text;info.style.color=isError?'#ffc2b1':'#a9d8c2'}
 async function load(){
  const request=++seq;grid.replaceChildren();message('در حال دریافت تصاویر از کتابخانه…');
  prev.disabled=next.disabled=true;
  const qp=new URLSearchParams({page:String(currentPage),limit:String(LIMIT),group:group.value,search:query.value.trim()});
  try{
   const res=await fetch('/admin/mmvs/media-library?'+qp,{cache:'no-store',credentials:'same-origin',headers:{authorization:'Bearer '+token()}});
   const result=await res.json().catch(()=>({}));if(!res.ok)throw Error(result.error||result.message||'HTTP '+res.status);
   if(request!==seq||!host.isConnected)return;
   const list=Array.isArray(result.items)?result.items:Array.isArray(result.files)?result.files:Array.isArray(result.results)?result.results:Array.isArray(result.data?.items)?result.data.items:[];
   total=Number(result.total??result.totalCount??result.pagination?.total??result.data?.total??NaN);
   if(!Number.isFinite(total))total=NaN;
   if(!list.length){message('تصویری در این بخش پیدا نشد.');}
   else message('تصویر را انتخاب کن تا فقط به پس‌زمینه تعداد پله فعلی متصل شود.');
   for(const item of list){
    if(!item||typeof item.url!=='string')continue;
    const url=mmvsP74CatalogImageUrl(item.url);
    const tile=el('div','mmvs-p74-lib-item');const photo=el('img');if(url)photo.src=url;photo.alt=String(item.name||'تصویر');photo.loading='lazy';
    const label=el('span','mmvs-p74-lib-name',String(item.name||item.url).slice(0,120));
    const choose=el('button','',url?'استفاده برای این کوه':'مسیر غیرمجاز');choose.disabled=!url;
    choose.title=url?'انتخاب بدون کپی یا آپلود مجدد':'این تصویر خارج از مسیر مجاز تصویر کوه است';
    choose.onclick=async()=>{if(!url)return;
     choose.disabled=true;
     try{message('در حال بررسی تصویر انتخاب‌شده…');await mmvsP74ConfirmImage(url);if(!host.isConnected)return;onPick(url,item);close();}
     catch(error){message(String(error.message||error),true);choose.disabled=false;}
    };
    photo.title='برای انتخاب تصویر کلیک کن';photo.style.cursor=url?'pointer':'not-allowed';photo.onclick=()=>{if(!choose.disabled)choose.click()};tile.append(photo,label,choose);grid.append(tile);
   }
   const pages=Number.isFinite(total)?Math.max(1,Math.ceil(total/LIMIT)):null;
   count.textContent='صفحه '+currentPage+(pages?' از '+pages:'')+' · '+(Number.isFinite(total)?total.toLocaleString('fa-IR')+' تصویر':'کتابخانه مشترک');
   prev.disabled=currentPage<=1;next.disabled=pages?currentPage>=pages:list.length<LIMIT;
  }catch(error){if(request===seq)message('خطا در دریافت کتابخانه: '+String(error.message||error),true)}
 }
 query.addEventListener('change',()=>{currentPage=1;load()});query.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();currentPage=1;load()}});
 group.onchange=()=>{currentPage=1;load()};prev.onclick=()=>{if(currentPage>1){currentPage--;load()}};next.onclick=()=>{currentPage++;load()};
 document.body.append(host);load();
}
/* MMVS_P74_BG_LIBRARY_R3 JS END */

function buildObjectStudio(){
 const group=heading(form,'Object Studio — آبجکت‌ها و انیمیشن‌ها');group.classList.add('mm-object-studio');
 group.append(el('p','p74admin-hint','آبجکت‌ها مستقل از دکمه‌های مراحل هستند؛ جابه‌جایی روی پیش‌نمایش، مخفی‌سازی، حذف و انتخاب انیمیشن از این بخش انجام می‌شود.'));
 group.append(el('p','mm-base-warning','توجه: پرچم، مکعب و نورهای داخل عکس‌های قدیمی روی خود تصویر حک شده‌اند. برای حذف کامل آن‌ها، تصویر پس‌زمینه بدون این عناصر را برای هر تعداد پله بارگذاری کن.'));
 const backgrounds=el('section','mm-object-background');backgroundLabel=el('p','p74admin-info');
 const updateBg=()=>{const path=config.backgrounds?.[String(config.stepCount)];backgroundLabel.textContent=path?'پس‌زمینه مستقل '+config.stepCount+' پله: '+path:'پس‌زمینه فعلی '+config.stepCount+' پله: تصویر قدیمی (دارای عناصر چسبیده به عکس)'};
 updateBg();backgrounds.append(backgroundLabel);
 const bgInput=el('input');bgInput.type='file';bgInput.accept='image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.gif';bgInput.hidden=true;
 const uploadBg=objectButton('آپلود پس‌زمینه جدید برای '+config.stepCount+' پله (کتابخانه)',()=>bgInput.click());
 const resetBg=objectButton('بازگشت به تصویر قبلی',()=>{delete config.backgrounds[String(config.stepCount)];updateBg();preview()});
 bgInput.addEventListener('change',async()=>{const f=bgInput.files?.[0];if(!f)return;uploadBg.disabled=true;
  try{status('در حال آپلود پس‌زمینه…');const uploaded=await uploadObjectMedia(f,'background');config.backgrounds[String(config.stepCount)]=uploaded.url;updateBg();preview();status('پس‌زمینه آپلود شد؛ '+uploaded.summary+'؛ برای نمایش عمومی انتشار لازم است.','ok')}
  catch(e){status('خطای آپلود: '+e.message,'warn')}finally{uploadBg.disabled=false;bgInput.value=''}});
 const libraryBg=objectButton('🗂 انتخاب تصویر از کتابخانه مشترک',()=>mmvsP74OpenBackgroundLibrary((url,item)=>{
    if(!OBJECT.assetUrl(url))throw Error('آدرس این تصویر برای پس‌زمینه کوه مجاز نیست.');
    const n=String(config.stepCount);config.backgrounds=config.backgrounds||{};
    config.backgrounds[n]=url;updateBg();preview();
    const stageCount=n,expectedUrl=url;
    setTimeout(()=>{
      if(!modal?.isConnected||String(config.stepCount)!==stageCount)return;
      const stage=frame?.contentDocument?.querySelector('#p74-app .p74-page');
      const applied=stage?.style.getPropertyValue('--p76-background')||'';
      if(applied.includes(expectedUrl))status('پس‌زمینه '+stageCount+' پله در پیش‌نمایش اعمال شد؛ برای نمایش عمومی انتشار لازم است.','ok');
      else status('تصویر انتخاب شد اما پیش‌نمایش آن را اعمال نکرد. فعلاً منتشر نکن و خطا را بررسی کن.','warn');
    },750);
    status('پس‌زمینه '+n+' پله از کتابخانه انتخاب شد؛ برای نمایش کاربران انتشار لازم است.','ok');
  }));
  backgrounds.append(uploadBg,libraryBg,resetBg,bgInput);group.append(backgrounds);
 const addTools=el('div','mm-object-buttons');const tools=[['image','➕ تصویر'],['text','➕ متن'],['shape','➕ شکل'],['light','➕ نور'],['flag','➕ پرچم']];
 for(const [type,label] of tools)addTools.append(objectButton(label,()=>{
   if(config.objects.length>=48)return status('حداکثر ۴۸ آبجکت مجاز است','warn');const obj=OBJECT.make(type);config.objects.push(obj);selectedObjectId=obj.id;refreshObjects();preview();}));
 const imgInput=el('input');imgInput.type='file';imgInput.accept='image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.gif';imgInput.hidden=true;
 addTools.append(objectButton('آپلود تصویر شفاف',()=>imgInput.click()));
 imgInput.addEventListener('change',async()=>{const f=imgInput.files?.[0];if(!f)return;
  try{status('در حال آپلود آبجکت…');if(config.objects.length>=48)throw Error('حداکثر ۴۸ آبجکت');const uploaded=await uploadObjectMedia(f,'object');
    const obj=OBJECT.make('image');obj.src=uploaded.url;obj.name=f.name.slice(0,48);config.objects.push(obj);selectedObjectId=obj.id;refreshObjects();preview();status('آبجکت آپلود شد؛ '+uploaded.summary+'؛ پیش‌نویس را ذخیره کن.','ok')}
  catch(e){status('خطای آپلود: '+e.message,'warn')}finally{imgInput.value=''}});
 addTools.append(imgInput);group.append(addTools);
 const libs=el('div','mm-object-buttons');libs.append(objectButton('مکعب MM',()=>addBuiltIn('cube')),objectButton('سکه MM',()=>addBuiltIn('coin')),objectButton('مکعب کوچک',()=>addBuiltIn('smallcube')));group.append(libs);
 objectList=el('div','mm-object-list');group.append(objectList);objectInspector=el('section','mm-object-inspector');group.append(objectInspector);
 refreshObjects();
}
function addBuiltIn(type){if(config.objects.length>=48)return status('حداکثر ۴۸ آبجکت مجاز است','warn');
 const obj=OBJECT.make('image');obj.name=type==='coin'?'سکه MM':type==='smallcube'?'مکعب کوچک':'مکعب MM';obj.src=type==='coin'?'/miniapp/p74/assets/coin.webp':'/miniapp/p74/assets/cube.webp';
 obj.w=type==='smallcube'?8:20;obj.h=type==='smallcube'?5:12;obj.animation='float';config.objects.push(obj);selectedObjectId=obj.id;refreshObjects();preview();}

function status(t,kind=''){if(statusNode){statusNode.textContent=t;statusNode.dataset.state=kind}}
function changed(){
 if(!adapter||!dataLoaded||!config)return;
 const value=JSON.stringify(config);if(value===lastEmitted)return;
 if(adapter.isBusy?.()||adapter.isReadOnly?.())return;
 adapter.onChange(clone(config));lastEmitted=value;
}
function preview(){if(adapter?.isReadOnly?.())return;changed();if(frame?.contentWindow&&config)frame.contentWindow.postMessage({type:'P74_CONFIG_PREVIEW',config:clone(config),selectedElementId:selectedPageElementId},location.origin)}
function heading(parent,title){
 const s=el('details','p74admin-group');
 const summary=el('summary','mm-object-accordion-title');
 summary.append(el('h3','',title));
 s.append(summary);
 parent.append(s);
 return s;
}
function input(parent,title,obj,key,kind='text',meta={}){
 const lab=el('label','p74admin-field'),node=el('input');lab.append(el('span','',title));
 node.type=kind==='number'?'number':'text';node.value=obj[key]??'';node.autocomplete='off';
 if(kind==='number'){const lim=meta.range||(meta.stepIndex===undefined?null:({top:[-178.57,171.57],right:[0,100],width:[18,95],height:[7,28]})[key]);
  node.min=String(lim?lim[0]:0);node.max=String(lim?lim[1]:100);node.step='0.1';node.style.direction='ltr';node.style.textAlign='left'}
 if(kind==='url')node.placeholder='https:// یا /miniapp/...';
 node.addEventListener('input',()=>{obj[key]=kind==='number'?Number(node.value):node.value;preview()});
 if(meta.stepIndex!==undefined)node.dataset.p76key=meta.stepIndex+':'+key;
 lab.append(node);parent.append(lab);return node}
// Mountain area is 50%..78% of the full stage. Keep the stored % coordinates backward-compatible.
function stepNormalize(p){const width=clamp(p.width,18,95),height=clamp(p.height,7,28);
 const top=Math.max(-50/28*100,Math.min((100-50)/28*100-height,Number(p.top)||0));
 const right=Math.max(0,Math.min(100-width,Number(p.right)||0));
 return{top:Math.round(top*100)/100,right:Math.round(right*100)/100,width:Math.round(width*100)/100,height:Math.round(height*100)/100};}
function redrawSteps(){stepZone.replaceChildren();stageCounter.textContent=''+config.stepCount;
 for(let i=0;i<config.stepCount;i++){
 const item=config.steps[i],s=heading(stepZone,'مرحله '+(i+1));
 input(s,'عنوان',item,'title');input(s,'لینک مرحله',item,'href','url');
 const move=el('p','p75-step-help','بکشید تا جابه‌جا شود؛ گوشهٔ چپ پایین را بکشید یا با دو انگشت اندازه را تغییر دهید. فاصله از بالا می‌تواند منفی باشد.');s.append(move);
 for(const [name,label] of [['top','فاصله از بالا (%)'],['right','فاصله از راست (%)'],['width','عرض دکمه (%)'],['height','ارتفاع دکمه (%)']]){
 const field=input(s,label,item.position,name,'number',{stepIndex:i});
 field.addEventListener('change',()=>{item.position=stepNormalize(item.position);for(const k of ['top','right','width','height']){const f=stepZone.querySelector(`[data-p76key="${i}:${k}"]`);if(f)f.value=String(item.position[k])}preview()})
 }
 const actions=el('div','p76-step-actions');
 const reset=el('button','p75-step-reset','چیدمان خودکار');reset.type='button';reset.addEventListener('click',()=>{item.position=layout(config.stepCount)[i];redrawSteps();preview()});actions.append(reset);
 const remove=el('button','p76-danger','حذف این مرحله');remove.type='button';remove.disabled=config.stepCount<=3;
 remove.addEventListener('click',()=>{if(config.stepCount<=3)return;config.steps.splice(i,1);config.stepCount--;
 const positions=layout(config.stepCount);config.steps.forEach((x,j)=>x.position=positions[j]);redrawSteps();preview()});actions.append(remove);s.append(actions)
 }
}
function setCount(v){const next=count(v);if(next===config.stepCount)return;
 if(next>config.stepCount)for(let i=config.stepCount;i<next;i++)config.steps.push(clone(DEF.steps[i]));
 else config.steps.splice(next);
 config.stepCount=next;config.steps.forEach((s,i)=>s.position=layout(next)[i]);redrawSteps();preview();status('تعداد پله‌ها تغییر کرد؛ برای نمایش در نسخه زنده انتشار لازم است.','ok')}
function rebuild(){form.replaceChildren();const toggle=el('label','p74admin-switch');const check=el('input');check.type='checkbox';check.checked=config.enabled!==false;check.addEventListener('change',()=>{config.enabled=check.checked;preview()});toggle.append(check,el('span','','نمایش Home جدید پس از انتشار'));form.append(toggle);
 let s=heading(form,'برند');input(s,'نام برند',config,'brand');input(s,'زیرعنوان',config,'tagline');
 s=heading(form,'ویدیو');for(const [k,l] of [['heroEyebrow','برچسب ویدیو'],['heroTitle','عنوان ویدیو'],['heroSubtitle','توضیح ویدیو'],['videoUrl','لینک ویدیوی ناماهاب / MP4'],['videoDuration','زمان نمایشی']])input(s,l,config,k,k==='videoUrl'?'url':'text');
 s=heading(form,'پوستر ویدیو و اندازه کادر');s.classList.add('mm-poster-group');
 s.append(el('p','p74admin-info','سایز پیشنهادی طراحی: ۱۴۴۰ × ۶۰۰ پیکسل (نسبت ۲٫۴ به ۱). تصویر به‌صورت خودکار بهینه می‌شود.'));
 const posterPreview=el('img','mm-poster-preview');posterPreview.src=OBJECT.assetUrl(config.videoPoster)||DEF.videoPoster;posterPreview.alt='پیش‌نمایش پوستر فعلی';posterPreview.loading='lazy';s.append(posterPreview);
 const posterInput=el('input');posterInput.type='file';posterInput.accept='image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.gif';posterInput.hidden=true;
 const posterButton=objectButton('انتخاب تصویر و آپلود پوستر ویدیو',()=>posterInput.click());posterButton.classList.add('mm-poster-upload');
 s.append(posterButton,posterInput);
 posterInput.onchange=async()=>{const file=posterInput.files?.[0];if(!file)return;
  try{const result=await uploadObjectMedia(file,'object');config.videoPoster=result.url;rebuild();preview();status('پوستر تغییر کرد؛ '+result.summary+'؛ برای نمایش عمومی انتشار لازم است.','ok')}
  catch(e){status('آپلود پوستر: '+e.message,'warn')}finally{posterInput.value=''}};
 input(s,'آدرس پوستر آپلودشده',config,'videoPoster');
 for(const [k,label,min,max] of [['videoFrameWidth','عرض کادر ویدیو (%)',60,100],['videoFrameHeight','ارتفاع کادر ویدیو (%)',8,32],['videoFrameTop','فاصله کادر از بالای صفحه (%)',4,42]]){
  const field=input(s,label,config,k,'number',{range:[min,max]});field.min=String(min);field.max=String(max);
  field.addEventListener('change',()=>{const v=Number(field.value);config[k]=Number.isFinite(v)?Math.min(max,Math.max(min,v)):DEF[k];field.value=String(config[k]);preview()});
 }
 s=heading(form,'مسیر چالش');input(s,'تیتر مسیر',config,'journeyTitle');input(s,'زیرتیتر',config,'journeySubtitle');
 s=heading(form,'تعداد پله‌ها و دکمه‌ها');const tools=el('div','p76-count-controls');
 const less=el('button','','− حذف مرحله آخر');less.type='button';less.addEventListener('click',()=>setCount(config.stepCount-1));
 stageCounter=el('strong','p76-stage-count',String(config.stepCount));const add=el('button','','+ افزودن مرحله');add.type='button';add.addEventListener('click',()=>setCount(config.stepCount+1));
 const auto=el('button','p76-layout-btn','چیدمان خودکار همه');auto.type='button';auto.addEventListener('click',()=>{config.steps.forEach((x,i)=>x.position=layout(config.stepCount)[i]);redrawSteps();preview()});
 tools.append(less,stageCounter,add,auto);s.append(tools);stepZone=el('div','p76-step-zone');form.append(stepZone);redrawSteps();
 buildObjectStudio();
 buildPageElementEditor();
 s=heading(form,'پیشرفت و CTA');for(const [k,l] of [['progressTitle','عنوان پیشرفت'],['progressHref','لینک پیشرفت'],['ctaText','متن CTA'],['ctaHref','لینک CTA']])input(s,l,config,k,k.toLowerCase().includes('href')?'url':'text');
 s=heading(form,'منوی قدیمی هوم (پیش‌نمایش)');s.append(el('p','p74admin-info','این سه گزینه متعلق به قالب قدیمی هوم هستند؛ منوی سراسری فعال از بخش «نوار پایین Mini App» مدیریت می‌شود.'));for(let i=0;i<3;i++){input(s,'عنوان '+(i+1),config.nav[i],'title');input(s,'لینک '+(i+1),config.nav[i],'href','url')}
}
function receive(e){if(operation||adapter?.isBusy?.()||adapter?.isReadOnly?.()||!modal||!frame||e.origin!==location.origin||e.source!==frame.contentWindow||!e.data)return;
 if(e.data.type==='P74_ELEMENT_SELECTED'){
  selectedPageElementId=String(e.data.id||'');
  selectedPageGeometry=e.data.layout&&typeof e.data.layout==='object'?e.data.layout:null;
  refreshPageElementEditor();return
 }
 if(e.data.type==='P74_ELEMENT_LAYOUT'){
  const id=String(e.data.id||''),g=e.data.layout;
  if(!PAGE_EDITOR_ITEMS.some(x=>x.id===id)||!g)return;
  config.pageLayout=config.pageLayout||{};
  config.pageLayout[id]=normalizePageLayout({[id]:g})[id];
  selectedPageElementId=id;selectedPageGeometry=config.pageLayout[id];
  refreshPageElementEditor();
  status('اندازه یا موقعیت عنصر تغییر کرد؛ پیش‌نویس را ذخیره کن.','ok');
  preview();return
 }
 if(e.data.type==='P74_OBJECT_SELECTED'){selectedObjectId=e.data.id;refreshObjects();return}
 if(e.data.type==='P74_OBJECT_MOVE'){const obj=config?.objects?.find(o=>o.id===e.data.id);if(!obj)return;
  obj.x=Math.round(Math.max(0,Math.min(100-obj.w,Number(e.data.x)||0))*100)/100;
  obj.y=Math.round(Math.max(0,Math.min(100-obj.h,Number(e.data.y)||0))*100)/100;
  selectedObjectId=obj.id;refreshObjects();status('موقعیت آبجکت تغییر کرد؛ پیش‌نویس را ذخیره کن.','ok');changed();return}
 if(e.data.type!=='P75_STEP_POSITION')return;
 const i=Number(e.data.step),p=e.data.position;if(!Number.isInteger(i)||i<0||i>=config.stepCount||!p)return;
 config.steps[i].position=stepNormalize({...config.steps[i].position,...p});
 for(const k of ['top','right','width','height']){
 const f=form.querySelector(`[data-p76key="${i}:${k}"]`);if(f&&p[k]!==undefined)f.value=String(p[k])
 }
 status('موقعیت دکمه '+(i+1)+' تغییر کرد؛ ذخیره و انتشار را انجام دهید.','ok');changed()
}
function close(force=false){if(!force&&(operation||(objectDirty()&&!confirm('تغییرات ذخیره نشده‌اند. خارج شوید؟'))))return false;openSession++;modal?.remove();modal=null;frame=null;dataLoaded=false;config=null;objectList=null;objectInspector=null;selectedObjectId=null;selectedPageElementId=null;selectedPageGeometry=null;pageElementList=null;pageElementInspector=null;document.body.classList.remove('mm-object-fullpage');window.removeEventListener('message',receive);return true}
function validate(){if(!config||config.steps.length!==config.stepCount)throw Error('تعداد دکمه‌ها با پله‌ها برابر نیست');
 for(const s of config.steps){if(!String(s.title||'').trim())throw Error('عنوان مرحله خالی است');urlValid(s.href);
 const p=s.position;if(!p)throw Error('موقعیت مرحله تعریف نشده');for(const k of ['top','right','width','height'])if(!Number.isFinite(Number(p[k])))throw Error('موقعیت دکمه نامعتبر است');
 if(p.width<18||p.width>95||p.height<7||p.height>28||p.top<-(50/28*100)-.02||p.right<0||p.top+p.height>(50/28*100)+.02||p.right+p.width>100.02)throw Error('یک دکمه خارج از محدوده تصویر است')}
 if(!OBJECT.assetUrl(config.videoPoster))throw Error('آدرس پوستر باید به تصویر آپلودشده در سیستم اشاره کند');
 for(const [k,min,max] of [['videoFrameWidth',60,100],['videoFrameHeight',8,32],['videoFrameTop',4,42]]){
   if(!Number.isFinite(Number(config[k]))||Number(config[k])<min||Number(config[k])>max)throw Error('اندازه یا جای پوستر نامعتبر است');
 }
 for(const s of config.nav)urlValid(s.href);urlValid(config.ctaHref);urlValid(config.progressHref);urlValid(config.videoUrl);const checked=window.MMTradeObjectModel.validateConfig(clone(config));checked.pageLayout=normalizePageLayout(config.pageLayout);checked.pageStyles=normalizePageStyles(config.pageStyles);return checked}

function unmount(){
 if(frame)frame.removeEventListener('load',preview);
 document.getElementById('mmvs-p74-library')?.dispatchEvent(new Event('mm-home-close'));
 close(true);adapter=null;lastEmitted='';
}
function mount(options){
 unmount();adapter=options;config=normalize(options.config);savedConfig=JSON.stringify(config);lastEmitted=savedConfig;
 modal=el('section','mm-home-object-controls');form=el('div','p74admin-form');statusNode=el('p','p74admin-status','تنظیمات هوم با ذخیره و انتشار همین استودیو اعمال می‌شوند.');
 modal.append(objectButton('نمایش پیش‌نمایش',()=>adapter?.onHide?.()),form,statusNode);options.host.replaceChildren(modal);frame=options.frame;dataLoaded=true;
 rebuild();window.addEventListener('message',receive);frame?.addEventListener('load',preview);
 setReadOnly(Boolean(options.isReadOnly?.()||options.isBusy?.()));
 return {validate,unmount};
}
function setReadOnly(value){operation=Boolean(value);if(form)form.inert=operation;}
window.MMTradeHomeEditor={mount,unmount,validate,setReadOnly,hasMounted:()=>Boolean(modal?.isConnected),
 getConfig:()=>config?clone(config):null};
})();
