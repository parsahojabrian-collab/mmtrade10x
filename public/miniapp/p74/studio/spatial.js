/* MMTrade10X · Visual Studio R9: precise object selection and independent per-element animations. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const defaults = s => ({selector:s,x:0,y:0,scale:1});
  const prohibited = s => new Set(['#p74-app','#mf62-home','#mmvs-root','#app','main.home-shell','.stage-page','.stage-shell']).has(String(s||'').trim());
  const animationKinds = new Set(['float','spin','sway','pulse']);
  const animationValid = a => a && animationKinds.has(a.kind) && Number.isInteger(a.durationMs) && a.durationMs>=400 && a.durationMs<=30000 && Number.isFinite(a.amplitude) && a.amplitude>=1 && a.amplitude<=150 && Number.isInteger(a.delayMs) && a.delayMs>=0 && a.delayMs<=10000 && typeof a.loop==='boolean';
  let animationPlaying=true,reviewLayout=null;
  let page='academy', revision=0, published={items:[]}, draft=null;
  let doc={items:[]}, initial='{"items":[]}', dirty=false;
  let mode=false,grid=false,selected='',ready=false,loading=false,history=[],session=0,publishing=false;
  let layerItems=[], overlapItems=[];
  let touchedSelection=null;
  const isValid = x => !!x && typeof x.selector==='string' && x.selector.length<=500 &&
    Number.isFinite(x.x) && Number.isFinite(x.y) && Number.isFinite(x.scale);

  function normalize(p) {
    if (!isValid(p)) return null;
    const x={selector:p.selector,
      x:Math.round(clamp(p.x,-4000,4000)*10)/10,
      y:Math.round(clamp(p.y,-4000,4000)*10)/10,
      scale:Math.round(clamp(p.scale,0.2,4)*1000)/1000};
    if(p.locked===true)x.locked=true;
    if(p.hidden===true)x.hidden=true;
    if(Number.isInteger(p.zIndex))x.zIndex=clamp(p.zIndex,-1000,20000);
    if(Number.isFinite(p.opacity))x.opacity=Math.round(clamp(p.opacity,0.05,1)*1000)/1000;
    if(animationValid(p.animation))x.animation=clone(p.animation);
    return x;
  }
  function send(type,data={}) {
    const target=$('frame')?.contentWindow;
    if (!ready||!target) return;
    try{target.postMessage({type,...data},location.origin)}catch(_e){}
  }
  function toast(s,error=false) {
    const el=$('spatial-note');if(el){el.textContent=s;el.classList.toggle('bad',error)}
  }
  function current() {return doc.items.find(item=>item.selector===selected)||defaults(selected)}
  function savedFor(selector) {return doc.items.find(item=>item.selector===selector)||defaults(selector)}
  function scanLayers(){send('MMVS_SPATIAL_SCAN')}
  function state() {
    dirty=JSON.stringify(doc)!==initial;
    const title=$('spatial-state');if(title){
      title.textContent=dirty?'چیدمان ذخیره‌نشده':draft?'پیش‌نویس چیدمان موجود':'چیدمان منتشرشده';
      title.classList.toggle('dirty',dirty);
    }
    $('spatial-save').disabled=!dirty||loading||publishing||!!reviewLayout;
    $('spatial-publish').disabled=loading||publishing||!!reviewLayout||(!dirty&&!draft);
    $('spatial-reset').disabled=!selected||loading||publishing||!!reviewLayout;
    window.dispatchEvent(new Event('mmvs:state'));
  }
  function renderLayers(){
    const root=$('spatial-layer-list');if(!root)return;
    const query=String($('spatial-layer-search')?.value||'').trim().toLocaleLowerCase();
    root.replaceChildren();let count=0;
    for(const item of layerItems){
      if(query&&!String(item.label+' '+item.selector+' '+item.kind).toLocaleLowerCase().includes(query))continue;
      const itemData=savedFor(item.selector);
      const b=document.createElement('button');b.type='button';b.dataset.selector=item.selector;
      b.classList.toggle('active',item.selector===selected);
      b.classList.toggle('mmvs-layer-hidden',!!itemData.hidden);
      b.classList.toggle('mmvs-layer-locked',!!itemData.locked);
      b.classList.toggle('mmvs-layer-animated',!!itemData.animation);
      b.title=item.selector;
      const emo=document.createElement('span');emo.className='mmvs-layer-emoji';emo.textContent=item.icon||'◈';
      const group=document.createElement('span');group.style.minWidth='0';
      const name=document.createElement('span');name.className='mmvs-layer-text';name.textContent=item.label;
      const sub=document.createElement('span');sub.className='mmvs-layer-sub';
      sub.textContent=item.selector+(itemData.hidden?' · مخفی':'')+(itemData.animation?' · ✦ حرکت':'')+(itemData.zIndex!==undefined?' · Z '+itemData.zIndex:'');
      group.append(name,sub);b.append(emo,group);
      b.onclick=()=>{choose(item.selector);send('MMVS_SPATIAL_REVEAL',{selector:item.selector})};
      root.append(b);count++;
    }
    if(!count){const empty=document.createElement('span');empty.className='mmvs-empty';empty.textContent='لایه‌ای پیدا نشد؛ روی «اسکن دوباره» بزن.';root.append(empty)}
    const total=$('spatial-layer-count');if(total)total.textContent='('+layerItems.length+' عنصر)';
  }
  function renderOverlap(){
    const root=$('spatial-overlap-list');if(!root)return;
    root.replaceChildren();const count=$('spatial-overlap-count');
    if(count)count.textContent='('+overlapItems.length+')';
    if(!overlapItems.length){const p=document.createElement('span');p.className='mmvs-empty';p.textContent=selected?'آبجکت تصویری هم‌پوشانی پیدا نشد.':'برای مشاهده، یک آبجکت را انتخاب کن.';root.append(p);return}
    for(const item of overlapItems.slice(0,28)){
      const b=document.createElement('button');b.type='button';b.title=item.selector;
      const x=savedFor(item.selector);
      b.textContent=(x.locked?'🔒 ':'')+(x.hidden?'◌ ':'')+(item.icon||'◈')+' '+item.label+' · Z:'+(x.zIndex??item.z??'پیش‌فرض');
      b.onclick=()=>{choose(item.selector);send('MMVS_SPATIAL_REVEAL',{selector:item.selector})};root.append(b);
    }
  }
  function renderProps(){
    const p=current();
    const selectedEnough=!!selected;
    const locked=!!p.locked;
    for(const k of ['x','y','scale']){
      const el=$('spatial-'+k);if(!el)continue;
      el.value=String(p[k]);el.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;
    }
    $('spatial-chosen').textContent=selected||'برای انتخاب، روی عنصر در پیش‌نمایش بزن';
    const lock=$('spatial-lock');if(lock){
      lock.textContent=locked?'🔒 بازکردن قفل':'🔓 قفل عنصر';lock.disabled=!selectedEnough||loading||publishing||!!reviewLayout;
      lock.classList.toggle('mmvs-locked',locked);
    }
    const hide=$('spatial-hide');if(hide){hide.textContent=p.hidden?'↩ بازگردانی به صفحه':'◉ مخفی/حذف از صفحه';hide.disabled=!selectedEnough||loading||publishing||!!reviewLayout;hide.classList.toggle('mmvs-hidden',!!p.hidden)}
    for(const id of ['spatial-forward','spatial-backward','spatial-to-front','spatial-to-back']){
      const e=$(id);if(e)e.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;
    }
    for(const id of ['spatial-nudge-up','spatial-nudge-down','spatial-nudge-left','spatial-nudge-right']){
      const e=$(id);if(e)e.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;
    }
    const z=$('spatial-z');if(z){z.value=p.zIndex??'';z.placeholder='پیش‌فرض';z.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked}
    const op=$('spatial-opacity');if(op){op.value=p.opacity??1;op.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked}
    const tip=$('spatial-object-tip');if(tip){tip.textContent=p.hidden?'این عنصر برای کاربران مخفی می‌شود؛ با «بازگردانی» دوباره نمایش بده.':locked?'قفل فعال است: حرکت و تغییر اندازه غیرفعال؛ انیمیشن باقی می‌ماند.':'تنظیم لایه و شفافیت، انیمیشن اصلی عنصر را متوقف نمی‌کند.'}
    const a=p.animation||null;
    const aKind=$('spatial-animation-kind');if(aKind)aKind.value=a?.kind||'none';
    const aDuration=$('spatial-animation-duration');if(aDuration)aDuration.value=String((a?.durationMs??3000)/1000);
    const aAmplitude=$('spatial-animation-amplitude');if(aAmplitude)aAmplitude.value=String(a?.amplitude??18);
    const aDelay=$('spatial-animation-delay');if(aDelay)aDelay.value=String((a?.delayMs??0)/1000);
    const aLoop=$('spatial-animation-loop');if(aLoop)aLoop.checked=a?.loop!==false;
    for(const id of ['spatial-animation-kind','spatial-animation-duration','spatial-animation-amplitude','spatial-animation-delay','spatial-animation-loop','spatial-animation-apply','spatial-animation-remove']){
      const el=$(id);if(el)el.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;
    }
    const aniTip=$('spatial-animation-tip');if(aniTip)aniTip.textContent=locked?'ابتدا قفل آبجکت را باز کن تا بتوانی انیمیشنش را تغییر بدهی.':a?'✦ '+a.kind+' · برای انتشار، «ذخیره چیدمان» و «انتشار چیدمان» را بزن.':'نوع حرکت را انتخاب و روی «اعمال انیمیشن» بزن. حرکت CSS قبلی حذف نمی‌شود.';
    $('spatial-reset').disabled=!selectedEnough||loading||publishing||!!reviewLayout;
    renderLayers();renderOverlap();
  }
  function preview(){
    send('MMVS_SPATIAL_PREVIEW',{layout:clone(reviewLayout||doc)});
    send('MMVS_SPATIAL_MODE',{enabled:reviewLayout?false:mode,grid});
    send('MMVS_SPATIAL_ANIMATION_PLAY',{playing:animationPlaying});
    if(selected&&!reviewLayout)send('MMVS_SPATIAL_PICK',{selector:selected});
    scanLayers();
  }
  function put(p,sendSet=true){
    const fixed=normalize(p);if(!fixed||!fixed.selector||prohibited(fixed.selector))return;
    const ix=doc.items.findIndex(x=>x.selector===fixed.selector);
    if(ix<0&&doc.items.length>=250)return toast('حداکثر ۲۵۰ عنصر قابل ذخیره است',true);
    if(ix>=0)doc.items[ix]=fixed;else doc.items.push(fixed);
    selected=fixed.selector;renderProps();state();
    if(sendSet)send('MMVS_SPATIAL_SET',{item:fixed});
  }
  function selectClear(){
    if(!selected)return;
    if(!confirm('همه تنظیمات موقعیت، اندازه، قفل و لایه این عنصر بازنشانی شود؟'))return;
    const old=selected;
    doc.items=doc.items.filter(x=>x.selector!==old);
    send('MMVS_SPATIAL_CLEAR',{selector:old});
    preview();renderProps();state();
    toast('تنظیمات عنصر بازنشانی شد؛ برای ثبت نهایی ذخیره و منتشر کن.');
  }
  function choose(s){
    if(typeof s!=='string'||!s||s.length>500||prohibited(s))return;
    const changed=selected!==s;
    selected=s;
    if(changed){overlapItems=[];touchedSelection=null;}
    renderProps();send('MMVS_SPATIAL_PICK',{selector:s});
  }
  function edit(mutator,allowWhenLocked=false){
    if(!selected||loading||publishing||!!reviewLayout)return;
    const p={...current()};
    if(p.locked&&!allowWhenLocked){toast('این عنصر قفل است؛ ابتدا قفل را باز کن.',true);return}
    mutator(p);
    put(p);
  }
  function setLock(){edit(p=>{p.locked=!p.locked},true)}
  function animateSelection(){
    if(!selected||loading||publishing||!!reviewLayout)return;
    const kind=$('spatial-animation-kind')?.value;
    if(kind==='none'){edit(p=>{delete p.animation});toast('انیمیشن سفارشی برداشته شد.');return}
    const dur=Number($('spatial-animation-duration')?.value),amp=Number($('spatial-animation-amplitude')?.value),delay=Number($('spatial-animation-delay')?.value);
    if(!animationKinds.has(kind)||!Number.isFinite(dur)||dur<.4||dur>30||!Number.isFinite(amp)||amp<1||amp>150||!Number.isFinite(delay)||delay<0||delay>10){toast('مدت ۰.۴ تا ۳۰ ثانیه، شدت ۱ تا ۱۵۰، تأخیر ۰ تا ۱۰ ثانیه.',true);return}
    const animation={kind,durationMs:Math.round(dur*1000),amplitude:Math.round(amp*10)/10,delayMs:Math.round(delay*1000),loop:!!$('spatial-animation-loop').checked};
    if(!animationValid(animation)){toast('پارامترهای انیمیشن معتبر نیست.',true);return}
    edit(p=>{p.animation=animation});toast('انیمیشن در پیش‌نمایش اعمال شد؛ برای نمایش عمومی ذخیره و منتشر کن.');
  }
  function removeAnimation(){edit(p=>{delete p.animation});toast('انیمیشن سفارشی حذف شد؛ حرکت CSS قدیمی دست‌نخورده است.')}
  function focusAnimation(){const panel=$('spatial-animation-panel');if(!panel)return;panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'nearest'});$('spatial-animation-kind')?.focus()}
  function toggleAnimation(){animationPlaying=!animationPlaying;const btn=$('spatial-animation-toggle');if(btn)btn.textContent=animationPlaying?'⏸ توقف پیش‌نمایش حرکت':'▶ پخش پیش‌نمایش حرکت';send('MMVS_SPATIAL_ANIMATION_PLAY',{playing:animationPlaying})}
  function setHidden(){if(/^(?:#(?:p74-app|mf62-home|mmvs-root|app)|main\.home-shell)$/.test(selected))return toast('ریشه صفحه را نمی‌توان مخفی کرد؛ یکی از آبجکت‌های داخل آن را انتخاب کن.',true);edit(p=>{p.hidden=!p.hidden},true);send('MMVS_SPATIAL_SCAN')}
  function layer(action){
    if(!selected)return;
    const values=doc.items.map(x=>x.zIndex).filter(Number.isInteger);
    const c=current().zIndex??touchedSelection?.baseZ??0;
    const lo=Math.min(-1,...values);const hi=Math.max(1000,...values);
    const next={front:hi+1,forward:c+1,backward:c-1,back:lo-1}[action];
    if(!Number.isInteger(next))return;
    edit(p=>{p.zIndex=clamp(next,-1000,20000)});
  }
  function nudge(dx,dy,step=1){edit(p=>{p.x=clamp(p.x+dx*step,-4000,4000);p.y=clamp(p.y+dy*step,-4000,4000)})}
  async function api(path,method='GET',body){
    const token=sessionStorage.getItem('tenx_admin_token');if(!token)throw Error('ابتدا با سوپرادمین وارد شو');
    const r=await fetch('/admin/mmvs/layout/'+encodeURIComponent(page)+path,{
      method,cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||d.message||'HTTP '+r.status);
    return d;
  }
  function drawHistory(){
    const list=$('spatial-versions');if(!list)return;list.replaceChildren();
    for(const version of [...history].reverse().slice(0,15)){
      const b=document.createElement('button');b.type='button';b.className='minor';
      b.textContent='فقط چیدمان قدیمی '+version.revision+' · '+new Date(version.at).toLocaleString('fa-IR');
      b.onclick=async()=>{
        if(!confirm('فقط چیدمان به پیش‌نویس برمی‌گردد و محتوا تغییر نمی‌کند. برای بازیابی هماهنگ از تاریخچه نسخه‌ها استفاده کنید. ادامه می‌دهید؟'))return;
        try{await api('/restore','POST',{expectedRevision:revision,revision:version.revision});await load(page);toast('نسخه در پیش‌نویس بازیابی شد؛ برای کاربران هنوز منتشر نشده')}catch(e){toast('خطای بازیابی: '+e.message,true)}
      };
      list.append(b);
    }
    if(!history.length)list.textContent='تاریخچه‌ای ثبت نشده.';
  }
  async function load(slug){
    const id=++session;page=slug;loading=true;selected='';overlapItems=[];layerItems=[];state();
    let result;try{result=await api('')}catch(e){loading=false;state();throw e}
    if(id!==session)return;
    revision=result.revision;
    published=clone(result.published||{items:[]});draft=result.draft?clone(result.draft):null;
    history=Array.isArray(result.history)?result.history:[];
    doc.items=clone(draft||published).items||[];
    initial=JSON.stringify(doc);loading=false;state();renderProps();preview();drawHistory();
    toast('یک عنصر را انتخاب کن؛ روی خودش قفل، مخفی‌کردن و جلو/عقب بردن لایه را داری.');
  }
  async function save(){
    if(!dirty)return true;if(loading||publishing||!!reviewLayout)return false;loading=true;state();
    try{
      const snapshot=clone(doc);
      const result=await api('/draft','PUT',{expectedRevision:revision,layout:snapshot});
      revision=result.revision;draft=snapshot;initial=JSON.stringify(snapshot);state();
      toast('چیدمان ذخیره شد؛ هنوز منتشر نشده.');return true;
    }catch(e){toast('خطای ذخیره: '+e.message,true);throw e}
    finally{loading=false;state()}
  }
  async function publish(){
    if(loading||publishing||!!reviewLayout)return false;if(dirty&&!(await save()))return false;if(!draft)return true;
    loading=true;state();
    try{
      const result=await api('/publish','POST',{expectedRevision:revision});
      revision=result.revision;published=clone(draft);draft=null;initial=JSON.stringify(doc);
      const restoreSelection=selected;
      await load(page);if(restoreSelection)choose(restoreSelection);
      toast('چیدمان، قفل‌ها و ترتیب لایه‌ها منتشر شد.');return true;
    }catch(e){toast('خطای انتشار: '+e.message,true);throw e}
    finally{loading=false;state()}
  }
  function bind(){
    $('spatial-layer-search')?.addEventListener('input',renderLayers);
    $('spatial-layer-refresh').onclick=scanLayers;
    const modeBtn=$('spatial-mode');modeBtn.onclick=()=>{
      mode=!mode;modeBtn.classList.toggle('active',mode);
      modeBtn.textContent=mode?'✋ جابه‌جایی روشن':'✋ فعال‌سازی جابه‌جایی';
      send('MMVS_SPATIAL_MODE',{enabled:reviewLayout?false:mode,grid});
      toast(mode?'برای ویرایش، روی عنصر بزن؛ منوی شناور و دستگیره ظاهر می‌شوند.':'حالت پیمایش عادی صفحه فعال شد.');
    };
    $('spatial-grid').onchange=e=>{grid=e.target.checked;send('MMVS_SPATIAL_MODE',{enabled:mode,grid})};
    $('spatial-save').onclick=()=>save().catch(()=>{});
    $('spatial-publish').textContent='انتشار صفحه و چیدمان';
    $('spatial-publish').onclick=()=>window.MMVSWorkspace?.publish();
    $('spatial-reset').onclick=selectClear;
    $('spatial-lock').onclick=setLock;$('spatial-hide').onclick=setHidden;
    $('spatial-animation-apply').onclick=animateSelection;
    $('spatial-animation-remove').onclick=removeAnimation;
    $('spatial-animation-toggle').onclick=toggleAnimation;
    for(const [id,action] of [['spatial-to-front','front'],['spatial-forward','forward'],['spatial-backward','backward'],['spatial-to-back','back']])$(id).onclick=()=>layer(action);
    for(const [id,dx,dy] of [['spatial-nudge-up',0,-1],['spatial-nudge-down',0,1],['spatial-nudge-left',-1,0],['spatial-nudge-right',1,0]])$(id).onclick=()=>nudge(dx,dy);
    for(const key of ['x','y','scale'])$('spatial-'+key).addEventListener('change',()=>{
      const raw=$('spatial-'+key).value.trim();if(!raw)return toast('این مقدار نباید خالی باشد',true);const n=Number(raw);if(!Number.isFinite(n))return toast('عدد نامعتبر است',true);
      edit(p=>{p[key]=n});
    });
    $('spatial-z').addEventListener('change',()=>{
      if(!$('spatial-z').value.trim())return edit(p=>{delete p.zIndex});
      const n=Number($('spatial-z').value);if(!Number.isInteger(n)||n< -1000||n>20000)return toast('لایه Z باید عدد صحیح بین -۱۰۰۰ تا ۲۰۰۰۰ باشد.',true);
      edit(p=>{p.zIndex=n});
    });
    $('spatial-opacity').addEventListener('change',()=>{
      const n=Number($('spatial-opacity').value);
      if(!Number.isFinite(n)||n<.05||n>1)return toast('شفافیت باید بین ۰.۰۵ تا ۱ باشد.',true);
      edit(p=>{p.opacity=n});
    });
    window.addEventListener('keydown',e=>{
      if(!mode||!selected||e.altKey||e.ctrlKey||e.metaKey)return;
      if(e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
      const d=dirs[e.key];if(!d)return;
      e.preventDefault();nudge(d[0],d[1],e.shiftKey?10:1);
    });
    window.addEventListener('message',e=>{
      if(e.origin!==location.origin||e.source!==$('frame')?.contentWindow||!e.data)return;
      const d=e.data;
      if(d.slug&&d.slug!==page)return;
      if(d.type==='MMVS_SPATIAL_READY'||d.type==='MMVS_READY'){
        ready=true;preview();
      }else if(d.type==='MMVS_SPATIAL_LAYERS'){
        layerItems=Array.isArray(d.items)?d.items.filter(x=>x&&typeof x.selector==='string'&&typeof x.label==='string').slice(0,350):[];renderLayers();
      }else if(d.type==='MMVS_SPATIAL_OVERLAPS'){
        if(d.selector===selected){overlapItems=Array.isArray(d.items)?d.items.slice(0,28):[];renderOverlap()}
      }else if(d.type==='MMVS_SELECT' && !mode && d.element?.selector){
        choose(d.element.selector);
      }else if(d.type==='MMVS_SPATIAL_SELECTED' && d.item?.selector){
        choose(d.item.selector);touchedSelection=d.item;
      }else if(d.type==='MMVS_SPATIAL_COMMIT' && d.item?.selector){
        if(!mode||loading||publishing||!!reviewLayout||savedFor(d.item.selector).locked)return;
        put({...savedFor(d.item.selector),...d.item},false);
      }else if(d.type==='MMVS_SPATIAL_ACTION'){
        if(d.selector!==selected)choose(d.selector);
        switch(d.action){
          case 'lock':setLock();break;
          case 'hide':setHidden();break;
          case 'front':layer('front');break;
          case 'back':layer('back');break;
          case 'reset':selectClear();break;
          case 'animation':focusAnimation();break;
          case 'nudge':if(Number.isFinite(d.dx)&&Number.isFinite(d.dy))nudge(clamp(d.dx,-10,10),clamp(d.dy,-10,10));break;
        }
      }
    });
    window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  }
  function start(){bind();if(window.matchMedia('(max-width:650px)').matches)$('spatial-tools').open=false;state();renderProps();$('frame')?.addEventListener('load',()=>{ready=true;preview()})}
  window.MMVS_Spatial={review:layout=>{reviewLayout=layout?clone(layout):null;preview();state();renderProps()},getDraftLayout:()=>clone(doc),loadPage:load,saveIfDirty:save,publishIfPending:publish,
    hasPending:()=>Boolean(dirty||draft),refresh:preview,isDirty:()=>JSON.stringify(doc)!==initial,
    acceptPublished:next=>{if(Number.isInteger(next)){revision=next;published=clone(draft||published);draft=null;state()}},
    isBusy:()=>loading||publishing,getRevision:()=>loading?undefined:revision,setPublishing:value=>{publishing=value;state();renderProps()}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
