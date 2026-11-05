/* P76 dynamic stage editor: 3..8 stage overlays, existing P74 Home draft/publish only. */
(function(){'use strict';if(window.__P74_STUDIO__)return;window.__P74_STUDIO__=true;
const MARK='#p74-home-config',TOKEN='tenx_admin_token';
const SEED=[
 ['شروع چالش','/miniapp/challenge.html'],['آموزش‌های کلیدی','/miniapp/academy.html'],
 ['تمرین و اجرا','/miniapp/challenge.html'],['مدیریت ریسک','/miniapp/copy-trading.html'],
 ['رشد و مقیاس','/miniapp/profile.html'],['ماموریت ششم','/miniapp/challenge.html'],
 ['ماموریت هفتم','/miniapp/challenge.html'],['ماموریت هشتم','/miniapp/challenge.html']];
const DEF={version:74,enabled:true,brand:'MM trade challenge 10x',tagline:'چالش رشد ۱۰ برابری در معاملات',
 heroEyebrow:'ویدیوی معرفی چالش',heroTitle:'چالش MM',heroSubtitle:'رشد ۱۰ برابری',
 journeyTitle:'مسیر 10X تو از اینجا شروع می‌شود',journeySubtitle:'یک مسیر مرحله‌به‌مرحله برای رشد مهارت، اعتمادبه‌نفس و سرمایه',
 videoUrl:'https://dl.namahub.ir/parsahojabrian/W0OGUlGh',videoDuration:'07:46',
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
async function api(route,options={}){if(!token())throw Error('ابتدا وارد پنل شوید');const r=await fetch('/admin'+route,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+token()}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||d.message||'HTTP '+r.status);return d}
function decodeMarker(blocks){const m=(Array.isArray(blocks)?blocks:[]).filter(b=>b?.type==='element'&&b.selector===MARK);
if(m.length>1)throw Error('تنظیمات تکراری Home');if(!m.length)return null;let v;try{v=JSON.parse(m[0].text)}catch(e){throw Error('تنظیمات ذخیره‌شده معتبر نیست')};if(v.version!==74)throw Error('نسخه تنظیمات ناسازگار');return v}
function normalize(raw){const a=clone(DEF);if(!raw||typeof raw!=='object'){a.steps=a.steps.slice(0,5).map((s,i)=>({...s,position:layout(5)[i]}));return a}
 for(const key of ['enabled','brand','tagline','heroEyebrow','heroTitle','heroSubtitle','journeyTitle','journeySubtitle','videoUrl','videoDuration','progressTitle','progressHref','ctaText','ctaHref'])if(raw[key]!==undefined)a[key]=raw[key];
 a.stepCount=count(raw.stepCount??(Array.isArray(raw.steps)?raw.steps.length:5));
 const auto=layout(a.stepCount);
 a.steps=Array.from({length:a.stepCount},(_,i)=>{const seed=clone(DEF.steps[i]);const v=Array.isArray(raw.steps)?raw.steps[i]:null;return{...seed,...(v||{}),position:{...auto[i],...(v?.position||{})}}});
 if(Array.isArray(raw.nav))a.nav=a.nav.map((v,i)=>({...v,...(raw.nav[i]||{})}));return a}
let modal=null,frame=null,dataLoaded=false,config=null,statusNode=null,form=null,stepZone=null,stageCounter=null;
function status(t,kind=''){if(statusNode){statusNode.textContent=t;statusNode.dataset.state=kind}}
function preview(){if(frame?.contentWindow&&config)frame.contentWindow.postMessage({type:'P74_CONFIG_PREVIEW',config:clone(config)},location.origin)}
function heading(parent,title){const s=el('section','p74admin-group');s.append(el('h3','',title));parent.append(s);return s}
function input(parent,title,obj,key,kind='text',meta={}){
 const lab=el('label','p74admin-field'),node=el('input');lab.append(el('span','',title));
 node.type=kind==='number'?'number':'text';node.value=obj[key]??'';node.autocomplete='off';
 if(kind==='number'){node.min='0';node.max='100';node.step='0.1';node.style.direction='ltr';node.style.textAlign='left'}
 if(kind==='url')node.placeholder='https:// یا /miniapp/...';
 node.addEventListener('input',()=>{obj[key]=kind==='number'?Number(node.value):node.value;preview()});
 if(meta.stepIndex!==undefined)node.dataset.p76key=meta.stepIndex+':'+key;
 lab.append(node);parent.append(lab);return node}
function redrawSteps(){stepZone.replaceChildren();stageCounter.textContent=''+config.stepCount;
 for(let i=0;i<config.stepCount;i++){
 const item=config.steps[i],s=heading(stepZone,'مرحله '+(i+1));
 input(s,'عنوان',item,'title');input(s,'لینک مرحله',item,'href','url');
 const move=el('p','p75-step-help','روی پیش‌نمایش با انگشت بکشید یا عددهای زیر را تغییر دهید');s.append(move);
 for(const [name,label] of [['top','فاصله از بالا (%)'],['right','فاصله از راست (%)'],['width','عرض دکمه (%)'],['height','ارتفاع دکمه (%)']]){
 const field=input(s,label,item.position,name,'number',{stepIndex:i});
 field.addEventListener('change',()=>{item.position[name]=Math.round(clamp(item.position[name],0,100)*100)/100;preview()})
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
 s=heading(form,'مسیر چالش');input(s,'تیتر مسیر',config,'journeyTitle');input(s,'زیرتیتر',config,'journeySubtitle');
 s=heading(form,'تعداد پله‌ها و دکمه‌ها');const tools=el('div','p76-count-controls');
 const less=el('button','','− حذف مرحله آخر');less.type='button';less.addEventListener('click',()=>setCount(config.stepCount-1));
 stageCounter=el('strong','p76-stage-count',String(config.stepCount));const add=el('button','','+ افزودن مرحله');add.type='button';add.addEventListener('click',()=>setCount(config.stepCount+1));
 const auto=el('button','p76-layout-btn','چیدمان خودکار همه');auto.type='button';auto.addEventListener('click',()=>{config.steps.forEach((x,i)=>x.position=layout(config.stepCount)[i]);redrawSteps();preview()});
 tools.append(less,stageCounter,add,auto);s.append(tools);stepZone=el('div','p76-step-zone');form.append(stepZone);redrawSteps();
 s=heading(form,'پیشرفت و CTA');for(const [k,l] of [['progressTitle','عنوان پیشرفت'],['progressHref','لینک پیشرفت'],['ctaText','متن CTA'],['ctaHref','لینک CTA']])input(s,l,config,k,k.toLowerCase().includes('href')?'url':'text');
 s=heading(form,'منوی پایین');for(let i=0;i<3;i++){input(s,'عنوان '+(i+1),config.nav[i],'title');input(s,'لینک '+(i+1),config.nav[i],'href','url')}
}
function receive(e){if(!modal||!frame||e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=='P75_STEP_POSITION')return;
 const i=Number(e.data.step),p=e.data.position;if(!Number.isInteger(i)||i<0||i>=config.stepCount||!p)return;
 config.steps[i].position={...config.steps[i].position,...p};
 for(const k of ['top','right','width','height']){
 const f=form.querySelector(`[data-p76key="${i}:${k}"]`);if(f&&p[k]!==undefined)f.value=String(p[k])
 }
 status('موقعیت دکمه '+(i+1)+' تغییر کرد؛ ذخیره و انتشار را انجام دهید.','ok')
}
function close(){modal?.remove();modal=null;frame=null;dataLoaded=false;config=null;window.removeEventListener('message',receive);document.removeEventListener('keydown',keyesc)}
function keyesc(e){if(e.key==='Escape')close()}
function validate(){if(!config||config.steps.length!==config.stepCount)throw Error('تعداد دکمه‌ها با پله‌ها برابر نیست');
 for(const s of config.steps){if(!String(s.title||'').trim())throw Error('عنوان مرحله خالی است');urlValid(s.href);
 const p=s.position;if(!p)throw Error('موقعیت مرحله تعریف نشده');for(const k of ['top','right','width','height'])if(!Number.isFinite(Number(p[k])))throw Error('موقعیت دکمه نامعتبر است');
 if(p.width<22||p.width>85||p.height<7||p.height>18||p.top<0||p.right<0||p.top+p.height>100||p.right+p.width>100)throw Error('یک دکمه خارج از محدوده تصویر است')}
 for(const s of config.nav)urlValid(s.href);urlValid(config.ctaHref);urlValid(config.progressHref);urlValid(config.videoUrl);return clone(config)}
async function saveDraft(){if(!dataLoaded)throw Error('اطلاعات صفحه هنوز بارگذاری نشده');const d=await api('/content/pages/index/editor');const arr=Array.isArray(d.blocks)?d.blocks:[];decodeMarker(arr);const other=arr.filter(b=>!(b?.type==='element'&&b.selector===MARK));if(other.length>=40)throw Error('ظرفیت بلاک‌های صفحه پر شده');
 const final=validate();final.version=74;other.push({type:'element',selector:MARK,text:JSON.stringify(final)});
 await api('/content/pages/index/draft',{method:'PUT',body:JSON.stringify({title:d.title||null,blocks:other})});return final}
async function open(){if(modal)close();config=normalize(null);modal=el('div','p74admin-backdrop');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const box=el('section','p74admin-panel'),head=el('header','p74admin-head');head.append(el('strong','','P76 • ویرایش کوه و دکمه‌ها'));const x=el('button','p74admin-close','بستن ✕');x.onclick=close;head.append(x);box.append(head);
 box.append(el('p','p74admin-info','۳ تا ۸ مرحله؛ با افزودن/حذف دکمه، پس‌زمینه متناسب خودکار عوض می‌شود. ارتفاع و جای هر دکمه قابل ویرایش است.'));
 const panel=el('div','p74admin-layout'),aside=el('div','p74admin-form'),screen=el('div','p74admin-screen');panel.append(aside,screen);box.append(panel);form=aside;
 frame=el('iframe','p74admin-preview');frame.src='/miniapp/p74/preview.html?p74Preview=1&stepEdit=1';frame.title='پیش‌نمایش زنده ۳ تا ۸ پله';frame.addEventListener('load',preview);screen.append(frame);
 screen.append(el('div','p74admin-hint','بکشید و رها کنید؛ موقعیت‌ها به نسبت تصویر ثبت می‌شوند.'));rebuild();
 const acts=el('div','p74admin-actions'),save=el('button','','ذخیره پیش‌نویس'),publish=el('button','p74admin-primary','انتشار برای کاربران'),reload=el('button','','بارگذاری دوباره');acts.append(save,publish,reload);box.append(acts);statusNode=el('p','p74admin-status','در حال دریافت تنظیمات…');box.append(statusNode);
 modal.append(box);document.body.append(modal);modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',keyesc);window.addEventListener('message',receive);
 const busy=v=>{save.disabled=publish.disabled=reload.disabled=v};
 const load=async()=>{const d=await api('/content/pages/index/editor');config=normalize(decodeMarker(d.blocks));dataLoaded=true;rebuild();preview();status('تنظیمات Home بارگذاری شد؛ تا انتشار روی کاربران اعمال نمی‌شود.','ok')};
 save.onclick=async()=>{busy(true);try{await saveDraft();status('پیش‌نویس ذخیره شد.','ok')}catch(e){status('خطا: '+e.message,'warn')}finally{busy(false)}};
 publish.onclick=async()=>{if(!confirm('پیش‌نویس Home برای کاربران منتشر شود؟'))return;busy(true);try{await saveDraft();await api('/content/pages/index/publish',{method:'POST',body:'{}'});status('نسخه جدید منتشر شد.','ok')}catch(e){status('خطا: '+e.message,'warn')}finally{busy(false)}};
 reload.onclick=async()=>{busy(true);try{await load()}catch(e){status('خطا: '+e.message,'warn')}finally{busy(false)}};
 try{await load()}catch(e){status('خطا در بارگذاری: '+e.message,'warn')}
}
function watch(){const authorized=Boolean(token())&&Boolean(document.getElementById('nav')||document.getElementById('view'));
 const old=document.getElementById('p74-admin-launch');if(authorized&&!old){const b=el('button','','✦ طراحی هوم P76');b.id='p74-admin-launch';b.type='button';b.onclick=open;document.body.append(b)}else if(!authorized&&old)old.remove()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{watch();setInterval(watch,1200)});else{watch();setInterval(watch,1200)}
})();
