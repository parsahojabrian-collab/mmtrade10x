/* MMTRADE UI/UX Pro Max R4 - structural UI architecture.
 * Rearranges existing rendered nodes without cloning, replacing IDs,
 * reimplementing business logic, or modifying network requests.
 */
(() => {
  'use strict';
  if (window.__MMTRADE_UIUX_R4__) return;
  window.__MMTRADE_UIUX_R4__ = Object.freeze({version:'R4-20261118',kind:'structural'});
  const d = document, html = d.documentElement;
  const $ = (s, scope=d) => scope.querySelector(s);
  const make = (tag, cls, text) => {
    const n = d.createElement(tag);
    if (cls) n.className=cls;
    if (text!==undefined) n.textContent=text;
    return n;
  };
  const icon = (name) => {
    const s=d.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('viewBox','0 0 24 24');
    s.setAttribute('aria-hidden','true');
    s.setAttribute('fill','none');
    s.setAttribute('stroke','currentColor');
    s.setAttribute('stroke-width','1.8');
    s.setAttribute('stroke-linecap','round');
    s.setAttribute('stroke-linejoin','round');
    const p=d.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',name==='arrow'?'M19 12H5m7 7-7-7 7-7':name==='layers'?'M12 3 2 9l10 6 10-6-10-6ZM2 15l10 6 10-6M2 12l10 6 10-6':name==='shield'?'M12 2 4 5v6c0 6 4 9 8 11 4-2 8-5 8-11V5l-8-3Z':'M4 4h16v16H4z');
    s.appendChild(p); return s;
  };
  function classify() {
    const explicit=html.getAttribute('data-mm-r4-module');
    if (['academy','support','eplanet','copytrade','visual-studio','academy-studio','command-center','profile','home','team','admin','generic'].includes(explicit)) return explicit;
    const p=location.pathname.toLowerCase();
    if (p.includes('control-center-v2')) return 'command-center';
    if (p.includes('/p74/studio/')) return 'visual-studio';
    if (p.includes('/learning/academy-studio') || p.includes('/learning/studio.html')) return 'academy-studio';
    if (p.includes('copytrade-academy')) return 'copytrade';
    if (p.includes('/eplanet/') || p.includes('marhale2')) return 'eplanet';
    if (p.includes('/profile/')) return 'profile';
    if (p.includes('support')) return 'support';
    if (p.includes('academy') || p.includes('/learning/')) return 'academy';
    if (p.endsWith('/team') || p.endsWith('team.html')) return 'team';
    if (p.includes('/admin') || p.endsWith('admin.html')) return 'admin';
    if (p.endsWith('/miniapp/') || p.endsWith('/miniapp/index.html') || p==='/' || p.endsWith('/p74/preview.html')) return 'home';
    return 'generic';
  }
  const status = (root,title,desc) => {
    const aside=make('aside','mm4-context'); aside.setAttribute('aria-label',title);
    const eyebrow=make('span','mm4-eyebrow','MMTRADE / 10X');
    const h=make('h2','mm4-context-title',title);
    const p=make('p','mm4-context-desc',desc);
    aside.append(eyebrow,h,p);
    return aside;
  };
  function addSkip() {
    if ($('.mm4-skip') || !d.body) return;
    const target=$('main:not([hidden]), #workspace:not([hidden]), .workspace:not([hidden])');
    if (!target || $('#p74-app')) return;
    if (!target.id) target.id='mm4-main';
    const a=make('a','mm4-skip','پرش به محتوای اصلی');a.href='#'+target.id;
    d.body.prepend(a);
  }
  function wrap(targets,cls,after) {
    if (!targets.length || targets.some(t=>!t) || targets.some(t=>t.closest('.'+cls))) return null;
    const container=make('div',cls);
    const anchor=after||targets[0];
    anchor.parentNode.insertBefore(container,anchor);
    targets.forEach(n=>container.appendChild(n));
    return container;
  }
  function enhanceAcademy() {
    const root=$('.academy-shell'); if (!root || $('.mm4-academy-layout',root)) return false;
    const steps=$('.academy-stages-wrap',root),cta=$('#academy-cta-section',root);
    if (!steps || !cta) return false;
    const grid=wrap([steps,cta],'mm4-academy-layout');
    if (!grid) return false;
    const aside=status(root,'مسیر آموزشی شما','مراحل آموزش را به‌ترتیب دنبال کنید؛ محتوای هر مرحله از سامانه آموزشی بارگذاری می‌شود.');
    const sub=make('div','mm4-context-note','یادگیری مرحله‌ای · نمایش وضعیت واقعی');
    aside.appendChild(sub);grid.appendChild(aside);
    html.setAttribute('data-mm-r4-structural','academy');return true;
  }
  function enhanceSupport() {
    const page=$('#support-page'); if (!page || $('.mm4-support-grid',page)) return false;
    const actions=$('.main-actions',page),help=$('.quick-help',page);
    if (!actions || !help) return false;
    const grid=wrap([actions,help],'mm4-support-grid');
    if (!grid) return false;
    const guide=status(page,'مرکز ارتباط با تیم','درخواست جدید ایجاد کنید، پاسخ‌ها را پیگیری کنید یا از پرسش‌های متداول کمک بگیرید.');
    guide.classList.add('mm4-support-context');help.prepend(guide);
    html.setAttribute('data-mm-r4-structural','support');return true;
  }
  function enhanceEplanet() {
    const root=$('main.app-shell');if (!root || $('.mm4-eplanet-layout',root)) return false;
    const progress=$('.progress-panel',root),steps=$('.steps',root);
    if (!progress || !steps) return false;
    const grid=wrap([progress,steps],'mm4-eplanet-layout');
    if (!grid) return false;
    progress.insertBefore(make('div','mm4-overline','وضعیت فعال‌سازی'),progress.firstChild);
    steps.insertBefore(make('div','mm4-overline','مراحل اتصال به حساب'),steps.firstChild);
    html.setAttribute('data-mm-r4-structural','eplanet');return true;
  }
  function enhanceCopytrade() {
    const page=$('#course-index');if (!page || $('.mm4-course-layout',page)) return false;
    const list=$('nav.list',page);if (!list) return false;
    const container=make('div','mm4-course-layout');list.parentNode.insertBefore(container,list);container.appendChild(list);
    const aside=status(page,'راهنمای دوره','درس موردنظر را انتخاب کنید تا محتوای همان درس در محیط آموزشی اصلی باز شود.');
    aside.appendChild(make('div','mm4-context-note','هفت درس · انتخاب تعاملی'));
    container.appendChild(aside);
    html.setAttribute('data-mm-r4-structural','copytrade');return true;
  }
  function appendWorkflow(host,buttons,kind) {
    if (!host || $('.mm4-workflow',host)) return false;
    const list=buttons.filter(x=>$(x.selector));if (!list.length) return false;
    const panel=make('nav','mm4-workflow');panel.setAttribute('aria-label','ابزارهای سریع');
    const label=make('span','mm4-workflow-title','دسترسی سریع'); panel.appendChild(label);
    list.forEach(item=>{
      const b=make('button','mm4-workflow-action',item.label);b.type='button';
      b.dataset.mm4Trigger=item.selector; b.setAttribute('aria-label',item.label);
      b.addEventListener('click',()=>{const target=$(item.selector);if(target && !target.disabled)target.click();});
      panel.appendChild(b);
    });
    host.appendChild(panel);
    html.setAttribute('data-mm-r4-structural',kind);return true;
  }
  function enhanceVisualStudio() {
    return appendWorkflow($('.header'),[
      {label:'ذخیره',selector:'#save'},
      {label:'انتشار',selector:'#publish'},
      {label:'برگشت تغییر',selector:'#undo'},
      {label:'تکرار تغییر',selector:'#redo'}
    ],'visual-studio');
  }
  function enhanceAcademyStudio() {
    return appendWorkflow($('.studio-header'),[
      {label:'ذخیره',selector:'#save'},
      {label:'انتشار',selector:'#publish'},
      {label:'بازخوانی',selector:'#reload'}
    ],'academy-studio');
  }
  function enhanceCommandCenter() {
    const main=$('.main'),dashboard=$('#dashboard');
    if (!main || !dashboard || $('.mm4-command-intro')) return false;
    const title=make('section','mm4-command-intro');
    title.setAttribute('aria-label','میانبرهای داشبورد');
    title.appendChild(make('span','mm4-overline','MMTRADE / WORKSPACE'));
    title.appendChild(make('h2','','مرکز فرمان پروژه'));
    title.appendChild(make('p','','بخش موردنظر را از میان ابزارهای موجود در پنل انتخاب کنید.'));
    const actions=make('div','mm4-command-actions');
    const tabs=[...d.querySelectorAll('.sidebar .navbtn')].slice(0,6);
    tabs.forEach(tab=>{
      const txt=(tab.textContent||'').replace(/\s+/g,' ').trim();if (!txt)return;
      const b=make('button','mm4-tab-shortcut',txt);b.type='button';
      b.addEventListener('click',()=>{if(!tab.disabled)tab.click();});actions.appendChild(b);
    });
    if(actions.children.length)title.appendChild(actions);
    dashboard.prepend(title);
    html.setAttribute('data-mm-r4-structural','command-center');return true;
  }
  function enhanceProfile() {
    const shell=$('#p77-app .p77-shell');
    if(!shell || $('.mm4-profile-dashboard',shell))return false;
    const primary=$('.p77-metrics-primary',shell),stats=$('.p77-metrics-stats',shell),rows=$('.p77-mini-rows',shell);
    if(!primary || !stats || !rows)return false;
    const dashboard=wrap([primary,stats,rows],'mm4-profile-dashboard');
    const awards=$('.p77-awards',shell),actions=$('.p77-actions',shell);
    if(awards && actions)wrap([awards,actions],'mm4-profile-detail');
    html.setAttribute('data-mm-r4-structural','profile');return !!dashboard;
  }
  function enhanceTeam() {
    const main=$('main'); if (!main || $('.mm4-team-intro',main))return false;
    const h=make('section','mm4-team-intro');h.setAttribute('aria-label','مدیریت اعضای تیم');
    h.appendChild(make('span','mm4-overline','TEAM OPERATIONS'));
    h.appendChild(make('h2','','مدیریت یکپارچه تیم'));
    h.appendChild(make('p','','اطلاعات را از پنل اصلی مشاهده و ویرایش کنید. دسترسی‌ها طبق مجوزهای فعلی کنترل می‌شوند.'));
    main.prepend(h);
    html.setAttribute('data-mm-r4-structural','team');return true;
  }
  function markNavigation() {
    const nav=$('#mmu-bottom-nav') || $('nav.bottom-nav');
    if (nav && !nav.hasAttribute('aria-label'))nav.setAttribute('aria-label','ناوبری اصلی');
    const root=$('#p74-app');if(root && !root.hasAttribute('aria-label'))root.setAttribute('aria-label','صفحه اصلی چالش MMTRADE');
    const tabs=$('.studio-tabs');if(tabs&&!tabs.hasAttribute('aria-label'))tabs.setAttribute('aria-label','بخش‌های استودیو');
  }
  function mount() {
    const page=classify();html.setAttribute('data-mm-r4-page',page);
    html.setAttribute('data-mm-r4-ready','true');addSkip();markNavigation();
    switch(page){
      case 'academy':enhanceAcademy();break;
      case 'profile':enhanceProfile();break;
      case 'support':enhanceSupport();break;
      case 'eplanet':enhanceEplanet();break;
      case 'copytrade':enhanceCopytrade();break;
      case 'visual-studio':enhanceVisualStudio();break;
      case 'academy-studio':enhanceAcademyStudio();break;
      case 'command-center':enhanceCommandCenter();break;
      case 'team':enhanceTeam();break;
    }
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  // Some modules render their navigation asynchronously; only add semantics, never move dynamic roots.
  if(d.body){
    if(classify()==='profile'){
      const root=$('#p77-app');
      if(root){const profileObserver=new MutationObserver(()=>enhanceProfile());
        profileObserver.observe(root,{childList:true});
        window.addEventListener('pagehide',()=>profileObserver.disconnect(),{once:true});
      }
    }
    const obs=new MutationObserver(()=>{markNavigation();});
    obs.observe(d.body,{childList:true,subtree:true});
    window.addEventListener('pagehide',()=>obs.disconnect(),{once:true});
  }
})();
