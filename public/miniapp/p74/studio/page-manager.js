/* Canonical page workspace: lifecycle, draft state and editor entry points. */
(() => {
 'use strict';
 const el=(tag,klass='',text)=>{const n=document.createElement(tag);n.className=klass;if(text!==undefined)n.textContent=String(text);return n;};
 const button=(label,fn,klass='')=>{const n=el('button',klass,label);n.type='button';n.onclick=fn;return n;};
 const field=(label,control)=>{const n=el('label','r10-field');n.append(el('span','',label),control);return n;};
 const input=(label,value='')=>{const n=el('input');n.placeholder=label;n.value=value;return n;};
 const selector=(items,value)=>{const n=el('select');for(const [key,title] of items){const o=el('option','',title);o.value=key;n.append(o)}n.value=value;return n;};
 const labels={PUBLISHED:'منتشرشده',DRAFT:'پیش‌نویس',ARCHIVED:'آرشیوشده'};
 const catalog={heading:'تیتر',text:'متن',image:'تصویر',button:'دکمه',banner:'بنر',divider:'جداکننده'};
 const safeUrl=v=>/^\/(?!\/)[^\s<>"']*$/.test(v)||/^https:\/\/[^\s<>"']+$/.test(v);
 function mount({api,toast,navigate}){
  const root=el('section','r10-manager');
  let data=null,selected='',draft=null,saved='',revision,working=false,requestId=0;
  const dirty=()=>draft!==null&&JSON.stringify(draft)!==saved;
  const workspace=window.MMAdminWorkspace;
  workspace?.register('pageManager',{active:()=>root.isConnected,dirty,busy:()=>working});
  const top=el('header','r10-top');
  const heading=el('div');heading.append(el('span','r10-eyebrow','محتوا و طراحی'),el('h2','','مدیریت صفحات'),el('p','','از ساخت صفحه تا پیش‌نمایش و انتشار، در یک مسیر مشخص.'));
  const refresh=button('به‌روزرسانی',()=>{if(askLeave())fetchAll()},'r10-secondary');top.append(heading,refresh);
  const summary=el('div','r10-summary');
  const status=el('div','r10-status','در حال دریافت صفحات…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const grid=el('div','r10-grid'),left=el('aside','r10-list'),right=el('section','r10-detail');
  const search=input('جست‌وجوی نام یا آدرس صفحه');search.type='search';search.setAttribute('aria-label','جست‌وجوی صفحات');
  const filter=selector([['','همه وضعیت‌ها'],['PUBLISHED','منتشرشده'],['DRAFT','پیش‌نویس'],['ARCHIVED','آرشیوشده']],'');filter.setAttribute('aria-label','فیلتر وضعیت صفحه');
  const list=el('div','r10-pages');left.append(search,filter,list);
  search.oninput=filter.onchange=renderList;
  grid.append(left,right);root.append(top,summary,status,grid);
  function notify(message,error=false){status.textContent=message;status.dataset.error=String(error);}
  function askLeave(){if(working){toast('عملیات در حال انجام است؛ صبر کنید');return false}return !dirty()||confirm('تغییرات ذخیره نشده‌اند. بدون ذخیره ادامه می‌دهید؟')}
  function setBusy(value){working=value;refresh.disabled=value;root.setAttribute('aria-busy',String(value));root.querySelectorAll('[data-operation]').forEach(n=>n.disabled=value);paintSaveState()}
  function paintSaveState(){const n=root.querySelector('.r10-save-state');if(n){n.textContent=working?'در حال انجام عملیات…':dirty()?'تغییرات ذخیره‌نشده':'ذخیره شده';n.dataset.dirty=String(dirty());}}
  async function fetchAll(){
   if(working)return;setBusy(true);
   try{data=await api('/page-lifecycle');renderSummary();renderList();await selectPage(selected||data.start,true);notify('اطلاعات صفحات به‌روز است.');}
   catch(e){notify('دریافت صفحات انجام نشد: '+e.message,true)}finally{setBusy(false)}
  }
  function renderSummary(){summary.replaceChildren();for(const [label,value] of [['کل صفحات',data.pages.length],['منتشرشده',data.pages.filter(p=>p.status==='PUBLISHED').length],['پیش‌نویس',data.pages.filter(p=>p.status==='DRAFT').length],['صفحه شروع',data.pages.find(p=>p.slug===data.start)?.title||data.start]]){const c=el('div','r10-metric');c.append(el('span','',label),el('strong','',value));summary.append(c)}}
  function renderList(){
   if(!data)return;list.replaceChildren();const q=search.value.trim().toLocaleLowerCase('fa');
   const pages=data.pages.filter(p=>(!filter.value||p.status===filter.value)&&(!q||`${p.title} ${p.slug} ${p.path}`.toLocaleLowerCase('fa').includes(q)));
   for(const p of pages){const row=button('',()=>selectPage(p.slug),'r10-page'+(selected===p.slug?' is-selected':''));row.setAttribute('aria-pressed',String(selected===p.slug));
    const line=el('span','r10-page-head');line.append(el('b','',p.title),el('small','r10-badge r10-status-'+p.status,labels[p.status]||p.status));
    row.append(line,el('code','',p.path));if(p.slug===data.start)row.append(el('small','r10-start-flag','صفحه شروع'));list.append(row);
   }
   if(!pages.length)list.append(el('p','r10-empty','صفحه‌ای با این جست‌وجو پیدا نشد.'));
   const add=el('details','r10-add');add.append(el('summary','','＋ ساخت صفحه جدید'));
   const slug=input('about-us'),title=input('عنوان صفحه');slug.dir='ltr';slug.maxLength=40;title.maxLength=120;
   add.append(field('شناسه انگلیسی',slug),field('عنوان صفحه',title),button('ساخت پیش‌نویس',async()=>{
    if(!askLeave())return;const id=slug.value.trim().toLowerCase(),name=title.value.trim();
    if(!/^[a-z][a-z0-9-]{2,39}$/.test(id)||!name)return toast('عنوان و شناسه انگلیسی ۳ تا ۴۰ کاراکتری لازم است.');
    setBusy(true);try{await api('/page-lifecycle',{method:'POST',body:JSON.stringify({slug:id,title:name,expectedVersion:data.version})});selected=id;draft=null;}
    catch(e){notify('ساخت صفحه انجام نشد: '+e.message,true);return}finally{setBusy(false)}await fetchAll();
   },'r10-primary'));list.append(add);
  }
  async function change(path,body,method='POST'){
   if(!askLeave())return;setBusy(true);
   try{await api(path,{method,body:JSON.stringify(body)});draft=null;toast('تغییرات ثبت شد');}
   catch(e){notify('تغییر ثبت نشد: '+e.message,true);return}finally{setBusy(false)}await fetchAll();
  }
  async function selectPage(slug,approved=false){
   if(!approved&&!askLeave())return;const session=++requestId;selected=slug;draft=null;saved='';renderList();right.replaceChildren();
   const p=data.pages.find(x=>x.slug===slug);if(!p)return right.append(el('p','r10-empty','صفحه‌ای انتخاب نشده است.'));
   const head=el('div','r10-detail-header');head.append(el('h3','',p.title),el('span','r10-badge r10-status-'+p.status,labels[p.status]));right.append(head,el('code','r10-path',p.path));
   const tools=el('div','r10-actions');
   const publicPreview=button('مشاهده نسخه عمومی',()=>window.open(p.path,'_blank','noopener,noreferrer'),'r10-secondary');publicPreview.disabled=p.status!=='PUBLISHED';if(publicPreview.disabled)publicPreview.title='برای مشاهده عمومی ابتدا صفحه را منتشر کنید';tools.append(publicPreview);
   const engine=selector([['p74','طراحی اصلی'],['p62','استودیوی قدیمی'],['legacy','نسخه پایه']],data.engine);
   if(p.status==='PUBLISHED'&&p.slug!==data.start)tools.append(button('انتخاب به‌عنوان صفحه شروع',()=>{if(confirm('صفحه شروع به «'+p.title+'» تغییر کند؟'))change('/page-lifecycle/start',{slug:p.slug,engine:engine.value,expectedVersion:data.version})},'r10-secondary'));
   if(p.status!=='ARCHIVED')tools.append(button('آرشیو صفحه',()=>{if(p.slug===data.start)return toast('ابتدا صفحه شروع را تغییر دهید');if(confirm('صفحه از نمایش خارج و قابل بازیابی بماند؟'))change('/page-lifecycle/'+encodeURIComponent(p.slug),{status:'ARCHIVED',expectedVersion:data.version},'PATCH')},'r10-danger'));
   else tools.append(button('بازیابی صفحه',()=>change('/page-lifecycle/'+encodeURIComponent(p.slug),{status:p.kind==='CUSTOM'?(p.previousStatus||'DRAFT'):'PUBLISHED',expectedVersion:data.version},'PATCH')));
   right.append(tools);
   if(p.slug==='index'){const home=el('details','r10-start');home.append(el('summary','','تنظیم موتور نمایش خانه'),field('موتور نمایش',engine),button('ذخیره تنظیم نمایش',()=>change('/page-lifecycle/start',{slug:data.start,engine:engine.value,expectedVersion:data.version}),'r10-secondary'));right.append(home)}
   if(p.kind!=='CUSTOM'){
    const links=el('div','r10-editor-links');links.append(el('h4','','ویرایش این صفحه'),el('p','r10-muted','پیش‌نویس مستقل از نسخه عمومی است. پس از بررسی، انتشار را انجام دهید.'));
    links.append(button('بازکردن استودیوی بصری',()=>navigate?.('visualStudio',p.slug),'r10-primary'));
    if(p.slug==='index')links.append(button('ویرایش آبجکت‌های خانه',()=>navigate?.('objectStudio'),'r10-secondary'));
    links.append(button('مدیریت آدرس‌ها',()=>navigate?.('routeManager'),'r10-secondary'),button('تاریخچه و ویرایش محتوای صفحه',()=>{if(askLeave())location.assign('/admin/editor/'+encodeURIComponent(p.slug))},'r10-secondary'));
    right.append(links);return;
   }
   const area=el('section','r10-editor');area.textContent='در حال دریافت پیش‌نویس…';right.append(area);
   try{const d=await api('/page-lifecycle/'+encodeURIComponent(p.slug)+'/draft');if(session!==requestId)return;draft={title:d.title,blocks:JSON.parse(JSON.stringify(d.blocks||[]))};revision=d.revision;saved=JSON.stringify(draft);renderEditor();}
   catch(e){if(session===requestId){area.textContent='دریافت پیش‌نویس انجام نشد: '+e.message;notify('دریافت پیش‌نویس ناموفق بود؛ دوباره صفحه را انتخاب کنید.',true)}}
   function renderEditor(){
    if(session!==requestId)return;area.replaceChildren();
    const title=input('عنوان صفحه',draft.title);title.maxLength=120;title.oninput=()=>{draft.title=title.value;paintSaveState()};area.append(field('عنوان صفحه',title));
    draft.blocks.forEach((b,index)=>{
     const box=el('div','r10-block'),head=el('div','r10-block-header');head.append(el('b','',catalog[b.type]||b.type));
     for(const [label,action] of [['↑',()=>swap(index,-1)],['↓',()=>swap(index,1)],['×',()=>{draft.blocks.splice(index,1);renderEditor()}]]){const bt=button(label,action,'r10-secondary');bt.setAttribute('aria-label',(label==='×'?'حذف':label==='↑'?'بالا بردن':'پایین بردن')+' بلوک '+(index+1));head.append(bt)}box.append(head);
     const add=(key,label)=>{const n=key==='text'&&b.type==='text'?el('textarea'):input(label);n.value=b[key]||'';n.oninput=()=>{b[key]=n.value;paintSaveState()};box.append(field(label,n));};
     if(['heading','text','button'].includes(b.type))add('text','متن');
     if(b.type==='image'){add('url','آدرس تصویر');add('alt','متن جایگزین')}
     if(b.type==='button')add('url','آدرس مقصد');
     if(b.type==='banner'){add('title','عنوان بنر');add('text','توضیح بنر');add('url','آدرس مقصد')}
     area.append(box);
    });
    const add=el('div','r10-add-block');for(const [type,label] of Object.entries(catalog))add.append(button('＋ '+label,()=>{
     if(draft.blocks.length>=40)return toast('حداکثر ۴۰ بلوک مجاز است');
     draft.blocks.push(({heading:{type,text:'تیتر جدید'},text:{type,text:'متن جدید'},image:{type,url:'/miniapp/p74/assets/hero_poster.webp',alt:''},button:{type,text:'مشاهده',url:'/miniapp'},banner:{type,title:'بنر جدید',text:'',url:'/miniapp'},divider:{type}})[type]);renderEditor();
    },'r10-secondary'));area.append(add);
    const footer=el('div','r10-savebar'),state=el('span','r10-save-state');state.setAttribute('aria-live','polite');
    const saveButton=button('ذخیره پیش‌نویس',()=>save(),'r10-secondary'),publishButton=button('انتشار صفحه',publish,'r10-primary');
    saveButton.dataset.operation=publishButton.dataset.operation='1';saveButton.disabled=publishButton.disabled=working;
    footer.append(state,saveButton,publishButton);area.append(footer);paintSaveState();
   }
   function swap(i,delta){const n=i+delta;if(n<0||n>=draft.blocks.length)return;[draft.blocks[i],draft.blocks[n]]=[draft.blocks[n],draft.blocks[i]];renderEditor()}
   async function save(){
    if(working)return false;
    if(!draft.title.trim())return notify('عنوان صفحه نمی‌تواند خالی باشد',true),false;
    if(draft.blocks.some(b=>['image','button','banner'].includes(b.type)&&b.url&&!safeUrl(b.url)))return notify('آدرس تصویر یا مقصد معتبر نیست',true),false;
    const snapshot=JSON.parse(JSON.stringify(draft)),sent=JSON.stringify(snapshot);setBusy(true);
    try{const r=await api('/page-lifecycle/'+encodeURIComponent(p.slug)+'/draft',{method:'PUT',body:JSON.stringify({...snapshot,expectedRevision:revision})});
     if(session!==requestId)return false;revision=r.revision;saved=sent;notify(dirty()?'نسخه قبلی ذخیره شد؛ تغییرات جدید هنوز ذخیره نشده‌اند.':'پیش‌نویس ذخیره شد؛ هنوز منتشر نشده.');return true;
    }catch(e){notify('ذخیره انجام نشد: '+e.message,true);return false}finally{setBusy(false)}
   }
   async function publish(){
    if(working)return;if(dirty()&&!(await save()))return;
    if(dirty())return notify('تغییر جدید هنگام ذخیره ایجاد شد؛ دوباره ذخیره کنید',true);
    if(!confirm('همین پیش‌نویس برای کاربران منتشر شود؟'))return;setBusy(true);
    try{await api('/page-lifecycle/'+encodeURIComponent(p.slug)+'/publish',{method:'POST',body:JSON.stringify({expectedRevision:revision})});toast('صفحه منتشر شد');
     if(!dirty())draft=null;else return notify('نسخه ذخیره‌شده منتشر شد؛ تغییرات محلی جدید باقی مانده‌اند.');
    }catch(e){notify('انتشار انجام نشد: '+e.message,true);return}finally{setBusy(false)}await fetchAll();
   }
  }
  fetchAll();return root;
 }
 window.MMPageR10={mount};
})();
