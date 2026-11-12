(()=>{'use strict';
 const preview=new URLSearchParams(location.search).get('visualPreview')==='1';
 const initData=window.Telegram?.WebApp?.initData||'';
 const status=document.getElementById('status'),box=document.getElementById('content');
 try{window.Telegram?.WebApp?.ready()}catch{}
 const token=preview?sessionStorage.getItem('tenx_admin_token'):'';
 if(preview&&!token){status.textContent='برای پیش‌نمایش مرحله دوم، ابتدا وارد پنل مدیریت شوید.';return}
 if(!preview&&!initData){status.textContent='این مرحله فقط از مینی‌اپ تلگرام و برای کاربر شناسایی‌شده قابل بررسی است.';return}
 const path=preview?'/admin/challenge/learning/stage2/preview':'/challenge/learning/stage2/content';
 const options=preview?{headers:{authorization:'Bearer '+token},cache:'no-store'}:
  {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData}),cache:'no-store'};
 fetch(path,options).then(async r=>{
  const data=await r.json().catch(()=>({}));
  if(!preview&&r.status===403&&data.error==='stage1_incomplete'){
   status.textContent=`🔒 مرحله ۲ قفل است؛ ${data.total-data.done} درس از مرحله اول باقی مانده.`;
   const a=document.createElement('a');a.href='./stage1.html';a.textContent='بازگشت و تکمیل آموزش‌ها';a.className='next';box.append(a);return;
  }
  if(!r.ok)throw Error(data.error||'server_error');
  status.textContent=preview?'پیش‌نمایش مدیریت · پیشرفت کاربری تغییر نمی‌کند.':'✓ مرحله ۱ تکمیل شده؛ آموزش عضویت باز شد.';
  if(!preview){window.__MMVS_STAGE2_UNLOCKED__=true;window.dispatchEvent(new Event('mmvs:stage2-unlocked'))}
  box.replaceChildren();
  for(const step of data.steps||[]){const card=document.createElement('section');card.className='stage2-lesson';const h=document.createElement('h3');h.textContent=step.title;const p=document.createElement('p');p.textContent=step.detail;card.append(h,p);box.append(card)}
 }).catch(e=>{status.textContent='خطا در دریافت محتوای مرحله ۲: '+e.message});
})();
