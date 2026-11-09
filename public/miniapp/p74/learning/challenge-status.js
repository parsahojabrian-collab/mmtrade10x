(()=>{'use strict';
const hero=document.getElementById('hero');if(!hero)return;
if(document.getElementById('challengeResult'))return;
const css=document.createElement('link');css.rel='stylesheet';css.href='./challenge-status.css?v=CHALLENGE_RESULT_R1';document.head.append(css);
const widget=document.createElement('div');widget.id='challengeResult';widget.className='challenge-result';widget.dataset.state='unknown';widget.setAttribute('role','status');widget.setAttribute('aria-live','polite');
const title=document.createElement('b');title.textContent='وضعیت چالش 10X';
const row=document.createElement('span');row.className='challenge-main';const dot=document.createElement('span');dot.dataset.dot='';const result=document.createElement('span');result.dataset.result='';row.append(dot,result);
const info=document.createElement('small');info.dataset.info='';widget.append(title,row,info);hero.append(widget);
const main=widget.querySelector('[data-result]');const sub=widget.querySelector('[data-info]');const icon=widget.querySelector('[data-dot]');
const values={
 PASSED:['چالش پاس شده','نتیجه تأییدشده','passed','✓'],
 FAILED:['چالش پاس نشده','نتیجه تأییدشده','failed','×'],
 IN_PROGRESS:['در حال انجام چالش','هنوز نتیجه نهایی ثبت نشده','pending','◌'],
 UNDER_REVIEW:['در انتظار بررسی','نتیجه هنوز قطعی نیست','pending','…'],
 NOT_VERIFIED:['نتیجه هنوز تأیید نشده','بعد از دریافت داده معتبر مشخص می‌شود','unknown','•']
};
const apply=(s)=>{
 const v=values[s?.verdict]||values.NOT_VERIFIED;
 widget.dataset.state=v[2];main.textContent=v[0];icon.textContent=v[3];
 const source=s?.source==='SUPER_ADMIN'?'تأیید سوپرادمین':s?.source==='EPLANET'?'اطلاعات تأییدشده ePlanet':null;
 sub.textContent=source?(v[1]+' · '+source):v[1];
 widget.title=s?.conflict?'نتیجه بروکر و تصمیم مدیر متفاوت است؛ بررسی مدیریتی لازم است':'';
};
apply(null);
async function load(){
 const initData=window.Telegram?.WebApp?.initData;
 if(!initData){sub.textContent='وضعیت شخصی فقط داخل تلگرام نمایش داده می‌شود';return}
 try{
  const r=await fetch('/challenge/result/status',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({initData})});
  if(!r.ok)throw new Error('status_unavailable');
  apply(await r.json());
 }catch{main.textContent='وضعیت در دسترس نیست';sub.textContent='بعداً دوباره تلاش کنید';widget.dataset.state='unknown'}
}
load();
})();
