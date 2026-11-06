(()=>{'use strict';const $=id=>document.getElementById(id);let selected=null;
const token=()=>{try{return sessionStorage.getItem('tenx_admin_token')||''}catch{return''}};
const msg=(s)=>{$('msg').textContent=s};
async function api(path,options={}){const t=token();if(!t)throw Error('ابتدا داخل پنل مدیریت وارد شوید');const r=await fetch(path,{...options,cache:'no-store',headers:{authorization:'Bearer '+t,'content-type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'HTTP_'+r.status);return d}
const statusText={PASSED:'پاس شده',FAILED:'پاس نشده',IN_PROGRESS:'در حال انجام',UNDER_REVIEW:'در انتظار بررسی',NOT_VERIFIED:'تأیید نشده'};
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e}
const safe=val=>val==null?'—':String(val);
async function choose(id){selected=id;document.querySelectorAll('.user').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.id===id)));
 try{const d=await api('/admin/challenge/results/'+encodeURIComponent(id));const out=$('detail');out.replaceChildren();
  out.append(el('p','کاربر: '+safe(d.user?.username||d.user?.telegramId)),el('p','حساب ePlanet: '+safe(d.accountId)));
  const effective=d.status?.verdict||'NOT_VERIFIED';out.append(el('p','وضعیت نهایی: '+(statusText[effective]||effective),effective==='PASSED'?'passed':effective==='FAILED'?'failed':'pending'));
  out.append(el('p','منبع نتیجه: '+safe(d.status?.source)),el('p','آخرین نتیجه بروکر: '+(statusText[d.status?.brokerVerdict]||'نامشخص')));
  if(d.status?.conflict)out.append(el('p','تعارض نتیجه بروکر با تصمیم مدیر: نیازمند بررسی','failed'));
  if(d.manual)out.append(el('p','آخرین دلیل ثبت‌شده: '+safe(d.manual.reason)));
  $('refresh').disabled=false;$('save').disabled=false;$('clear').disabled=!d.manual;
  $('history').replaceChildren();for(const a of d.history||[]){const node=el('div','', 'audit');node.append(el('b',a.action),el('div',new Date(a.createdAt).toLocaleString('fa-IR')));
    const details=a.metadata||{};if(details.reason)node.append(el('div','دلیل: '+details.reason));if(details.previous||details.next)node.append(el('div','تغییر: '+safe(details.previous)+' ← '+safe(details.next)));
    node.append(el('div','شناسه ثبت‌کننده: '+safe(a.adminUserId||'دریافت خودکار')));$('history').append(node)
  }if(!(d.history||[]).length)$('history').textContent='هنوز سابقه‌ای ثبت نشده است.';
 }catch(e){msg('خطا: '+e.message)}
}
async function search(){try{const q=$('q').value.trim();const d=await api('/admin/challenge/results?q='+encodeURIComponent(q));const root=$('users');root.replaceChildren();for(const u of d.items||[]){const b=el('button',(u.username?'@'+u.username:'کاربر '+safe(u.telegramId))+' | '+safe(u.accountId)+' | '+(statusText[u.status?.verdict]||'تأیید نشده'),'user');b.dataset.id=u.userId;b.type='button';b.setAttribute('aria-pressed',String(selected===u.userId));b.onclick=()=>choose(u.userId);root.append(b)}if(!(d.items||[]).length)root.textContent='کاربری پیدا نشد.';msg('فهرست دریافت شد.')}catch(e){msg('خطا: '+e.message)}}
$('search').onclick=search;$('q').onkeydown=e=>{if(e.key==='Enter')search()};
$('save').onclick=async()=>{if(!selected)return;const reason=$('reason').value.trim();if(reason.length<10)return msg('دلیل حداقل ۱۰ کاراکتر نیاز دارد.');const verdict=$('verdict').value;const evidenceRef=$('evidence').value.trim();if(['PASSED','FAILED'].includes(verdict)&&evidenceRef.length<4)return msg('برای پاس/رد قطعی شناسه مدرک یا ارجاع لازم است.');if(!confirm('نتیجه برای این کاربر با ثبت تاریخچه تغییر کند؟'))return;
 try{await api('/admin/challenge/results/'+encodeURIComponent(selected),{method:'PUT',body:JSON.stringify({verdict,reason,evidenceRef:evidenceRef||undefined})});msg('تغییر با تاریخچه ثبت شد.');await choose(selected)}catch(e){msg('خطا: '+e.message)}};
$('refresh').onclick=async()=>{if(!selected)return;try{await api('/admin/challenge/results/'+encodeURIComponent(selected)+'/sync',{method:'POST',body:'{}'});msg('اطلاعات بروکر دریافت شد.');await choose(selected)}catch(e){msg('بررسی بروکر ناموفق: '+e.message)}};
$('clear').onclick=async()=>{if(!selected)return;const reason=prompt('علت لغو تصمیم دستی (حداقل ۱۰ کاراکتر):');if(!reason||reason.trim().length<10)return;try{await api('/admin/challenge/results/'+encodeURIComponent(selected)+'/clear-override',{method:'POST',body:JSON.stringify({reason:reason.trim()})});msg('تصمیم دستی لغو شد و سابقه آن ثبت شد.');await choose(selected)}catch(e){msg('خطا: '+e.message)}};
search();
})();
