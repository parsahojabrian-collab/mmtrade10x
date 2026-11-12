'use strict';
(() => {
  const $ = (s,root=document)=>root.querySelector(s);
  const dialog=$('#dialog'), sheetTitle=$('#sheetTitle'), sheetBody=$('#sheetBody');
  const currentTelegram=()=>window.Telegram?.WebApp;currentTelegram()?.ready?.();currentTelegram()?.expand?.();window.addEventListener('load',()=>{currentTelegram()?.ready?.();currentTelegram()?.expand?.();},{once:true});
  const initData=()=>currentTelegram()?.initData||'';
  const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const show=(heading,html)=>{sheetTitle.textContent=heading;sheetBody.innerHTML=html;dialog.hidden=false;document.body.style.overflow='hidden';};
  const close=()=>{dialog.hidden=true;document.body.style.overflow='';};
  const request=async(path,payload={})=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({initData:initData(),...payload})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.message||`خطای سرور (${response.status})`);return data;};
  const auth=()=>{if(initData())return true;show('ورود به پشتیبانی','<p class="notice">برای ثبت درخواست یا مشاهده تیکت‌ها، این صفحه را از داخل مینی‌اپ تلگرام باز کنید.</p>');return false;};
  const renderError=e=>`<p class="notice error" role="alert">${escapeHTML(e.message||e)}</p>`;
  function createTicket(subject=''){
    if(!auth())return;
    show('ارسال درخواست جدید',`<form id="ticketForm"><div class="field"><label for="ticketSubject">موضوع درخواست</label><input id="ticketSubject" minlength="3" maxlength="150" required value="${escapeHTML(subject)}" placeholder="موضوع درخواست خود را بنویسید"></div><div class="field"><label for="ticketMessage">شرح مشکل</label><textarea id="ticketMessage" minlength="5" maxlength="3500" required placeholder="لطفاً مشکل را دقیق توضیح دهید. رمز عبور یا کد تأیید ارسال نکنید."></textarea></div><button class="primary" type="submit">ثبت درخواست</button><p class="notice" id="ticketStatus" role="status"></p></form>`);
    $('#ticketForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type="submit"]',e.currentTarget),status=$('#ticketStatus');const subject=$('#ticketSubject').value.trim(),body=$('#ticketMessage').value.trim();if(!subject||subject.length<3||subject.length>150||body.length<5||body.length>3500){status.textContent='موضوع و شرح مشکل را کامل وارد کنید.';return;}btn.disabled=true;status.textContent='در حال ثبت درخواست...';try{await request('/public/tickets',{subject,body});show('درخواست شما ثبت شد','<p class="success">تیکت با موفقیت ثبت شد. پاسخ پشتیبانی را از بخش «تیکت‌های من» مشاهده کنید.</p><button class="primary" id="openTickets">مشاهده تیکت‌ها</button>');$('#openTickets').addEventListener('click',listTickets);}catch(err){status.textContent=err.message;status.className='notice error';btn.disabled=false;}});
  }
  async function listTickets(){
    if(!auth())return;show('تیکت‌های من','<p class="notice">در حال دریافت درخواست‌ها...</p>');
    try{const result=await request('/support/tickets/list');const tickets=Array.isArray(result)?result:(result.items||[]);if(!tickets.length){sheetBody.innerHTML='<p class="notice">هنوز تیکتی ثبت نکرده‌اید.</p><button class="primary" id="firstTicket">ثبت اولین درخواست</button>';$('#firstTicket').addEventListener('click',()=>createTicket());return;}
      sheetBody.innerHTML=tickets.map(t=>{const messages=Array.isArray(t.messages)?t.messages:[];const isClosed=['CLOSED','RESOLVED'].includes(String(t.status||'').toUpperCase());return `<article class="ticket"><strong>${escapeHTML(t.subject||'درخواست پشتیبانی')}</strong><p class="status">وضعیت: ${escapeHTML(t.status||'در انتظار بررسی')}</p>${messages.map(m=>`<p class="message">${escapeHTML(m.body||m.text||'')}</p>`).join('')}${isClosed?'<p class="notice">این درخواست بسته شده است.</p>':`<button class="primary reply-btn" data-ticket-id="${escapeHTML(t.id)}">ارسال پاسخ</button>`}</article>`;}).join('');
    }catch(err){sheetBody.innerHTML=renderError(err);}
  }
  function reply(id){show('پاسخ به تیکت',`<form id="replyForm"><div class="field"><label for="replyMessage">پیام شما</label><textarea id="replyMessage" required minlength="1" maxlength="3500" placeholder="پاسخ خود را بنویسید..."></textarea></div><button type="submit" class="primary">ارسال پیام</button><p class="notice" id="replyStatus" role="status"></p></form>`);$('#replyForm').addEventListener('submit',async e=>{e.preventDefault();const value=$('#replyMessage').value.trim();if(!value)return;const btn=$('button[type="submit"]',e.currentTarget);btn.disabled=true;try{await request('/support/tickets/'+encodeURIComponent(id)+'/messages',{body:value});await listTickets();}catch(err){$('#replyStatus').textContent=err.message;$('#replyStatus').className='notice error';btn.disabled=false;}});}
  function faq(){show('سؤالات متداول',`<div class="faq-item"><strong>چطور حساب ePlanet را متصل کنم؟</strong><p class="notice">پس از افتتاح حساب، مراحل اتصال حساب معاملاتی را در بخش مربوط به ePlanet دنبال کنید.</p></div><div class="faq-item"><strong>چطور مشکل واریز یا برداشت را گزارش کنم؟</strong><p class="notice">یک تیکت با موضوع «واریز و برداشت» ثبت کنید و شناسه تراکنش را وارد کنید؛ هرگز رمز عبور یا کد یک‌بارمصرف ارسال نکنید.</p></div><div class="faq-item"><strong>از کجا پاسخ پشتیبانی را ببینم؟</strong><p class="notice">پاسخ‌ها در بخش «تیکت‌های من» در همین صفحه نمایش داده می‌شوند.</p></div><button class="primary" id="faqTicket">هنوز سؤال دارم</button>`);$('#faqTicket').addEventListener('click',()=>createTicket());}
  $('#backBtn').addEventListener('click',()=>{location.href='/miniapp/p74/profile/profile.html';});
  $('#newTicketBtn').addEventListener('click',()=>createTicket());$('#ticketsBtn').addEventListener('click',listTickets);$('#faqBtn').addEventListener('click',faq);
  document.querySelectorAll('[data-subject]').forEach(btn=>btn.addEventListener('click',()=>createTicket(btn.dataset.subject)));
  $('#closeBtn').addEventListener('click',close);$('.scrim').addEventListener('click',close);
  sheetBody.addEventListener('click',e=>{const btn=e.target.closest('.reply-btn');if(btn)reply(btn.dataset.ticketId);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.hidden)close();});
})();
