/* MMVS_R97_SECTION_BACKGROUNDS */
/* MMVS_R95_UNDERLAY_HOST_FIX */
/* MMTrade10X · Visual Studio R9: precise object selection and independent per-element animations. */
/* MMVS_PAGE_BOUNDARY_R2 */
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
  let doc={items:[],domMoves:[]}, initial='{"items":[],"domMoves":[]}', dirty=false;
  let mode=false,grid=false,selected='',ready=false,loading=false,history=[],session=0,publishing=false;
  let layerItems=[], overlapItems=[];
  let touchedSelection=null;
  // MMVS_MULTI_R1: temporary multi-selection only; saved layout schema stays unchanged.
  let groupMode=false, groupSelection=[];
  function groupClean(items){
    const unique=[];
    for(const s of Array.isArray(items)?items:[]){
      if(typeof s!=='string'||s.length>500||s==='html'||prohibited(s)||mmvsR11RootSelector(s)||unique.includes(s))continue;
      if(savedFor(s).locked||savedFor(s).hidden)continue;
      unique.push(s);if(unique.length>=32)break;
    }
    return unique;
  }
  function groupSync(){
    const b=$('spatial-multi-mode'),clear=$('spatial-multi-clear'),count=$('spatial-multi-count');
    if(b){b.classList.toggle('active',groupMode);b.setAttribute('aria-pressed',String(groupMode));b.textContent=groupMode?'☑ چندانتخابی روشن':'☐ انتخاب چندتایی'}
    if(clear)clear.disabled=!groupSelection.length;
    if(count)count.textContent=groupMode?`${groupSelection.length} آیتم انتخاب شده`:'انتخاب معمولی';
    send('MMVS_SPATIAL_GROUP_MODE',{enabled:groupMode});
    send('MMVS_SPATIAL_GROUP_SET',{selectors:groupMode?groupSelection:[]});
  }
  function groupSet(items){
    groupSelection=groupClean(items);selected=groupSelection[groupSelection.length-1]||'';
    touchedSelection=null;overlapItems=[];
    renderProps();groupSync();
  }
  function groupToggle(s){
    if(!groupMode||loading||publishing||reviewLayout)return;
    const next=groupSelection.includes(s)?groupSelection.filter(x=>x!==s):[...groupSelection,s];
    groupSet(next);
  }
  function groupMove(dx,dy){
    if(!groupMode||groupSelection.length<2||loading||publishing||reviewLayout)return false;
    send('MMVS_SPATIAL_GROUP_NUDGE',{selectors:groupSelection,dx,dy});
    return true;
  }
  function groupCommit(items){
    if(!groupMode||loading||publishing||reviewLayout||!Array.isArray(items)||items.length<2||items.length>32)return;
    const allowed=new Set(groupClean(groupSelection));
    if(items.length!==allowed.size||items.some(x=>!x||!allowed.has(x.selector)))return;
    const fixes=items.map(x=>normalize({...savedFor(x.selector),x:x.x,y:x.y}));
    if(fixes.some(x=>!x))return;
    for(const item of fixes){const ix=doc.items.findIndex(x=>x.selector===item.selector);if(ix>=0)doc.items[ix]=item;else doc.items.push(item)}
    state();renderProps();toast(`${fixes.length} آیتم با هم جابه‌جا شدند؛ برای کاربران، ذخیره و انتشار لازم است.`);
  }

  const isValid = x => !!x && typeof x.selector==='string' && x.selector.length<=500 &&
    Number.isFinite(x.x) && Number.isFinite(x.y) && Number.isFinite(x.scale);

  function normalize(p) {
    if (!isValid(p)) return null;
    const x={selector:p.selector,
      x:Math.round(clamp(p.x,-4000,4000)*10)/10,
      y:Math.round(clamp(p.y,-4000,4000)*10)/10,
      scale:Math.round(clamp(p.scale,0.2,4)*1000)/1000};
    if(Number.isFinite(p.widthPx))x.widthPx=Math.round(clamp(p.widthPx,24,1600));
    if(Number.isFinite(p.heightPx))x.heightPx=Math.round(clamp(p.heightPx,16,1600));
    if(p.locked===true)x.locked=true;
    if(p.hidden===true)x.hidden=true;
    if(Number.isInteger(p.zIndex))x.zIndex=clamp(p.zIndex,-1000,20000);
    if(Number.isFinite(p.opacity))x.opacity=Math.round(clamp(p.opacity,0.05,1)*1000)/1000;
    if(animationValid(p.animation))x.animation=clone(p.animation);
    if(typeof p.layerId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(p.layerId))x.layerId=p.layerId;
    if(typeof p.groupId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(p.groupId))x.groupId=p.groupId;
    if(Number.isInteger(p.rank)&&p.rank>=1&&p.rank<=500)x.rank=p.rank;
    if(p.renderPlane==='free'||p.renderPlane==='native')x.renderPlane=p.renderPlane;
    if(mmvsBgValid(p.sectionBackground))x.sectionBackground=clone(p.sectionBackground);
    return x;
  }
  // MMVS_BOUNDARY_R12: boundary control validation, preserving existing html layout entry.
    // MMVS_PAGE_BOUNDARY_R2: stored in the existing spatial layout as a reserved html entry.
  const BOUNDARY_SELECTOR='html';
  function boundaryItem(){return doc.items.find(x=>x.selector===BOUNDARY_SELECTOR)||null}
  function setBoundary(enabled,height){
    if(loading||publishing||reviewLayout)return;
    /* MMTRADE_AUDIT_FIX_R1_BOUNDARY_CONFLICT: prevent dual configurations. */
    if(enabled&&window.MMVS_PublishedFold?.get?.()?.enabled===true){
      toast('خط انتشار جدید برای این صفحه فعال است. ابتدا آن را در پیش‌نویس غیرفعال کن.',true);
      renderBoundary();return;
    }
    const n=Math.round(Number(height));
    if(enabled&&(!Number.isFinite(n)||n<200||n>4000)){renderBoundary();toast('ارتفاع باید بین ۲۰۰ تا ۴۰۰۰ پیکسل باشد.',true);return}
    const had=boundaryItem();
    if(enabled&&!had&&doc.items.length>=500){renderBoundary();toast('ظرفیت ۲۵۰ تنظیم پر است؛ ابتدا یک تنظیم غیرضروری را حذف کن.',true);return}
    doc.items=doc.items.filter(x=>x.selector!==BOUNDARY_SELECTOR);
    if(enabled)doc.items.push({selector:BOUNDARY_SELECTOR,x:n,y:0,scale:1});
    renderBoundary();preview();state();
    toast(enabled?'محدوده نمایش در پیش‌نمایش اعمال شد؛ برای کاربران ذخیره و منتشر کن.':'محدودیت نمایش غیرفعال شد؛ برای ثبت، ذخیره و منتشر کن.');
  }
  function renderBoundary(){
    const p=boundaryItem(),on=!!p,check=$('spatial-boundary-enabled'),height=$('spatial-boundary-height');
    if(check){check.checked=on;check.disabled=loading||publishing||!!reviewLayout}
    if(height){height.value=String(on?Math.round(p.x):850);height.disabled=!on||loading||publishing||!!reviewLayout}
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
    $('spatial-mode').disabled=loading||publishing||!!reviewLayout;
    $('spatial-save').disabled=!dirty||loading||publishing||!!reviewLayout;
    $('spatial-publish').disabled=loading||publishing||!!reviewLayout||(!dirty&&!draft);
    $('spatial-reset').disabled=!selected||loading||publishing||!!reviewLayout;
    window.dispatchEvent(new Event('mmvs:state'));
  }

  // MMVS_STUDIO_V2_R3_DOM_EXPLORER: read-only DOM tree; reuse existing selection and layer engine.
  let mmvsDomTimer=0;
  function mmvsDomSelector(el,docInFrame){
    const anchored=docInFrame.defaultView?.__MMVS_DOM_BASE_SELECTOR__?.(el);if(typeof anchored==='string'&&anchored.length<=500)return anchored;
    if(el.id){const s='#'+CSS.escape(el.id);if(docInFrame.querySelectorAll(s).length===1)return s}
    let node=el,parts=[];
    while(node&&node!==docInFrame.body&&parts.length<12){
      if(node.id){parts.unshift('#'+CSS.escape(node.id));break}
      const tag=node.tagName.toLowerCase();const siblings=[...node.parentElement.children].filter(x=>x.tagName===node.tagName);
      parts.unshift(tag+(siblings.length>1?':nth-of-type('+(siblings.indexOf(node)+1)+')':''));
      const s=parts.join(' > ');if(s.length<=500&&docInFrame.querySelectorAll(s).length===1)return s;
      node=node.parentElement;
    }
    const s=parts.join(' > ');return s.length<=500?s:null;
  }
  // MMVS_DOM_ORDER_R85: DOM tree operations (not z-index). The API stores these in layout.domMoves.
  let mmvsDomPending=null;
  const mmvsDomBlocked='html,body,script,style,link,meta,noscript,template,head,title,#p74-app,#mf62-home,#mmvs-root,#app,#page-root,.home-shell,.stage-page,.stage-shell,.p74-scroll,.p74-page,[data-mmvs-app-root],#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-v2-image-plane';
  const mmvsDomContainers='div,section,article,aside,header,footer,main,nav,ul,ol,li,figure,figcaption,blockquote,details';
  function mmvsDomGet(s,d){
    try{return d.defaultView?.__MMVS_DOM_GET__?.(s)||d.querySelector(s)}catch(_e){return null}
  }
  function mmvsDomSafe(el){
    if(!el||!el.isConnected||el.matches(mmvsDomBlocked)||el.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-v2-image-plane'))return false;
    if(el.closest('script,template,svg,canvas,[contenteditable="true"]'))return false;
    if(el.tagName.includes('-'))return false; // custom elements may be owned by a framework
    if(el.closest('[data-reactroot],[data-v-app],[ng-version]'))return false;
    return true;
  }
  function mmvsDomMove(source,target,placement){
    if(loading||publishing||reviewLayout||false)return toast('در زمان بارگذاری، انتشار یا بازبینی تاریخی، جابه‌جایی غیرفعال است.',true);
    const d=$('frame')?.contentDocument;
    if(!d?.body)return toast('صفحه آماده نیست.',true);
    const a=mmvsDomGet(source,d),b=mmvsDomGet(target,d);
    if(!mmvsDomSafe(a)||!mmvsDomSafe(b)||a===b||a.contains(b)||!b.parentElement)return toast('این جابه‌جایی برای عناصر ریشه یا ساختارهای حساس مجاز نیست.',true);
    if(placement==='inside'){
      if(!b.matches(mmvsDomContainers)||b.closest('form,[contenteditable="true"]'))return toast('این عنصر نمی‌تواند والد HTML باشد. یک ظرف مثل div یا section انتخاب کن.',true);
    }else if(!mmvsDomSafe(b.parentElement)&&b.parentElement!==d.body)return toast('والد مقصد محافظت شده است.',true);
    if(a.matches('form,iframe,video,audio,dialog')||b.matches('form,iframe,video,audio,dialog'))return toast('انتقال عناصر تعاملی پرخطر محدود شده است.',true);
    const nextParent=placement==='inside'?b:b.parentElement;
    if(!nextParent||a.contains(nextParent))return toast('قرار دادن والد داخل فرزند مجاز نیست.',true);
    if(a.parentElement!==nextParent&&!confirm('این عملیات والد HTML را تغییر می‌دهد و ممکن است CSS و رویدادهای صفحه را تحت تأثیر قرار دهد. ادامه می‌دهی؟'))return;
    if((doc.domMoves||[]).length>=80&&!(doc.domMoves||[]).some(x=>x.selector===source))return toast('حداکثر ۸۰ انتقال DOM در هر صفحه مجاز است.',true);
    const next=(doc.domMoves||[]).filter(x=>x.selector!==source);
    next.push({selector:source,reference:target,placement});
    doc.domMoves=next;
    mmvsDomPending=null;state();preview();mmvsDomSchedule();
    toast('ترتیب HTML در پیش‌نمایش تغییر کرد؛ برای ماندگاری «ذخیره چیدمان» و سپس انتشار را بزن.');
  }
  function mmvsDomStep(direction){
    const d=$('frame')?.contentDocument,a=d&&mmvsDomGet(selected,d);
    if(!mmvsDomSafe(a))return toast('ابتدا یک آیتم قابل‌جابه‌جایی انتخاب کن.',true);
    const sibling=direction<0?a.previousElementSibling:a.nextElementSibling;
    if(!sibling||!mmvsDomSafe(sibling))return toast('در این جهت آیتم هم‌سطح قابل انتقال وجود ندارد.',true);
    const target=mmvsDomSelector(sibling,d);
    if(!target)return toast('شناسه پایدار مقصد پیدا نشد.',true);
    mmvsDomMove(selected,target,direction<0?'before':'after');
  }
  function mmvsDomSetPending(mode){
    if(!selected)return toast('اول آیتم مبدأ را از DOM Explorer انتخاب کن.',true);
    mmvsDomPending={selector:selected,placement:mode};
    const label=mode==='inside'?'داخل':'زیر';
    toast('حالا از درخت HTML روی آیتم مقصد کلیک کن تا آیتم انتخاب‌شده '+label+' آن قرار بگیرد.');
    mmvsDomSchedule();
  }
  function mmvsDomCancel(){mmvsDomPending=null;mmvsDomSchedule()}
  function mmvsDomUnmove(){
    if(!selected)return;
    const prior=(doc.domMoves||[]).length;
    doc.domMoves=(doc.domMoves||[]).filter(x=>x.selector!==selected);
    if(doc.domMoves.length===prior)return toast('برای این آیتم جابه‌جایی DOM ثبت نشده است.');
    state();preview();mmvsDomSchedule();toast('ترتیب این آیتم به ساختار اصلی برمی‌گردد؛ برای ماندگاری ذخیره کن.');
  }

  function mmvsDomRefresh(){
    const root=$('mmvs-dom-list'),status=$('mmvs-dom-status');if(!root||!status)return;
    const frame=$('frame');let d;
    try{d=frame?.contentDocument}catch(_e){}
    if(!d?.body){status.textContent='صفحه هنوز آماده نیست یا دسترسی DOM وجود ندارد.';root.replaceChildren();return}
    const search=String($('mmvs-dom-search')?.value||'').trim().toLocaleLowerCase();
    const nodes=[d.body,...d.body.querySelectorAll('*')];const max=5000;
    const frag=document.createDocumentFragment();let count=0,shown=0;
    for(const el of nodes){
      if(count++>=max)break;
      if(el.closest('#mmvs-spatial-overlay,#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-overlay'))continue;
      const selector=mmvsDomSelector(el,d);if(!selector||prohibited(selector)||mmvsR11RootSelector(selector))continue;
      const tag=el.tagName.toLowerCase(),id=el.id?'#'+el.id:'',cls=typeof el.className==='string'?el.className.trim().split(/\s+/).slice(0,2).map(x=>'.'+x).join(''):'';
      const title=(el.getAttribute('aria-label')||el.getAttribute('alt')||((el.children.length===0)?el.textContent:'')||'').trim().slice(0,55);
      const label=(tag+id+cls+' '+title).toLocaleLowerCase();if(search&&!label.includes(search)&&!selector.toLocaleLowerCase().includes(search))continue;
      const style=d.defaultView.getComputedStyle(el);const hidden=style.display==='none'||style.visibility==='hidden';
      const isolated=style.isolation==='isolate'||style.transform!=='none'||Number(style.opacity)<1||['fixed','sticky'].includes(style.position);
      const b=document.createElement('button');b.type='button';b.className='mmvs-dom-item'+(hidden?' is-hidden':'')+(isolated?' is-isolated':'')+(selected===selector?' active':'');b.dataset.selector=selector;b.title=selector;
      const depth=Math.min(12,(()=>{let n=el,k=0;while(n&&n!==d.body){k++;n=n.parentElement}return k})());b.style.paddingInlineStart=(8+depth*11)+'px';
      const t=document.createElement('span');t.className='mmvs-dom-tag';t.textContent='<'+tag+'>';
      const name=document.createElement('span');name.className='mmvs-dom-label';name.textContent=(id||cls||title||tag).slice(0,90);
      b.append(t,name);b.draggable=mmvsDomSafe(el);
      b.ondragstart=e=>{if(!mmvsDomSafe(el)){e.preventDefault();return}mmvsDomPending={selector,placement:'after'};e.dataTransfer?.setData('text/plain',selector)};
      b.ondragend=()=>{if(mmvsDomPending?.selector===selector)mmvsDomCancel()};
      b.ondragover=e=>{if(mmvsDomPending&&mmvsDomPending.selector!==selector)e.preventDefault()};
      b.ondrop=e=>{e.preventDefault();const source=mmvsDomPending?.selector;if(source&&source!==selector)mmvsDomMove(source,selector,'after')};
      b.onclick=()=>{if(mmvsDomPending){const p=mmvsDomPending;if(p.selector!==selector)mmvsDomMove(p.selector,selector,p.placement);else mmvsDomCancel();return}
        if(groupMode){groupMode=false;groupSelection=[];groupSync()}if(!mode&&!loading&&!publishing&&!reviewLayout){$('spatial-mode').click()}choose(selector);send('MMVS_SPATIAL_REVEAL',{selector});root.querySelectorAll('.active').forEach(x=>x.classList.remove('active'));b.classList.add('active')};
      frag.append(b);shown++;
    }
    root.replaceChildren(frag);root.classList.toggle('mmvs-dom-target-mode',!!mmvsDomPending);status.textContent=(mmvsDomPending?'انتخاب مقصد انتقال DOM · ':'')+'عناصر HTML: '+nodes.length+' · نمایش: '+shown+(nodes.length>max?' · سقف اسکن '+max:'')+(search?' · فیلتر فعال':'');
  }
  function mmvsDomSchedule(){clearTimeout(mmvsDomTimer);mmvsDomTimer=setTimeout(mmvsDomRefresh,240)}

  function renderLayers(){
    const root=$('spatial-layer-list');if(!root)return;
    const query=String($('spatial-layer-search')?.value||'').trim().toLocaleLowerCase();
    root.replaceChildren();let count=0;
    for(const item of layerItems){
      if(query&&!String(item.label+' '+item.selector+' '+item.kind).toLocaleLowerCase().includes(query))continue;
      const itemData=savedFor(item.selector);
      const b=document.createElement('button');b.type='button';b.dataset.selector=item.selector;
      b.classList.toggle('active',item.selector===selected);b.classList.toggle('mmvs-multi-selected',groupMode&&groupSelection.includes(item.selector));b.setAttribute('aria-selected',String(groupMode?groupSelection.includes(item.selector):item.selector===selected));
      b.classList.toggle('mmvs-layer-hidden',!!itemData.hidden);
      b.classList.toggle('mmvs-layer-locked',!!itemData.locked);
      b.classList.toggle('mmvs-layer-animated',!!itemData.animation);
      b.title=item.selector;
      const emo=document.createElement('span');emo.className='mmvs-layer-emoji';emo.textContent=item.icon||'◈';
      const group=document.createElement('span');group.style.minWidth='0';
      const name=document.createElement('span');name.className='mmvs-layer-text';name.textContent=item.label;
      const sub=document.createElement('span');sub.className='mmvs-layer-sub';
      sub.textContent=item.selector+(itemData.hidden?' · مخفی':'')+(itemData.animation?' · ✦ حرکت':'')+(itemData.zIndex!==undefined?' · Z '+itemData.zIndex:'')+(itemData.renderPlane==='free'?' · ✦ آزاد '+(itemData.rank??1):'');
      group.append(name,sub);b.append(emo,group);
      b.onclick=e=>{if(groupMode||e.shiftKey||e.ctrlKey||e.metaKey){if(!groupMode){groupMode=true;groupSelection=selected?[selected]:[]}groupToggle(item.selector)}else{choose(item.selector);send('MMVS_SPATIAL_REVEAL',{selector:item.selector})}};
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
      b.onclick=e=>{if(groupMode||e.shiftKey||e.ctrlKey||e.metaKey){if(!groupMode){groupMode=true;groupSelection=selected?[selected]:[]}groupToggle(item.selector)}else{choose(item.selector);send('MMVS_SPATIAL_REVEAL',{selector:item.selector})}};root.append(b);
    }
  }
  function renderProps(){
    const p=current();
    const selectedEnough=!!selected&&!(groupMode&&groupSelection.length>1);
    const locked=!!p.locked;
    for(const k of ['x','y','scale']){
      const el=$('spatial-'+k);if(!el)continue;
      el.value=String(p[k]);el.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;
    }
    for(const [axis,min,fallback] of [['width',24,240],['height',16,80]]){
      const el=$('spatial-'+axis),out=$('spatial-'+axis+'-value'),num=$('spatial-'+axis+'-number');
      const val=p[axis+'Px'];if(el){el.value=String(val??fallback);el.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked}
      if(out)out.textContent=val===undefined?'خودکار':val+'px';
      if(num){num.value=String(val??fallback);num.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;}
    }
    const resetSize=$('spatial-size-reset');if(resetSize)resetSize.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;
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
      const e=$(id);if(e)e.disabled=!(selectedEnough||(groupMode&&groupSelection.length>=2))||loading||publishing||!!reviewLayout||(locked&&!(groupMode&&groupSelection.length>=2));
    }
    const z=$('spatial-z');if(z){z.value=p.renderPlane==='free'?(p.rank??1):(p.zIndex??'');z.placeholder=p.renderPlane==='free'?'رتبه سطح آزاد':'پیش‌فرض';z.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked}
    const v2=$('spatial-v2-plane');if(v2){v2.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;v2.textContent=p.renderPlane==='free'?'↩ بازگشت تصویر به لایه معمولی':'✦ انتقال تصویر تزئینی به سطح آزاد';v2.setAttribute('aria-pressed',String(p.renderPlane==='free'))}
    const bg=$('spatial-underlay');if(bg){bg.disabled=!selectedEnough||loading||publishing||!!reviewLayout||locked;bg.textContent=p.layerId===mmvsUnderlayKey?'↩ بازگردانی تصویر از پس‌زمینه':'⬇ قرار دادن تصویر کتابخانه پشت محتوای صفحه';bg.setAttribute('aria-pressed',String(p.layerId===mmvsUnderlayKey))}
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
  /* MMVS_HOME_PREVIEW_PARITY_R2: published spatial snapshot in live comparison */
  function preview(){
    const liveHome=false;
    send('MMVS_SPATIAL_PREVIEW',{layout:clone(reviewLayout||(liveHome?published:doc))});
    send('MMVS_SPATIAL_MODE',{enabled:!liveHome&&!reviewLayout&&mode,grid});
    send('MMVS_SPATIAL_ANIMATION_PLAY',{playing:animationPlaying});
    if(selected&&!reviewLayout)send('MMVS_SPATIAL_PICK',{selector:selected});
    groupSync();scanLayers();
  }
  // MMVS_R11_SAFE_PICK: rejects only the root selector, never its child components.
const mmvsR11RootSelector=s=>{
 const v=String(s||'').trim();
 return /^(?:html|body|main|#(?:app|root|page-root|p74-app|mf62-home|mmvs-root)|main\.home-shell|\.home-shell|\.stage-page|\.stage-shell)$/i.test(v)
  || /(?:^|>)\s*(?:html|body|main|#(?:app|root|page-root|p74-app|mf62-home|mmvs-root))\s*$/i.test(v);
};
function put(p,sendSet=true){if(mmvsR11RootSelector(p?.selector))return;
    const fixed=normalize(p);if(!fixed||!fixed.selector||prohibited(fixed.selector))return;
    const ix=doc.items.findIndex(x=>x.selector===fixed.selector);
    if(ix<0&&doc.items.length>=500)return toast('حداکثر ۵۰۰ عنصر قابل ذخیره است',true);
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
    if(!groupMode){groupSelection=[];groupSync()}if(mmvsR11RootSelector(s))return;
    if(typeof s!=='string'||!s||s.length>500||prohibited(s))return;
    const changed=selected!==s;
    selected=s;
    if(changed){overlapItems=[];touchedSelection=null;mmvsVisualPinned.add(s);
      if(mmvsVisualPinned.size>60)mmvsVisualPinned.delete(mmvsVisualPinned.values().next().value)}
    mmvsVisualStackSchedule();
    renderProps();send('MMVS_SPATIAL_PICK',{selector:s});
  }
  function edit(mutator,allowWhenLocked=false){

    if(!selected||loading||publishing||!!reviewLayout)return;
    const p={...current()};
    if(p.locked&&!allowWhenLocked){toast('این عنصر قفل است؛ ابتدا قفل را باز کن.',true);return}
    mutator(p);
    put(p);
  }
  // MMVS_R97_SECTION_BACKGROUNDS — persisted in the spatial draft and history.
  function mmvsBgValidUrl(url){
    if(typeof url!=='string'||!url||url.length>2048||url.startsWith('//')||!/\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i.test(url))return false;
    try{const u=new URL(url,location.origin);return u.protocol==='https:'||(u.protocol==='http:'&&u.origin===location.origin)}catch{return false}
  }
  function mmvsBgValid(bg){
    return !!bg&&mmvsBgValidUrl(bg.url)&&['cover','contain'].includes(bg.fit)&&['center','top','bottom'].includes(bg.position)&&Number.isFinite(bg.dim)&&bg.dim>=0&&bg.dim<=.8&&
      (bg.sourceSelector===undefined||(typeof bg.sourceSelector==='string'&&bg.sourceSelector.length<=500&&bg.sourceSelector.length>0));
  }
  function mmvsBgChange(selector,bg){
    if(typeof selector!=='string'||!selector||selector.length>500||/^(?:html|body)$/i.test(selector)||selector.startsWith('#mmvs-')||loading||publishing||reviewLayout||window.MMVSWorkspace?.isPublishedHomePreview?.())return false;
    if(bg!==null&&!mmvsBgValid(bg))return false;
    const el=mmvsDomGet(selector,$('frame')?.contentDocument);
    if(!el||!el.isConnected||el.closest('#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-managed-content'))return false;
    const index=doc.items.findIndex(x=>x.selector===selector);
    if(index===-1&&doc.items.length>=500)return false;
    if(index<0&&bg===null)return true;
    const next=normalize({...savedFor(selector),...(bg===null?{}:{sectionBackground:bg})});
    if(!next)return false;
    if(bg===null)delete next.sectionBackground;
    if(index<0)doc.items.push(next);else doc.items[index]=next;
    if(bg?.sourceSelector){
      const p=doc.items.find(x=>x.selector===bg.sourceSelector);
      if(p?.layerId==='mmvs_underlay'){delete p.layerId;delete p.renderPlane;delete p.rank;}
    }
    state();preview();renderProps();return true;
  }

  function setLock(){edit(p=>{p.locked=!p.locked},true)}
  function animateSelection(){
    if(!selected||loading||publishing||!!reviewLayout)return;
    if(current().renderPlane==='free')return toast('قبل از فعال‌کردن انیمیشن، تصویر را از سطح آزاد به لایه معمولی برگردان.',true);
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
  // MMVS_V2_PILOT: opt-in independent image plane; never reparent live DOM.
  function mmvsV2Candidate(selector){
    let el,frame=$('frame')?.contentDocument,view=frame?.defaultView;
    try{el=frame?.querySelector(selector)}catch(_e){return null}
    if(!el||el.tagName!=='IMG'||!view||!el.isConnected)return null;
    if(el.closest('a,button,form,label,[role="button"],[contenteditable="true"]'))return null;
    let r=el.getBoundingClientRect(),s=view.getComputedStyle(el);
    if(r.width<8||r.height<8||r.width>view.innerWidth*.9||r.height>view.innerHeight*2)return null;
    if(s.display==='none'||s.visibility==='hidden'||s.position==='fixed'||s.position==='sticky')return null;
    if((s.transform&&s.transform!=='none')||(s.rotate&&s.rotate!=='none')||
       (s.scale&&s.scale!=='none'&&s.scale!=='1')||(s.filter&&s.filter!=='none'&&s.filter!=='blur(0px)')||
       (s.mixBlendMode&&s.mixBlendMode!=='normal')||(s.clipPath&&s.clipPath!=='none'))return null;
    if(el.getAnimations?.().length)return null;
    for(let p=el.parentElement;p&&p!==frame.documentElement;p=p.parentElement){
      const a=view.getComputedStyle(p);
      if(Number(a.opacity)<1||(a.filter&&a.filter!=='none')||(a.mixBlendMode&&a.mixBlendMode!=='normal')||p.getAnimations?.().length)return null;
      if(a.clipPath&&a.clipPath!=='none')return null;
      if(a.transform&&a.transform!=='none'&&/matrix\(([^)]+)\)/.test(a.transform)){
        const m=a.transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
        if(m.length===6&&(Math.abs(m[1])>.001||Math.abs(m[2])>.001))return null;
      }
    }
    return el;
  }
  function mmvsV2FreeOrder(action){
    const peers=doc.items.filter(x=>x.renderPlane==='free'&&x.selector!=='html');
    if(peers.length<2){toast('برای مرتب‌سازی، دست‌کم دو تصویر را به سطح آزاد اضافه کن.',true);return}
    const sorted=[...peers].sort((a,b)=>(a.rank??500)-(b.rank??500)||doc.items.indexOf(a)-doc.items.indexOf(b));
    const pos=sorted.findIndex(x=>x.selector===selected);if(pos<0)return;
    const to=action==='front'?sorted.length-1:action==='back'?0:action==='forward'?Math.min(pos+1,sorted.length-1):Math.max(0,pos-1);
    if(to===pos)return toast('لایه در انتهای همین سطح قرار دارد.');
    const [item]=sorted.splice(pos,1);sorted.splice(to,0,item);
    for(const [i,p] of sorted.entries()){
      const fixed=normalize({...p,rank:i+1});const idx=doc.items.findIndex(x=>x.selector===p.selector);
      if(idx>=0)doc.items[idx]=fixed;
    }
    renderProps();state();preview();toast('ترتیب تصاویر سطح آزاد تغییر کرد؛ هنوز منتشر نشده.');
  }
  function mmvsV2FreeRank(rank){
    if(!Number.isInteger(rank))return;
    const peers=doc.items.filter(x=>x.renderPlane==='free');
    const ordered=[...peers].sort((a,b)=>(a.rank??500)-(b.rank??500)||doc.items.indexOf(a)-doc.items.indexOf(b));
    const pos=ordered.findIndex(p=>p.selector===selected);if(pos<0)return;
    const [item]=ordered.splice(pos,1);ordered.splice(Math.max(0,Math.min(rank-1,ordered.length)),0,item);
    for(const [i,p] of ordered.entries()){
      const idx=doc.items.findIndex(x=>x.selector===p.selector);
      if(idx>=0)doc.items[idx]=normalize({...p,rank:i+1});
    }
    renderProps();state();preview();
  }
  // MMVS_R92_LIBRARY_UNDERLAY: a managed library IMG can be an actual background
  // behind native page content, without CSS stacking-context bypass.
  const mmvsUnderlayKey='mmvs_underlay';
  function underlayImage(){
    const f=document.querySelector('#frame')?.contentDocument;
    let n=null;
    try{n=f?.querySelector(selected)}catch(e){}
    if(n?.tagName!=='IMG')
      n=n?.closest?.('#mmvs-managed-content .mmvs-c-block')?.querySelector('img')
        ||n?.querySelector?.('img');
    if(!n||n.tagName!=='IMG'
       ||!n.matches('#mmvs-managed-content .mmvs-c-block > img'))
      return null;
    return n.id?('#'+CSS.escape(n.id)):mmvsDomSelector(n,f);
  }
  function mmvsUnderlayToggle(){
    if(!selected||loading||publishing||reviewLayout)return;
    const target=underlayImage();
    if(!target)return toast('تصویر کتابخانه را انتخاب کن.',true);
    if(selected!==target)choose(target);
    if(current().locked||current().animation)
      return toast('ابتدا قفل یا انیمیشن تصویر را بردار.',true);
    const enabled=current().layerId===mmvsUnderlayKey;
    edit(p=>{
      if(enabled)delete p.layerId;
      else{
        p.layerId=mmvsUnderlayKey;
        delete p.renderPlane;
        delete p.rank;
        delete p.zIndex;
      }
    });
    toast(enabled?'تصویر از پس‌زمینه خارج شد.':
      'در حال اعمال تصویر پشت محتوا…');
  }
  function mmvsV2Toggle(){
    if(!selected||loading||publishing||reviewLayout||savedFor(selected).locked||groupMode&&groupSelection.length>1)return;
    const isFree=current().renderPlane==='free';
    if(!isFree&&(current().animation||!mmvsV2Candidate(selected)))return toast('سطح آزاد فقط برای IMG تزئینیِ بدون انیمیشن/تعامل/افکت پیچیده فعال است.',true);
    edit(p=>{
      if(isFree){delete p.renderPlane;delete p.rank}
      else{p.renderPlane='free';p.rank=Math.min(500,doc.items.filter(x=>x.renderPlane==='free').length+1)}
    });
    if(isFree)toast('تصویر به جایگاه معمول صفحه بازگشت.');
    else toast('تصویر به سطح آزاد آزمایشی اضافه شد؛ ترتیب آن فقط با تصاویر آزاد دیگر تغییر می‌کند.');
  }
  // MMVS_VISUAL_STACK_R86: visual front/back ordering inside the DOM Explorer.
  // This deliberately does not reparent DOM nodes or change their HTML hierarchy.
  let mmvsVisualStackTimer=0,mmvsVisualDrag='';
  const mmvsVisualPinned=new Set();
  function mmvsVisualStackSchedule(){
    clearTimeout(mmvsVisualStackTimer);
    mmvsVisualStackTimer=setTimeout(mmvsVisualStackRender,110);
  }
  function mmvsVisualStackPeers(){
    if(!selected)return [];
    const saved=savedFor(selected);
    if(saved.renderPlane==='free'){
      const free=doc.items.filter(x=>x.renderPlane==='free');
      return free.map((x,i)=>({selector:x.selector,z:x.rank??i+1,dom:i,free:true}));
    }
    return mmvsLayerPeers()||[];
  }
  function mmvsVisualStackCommit(topOrder){
    if(loading||publishing||reviewLayout||groupMode&&groupSelection.length>1||false){
      toast('در حالت انتشار، بازبینی یا انتخاب چندتایی نمی‌توان ترتیب را تغییر داد.',true);return false;
    }
    const peers=mmvsVisualStackPeers();
    if(peers.length<2||peers.length!==topOrder.length)return false;
    const allowed=new Set(peers.map(p=>p.selector));
    if(topOrder.some(x=>!allowed.has(x.selector)||savedFor(x.selector).locked)||new Set(topOrder.map(x=>x.selector)).size!==peers.length){
      toast('ترتیب نامعتبر است یا یکی از آبجکت‌ها قفل شده.',true);return false;
    }
    if(peers.some(x=>x.free)){
      // Rank 1 is behind; the first visual card is in front.
      for(const [i,item] of [...topOrder].reverse().entries()){
        const at=doc.items.findIndex(x=>x.selector===item.selector);
        if(at<0)return false;
        doc.items[at]=normalize({...doc.items[at],rank:i+1});
      }
      renderProps();state();preview();
      toast('ترتیب سطح آزاد تغییر کرد؛ برای ماندگاری ذخیره و منتشر کن.');
    }else if(!mmvsApplySafeLayerOrder([...topOrder].reverse()))return false;
    mmvsVisualStackSchedule();
    return true;
  }
  function mmvsVisualStackMove(source,target,side){
    if(!source||!target||source===target)return;
    const visual=[...mmvsVisualStackPeers()].sort((a,b)=>b.z-a.z||b.dom-a.dom);
    const from=visual.findIndex(x=>x.selector===source);
    if(from<0||!visual.some(x=>x.selector===target))return toast('لایه‌های انتخابی در یک سطح قابل‌جابه‌جایی نیستند.',true);
    const [moving]=visual.splice(from,1);
    const dest=visual.findIndex(x=>x.selector===target);
    if(dest<0)return;
    visual.splice(dest+(side==='below'?1:0),0,moving);
    mmvsVisualStackCommit(visual);
  }
  function mmvsVisualStackStep(source,dir){
    const visual=[...mmvsVisualStackPeers()].sort((a,b)=>b.z-a.z||b.dom-a.dom);
    const i=visual.findIndex(x=>x.selector===source),j=i+dir;
    if(i<0||j<0||j>=visual.length)return toast('در این جهت لایه دیگری وجود ندارد.');
    [visual[i],visual[j]]=[visual[j],visual[i]];
    mmvsVisualStackCommit(visual);
  }
  // MMVS_R93_GLOBAL_HTML_STACK: list the whole iframe DOM, independently of selection.
  // Reordering deliberately remains restricted to safe CSS stacking peers.
  let mmvsGlobalStackLimit=180;
  function mmvsVisualStackRender(){
    const root=$('mmvs-visual-stack-list'),status=$('mmvs-visual-stack-status');
    if(!root||!status)return;
    const frame=$('frame');let d=null;
    try{d=frame?.contentDocument}catch(_e){}
    if(!d?.body){root.replaceChildren();status.textContent='صفحه هنوز برای خواندن HTML آماده نیست.';return;}
    const shell=$('mmvs-visual-stack');
    if(shell){
      const summary=shell.querySelector(':scope > summary');
      if(summary)summary.textContent='▤ تمام عناصر HTML · لایه‌بندی سراسری';
      const top=shell.querySelector('.mmvs-visual-stack-top span');
      if(top)top.textContent='نمایش همه عناصر؛ جابه‌جایی فقط بین لایه‌های سازگار';
      const help=shell.querySelector('.mmvs-visual-stack-note');
      if(help)help.textContent='این فهرست مستقل از آبجکت انتخاب‌شده، تمام عناصر HTML را نشان می‌دهد. ترتیب درخت HTML الزاماً ترتیب روی‌هم‌افتادن نیست. دکمه‌های جلو/عقب و «زیر این» فقط در یک CSS Stacking Context مشترک فعال‌اند؛ عناصر والد یا ایزوله را نمی‌توان مستقلاً جابه‌جا کرد.';
    }
    let search=$('mmvs-global-stack-search');
    if(!search){
      search=document.createElement('input');search.id='mmvs-global-stack-search';search.type='search';
      search.placeholder='جستجو در تمام HTML: دکمه، تصویر، کلاس، متن...';
      search.setAttribute('aria-label','جستجوی سراسری تمام عناصر HTML');
      search.style.cssText='display:block;width:100%;box-sizing:border-box;min-width:0;margin:8px 0;padding:9px;border:1px solid #387d61;border-radius:8px;background:#061d17;color:#e0ffeb;font:inherit;';
      root.before(search);
      search.addEventListener('input',()=>{mmvsGlobalStackLimit=180;root.scrollTop=0;mmvsVisualStackSchedule()});
    }
    let unlock=$('mmvs-r94-unlock-all');
    if(!unlock){unlock=document.createElement('button');unlock.id='mmvs-r94-unlock-all';unlock.type='button';unlock.className='minor';unlock.style.cssText='margin:4px 0 9px;max-width:100%;white-space:normal;';search.after(unlock);
      unlock.onclick=()=>{if(loading||publishing||reviewLayout||false)return toast('در زمان بارگذاری، انتشار یا بازبینی تاریخی، قفل‌ها قابل تغییر نیستند.',true);
        const locks=doc.items.filter(x=>x.locked===true);if(!locks.length)return;
        if(!confirm('قفل '+locks.length+' آبجکت از چیدمان Draft برداشته شود؟'))return;
        for(const x of locks)delete x.locked;renderProps();state();preview();mmvsVisualStackSchedule();toast('قفل‌ها برداشته شد؛ Draft را ذخیره کن.');};}
    const count=doc.items.filter(x=>x.locked===true).length;unlock.textContent=count?'🔓 بازکردن قفل '+count+' آبجکت':'🔓 قفل ذخیره‌شده‌ای وجود ندارد';unlock.disabled=!count||loading||publishing||!!reviewLayout;
    const query=search.value.trim().toLocaleLowerCase();
    const all=[d.documentElement,d.body,...d.body.querySelectorAll('*')];
    const excluded='script,style,template,noscript,link,meta,source,track,svg *,#mmvs-spatial-overlay,#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-overlay,#mmvs-v2-image-plane';
    const elements=[];
    for(const el of all){
      if(el.matches(excluded)||el.closest('#mmvs-spatial-overlay,#mmvs-spatial-outline,#mmvs-spatial-toolbar,#mmvs-overlay,#mmvs-v2-image-plane'))continue;
      const tag=el.tagName.toLowerCase();
      const name=el.id?'#'+el.id:'';
      const cls=typeof el.className==='string'?el.className.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>'.'+x).join(''):'';
      const title=String(el.getAttribute('aria-label')||el.getAttribute('alt')||el.getAttribute('title')||(!el.children.length?el.textContent:'')||'').trim().slice(0,55);
      const label=tag+name+cls+(title?' · '+title:'');
      if(query&&!label.toLocaleLowerCase().includes(query))continue;
      elements.push({el,tag,label});
    }
    const peers=mmvsVisualStackPeers(),byElement=new Map();
    for(const p of peers){let el=null;try{el=mmvsDomGet(p.selector,d)}catch(_e){}if(el)byElement.set(el,p)}
    const order=[...peers].sort((a,b)=>b.z-a.z||b.dom-a.dom);
    const selectedEl=selected?mmvsDomGet(selected,d):null;
    const topCount=Math.min(mmvsGlobalStackLimit,elements.length);
    status.textContent='کل عناصر HTML: '+all.length+' · نتیجه: '+elements.length+' · نمایش: '+topCount+' · لایه‌های قابل جابه‌جاییِ انتخاب فعلی: '+peers.length;
    const oldScroll=root.scrollTop,fragment=document.createDocumentFragment();
    for(let i=0;i<topCount;i++){
      const {el,tag,label}=elements[i];
      const selector=el===d.documentElement?'html':el===d.body?'body':mmvsDomSelector(el,d);
      let resolved=null;try{resolved=selector?mmvsDomGet(selector,d):null}catch(_e){}
      const valid=!!selector&&resolved===el&&!prohibited(selector)&&!mmvsR11RootSelector(selector)&&!['html','body'].includes(selector);
      const peer=byElement.get(el),pos=peer?order.findIndex(x=>x.selector===peer.selector):-1;
      const chosen=el===selectedEl,locked=valid&&savedFor(selector).locked;
      const row=document.createElement('div');row.className='mmvs-visual-stack-row'+(chosen?' is-selected':'');
      row.dataset.selector=valid?selector:'';row.draggable=!!valid&&!locked;
      const depth=(()=>{let node=el,k=0;while(node&&node!==d.body&&node!==d.documentElement&&k<12){node=node.parentElement;k++}return k})();
      const pick=document.createElement('button');pick.type='button';pick.className='mmvs-visual-stack-pick';
      pick.style.paddingInlineStart=(4+depth*7)+'px';pick.title=selector||label;
      const title=document.createElement('span');title.className='mmvs-visual-stack-title';title.textContent=label.slice(0,95);
      const desc=document.createElement('span');desc.className='mmvs-visual-stack-desc';
      const z=valid?doc.items.find(x=>x.selector===selector)?.zIndex:null;
      const css=d.defaultView?.getComputedStyle(el);
      desc.textContent='<'+tag+'> · Z '+(Number.isInteger(z)?z:(css?.zIndex||'auto'))+(chosen?' · انتخاب‌شده':'')+(locked?' · قفل':'')+(peer?' · هم‌سطح':' · محدودیت CSS');
      pick.append(title,desc);pick.disabled=!valid;
      pick.onclick=()=>{choose(selector);send('MMVS_SPATIAL_REVEAL',{selector})};
      const actions=document.createElement('span');actions.className='mmvs-visual-stack-actions';
      const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='جلوتر در محدوده CSS مشترک';
      up.disabled=pos<1||locked;up.onclick=()=>{choose(selector);mmvsVisualStackStep(selector,-1)};
      const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='عقب‌تر در محدوده CSS مشترک';
      down.disabled=pos<0||pos===order.length-1||locked;down.onclick=()=>{choose(selector);mmvsVisualStackStep(selector,1)};
      const below=document.createElement('button');below.type='button';below.textContent='زیر این';
      below.title='آبجکت انتخاب‌شده را زیر این آیتم هم‌سطح قرار بده';
      below.disabled=!selected||!peer||selector===selected||locked||!!savedFor(selected).locked;
      below.onclick=()=>mmvsVisualStackMove(selected,selector,'below');
      if(valid&&el.tagName==='IMG'&&el.matches('#mmvs-managed-content .mmvs-c-block > img, #mmvs-managed-content .mmvs-c-image > img')){
        const back=document.createElement('button');back.type='button';back.title='تصویر کتابخانه را به پس‌زمینه صفحه منتقل کن';back.textContent=savedFor(selector).layerId===mmvsUnderlayKey?'↩ روی صفحه':'⬇ پشت کل محتوا';back.disabled=locked||loading||publishing||!!reviewLayout;
        back.onclick=()=>{choose(selector);mmvsUnderlayToggle();mmvsVisualStackSchedule()};actions.append(back);
      }
      actions.append(up,down,below);row.append(pick,actions);
      row.ondragstart=e=>{if(!valid||locked){e.preventDefault();return}mmvsVisualDrag=selector;e.dataTransfer?.setData('text/plain',selector);if(e.dataTransfer)e.dataTransfer.effectAllowed='move'};
      row.ondragover=e=>{if(mmvsVisualDrag&&mmvsVisualDrag!==selector){e.preventDefault();row.classList.add('is-drop-target')}};
      row.ondragleave=()=>row.classList.remove('is-drop-target');
      row.ondrop=e=>{e.preventDefault();row.classList.remove('is-drop-target');const from=mmvsVisualDrag;mmvsVisualDrag='';
        if(from&&selector&&from!==selector){choose(from);mmvsVisualStackMove(from,selector,'below')}};
      row.ondragend=()=>{mmvsVisualDrag='';root.querySelectorAll('.is-drop-target').forEach(x=>x.classList.remove('is-drop-target'))};
      fragment.append(row);
    }
    if(topCount<elements.length){
      const more=document.createElement('button');more.type='button';more.className='minor';
      more.textContent='نمایش '+Math.min(180,elements.length-topCount)+' آیتم بعدی از '+elements.length;
      more.onclick=()=>{mmvsGlobalStackLimit+=180;mmvsVisualStackRender()};fragment.append(more);
    }
    root.replaceChildren(fragment);root.scrollTop=oldScroll;
  }

  // MMVS_LAYER_ORDER_R1C: rank same-parent editable peers. z-index is NOT a step counter.
  function mmvsLayerOrdered(peers, selector, action){
    const ordered=[...peers].sort((a,b)=>a.z-b.z||a.dom-b.dom);
    const i=ordered.findIndex(x=>x.selector===selector);
    if(i<0)return null;
    let j=i;
    if(action==='forward')j=Math.min(i+1,ordered.length-1);
    else if(action==='backward')j=Math.max(i-1,0);
    else if(action==='front')j=ordered.length-1;
    else if(action==='back')j=0;
    else return null;
    if(i===j)return null;
    const [moving]=ordered.splice(i,1);
    ordered.splice(j,0,moving);
    return ordered;
  }
  // MMVS_STACK_CONTEXT_R1H: independent DOM parents can still be in the SAME
  // CSS stacking context. Compare the actual context, not parentElement.
  // Do not lift isolated children across a stacking-context boundary: doing so
  // would require restacking their parent, which moves other objects as well.
  function mmvsCreatesStackingContext(node, view, documentInFrame){
    if(node===documentInFrame.documentElement)return true;
    const css=view.getComputedStyle(node);
    const pos=css.position;
    if(pos==='fixed'||pos==='sticky')return true;
    if(css.zIndex&&css.zIndex!=='auto'){
      if(pos!=='static')return true;
      const parent=node.parentElement;
      if(parent){const d=view.getComputedStyle(parent).display;
        if(/(?:^|\s)(?:flex|inline-flex|grid|inline-grid)(?:\s|$)/.test(d))return true;
      }
    }
    if(Number(css.opacity)<1)return true;
    if((css.transform&&css.transform!=='none')||(css.translate&&css.translate!=='none')||(css.scale&&css.scale!=='none')||(css.rotate&&css.rotate!=='none'))return true;
    if((css.filter&&css.filter!=='none')||(css.backdropFilter&&css.backdropFilter!=='none')||(css.perspective&&css.perspective!=='none'))return true;
    if(css.isolation==='isolate'||(css.mixBlendMode&&css.mixBlendMode!=='normal'))return true;
    if((css.clipPath&&css.clipPath!=='none')||(css.maskImage&&css.maskImage!=='none')||(css.mask&&css.mask!=='none'))return true;
    if(css.containerType&&css.containerType!=='normal')return true;
    if(/(?:paint|layout|strict|content)/.test(css.contain||''))return true;
    if(/(?:transform|opacity|filter|perspective|clip-path|mask|translate|scale|rotate)/.test(css.willChange||''))return true;
    return false;
  }
  function mmvsStackingParent(node,view,documentInFrame){
    for(let ancestor=node?.parentElement;ancestor;ancestor=ancestor.parentElement){
      if(mmvsCreatesStackingContext(ancestor,view,documentInFrame))return ancestor;
    }
    return documentInFrame.documentElement;
  }
  function mmvsLayerPeers(){
    const frame=$('frame');let documentInFrame=null;
    try{documentInFrame=frame?.contentDocument}catch(_e){}
    if(!documentInFrame)return null;
    const view=documentInFrame.defaultView;
    if(!view)return null;
    let chosen;
    try{chosen=documentInFrame.querySelector(selected)}catch(_e){return null}
    if(!chosen?.parentElement)return null;
    const chosenStyle=view.getComputedStyle(chosen);
    if(chosenStyle.display==='none'||chosenStyle.visibility==='hidden'||chosenStyle.position==='fixed')return null;
    const context=mmvsStackingParent(chosen,view,documentInFrame);
    const byNode=new Map();
    // Surface explicit DOM selections and direct sibling elements as candidates.
    const siblings=Array.from(chosen.parentElement.children).slice(0,50)
      .map(el=>mmvsDomSelector(el,documentInFrame)).filter(Boolean);
    for(const s of new Set([selected,...mmvsVisualPinned,...siblings,...layerItems.map(x=>x.selector),...doc.items.map(x=>x.selector)])){
      if(typeof s!=='string'||s.length>500||s==='html'||mmvsR11RootSelector(s)||prohibited(s))continue;
      let node;
      try{node=documentInFrame.querySelector(s)}catch(_e){continue}
      if(!node||byNode.has(node))continue;
      // Ancestor and descendant are not independently reorderable peers.
      if(node!==chosen&&(node.contains(chosen)||chosen.contains(node)))continue;
      const css=view.getComputedStyle(node);
      if(css.display==='none'||css.visibility==='hidden'||css.position==='fixed')continue;
      const rect=node.getBoundingClientRect();
      if(rect.width<2||rect.height<2)continue;
      if(mmvsStackingParent(node,view,documentInFrame)!==context)continue;
      // MMVS_R8_4_LAYER_ORDER_FIX: use draft rank, not stale iframe CSS.
      const draftRank=doc.items.find(item=>item.selector===s)?.zIndex;
      const computedRank=Number.parseInt(css.zIndex,10);
      const z=Number.isInteger(draftRank)?draftRank:(Number.isFinite(computedRank)?computedRank:0);
      byNode.set(node,{selector:s,z,dom:0,node});
    }
    // Do not accidentally normalize both a visual wrapper and its visual child.
    // Prefer the wrapper, unless the selected item is that child.
    const nodes=[...byNode.keys()];
    for(const outer of nodes){
      if(outer===chosen||!byNode.has(outer))continue;
      for(const inner of nodes){
        if(inner!==chosen&&inner!==outer&&byNode.has(inner)&&outer.contains(inner))byNode.delete(inner);
      }
    }
    const result=[...byNode.values()].sort((a,b)=>{
      const relative=a.node.compareDocumentPosition(b.node);
      if(relative&4)return -1; // DOCUMENT_POSITION_FOLLOWING
      if(relative&2)return 1; // DOCUMENT_POSITION_PRECEDING
      return 0;
    });
    for(const [index,item] of result.entries()){
      item.dom=index;
      delete item.node;
    }
    if(result.length<2||result.length>64||!result.some(x=>x.selector===selected))return null;
    return result;
  }
  // MMVS_SAFE_LAYER_R1E: layer field means a sibling rank, NOT raw CSS z-index.
  // Rank peers using positive values only; never create z:-1 or z:0.
  function mmvsApplySafeLayerOrder(order){
    if(!Array.isArray(order)||order.length<2)return false;
    if(order.some(x=>savedFor(x.selector).locked)){
      toast('یکی از لایه‌های هم‌سطح قفل است؛ ترتیب آن‌ها را تغییر ندادم.',true);return false;
    }
    const required=order.filter(x=>!doc.items.some(p=>p.selector===x.selector)).length;
    if(doc.items.length+required>500){toast('ظرفیت ذخیره چیدمان کافی نیست.',true);return false}
    // Plan a complete batch before mutating document to prevent half-reordered layers.
    const updates=order.map((peer,index)=>normalize({...savedFor(peer.selector),zIndex:index+1}));
    if(updates.some(x=>!x))return false;
    const next=[...doc.items];
    for(const fixed of updates){
      const at=next.findIndex(x=>x.selector===fixed.selector);
      if(at<0)next.push(fixed);else next[at]=fixed;
    }
    doc.items=next;
    renderProps();state();preview();mmvsVisualStackSchedule();
    toast(`ترتیب ${order.length} لایه هم‌سطح امن تنظیم شد؛ برای نمایش کاربران ذخیره و منتشر کن.`);
    return true;
  }
  function mmvsSafeRankOrder(peers,s,rank){
    if(!Number.isInteger(rank))return null;
    const order=[...peers].sort((a,b)=>a.z-b.z||a.dom-b.dom);
    const from=order.findIndex(x=>x.selector===s);
    if(from<0)return null;
    // -1 and 0 map to the safe backmost position, never to CSS negative or zero.
    const desired=rank<=0?0:Math.min(rank-1,order.length-1);
    const [item]=order.splice(from,1);
    order.splice(desired,0,item);
    return order;
  }
  function mmvsSetSafeLayerRank(rank){
    if(!selected||loading||publishing||reviewLayout||groupMode&&groupSelection.length>1)return;
    if(savedFor(selected).locked){toast('ابتدا قفل لایه را باز کن.',true);return}
    const peers=mmvsLayerPeers();
    if(!peers){
      toast('آبجکت هم‌لایه در زمینهٔ مشترک پیدا نشد. لایه‌های دارای والد ایزوله را نمی‌توان مستقل از گروه والد جابه‌جا کرد.',true);
      renderProps();return;
    }
    const order=mmvsSafeRankOrder(peers,selected,rank);
    if(!order)return;
    mmvsApplySafeLayerOrder(order);
  }
  function layer(action){
    if(!selected||loading||publishing||reviewLayout||groupMode&&groupSelection.length>1)return;
    // MMVS_R94_LIBRARY_BACKMOST
    const target=underlayImage();
    if(target&&action==='back'){
      if(savedFor(target).layerId===mmvsUnderlayKey)
        return toast('تصویر پشت صفحه تنظیم شده.');
      mmvsUnderlayToggle();return;
    }
    if(target&&action==='front'
      &&savedFor(target).layerId===mmvsUnderlayKey){
      mmvsUnderlayToggle();return;
    }
    if(current().renderPlane==='free'){mmvsV2FreeOrder(action);return;}
    if(savedFor(selected).locked){toast('ابتدا قفل لایه را باز کن.',true);return}
    const peers=mmvsLayerPeers();
    if(!peers){toast('آبجکت هم‌لایه در زمینهٔ مشترک پیدا نشد. لایه‌های دارای والد ایزوله را نمی‌توان مستقل از گروه والد جابه‌جا کرد.',true);return}
    const order=mmvsLayerOrdered(peers,selected,action);
    if(!order){toast('این لایه در ابتدای یا انتهای ترتیب هم‌سطح‌های خود قرار دارد.');return}
    mmvsApplySafeLayerOrder(order);
  }
  function nudge(dx,dy,step=1){if(groupMove(dx*step,dy*step))return;edit(p=>{p.x=clamp(p.x+dx*step,-4000,4000);p.y=clamp(p.y+dy*step,-4000,4000)})}
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
    const id=++session;mmvsVisualPinned.clear();page=slug;loading=true;selected='';groupSelection=[];groupMode=false;groupSync();overlapItems=[];layerItems=[];state();
    let result;try{result=await api('')}catch(e){loading=false;state();throw e}
    if(id!==session)return;
    revision=result.revision;
    published=clone(result.published||{items:[]});draft=result.draft?clone(result.draft):null;
    history=Array.isArray(result.history)?result.history:[];
    doc.items=clone(draft||published).items||[];doc.domMoves=clone(draft||published).domMoves||[];
    initial=JSON.stringify(doc);loading=false;state();renderProps();renderBoundary();preview();drawHistory();mmvsVisualStackSchedule();
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
    // MMVS mobile compact mode R2: collapse spatial controls by default on phones.
    const compactPanel = $('spatial-panel');
    const compactToggle = $('spatial-collapse-toggle');
    if (compactPanel && compactToggle) {
      const mobileViewport = window.matchMedia ? window.matchMedia('(max-width: 650px)') : null;
      const syncCompactButton = () => {
        const collapsed = compactPanel.classList.contains('is-mobile-collapsed');
        compactToggle.textContent = collapsed ? 'نمایش ابزارها' : 'جمع‌کردن ابزارها';
        compactToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      };
      const syncCompactViewport = () => {
        if (mobileViewport && mobileViewport.matches) compactPanel.classList.add('is-mobile-collapsed');
        else compactPanel.classList.remove('is-mobile-collapsed');
        syncCompactButton();
      };
      compactToggle.addEventListener('click', () => {
        compactPanel.classList.toggle('is-mobile-collapsed');
        syncCompactButton();
      });
      syncCompactViewport();
      if (mobileViewport) {
        if (mobileViewport.addEventListener) mobileViewport.addEventListener('change', syncCompactViewport);
        else if (mobileViewport.addListener) mobileViewport.addListener(syncCompactViewport);
      }
    }
    $('spatial-layer-search')?.addEventListener('input',renderLayers);
    $('mmvs-dom-search')?.addEventListener('input',mmvsDomSchedule);
    $('mmvs-dom-refresh')?.addEventListener('click',mmvsDomRefresh);
    $('mmvs-visual-stack-refresh')?.addEventListener('click',mmvsVisualStackRender);
    $('mmvs-dom-move-up')?.addEventListener('click',()=>mmvsDomStep(-1));
    $('mmvs-dom-move-down')?.addEventListener('click',()=>mmvsDomStep(1));
    $('mmvs-dom-move-after')?.addEventListener('click',()=>mmvsDomSetPending('after'));
    $('mmvs-dom-move-inside')?.addEventListener('click',()=>mmvsDomSetPending('inside'));
    $('mmvs-dom-move-cancel')?.addEventListener('click',mmvsDomCancel);
    $('mmvs-dom-move-reset')?.addEventListener('click',mmvsDomUnmove);
    $('spatial-layer-refresh').onclick=scanLayers;
    $('spatial-multi-mode').onclick=()=>{if(loading||publishing||reviewLayout)return;if(compactPanel?.classList.contains('is-mobile-collapsed')){compactPanel.classList.remove('is-mobile-collapsed');compactToggle.textContent='جمع‌کردن ابزارها';compactToggle.setAttribute('aria-expanded','true')}if(!groupMode&&!mode)$('spatial-mode').click();groupMode=!groupMode;groupSelection=groupMode&&selected?[selected]:[];groupSet(groupSelection)};
    $('spatial-multi-clear').onclick=()=>groupSet([]);
    const modeBtn=$('spatial-mode');modeBtn.onclick=()=>{
      if(loading||publishing||reviewLayout)return toast('در حال ذخیره یا بازبینی، جابه‌جایی امکان‌پذیر نیست.',true);
      mode=!mode;modeBtn.classList.toggle('active',mode);
      modeBtn.textContent=mode?'✋ جابه‌جایی روشن':'✋ فعال‌سازی جابه‌جایی';
      send('MMVS_SPATIAL_MODE',{enabled:reviewLayout?false:mode,grid});
      toast(mode?'برای ویرایش، روی عنصر بزن؛ منوی شناور و دستگیره ظاهر می‌شوند.':'حالت پیمایش عادی صفحه فعال شد.');
    };
    $('spatial-grid').onchange=e=>{grid=e.target.checked;send('MMVS_SPATIAL_MODE',{enabled:mode,grid})};
    $('spatial-boundary-enabled').onchange=e=>setBoundary(e.target.checked,$('spatial-boundary-height').value);
    $('spatial-boundary-height').addEventListener('change',()=>{if($('spatial-boundary-enabled').checked)setBoundary(true,$('spatial-boundary-height').value)});
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
    for(const axis of ['width','height']){
      const el=$('spatial-'+axis);
      el.addEventListener('input',()=>{
        const n=Number(el.value);if(!Number.isFinite(n))return;
        edit(p=>{p[axis+'Px']=n});
      });
    }
    for(const [axis,min] of [['width',24],['height',16]]){
      const num=$('spatial-'+axis+'-number');
      num.addEventListener('change',()=>{
        if(!num.value.trim())return renderProps();
        const n=Number(num.value);
        if(!Number.isInteger(n)||n<min||n>1600){toast('مقدار باید عدد صحیح بین '+min+' و ۱۶۰۰ باشد.',true);renderProps();return}
        edit(p=>{p[axis+'Px']=n});
      });
    }
    $('spatial-size-reset').onclick=()=>edit(p=>{delete p.widthPx;delete p.heightPx});
    $('spatial-v2-plane').onclick=mmvsV2Toggle;
    $('spatial-underlay').onclick=mmvsUnderlayToggle;
    $('spatial-z').addEventListener('change',()=>{
      const value=$('spatial-z').value.trim();
      if(current().renderPlane==='free'){const n=Number(value);if(!value||!Number.isInteger(n)||n<1||n>500){renderProps();return toast('رتبه تصویر آزاد باید بین ۱ تا ۵۰۰ باشد.',true)}mmvsV2FreeRank(n);return;}
      if(!value){
        // Explicit reset to natural DOM stacking, not the same as rank zero.
        edit(p=>{delete p.zIndex});
        toast('رتبه دستی حذف شد؛ ترتیب طبیعی DOM برگشت. برای عقب‌ترین جایگاه امن، ۰ را وارد کن.');
        return;
      }
      const n=Number(value);
      if(!Number.isInteger(n)||n<-1000||n>20000){
        toast('رتبه باید عدد صحیح از ۱۰۰۰- تا ۲۰۰۰۰ باشد.',true);
        renderProps();return;
      }
      mmvsSetSafeLayerRank(n);
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
      }else if(d.type==='MMVS_SPATIAL_GROUP_SELECTED'&&groupMode&&Array.isArray(d.selectors)){
        groupSet(d.selectors);
      }else if(d.type==='MMVS_SPATIAL_GROUP_COMMIT'){
        groupCommit(d.items);
      }else if(d.type==='MMVS_SPATIAL_LAYERS'){
        layerItems=Array.isArray(d.items)?d.items.filter(x=>x&&typeof x.selector==='string'&&typeof x.label==='string').slice(0,350):[];renderLayers();mmvsDomSchedule();
      }else if(d.type==='MMVS_UNDERLAY_APPLIED'){toast('✅ تصویر پشت محتوا اعمال شد؛ Draft را ذخیره کن.');
      }else if(d.type==='MMVS_UNDERLAY_UNAVAILABLE'){toast('برای این تصویر ظرف پس‌زمینه مناسب پیدا نشد؛ تغییری در نمایش اعمال نشد.',true);
      }else if(d.type==='MMVS_SPATIAL_OVERLAPS'){
        if(d.selector===selected){overlapItems=Array.isArray(d.items)?d.items.slice(0,28):[];renderOverlap()}
      }else if(d.type==='MMVS_SELECT' && !mode && d.element?.selector){
        choose(d.element.selector);
      }else if(d.type==='MMVS_SPATIAL_SELECTED' && d.item?.selector){
        if(groupMode)return;
        if(mmvsR11RootSelector(d.item.selector))return;
        choose(d.item.selector);touchedSelection=d.item;
      }else if(d.type==='MMVS_SPATIAL_COMMIT' && d.item?.selector){
        if(!mode||loading||publishing||!!reviewLayout||savedFor(d.item.selector).locked)return;
        put({...savedFor(d.item.selector),...d.item},false);
      }else if(d.type==='MMVS_SPATIAL_ACTION'){
        if(d.selector!==selected)choose(d.selector);
        switch(d.action){
          case 'underlay':mmvsUnderlayToggle();break;
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
  function start(){bind();groupSync();if(window.matchMedia('(max-width:650px)').matches)$('spatial-tools').open=false;state();renderProps();renderBoundary();$('frame')?.addEventListener('load',()=>{ready=true;preview();mmvsDomSchedule()})}
  window.MMVS_Spatial={review:layout=>{reviewLayout=layout?clone(layout):null;preview();state();renderProps()},getDraftLayout:()=>clone(doc),getSelected:()=>selected,
    getSectionBackground:s=>clone(doc.items.find(x=>x.selector===s)?.sectionBackground||null),
    setSectionBackground:(s,bg)=>mmvsBgChange(s,bg),
    clearSectionBackground:s=>mmvsBgChange(s,null),loadPage:load,saveIfDirty:save,publishIfPending:publish,
    hasPending:()=>Boolean(dirty||draft),refresh:preview,isDirty:()=>JSON.stringify(doc)!==initial,
    acceptPublished:next=>{if(Number.isInteger(next)){revision=next;published=clone(draft||published);draft=null;state()}},
    isBusy:()=>loading||publishing,getRevision:()=>loading?undefined:revision,setPublishing:value=>{publishing=value;state();renderProps()}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
