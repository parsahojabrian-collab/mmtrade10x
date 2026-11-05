/* TENX_P63_HOME_STUDIO_ENTRY_V1 — reliable entry independent of legacy VIEWS.pages */
(function () {
  'use strict';
  if (window.__TENX_P63_HOME_ENTRY__) return;
  window.__TENX_P63_HOME_ENTRY__ = true;
  var authorized = false;
  var checkedToken = null;
  var checking = false;
  var directOpened = false;
  var loadingStudio = null;
  var errBox = null;
  var css = document.createElement('style');
  css.textContent = `
  .mf63-open{background:linear-gradient(135deg,#147a59,#29b889)!important;color:#fff!important;border:1px solid #69dcb3!important;border-radius:12px!important;padding:10px 14px!important;font:inherit!important;cursor:pointer!important;max-width:100%;white-space:normal!important;line-height:1.7!important;box-shadow:0 5px 18px #009d702b}
  .mf63-open:focus-visible{outline:2px solid #ffd6a2;outline-offset:3px}
  .mf63-card{direction:rtl;box-sizing:border-box;width:100%;min-width:0;background:linear-gradient(130deg,#112d23,#0d1d19);border:1px solid #5bbd9c;border-radius:18px;padding:17px 16px;margin:8px 0 18px;box-shadow:0 12px 30px #0003}
  .mf63-card strong{display:block;color:#f8e3c2;font-size:17px;margin-bottom:7px}
  .mf63-card p{color:#a7cbb8;font-size:13px;line-height:1.9;margin:3px 0 14px}
  .mf63-topbar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px}
  .mf63-alert{position:fixed;left:12px;right:12px;bottom:80px;z-index:99999;padding:13px;border-radius:13px;background:#311e21;color:#ffe8e8;border:1px solid #ff9e8b;font-size:13px;line-height:1.8;direction:rtl;box-shadow:0 15px 35px #0008}
  @media(max-width:650px){.mf63-topbar{width:100%}.mf63-topbar button{width:100%;max-width:100%}.mf63-card{margin-top:12px}}
  `;
  document.head.appendChild(css);
  function showError(s) {
    if (errBox) errBox.remove();
    errBox = document.createElement('div');
    errBox.className = 'mf63-alert';
    errBox.textContent = String(s);
    errBox.setAttribute('role', 'alert');
    document.body.appendChild(errBox);
    window.setTimeout(function(){ if(errBox){errBox.remove();errBox=null;} },10000);
  }
  function addStudioScript() {
    if (typeof window.MF62OpenHomeStudio === 'function') return Promise.resolve();
    if (loadingStudio) return loadingStudio;
    loadingStudio = new Promise(function(resolve,reject){
      var s = document.createElement('script');
      s.src = '/miniapp/p62/studio-admin.js?v=p63-recover';
      s.onload = function(){
        if (typeof window.MF62OpenHomeStudio === 'function') resolve();
        else reject(new Error('کد استودیو بارگذاری شد، اما تابع ورود پیدا نشد.'));
      };
      s.onerror = function(){reject(new Error('فایل استودیو از سرور بارگذاری نشد.'))};
      document.body.appendChild(s);
    }).catch(function(e){ loadingStudio=null; throw e; });
    return loadingStudio;
  }
  async function enter() {
    if (!authorized) { showError('دسترسی به استودیوی هوم فقط برای سوپرادمین است.'); return; }
    try {
      await addStudioScript();
      await window.MF62OpenHomeStudio();
    } catch(e) { showError('خطا در بازکردن استودیو: '+(e && e.message ? e.message : e)); }
  }
  function newButton(label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'mf63-open'; b.textContent = label;
    b.addEventListener('click', enter);
    return b;
  }
  function place() {
    if (!authorized) return;
    var app = document.getElementById('app');
    if (!app || app.classList.contains('hide')) return;
    var header = app.querySelector('main > header .row') || app.querySelector('main > header');
    if (header && !document.getElementById('mf63-top')) {
      var holder = document.createElement('div'); holder.id='mf63-top'; holder.className='mf63-topbar';
      holder.appendChild(newButton('✦ استودیوی هوم · ۳ قالب'));
      header.prepend(holder);
    }
    var view = document.getElementById('view');
    if (!view) return;
    var title = document.getElementById('title');
    var onPages = title && /صفحه‌ها|صفحات|پاپ‌آپ/.test(title.textContent || '');
    var oldEditor = /\/admin\/editor\/index\/?$/.test(location.pathname);
    if ((onPages || oldEditor) && !view.querySelector('#mf63-entry-card')) {
      var card = document.createElement('section'); card.className='mf63-card';card.id='mf63-entry-card';
      var heading = document.createElement('strong');heading.textContent='استودیوی هوم · سه طراحی ۳بعدی';
      var description = document.createElement('p');description.textContent='سه قالب ۱، ۲ و ۳، تغییر ویدیو و کاور، ویرایش اجزا، ذخیره پیش‌نویس و انتشار انتخابی؛ مستقل از ویرایشگر قدیمی.';
      card.appendChild(heading);card.appendChild(description);card.appendChild(newButton('ورود به ادیتور سه‌قالبی هوم'));
      view.prepend(card);
    }
  }
  async function checkIdentity(token) {
    if (checking) return;
    checking = true;
    try {
      var response = await fetch('/admin/auth/me', {headers:{authorization:'Bearer '+token},cache:'no-store'});
      if (!response.ok) throw new Error('HTTP '+response.status);
      var data = await response.json();
      authorized = data && data.role === 'SUPER_ADMIN';
      checkedToken = token;
      if (authorized) place();
    } catch(_) {authorized=false; checkedToken=token;}
    finally {checking=false;}
  }
  function tick() {
    var token = '';
    try { token = sessionStorage.getItem('tenx_admin_token') || ''; } catch(_){}
    if (!token) {authorized=false; checkedToken=null; return;}
    if (token!==checkedToken && !checking) { void checkIdentity(token); return; }
    if (!authorized) return;
    place();
    if (!directOpened && new URLSearchParams(location.search).get('homeStudio')==='1') {
      directOpened=true;
      void enter();
    }
  }
  // Keep a visible entry across legacy editor rerenders, login, and P51/P53 navigation.
  window.setInterval(tick, 900);
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', tick, {once:true});
  else tick();
})();
