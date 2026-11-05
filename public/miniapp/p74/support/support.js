/* P78 Support Center — no ticket backend, no unverified support URL, no private data persistence. */
(function(){'use strict';if(window.__MM_P78__)return;window.__MM_P78__=true;
const root=document.getElementById('p78-app');if(!root)return;
const base={brand:'MM Trade Challenge 10X',headline:'مرکز پشتیبانی',subtitle:'کنار شما در تمام مراحل مسیر 10X',telegramSupportUrl:'',hours:'',homeUrl:'/miniapp/index.html',profileUrl:'/miniapp/p74/profile/profile.html',academyUrl:'/miniapp/academy.html',topics:['ثبت‌نام و حساب ePlanet','واریز و وضعیت حساب','کپی‌ترید و اتصال','مراحل چالش 10X','سایر موارد']};
const data={...base,...(window.MM_SUPPORT_CONFIG||{})};
const url=(v)=>{v=String(v||'').trim();if(/^\/(?!\/)[a-zA-Z0-9_/.?=&%-]+$/.test(v))return v;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch(_){return''}};
const plain=(x,n=200)=>String(x==null?'':x).replace(/[\x00-\x1F\x7F]/g,'').trim().slice(0,n);
const tgsupport=/^https:\/\/(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/?=&%-]+$/i.test(url(data.telegramSupportUrl))?url(data.telegramSupportUrl):'';
const topics=Array.isArray(data.topics)&&data.topics.length>=2?data.topics.slice(0,8).map(x=>plain(x,44)):base.topics;
const svg=(name)=>{const shapes={arrow:'<path d="m15 5-7 7 7 7"/>',back:'<path d="m9 5 7 7-7 7"/>',help:'<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.6 2.6 0 1 1 4.3 2l-1.8 1.6v1.5M12 18h.01"/>',shield:'<path d="M12 2 4 5v7c0 5 3.5 8.7 8 10 4.5-1.3 8-5 8-10V5l-8-3Z"/><path d="m8.5 12 2.5 2.5 5-5"/>',book:'<path d="M4 5c3-2 6-2 8 0 2-2 5-2 8 0v15c-3-2-6-2-8 0-2-2-5-2-8 0zM12 5v15"/>',wallet:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 9V5a2 2 0 0 1 2-2h13M16 14h5M16 14h.01"/>',link:'<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',flag:'<path d="M5 21V4M5 5c7-4 8 4 16 0v11c-8 4-9-4-16 0"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',message:'<path d="M3 3h18v14H8l-5 4V3Z"/><path d="M7 8h10M7 12h7"/>',send:'<path d="m22 2-9 20-4-8-8-4 21-8Zm0 0L9 14"/>',home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',academy:'<path d="m2 9 10-6 10 6-10 6zM5 12v7c4 3 10 3 14 0v-7"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',headset:'<path d="M3 13v-1a9 9 0 0 1 18 0v1M3 13v7h5v-8H3ZM21 13v7h-5v-8h5Z"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',check:'<path d="m5 12 4 4L19 6"/>'};return `<svg aria-hidden="true" viewBox="0 0 24 24">${shapes[name]||shapes.help}</svg>`};
const el=(tag,cl,txt)=>{let e=document.createElement(tag);if(cl)e.className=cl;if(txt!==undefined)e.textContent=txt;return e};
const faq=[
['برای شروع چالش از کجا اقدام کنم؟','ابتدا مراحل ثبت‌نام و راهنمای افتتاح حساب را از بخش Home یا آکادمی دنبال کنید. وضعیت نهایی عضویت فقط بعد از تأیید سامانه مشخص می‌شود.'],
['شناسه حساب ePlanet را از کجا پیدا کنم؟','در حساب معاملاتی بروکر، شناسه حساب یا Login را بررسی کنید. برای حل مشکل اتصال، فقط شناسه غیرمحرمانه حساب و شرح خطا را به پشتیبانی بدهید؛ رمز عبور ارسال نکنید.'],
['چرا وضعیت واریز یا اتصال به‌روزرسانی نشده؟','گاهی تأیید عملیات وابسته به ثبت رویداد و همگام‌سازی سامانه است. زمان تقریبی عملیات و شناسه پیگیری غیرحساس را همراه شرح مشکل ارسال کنید.'],
['چطور مرحله تکمیل‌شده را سبز کنم؟','رنگ سبز باید بعد از ثبت و تأیید تکمیل مرحله از سمت سامانه فعال شود. تغییر ظاهری دستی به‌معنای تکمیل واقعی مرحله نیست.'],
['اگر Mini App روی لودینگ ماند چه کنم؟','یک‌بار داخل مرورگر گوشی امتحان کنید، اتصال VPN/Proxy را بررسی کنید و تلگرام را به‌روزرسانی کنید. اگر ادامه داشت، مدل گوشی و تصویر خطا را برای پشتیبانی بفرستید.'],
['چه اطلاعاتی را نباید بفرستم؟','رمز عبور، کد ورود پیامکی یا تلگرام، کلید خصوصی، عبارت بازیابی، کد دو مرحله‌ای و اطلاعات کامل پرداخت را هرگز در پیام پشتیبانی ارسال نکنید.']
];
const topicIcons=['book','wallet','link','flag','more'];
root.innerHTML=`<main class="p78-shell">
<div class="p78-topline"><a class="p78-back" id="p78-back">${svg('back')} بازگشت به پروفایل</a><span class="p78-tag">MMTRADE · SUPPORT</span></div>
<header class="p78-brand"><img src="./assets/brand_mm.webp" alt="نشان MM"/><h1>MM Trade Challenge <span>10X</span></h1><p>چالش رشد ۱۰ برابری در معاملات</p></header>
<section class="p78-hero p78-panel" aria-labelledby="p78-heading"><div class="p78-hero-text"><span class="p78-eyebrow">${svg('shield')} همراه مسیر 10X</span><h2 id="p78-heading"></h2><p id="p78-subtitle"></p></div><div class="p78-shield" aria-hidden="true">${svg('shield')}<small>10X</small></div></section>
<div class="p78-intro-note">${svg('help')} <span id="p78-hours">موضوع مشکل رو انتخاب کن تا راهنمای مناسب یا متن آماده ارتباط با پشتیبانی رو ببینی.</span></div>
<div class="p78-section-head"><h2>${svg('flag')} موضوع پشتیبانی</h2><span>موضوع را انتخاب کن</span></div>
<section class="p78-categories" id="p78-categories" aria-label="موضوعات پشتیبانی"></section>
<div class="p78-section-head"><h2>${svg('book')} پرسش‌های پرتکرار</h2><span>راهنمای سریع</span></div>
<section class="p78-faq p78-panel" id="p78-faq" aria-label="سؤالات متداول"></section>
<div class="p78-section-head" id="p78-form-head"><h2>${svg('message')} درخواست راهنمایی</h2><span>آماده‌سازی پیام</span></div>
<form class="p78-form p78-panel" id="p78-form">
<p class="p78-form-lead">مشکلت رو توضیح بده. پیام آماده می‌شه تا در گفت‌وگوی تلگرام برای پشتیبانی ارسالش کنی. ثبت تیکت خودکار هنوز فعال نیست.</p>
<label>موضوع درخواست<select id="p78-topic" required></select></label>
<label>عنوان کوتاه<input id="p78-title" type="text" maxlength="90" placeholder="مثلاً: اتصال حساب به کپی‌ترید" required autocomplete="off"/></label>
<label>شرح مشکل<textarea id="p78-description" maxlength="1200" rows="4" required placeholder="چه اتفاقی افتاده و چه خطایی دیده‌ای؟"></textarea></label>
<small>برای امنیت، رمز حساب، کد یک‌بارمصرف، کلمات بازیابی و مشخصات حساس پرداخت رو ننویس. تصویر خطا رو در خود تلگرام ضمیمه کن.</small>
<button type="submit" class="p78-send">${svg('send')} آماده‌سازی پیام پشتیبانی ${svg('arrow')}</button>
<div id="p78-feedback" class="p78-feedback" role="status" aria-live="polite" hidden></div>
<button type="button" class="p78-copy" id="p78-copy" hidden>${svg('copy')} کپی مجدد متن</button>
<a id="p78-contact" class="p78-contact" hidden>باز کردن گفت‌وگوی رسمی پشتیبانی در تلگرام</a>
</form>
<div class="p78-warning">پشتیبانی هرگز رمز عبور، کد ورود، عبارت بازیابی یا کلید خصوصی درخواست نمی‌کند.</div>
</main><nav class="p78-nav" aria-label="منوی اصلی"><a id="p78-nav-home">${svg('home')}<span>خانه</span></a><a id="p78-nav-academy">${svg('academy')}<span>آکادمی</span></a><a id="p78-nav-profile">${svg('user')}<span>پروفایل</span></a><a aria-current="page" href="./support.html">${svg('headset')}<span>پشتیبانی</span></a></nav>`;
if(document.body.dataset.preview==='true')root.append(el('span','p78-demo','پیش‌نمایش'));
root.querySelector('#p78-heading').textContent=plain(data.headline,65);root.querySelector('#p78-subtitle').textContent=plain(data.subtitle,140);
if(data.hours)root.querySelector('#p78-hours').textContent='ساعت پاسخ‌گویی اعلام‌شده: '+plain(data.hours,150);
for(const [sel,href] of [['#p78-back',data.profileUrl],['#p78-nav-home',data.homeUrl],['#p78-nav-academy',data.academyUrl],['#p78-nav-profile',data.profileUrl]]){const a=root.querySelector(sel);a.href=url(href)||'#p78-heading'};
const cats=root.querySelector('#p78-categories');const select=root.querySelector('#p78-topic');
topics.forEach((topic,i)=>{const b=el('button','p78-category');b.type='button';b.dataset.topic=String(i);b.innerHTML=svg(topicIcons[i%topicIcons.length]);b.append(el('strong','',topic));cats.append(b);const op=document.createElement('option');op.value=topic;op.textContent=topic;select.append(op)});
cats.addEventListener('click',e=>{const b=e.target.closest('[data-topic]');if(!b)return;let i=Number(b.dataset.topic);select.selectedIndex=i;cats.querySelectorAll('.p78-category').forEach((x,j)=>x.classList.toggle('selected',i===j));root.querySelector('#p78-form-head').scrollIntoView({behavior:'smooth',block:'start'})});
faq.forEach(([q,a])=>{const d=document.createElement('details');const s=document.createElement('summary');s.append(document.createTextNode(q));s.insertAdjacentHTML('beforeend',svg('arrow'));d.append(s,el('p','',a));root.querySelector('#p78-faq').append(d)});
let prepared='';const feedback=root.querySelector('#p78-feedback');const copyBtn=root.querySelector('#p78-copy');const contact=root.querySelector('#p78-contact');
function copied(){return navigator.clipboard?.writeText? navigator.clipboard.writeText(prepared):Promise.reject(Error('Clipboard API unavailable'))}
root.querySelector('#p78-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(!f.reportValidity())return;const topic=plain(select.value,80),title=plain(root.querySelector('#p78-title').value,90),description=plain(root.querySelector('#p78-description').value,1200);if(!title||!description)return;
prepared='درخواست پشتیبانی MMTrade 10X\nموضوع: '+topic+'\nعنوان: '+title+'\nشرح: '+description;
feedback.hidden=false;copyBtn.hidden=false;feedback.textContent='متن درخواست آماده شد. ';try{await copied();feedback.textContent+='متن کپی شد. آن را در گفت‌وگوی رسمی پشتیبانی قرار بده.'}catch(_){feedback.textContent+='برای کپی متن، دکمه «کپی مجدد» را بزن؛ اگر کپی خودکار در تلگرام کار نکرد، متن زیر را دستی کپی کن.';feedback.append(el('pre','',prepared))}
if(tgsupport){contact.hidden=false;contact.href=tgsupport;contact.target='_blank';contact.rel='noopener noreferrer'}else{contact.hidden=true;feedback.append(el('p','', 'لینک اپراتور رسمی هنوز تنظیم نشده است؛ تا قبل از تأیید آن، پیام به هیچ آیدی ناشناسی ارسال نمی‌شود.'))}
feedback.scrollIntoView({behavior:'smooth',block:'center'})});
copyBtn.addEventListener('click',async()=>{try{await copied();feedback.textContent='متن درخواست کپی شد.'}catch(_){feedback.textContent='کپی خودکار در این مرورگر در دسترس نیست. متن آماده:\n'+prepared}});
})();
