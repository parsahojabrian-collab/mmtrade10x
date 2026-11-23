/* MMTRADE_EPLANET_DEPOSIT_VPS_R3: safe fallback for disabled/not-deployed broker engine.
 * Replace R2 script body, do not touch existing ePlanet app.js/R3 email/R5 dialog CSS.
 */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const dialog=$('stepDialog'),submit=$('submitVerification'),description=$('dialogDescription');
 const depositCard=document.querySelector('.step-card[data-step="1"]');
 if(!dialog||!submit||!description||!depositCard)return;
 const wrap=document.createElement('section');
 wrap.id='eplanetDepositR3';
 wrap.className='mmtrade-deposit-r3';
 const heading=document.createElement('strong');
 heading.textContent='بررسی خودکار موجودی ePlanet';
 const message=document.createElement('p');
 message.id='eplanetDepositR3Message';message.setAttribute('role','status');
 const btn=document.createElement('button');
 btn.id='eplanetDepositR3Check';btn.type='button';btn.textContent='بررسی مجدد موجودی';
 const note=document.createElement('p');
 note.className='mmtrade-deposit-r3-note';
 note.textContent='موجودی شما از طریق سرور MMTRADE بررسی می‌شود. این استعلام اثبات تراکنش مشخص نیست.';
 wrap.append(heading,message,btn,note);
 description.insertAdjacentElement('afterend',wrap);
 const css=document.createElement('style');
 css.id='eplanetDepositR3Style';
 css.textContent='.mmtrade-deposit-r3{margin:12px 0;padding:14px;border:1px solid rgba(89,235,194,.30);border-radius:14px;background:rgba(6,28,31,.42);color:#eafff9;direction:rtl}' +
  '.mmtrade-deposit-r3[hidden]{display:none!important}' +
  '.mmtrade-deposit-r3 strong{display:block;font-size:14px;margin:0 0 7px}' +
  '.mmtrade-deposit-r3 p{margin:7px 0;font-size:12px;line-height:1.8}' +
  '.mmtrade-deposit-r3 button{width:100%;min-height:45px;border-radius:11px;border:1px solid rgba(126,239,195,.65);background:linear-gradient(120deg,#075c4c,#11a480);color:white;font-weight:700;cursor:pointer}' +
  '.mmtrade-deposit-r3 button:disabled{opacity:.65;cursor:progress}' +
  '.mmtrade-deposit-r3-note{color:#bbd7d1}';
 document.head.append(css);
 let activeId='',pollTimer=null,inFlight=false,fallback=false,epoch=0;
 function isDeposit(){
  const title=$('dialogTitle')?.textContent||'';
  const expected=depositCard.querySelector('h3')?.textContent||'';
  return dialog.open && depositCard.classList.contains('current') && title===expected;
 }
 function notify(value){message.textContent=value;}
 function stop(){
  ++epoch;
  if(pollTimer!==null)clearTimeout(pollTimer);
  pollTimer=null;inFlight=false;btn.disabled=false;
 }
 function legacy(reason){
  // Fallback is permitted ONLY for endpoint missing / engine disabled / config incomplete.
  // Never bypass ownership, membership, or balance failures when the engine is enabled.
  fallback=true;stop();wrap.hidden=false;submit.hidden=false;
  notify(reason+'؛ برای ادامه می‌توانید درخواست بررسی مدیر را ارسال کنید.');
  btn.hidden=true;
 }
 function render(){
  const open=isDeposit();
  if(!open){wrap.hidden=true;stop();activeId='';fallback=false;btn.hidden=false;return;}
  wrap.hidden=false;
  if(fallback){submit.hidden=false;btn.hidden=true;return;}
  submit.hidden=true;btn.hidden=false;
  if(!inFlight&&!activeId)notify('با دکمه زیر موجودی حساب تأییدشده را استعلام بگیرید.');
 }
 function uuid(){
  const b=new Uint8Array(16);crypto.getRandomValues(b);
  b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const x=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
  return [x.slice(0,8),x.slice(8,12),x.slice(12,16),x.slice(16,20),x.slice(20)].join('-');
 }
 async function call(route,payload){
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),12000);
  try{
   const response=await fetch('/miniapp/eplanet/deposit/'+route,{
    method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',
    cache:'no-store',signal:ctl.signal,
    body:JSON.stringify({initData:window.Telegram?.WebApp?.initData||'',...payload})
   });
   let data={};
   try{data=await response.json()}catch{data={}}
   return {response,data};
  }finally{clearTimeout(t)}
 }
 const human={
  CHECK_QUEUED:'در صف بررسی بروکر…',
  CHECK_RUNNING:'در حال استعلام موجودی…',
  BALANCE_CONFIRMATION_PENDING:'موجودی کافی است؛ تأیید نهایی دوم انجام می‌شود.',
  BALANCE_BELOW_THRESHOLD:'موجودی حساب به حدنصاب موردنیاز نرسیده است.',
  BROKER_PARTNER_MISMATCH:'مالکیت زیرمجموعه MMTRADE تأیید نشد.',
  BROKER_INDETERMINATE:'پاسخ بروکر قطعی نیست؛ تأییدی انجام نشده است.',
  BROKER_TEMPORARILY_UNAVAILABLE:'ارتباط با بروکر موقتاً برقرار نیست.',
  DEPOSIT_VERIFIED:'موجودی تأیید شد و مرحله بعد باز می‌شود.',
  BROKER_CONFIGURATION_ERROR:'تنظیمات API بروکر نیازمند بررسی مدیر است.',
  BROKER_EMAIL_UNVERIFIED:'مالکیت ایمیل ePlanet هنوز به‌صورت معتبر تأیید نشده است.',
  PREVIOUS_STEP_INCOMPLETE:'ابتدا مرحله اول را تکمیل کنید.',
  CHECK_COOLDOWN:'فاصله بین استعلام‌ها رعایت نشده است.',
  CHECK_LIMIT_REACHED:'سقف بررسی‌های امروز تکمیل شده است.',
  TELEGRAM_AUTH_INVALID:'احراز هویت تلگرام نامعتبر است.'
 };
 async function poll(checkId,key){
  if(!isDeposit()||activeId!==key)return;
  try{
   const {response,data}=await call('check/status',{checkId});
   if(activeId!==key||!isDeposit())return;
   if(!response.ok){notify(human[data.code]||'نتیجه بررسی دریافت نشد.');stop();return;}
   const amount=data.result?.availableBalance;
   notify((human[data.code]||'در حال بررسی موجودی…')+
    (typeof amount==='number'&&Number.isFinite(amount)?' · موجودی: '+amount:''));
   if(data.status==='VERIFIED'){
    stop();$('refreshStatus')?.click();return;
   }
   if(['QUEUED','RUNNING','PENDING_CONFIRMATION'].includes(data.status)||
      (data.status==='RETRYABLE_ERROR'&&typeof data.nextCheckAfter==='string')){
    pollTimer=setTimeout(()=>void poll(checkId,key),5000);
   }else{stop();}
  }catch{
   if(activeId===key){notify('دریافت نتیجه با خطا مواجه شد. دوباره بررسی کنید.');stop();}
  }
 }
 btn.addEventListener('click',async()=>{
  if(!isDeposit()||inFlight||fallback)return;
  inFlight=true;btn.disabled=true;
  const key=activeId=uuid(),session=++epoch;
  notify('درخواست استعلام در حال ارسال است…');
  try{
   const {response,data}=await call('check',{requestId:key});
   if(session!==epoch||!isDeposit()||activeId!==key)return;
   if(!response.ok){
    if(response.status===404||response.status===503){
     legacy(response.status===404?'سرویس بررسی موجودی هنوز راه‌اندازی نشده است':
      'موتور بررسی موجودی هنوز فعال یا پیکربندی نشده است');
     return;
    }
    notify(human[data.code]||'ثبت استعلام انجام نشد.');stop();return;
   }
   if(data.code==='DEPOSIT_ALREADY_COMPLETED'){notify('این مرحله قبلاً تأیید شده است.');stop();$('refreshStatus')?.click();return;}
   if(typeof data.checkId!=='string'||!/^depchk_[a-f0-9]{32}$/.test(data.checkId)){
    notify('پاسخ سرور معتبر نیست؛ تأییدی انجام نشد.');stop();return;
   }
   notify('استعلام ثبت شد؛ در حال دریافت پاسخ بروکر…');
   await poll(data.checkId,key);
  }catch{
   if(activeId===key&&session===epoch){notify('ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.');stop();}
  }
 });
 new MutationObserver(render).observe(dialog,{attributes:true,attributeFilter:['open']});
 // Existing app.js runs openStep(i) from buttons/cards; rendering after event catches active step changes.
 document.querySelectorAll('.step-card').forEach(card=>
  card.addEventListener('click',()=>queueMicrotask(render)));
 render();
})();
