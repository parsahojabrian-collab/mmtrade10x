/* MMTrade10X R6 • SuperAdmin route manager. No duplicate login or token storage. */
(function(){'use strict';
function el(t,cls,text){const x=document.createElement(t);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x}
function add(p,...nodes){nodes.forEach(x=>p.append(x));return p}
function fmt(n){return Number(n||0).toLocaleString('fa-IR')}
const labels={pages:'ارجاع در صفحات منتشرشده',drafts:'ارجاع در پیش‌نویس‌ها',popups:'دکمه‌های پاپ‌آپ',settings:'منوها و تنظیمات'};
function note(text,kind){return el('p','mmr6-note '+(kind||''),text)}
function btn(text,fn,kind){const b=el('button','mmr6-btn '+(kind||''),text);b.type='button';b.onclick=fn;return b}
function buildField(title,control){return add(el('label','mmr6-field'),el('span','',title),control)}
function view(api,toast){
  const root=el('section','mmr6-root');
  const top=add(el('div','mmr6-heading'),el('div','mmr6-eyebrow','MMTRADE10X · ROUTE CONTROL'),el('h2','', 'مدیریت آدرس انتشار و ارجاع‌های هوشمند'),el('p','', 'برای هر صفحه یک شناسه ثابت داریم؛ آدرس قابل تغییر است، اما دکمه‌ها و لینک‌های وابسته نباید بشکنند.'));
  root.append(top);
  const layout=el('div','mmr6-layout'),left=el('div','mmr6-card'),right=el('div','mmr6-card mmr6-detail');
  const select=el('select'),input=el('input');input.type='text';input.dir='ltr';input.spellcheck=false;input.placeholder='/my-new-page';input.maxLength=64;
  const old=el('code','mmr6-current');
  const target=el('code','mmr6-physical');
  const status=el('p','mmr6-status','در حال بارگذاری آدرس‌ها...');status.setAttribute('aria-live','polite');
  const previewButton=btn('شناسایی ارجاع‌ها و پیش‌نمایش',preview,'mmr6-primary');
  const publishButton=btn('تأیید و انتشار آدرس جدید',publish,'mmr6-publish');publishButton.disabled=true;
  const reloadButton=btn('به‌روزرسانی اطلاعات',load,'mmr6-muted');
  const actions=add(el('div','mmr6-actions'),previewButton,publishButton,reloadButton);
  add(left,el('h3','','تنظیم آدرس صفحه'),
    buildField('صفحه موردنظر',select),
    buildField('آدرس فعلی انتشار',old),
    buildField('آدرس جدید — فقط یک مسیر کوتاه',input),
    buildField('فایل واقعی پشت صفحه (بدون تغییر)',target),
    actions,status,
    note('لینک‌های داخلی شناسایی‌شده در دیتابیس همزمان به‌روزرسانی می‌شوند. تغییر محتوا یا فایل طراحی صفحه در این عملیات انجام نمی‌شود.'));
  const result=el('div','mmr6-results');
  add(right,el('h3','','گزارش وابستگی‌ها'),result);
  add(layout,left,right);root.append(layout);
  const footer=add(el('div','mmr6-footer'),el('h3','','قواعد انتشار امن'),
    el('p','','قبل از انتشار تداخل آدرس، نسخه تنظیمات و ارجاع‌های ثبت‌شده بررسی می‌شوند. هر تغییر در لاگ سوپرادمین ثبت می‌شود. لینک‌های قدیمی به‌عنوان مسیر سازگار حفظ می‌شوند؛ برای مسیرهای قدیمی که مستقیماً در Nginx تعریف شده‌اند همان هدایت قبلی فعال می‌ماند.'),
    el('p','','توجه: لینک‌های داخل پیام‌های قبلاً ارسال‌شده تلگرام، JavaScript سفارشی و بعضی مسیرهای Nginx از طریق دیتابیس قابل بازنویسی نیستند؛ پیش‌نمایش این موارد را جایگزین بررسی دستی نمی‌کند.'));
  root.append(footer);
  let state=null,plan=null,busy=false;
  function setStatus(s,isErr){status.textContent=s;status.dataset.error=isErr?'1':'0'}
  function setBusy(value){busy=value;previewButton.disabled=publishButton.disabled=reloadButton.disabled=value;if(!value)publishButton.disabled=!plan;select.disabled=input.disabled=value}
  function page(){return state?.pages.find(p=>p.slug===select.value)}
  function paintPage(){const p=page();plan=null;publishButton.disabled=true;result.replaceChildren(note('آدرس جدید را وارد کن و «پیش‌نمایش» را بزن.'));
    if(!p)return;old.textContent=p.path;target.textContent=p.target;input.value=p.path;setStatus('برای تغییر لینک، یک آدرس جدید وارد کن.');}
  select.onchange=paintPage;input.oninput=()=>{plan=null;publishButton.disabled=true;result.replaceChildren(note('آدرس تغییر کرده؛ برای انتشار باید پیش‌نمایش جدید بگیری.'))};
  async function load(){if(busy)return;setBusy(true);try{state=await api('/route-manager');
      const selected=select.value;select.replaceChildren(...state.pages.map(p=>{const o=el('option','',p.label+' · '+p.slug);o.value=p.slug;return o}));
      if(state.pages.some(p=>p.slug===selected))select.value=selected;paintPage();setStatus('اطلاعات صفحات بارگذاری شد.');
    }catch(e){setStatus('خطا در دریافت صفحات: '+e.message,true)}finally{setBusy(false)}}
  function showPlan(p){result.replaceChildren();
    add(result,add(el('div','mmr6-route-change'),el('span','','قبل: '+p.oldPath),el('span','','بعد: '+p.newPath)));
    const numbers=el('div','mmr6-stats');Object.entries(labels).forEach(([k,v])=>{const c=el('div','mmr6-stat');add(c,el('b','',fmt(p.totals[k])),el('span','',v));numbers.append(c)});result.append(numbers);
    const total=Object.values(p.totals).reduce((a,b)=>a+Number(b||0),0);
    result.append(note(total?'ارجاع‌های ذخیره‌شده زیر هنگام انتشار تغییر می‌کنند.':'ارجاع قابل‌تغییری در داده‌های فعلی پیدا نشد؛ لینک‌های ثابت همچنان باید بررسی شوند.'));
    const list=el('div','mmr6-list');p.changes.forEach(c=>{
      const box=el('details','mmr6-impact');const summary=el('summary','',({page:'صفحه',draft:'پیش‌نویس',popup:'پاپ‌آپ',setting:'تنظیمات'})[c.type]+' · '+(c.label||c.id)+' · '+fmt(c.count)+' ارجاع');box.append(summary);
      (c.detail||[]).forEach(s=>box.append(el('pre','mmr6-diff',s)));list.append(box);
    });if(!p.changes.length)list.append(note('ارجاع دیتابیسی برای این مسیر پیدا نشد.'));result.append(list);
    if(p.staticCandidates?.length){
      result.append(el('h4','', 'فایل‌هایی که ارجاع ثابت دارند (نیازمند بررسی)'));
      const files=el('div','mmr6-static-list');p.staticCandidates.forEach(f=>files.append(el('div','mmr6-static-item',f.file+' · '+fmt(f.occurrences)+' مورد')));result.append(files);
    }
    result.append(note('بررسی دستی: لینک‌های هاردکدشده در کد ربات، دکمه‌های onclick سفارشی و هدایت‌های مستقیم Nginx؛ این‌ها به‌صورت خودکار بازنویسی فایل نمی‌شوند.','mmr6-warning'));
  }
  async function preview(){if(busy)return;const p=page(),newPath=input.value.trim();if(!p)return;
    if(!/^\/[a-zA-Z0-9_-]{1,60}$/.test(newPath))return setStatus('مسیر باید مانند /academy-new و فقط از حروف انگلیسی، عدد، _ و - تشکیل شده باشد.',true);
    if(newPath===p.path)return setStatus('آدرس جدید با آدرس فعلی یکسان است.',true);
    setBusy(true);plan=null;result.replaceChildren(note('در حال اسکن ارجاع‌ها...'));
    try{plan=await api('/route-manager/preview',{method:'POST',body:JSON.stringify({slug:p.slug,newPath})});showPlan(plan);setStatus('پیش‌نمایش آماده است. تغییر هنوز منتشر نشده.');
    }catch(e){setStatus('پیش‌نمایش ناموفق: '+e.message,true);result.replaceChildren(note('مسیر نامعتبر، تکراری یا ناموجود است.'))}
    finally{setBusy(false)}
  }
  async function publish(){if(busy||!plan)return;
    const p=plan,total=Object.values(p.totals).reduce((a,b)=>a+Number(b||0),0);
    if(!confirm('تغییر آدرس «'+p.slug+'» از '+p.oldPath+' به '+p.newPath+' و اصلاح '+fmt(total)+' ارجاع دیتابیسی منتشر شود؟'))return;
    setBusy(true);try{const res=await api('/route-manager/publish',{method:'POST',body:JSON.stringify({slug:p.slug,newPath:p.newPath,expectedOldPath:p.oldPath,expectedRevision:p.revision})});
      toast?.('مسیر جدید منتشر شد: '+res.newPath);setBusy(false);await load();setStatus('انتشار موفق بود؛ لینک جدید: '+res.newPath);}
    catch(e){setStatus('انتشار انجام نشد: '+e.message+' — پیش‌نمایش را به‌روز کن.',true)}finally{setBusy(false)}
  }
  load();return root;
}
window.MMRouteR6={mount:({api,toast})=>view(api,toast)};
})();
