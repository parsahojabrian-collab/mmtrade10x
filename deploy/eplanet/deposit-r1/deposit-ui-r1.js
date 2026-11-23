/* MMTRADE_EPLANET_DEPOSIT_UI_R1: isolated UI, no changes to R5 dialog close or existing app.js. */
(()=>{'use strict';
 const dialog=document.getElementById('stepDialog');
 const submit=document.getElementById('submitVerification');
 const desc=document.getElementById('dialogDescription');
 if(!dialog||!submit||!desc)return;
 let timer=null,lastKey='',running=false;
 function depositOpen(){return dialog.open&&
  document.getElementById('dialogTitle')?.textContent===
   document.querySelector('.step-card[data-step="1"] h3')?.textContent;}
 const wrap=document.createElement('section');
 wrap.id='eplanetDepositCheckR1Panel';
 wrap.className='deposit-r1-ui';
 wrap.hidden=true;
 wrap.innerHTML='<div class="deposit-r1-ui-title">بررسی خودکار موجودی ePlanet</div>'+
  '<p id="depositR1Message" role="status">برای استعلام موجودی حساب تأییدشده از دکمه زیر استفاده کنید.</p>'+
  '<button type="button" id="depositR1Button">بررسی مجدد موجودی</button>'+
  '<p class="deposit-r1-ui-note">وضعیت فقط از سرور MMTRADE و بروکر بررسی می‌شود. این بررسی اثبات واریز مشخص نیست.</p>';
 desc.insertAdjacentElement('afterend',wrap);
 const message=document.getElementById('depositR1Message');
 const button=document.getElementById('depositR1Button');
 function say(s){message.textContent=s;}
 function stop(){if(timer)clearTimeout(timer);timer=null;running=false;button.disabled=false;}
 function begin(){
  const isDeposit=depositOpen();
  wrap.hidden=!isDeposit;
  if(isDeposit){
   submit.hidden=true;
   if(!lastKey){say('موجودی به‌صورت امن از بروکر استعلام می‌شود.');}
  }else{stop();lastKey='';}
 }
 function uuid(){
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 }
 async function post(path,payload){
  const controller=new AbortController();const t=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('/miniapp/eplanet/deposit/'+path,{
    method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{'content-type':'application/json'},
    body:JSON.stringify({initData:window.Telegram?.WebApp?.initData||'',...payload})
   });
   const data=await response.json();
   return {response,data};
  }finally{clearTimeout(t);}
 }
 const messages={
  CHECK_QUEUED:'در صف بررسی بروکر…',CHECK_RUNNING:'در حال استعلام موجودی…',
  BALANCE_CONFIRMATION_PENDING:'موجودی کافی است؛ تأیید نهایی خودکار در حال انجام است.',
  BALANCE_BELOW_THRESHOLD:'موجودی فعلی هنوز به حدنصاب تعیین‌شده نرسیده است.',
  BROKER_PARTNER_MISMATCH:'عضویت حساب در زیرمجموعه قابل تأیید نیست.',
  BROKER_INDETERMINATE:'پاسخ بروکر قطعی نیست؛ مرحله دوم تأیید نشده است.',
  BROKER_TEMPORARILY_UNAVAILABLE:'سرویس بروکر موقتاً در دسترس نیست.',
  DEPOSIT_VERIFIED:'موجودی با موفقیت تأیید شد؛ مرحله سوم فعال می‌شود.',
  BROKER_CONFIGURATION_ERROR:'تنظیمات اتصال بروکر نیاز به بررسی مدیر دارد.',
  BROKER_EMAIL_UNVERIFIED:'ایمیل بروکر هنوز به حساب شما به‌صورت معتبر متصل نشده است.',
  PREVIOUS_STEP_INCOMPLETE:'ابتدا مرحله اول باید تأیید شود.',
  ENGINE_DISABLED:'موتور بررسی موجودی هنوز فعال نشده است.',
  BROKER_NOT_CONFIGURED:'تنظیمات بروکر هنوز تکمیل نشده است.',
  CHECK_COOLDOWN:'درخواست زودتر از زمان مجاز ارسال شده است.',
  CHECK_LIMIT_REACHED:'سقف بررسی‌های دستی امروز تکمیل شده است.'
 };
 async function poll(checkId,initKey){
  if(!depositOpen()||lastKey!==initKey){stop();return;}
  try{
   const {response,data}=await post('check/status',{checkId});
   if(!response.ok)throw Error(data.code||'CHECK_FAILED');
   const amount=data.result?.availableBalance;
   say((messages[data.code]||data.code||'در حال بررسی')+
    (typeof amount==='number'?' · موجودی: '+amount:''));
   if(data.status==='VERIFIED'){
    stop();document.getElementById('refreshStatus')?.click();return;
   }
   if(['QUEUED','RUNNING','PENDING_CONFIRMATION','RETRYABLE_ERROR'].includes(data.status)){
    timer=setTimeout(()=>void poll(checkId,initKey),5000);
   }else{stop();}
  }catch{say('خطا در دریافت نتیجه بررسی؛ دوباره تلاش کنید.');stop();}
 }
 button.addEventListener('click',async()=>{
  if(running||!depositOpen())return;
  running=true;button.disabled=true;
  const key=lastKey=uuid();
  say('درخواست استعلام در حال ثبت است…');
  try{
   const {response,data}=await post('check',{requestId:key});
   if(!response.ok){say(messages[data.code]||'استعلام موجودی فعلاً امکان‌پذیر نیست.');stop();return;}
   if(data.code==='DEPOSIT_ALREADY_COMPLETED'){say('موجودی قبلاً تأیید شده است.');stop();document.getElementById('refreshStatus')?.click();return;}
   say('درخواست ثبت شد. نتیجه از بروکر دریافت می‌شود.');
   await poll(data.checkId,key);
  }catch{say('اتصال به سرور برقرار نشد.');stop();}
 });
 new MutationObserver(begin).observe(dialog,{attributes:true,attributeFilter:['open']});
 document.querySelectorAll('.step-card').forEach(card=>card.addEventListener('click',()=>setTimeout(begin,0)));
 begin();
})();