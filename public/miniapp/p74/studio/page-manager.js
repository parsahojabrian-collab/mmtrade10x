/* MMTrade R10: Superadmin-only page lifecycle UI. Server RBAC is authoritative. */
(function(){'use strict';if(window.MMPageR10)return;
const el=(tag,klass,text)=>{const n=document.createElement(tag);if(klass)n.className=klass;if(text!==undefined)n.textContent=String(text);return n;};
const button=(label,fn,klass='')=>{const x=el('button',klass,label);x.type='button';x.onclick=fn;return x;};
const field=(label,input)=>{const x=el('label','r10-field');x.append(el('span','',label),input);return x;};
const input=(placeholder,value='')=>{const x=el('input');x.placeholder=placeholder;x.value=value;return x;};
const selector=(items,value)=>{const x=el('select');items.forEach(([key,name])=>{const o=el('option','',name);o.value=key;x.append(o)});x.value=value;return x;};
const safeUrl=v=>/^\/(?!\/)[a-zA-Z0-9_./?=&%#-]{1,499}$/.test(v)||/^https:\/\/[\w.-]+(?::\d{2,5})?(?:\/[\w~!$&'()*+,;=:@%/?#.-]*)?$/.test(v);
const blockCatalog={heading:'تیتر',text:'متن',image:'تصویر',button:'دکمه',banner:'بنر',divider:'جداکننده'};
function mount({api,toast}){
 const root=el('section','r10-manager');let data=null,selected='',draft=null,dirty=false;
 const top=el('header','r10-top');top.append(el('div','', 'MMTRADE / PAGE CONTROL'),el('h2','','مدیریت صفحات و صفحه شروع'),el('p','','صفحه جدید بساز، محتوایش را ویرایش کن و فقط صفحه‌های منتشرشده را به کاربران نمایش بده. حذف به‌صورت آرشیو امن انجام می‌شود.'));
 const status=el('div','r10-status','در حال دریافت تنظیمات…');const grid=el('div','r10-grid');const left=el('div','r10-list');const right=el('div','r10-detail');
 grid.append(left,right);root.append(top,status,grid);
 function notify(x){status.textContent=x;}
 async function fetchAll(){
  try{data=await api('/page-lifecycle');showList();await showDetail(selected||data.start);notify('تنظیمات زنده بارگذاری شد · نسخه '+data.version);}
  catch(e){notify('خطا در بارگذاری: '+e.message)}
 }
 async function action(path,body,method='POST'){
  const r=await api(path,{method,body:JSON.stringify(body)});
  toast('تغییرات ذخیره شد');dirty=false;await fetchAll();return r;
 }
 function askLeave(){return !dirty||confirm('تغییرات ذخیره‌نشده در این صفحه وجود دارند. ادامه می‌دهی؟')}
 function showList(){left.replaceChildren();
  const title=el('div','r10-list-title');title.append(el('b','','صفحات پروژه'),el('span','',String(data.pages.length)+' مورد'));
  left.append(title);
  data.pages.forEach(p=>{
   const row=button('',async()=>{if(!askLeave())return;selected=p.slug;draft=null;dirty=false;showList();await showDetail(p.slug)},'r10-page '+(selected===p.slug?'is-selected':''));
   const head=el('span','r10-page-head');head.append(el('b','',p.title),el('small','r10-status-'+p.status,p.status==='PUBLISHED'?'فعال':p.status==='ARCHIVED'?'آرشیوشده':'پیش‌نویس'));
   row.append(head,el('code','',p.path));if(data.start===p.slug)row.append(el('small','r10-start-flag','صفحه شروع'));left.append(row);
  });
  const addBox=el('div','r10-add');addBox.append(el('h3','','افزودن صفحه'));
  const slug=input('نام انگلیسی لینک، مثل about-us');slug.dir='ltr';
  const titleInput=input('عنوان صفحه، مثلاً درباره ما');
  addBox.append(field('شناسه صفحه (غیرقابل تغییر)',slug),field('عنوان',titleInput),button('ساخت صفحه جدید',async()=>{
   if(!askLeave())return;
   const id=slug.value.trim().toLowerCase(),title=titleInput.value.trim();
   if(!/^[a-z][a-z0-9-]{2,39}$/.test(id)||!title)return toast('شناسه ۳ تا ۴۰ کاراکتر انگلیسی کوچک/عدد/خط‌تیره و عنوان لازم است.');
   try{await action('/page-lifecycle',{slug:id,title,expectedVersion:data.version});selected=id;await showDetail(id)}catch(e){toast('ایجاد نشد: '+e.message)}
  },'r10-primary'));
  left.append(addBox);
 }
 function showDetail(slug){
  selected=slug;showList();right.replaceChildren();const p=data.pages.find(x=>x.slug===slug);
  if(!p){right.append(el('p','','صفحه‌ای انتخاب نشده است.'));return;}
  const head=el('div','r10-detail-header');head.append(el('h3','',p.title),el('code','',p.path));
  const tools=el('div','r10-actions');
  tools.append(button('بازکردن صفحه',()=>window.open(p.path,'_blank','noopener,noreferrer'),'r10-secondary'));
  if(p.status==='PUBLISHED')tools.append(button(data.start===p.slug?'صفحه شروع فعلی':'انتخاب به‌عنوان صفحه شروع',async()=>{
   if(!askLeave())return;
   if(!confirm('صفحه شروع مینی‌اپ به «'+p.title+'» تغییر کند؟'))return;
   try{await action('/page-lifecycle/start',{slug:p.slug,engine:engine.value,expectedVersion:data.version})}catch(e){toast('خطا: '+e.message)}
  },'r10-primary'));
  if(p.status==='ARCHIVED')tools.append(button('بازیابی صفحه',async()=>{
   try{await action('/page-lifecycle/'+encodeURIComponent(p.slug),{status:p.kind==='CUSTOM'?(p.previousStatus||'DRAFT'):'PUBLISHED',expectedVersion:data.version},'PATCH')}catch(e){toast('خطا: '+e.message)}
  }));
  else tools.append(button('حذف از نمایش (آرشیو)',async()=>{
   if(data.start===p.slug)return toast('اول صفحه شروع را تغییر بده.');
   if(!confirm('صفحه از نمایش عمومی خارج شود؟ محتوا پاک نمی‌شود و قابل بازیابی است.'))return;
   try{await action('/page-lifecycle/'+encodeURIComponent(p.slug),{status:'ARCHIVED',expectedVersion:data.version},'PATCH')}catch(e){toast('خطا: '+e.message)}
  },'r10-danger'));
  const start=el('div','r10-start');start.append(el('b','','موتور طراحی صفحه اصلی'));
  const engine=selector([['p74','طراحی جدید P74'],['p62','استودیو P62'],['legacy','نسخه پایه (Legacy)']],data.engine);
  start.append(field('فقط یک موتور Home در هر بار ورود فعال می‌شود',engine),button('ذخیره موتور نمایش',async()=>{
   if(!askLeave())return;
   try{await action('/page-lifecycle/start',{slug:data.start,engine:engine.value,expectedVersion:data.version})}catch(e){toast('خطا: '+e.message)}
  },'r10-secondary'));
  right.append(head,tools,start);
  const info=el('div','r10-info');info.append(el('p','',p.kind==='BUILTIN'?'صفحه سیستمی: فایل اصلی حذف نمی‌شود. آرشیو فقط ورود عادی از مسیرهای تحت پوشش را به صفحه شروع هدایت می‌کند.':'صفحه اختصاصی: با آدرس مستقل ساخته می‌شود، پیش‌نویس خصوصی دارد و پس از انتشار عمومی می‌شود.'));
  right.append(info);
  if(p.kind==='CUSTOM')showEditor(p);
  else right.append(el('p','r10-muted','ویرایش محتوای این صفحه از «استودیوی بصری» و ویرایشگرهای موجود انجام می‌شود.'));
 }
 async function showEditor(p){
  const area=el('section','r10-editor');right.append(area);
  try{const x=await api('/page-lifecycle/'+encodeURIComponent(p.slug)+'/draft');if(selected!==p.slug)return;
   draft={title:x.title,blocks:JSON.parse(JSON.stringify(x.blocks||[]))};renderEditor();
  }catch(e){area.textContent='خطای دریافت پیش‌نویس: '+e.message}
  function renderEditor(){
   if(!draft||selected!==p.slug)return;area.replaceChildren();area.append(el('h3','','ویرایش محتوای صفحه'));
   const t=input('عنوان صفحه',draft.title);t.oninput=()=>{draft.title=t.value;dirty=true};area.append(field('عنوان',t));
   draft.blocks.forEach((b,index)=>{
    const box=el('div','r10-block');const hdr=el('div','r10-block-header');hdr.append(el('b','',blockCatalog[b.type]||b.type),button('↑',()=>swap(index,-1)),button('↓',()=>swap(index,1)),button('×',()=>{draft.blocks.splice(index,1);dirty=true;renderEditor()},'r10-danger'));
    box.append(hdr);
    const add=(key,label,place)=>{const control=key==='text'&&b.type==='text'?el('textarea'):input(place||label,b[key]||'');if(control.tagName==='TEXTAREA')control.value=b[key]||'';control.oninput=()=>{b[key]=control.value;dirty=true};box.append(field(label,control));};
    if(b.type==='heading'||b.type==='text'||b.type==='button')add('text',b.type==='button'?'متن دکمه':'متن','');
    if(b.type==='image'){add('url','لینک تصویر','/uploads/...');add('alt','متن جایگزین تصویر','');}
    if(b.type==='button')add('url','لینک مقصد','/p/about-us');
    if(b.type==='banner'){add('title','عنوان بنر');add('text','توضیح بنر');add('url','لینک بنر','/p/...');}
    area.append(box);
   });
   const addRow=el('div','r10-add-block');Object.entries(blockCatalog).forEach(([type,name])=>addRow.append(button('＋ '+name,()=>{
    if(draft.blocks.length>=40)return toast('حداکثر ۴۰ بلوک مجاز است.');
    draft.blocks.push(({heading:{type,text:'تیتر جدید'},text:{type,text:'متن جدید'},image:{type,url:'/miniapp/p74/assets/hero_poster.webp',alt:''},button:{type,text:'مشاهده',url:'/miniapp'},banner:{type,title:'بنر جدید',text:'',url:'/miniapp'},divider:{type}})[type]);dirty=true;renderEditor();
   })));
   const actions=el('div','r10-actions');actions.append(button('ذخیره پیش‌نویس',save,'r10-secondary'),button('انتشار صفحه',async()=>{
    if(dirty){const ok=await save();if(!ok)return;}
    if(!confirm('نسخه فعلی این صفحه برای کاربران منتشر شود؟'))return;
    try{await action('/page-lifecycle/'+encodeURIComponent(p.slug)+'/publish',{})}catch(e){toast('انتشار ناموفق: '+e.message)}
   },'r10-primary'));
   area.append(addRow,actions);
  }
  function swap(i,delta){const n=i+delta;if(n<0||n>=draft.blocks.length)return;[draft.blocks[i],draft.blocks[n]]=[draft.blocks[n],draft.blocks[i]];dirty=true;renderEditor()}
  async function save(){
   if(!draft.title.trim())return toast('عنوان صفحه خالی است.'),false;
   if(draft.blocks.some(b=>(b.type==='image'||b.type==='button')&&!safeUrl(String(b.url||''))))return toast('آدرس تصویر یا دکمه معتبر نیست.'),false;
   try{await api('/page-lifecycle/'+encodeURIComponent(p.slug)+'/draft',{method:'PUT',body:JSON.stringify(draft)});dirty=false;toast('پیش‌نویس ذخیره شد');return true}
   catch(e){toast('خطای ذخیره: '+e.message);return false}
  }
 }
 fetchAll();return root;
}
window.MMPageR10={mount};
})();
