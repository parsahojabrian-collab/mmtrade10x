(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';
  const previewMode = new URLSearchParams(location.search).get('preview') === '1';
  const studioPreview = new URLSearchParams(location.search).get('visualPreview') === '1';
  const asset = (name) => '/miniapp/p74/learning/academy-assets/' + name;
  const DEFAULT_CONFIG = {
    schemaVersion: 1,
    enabled: true,
    title: 'آکادمی متین فیوچر',
    subtitle: 'مسیر آموزشی ۷ مرحله‌ای برای شروع کپی‌ترید',
    logo: '',
    background: asset('academy-bg-portrait.webp'),
    footerBackground: asset('academy-footer-mountains.webp'),
    cta: { enabled: true, text: 'شروع ثبت‌نام', href: '/profile', icon: '➜' },
    footerText: 'آماده ورود به مرحله بعدی هستید؟',
    riskText: 'معاملات بازارهای مالی با ریسک همراه‌اند؛ سود تضمین‌شده نیست.',
    layout: { backgroundScroll: false, backgroundCoverage: 100 },
    stages: [
      {
        id: 'welcome', title: 'خوش آمدید', description: 'آشنایی سریع با مسیر پروژه و نحوه شروع', icon: asset('stage-01-rocket.webp'), enabled: true, locked: false,
        lesson: { intro: 'به MATIN FUTURE خوش آمدید. این مسیر برای آشنایی با بازار طلا، سازوکار کپی‌ترید، افتتاح حساب و اتصال حساب معاملاتی طراحی شده است. قبل از شروع، این هفت مرحله را به ترتیب مرور کنید.', sections: [
          { heading: 'در این مسیر چه یاد می‌گیرید؟', body: 'از شناخت بازار طلا تا آماده‌سازی حساب و پایش معاملات، قدم‌به‌قدم با فرآیند آشنا می‌شوید.', bullets: ['شناخت نماد XAUUSD و ویژگی‌های بازار طلا', 'درک سازوکار کپی‌ترید و نحوه اجرای معاملات', 'افتتاح حساب، تعیین ریسک و اتصال به MMTrade', 'شروع و بررسی عملکرد حساب معاملاتی'] },
          { heading: 'چطور از آکادمی استفاده کنید؟', body: 'هر مرحله را باز کنید، محتوای آن را بخوانید و پس از یادگیری، مطالعه را تأیید کنید تا پیشرفت شما ثبت شود.' }
        ], note: 'این آکادمی محتوای آموزشی است و هیچ سود یا بازدهی را تضمین نمی‌کند.' }
      },
      {
        id: 'gold', title: 'بازار طلا', description: 'شناخت XAUUSD و دلیل تمرکز ما روی طلا', icon: asset('stage-02-gold.webp'), enabled: true, locked: false,
        lesson: { intro: 'XAUUSD نماد رایج قیمت هر اونس طلا در برابر دلار آمریکاست. در این نماد، معامله‌گر با پیش‌بینی حرکت قیمت می‌تواند موقعیت خرید یا فروش باز کند.', sections: [
          { heading: 'خرید و فروش یعنی چه؟', body: 'در موقعیت BUY انتظار دارید قیمت افزایش پیدا کند؛ در موقعیت SELL انتظار دارید قیمت کاهش پیدا کند. در هر دو حالت، حرکت خلاف پیش‌بینی می‌تواند زیان ایجاد کند.' },
          { heading: 'چه عواملی روی طلا اثر می‌گذارند؟', body: 'قدرت دلار، نرخ بهره، داده‌های تورمی و اشتغال، تصمیم‌های بانک‌های مرکزی و رویدادهای ژئوپلیتیکی می‌توانند نوسان طلا را افزایش دهند.' },
          { heading: 'چرا تمرکز این پروژه روی طلاست؟', body: 'طلا بازاری شناخته‌شده و پرمعامله است؛ با این حال نقدشوندگی و فرصت معاملاتی به معنی کم‌ریسک بودن آن نیست.' }
        ], note: 'هنگام انتشار اخبار مهم، نوسان و لغزش قیمت می‌تواند بیشتر شود. از ریسک معامله آگاه باشید.' }
      },
      {
        id: 'copy', title: 'کپی ترید', description: 'درک نحوه کپی شدن معاملات در حساب شما', icon: asset('stage-03-copy.webp'), enabled: true, locked: false,
        lesson: { intro: 'کپی‌ترید به شما اجازه می‌دهد اجرای معاملات یک استراتژی را طبق تنظیمات اتصال، در حساب معاملاتی خود دنبال کنید.', sections: [
          { heading: 'فرآیند چگونه انجام می‌شود؟', body: 'با باز یا بسته شدن معامله در حساب مبدأ، دستور متناظر طبق تنظیمات و محدودیت‌های اتصال برای حساب شما ارسال می‌شود.' },
          { heading: 'حساب معاملاتی متعلق به چه کسی است؟', body: 'معاملات در حساب معاملاتی خودتان اجرا می‌شوند. موجودی، معاملات باز و سود و زیان را از پنل بروکر بررسی می‌کنید.' },
          { heading: 'چه چیزی را باید کنترل کنید؟', body: 'میزان سرمایه درگیر، ضریب یا حجم کپی، حد ریسک، وضعیت اتصال و اختلاف احتمالی قیمت اجرا را بررسی کنید.' }
        ], note: 'کپی‌ترید سود را تضمین نمی‌کند؛ نتیجه حساب شما ممکن است با حساب مبدأ متفاوت باشد.' }
      },
      {
        id: 'account', title: 'افتتاح حساب', description: 'ثبت‌نام و ساخت حساب معاملاتی در ePlanet', icon: asset('stage-04-account.webp'), enabled: true, locked: false,
        lesson: { intro: 'برای اتصال به سیستم، ابتدا باید حساب معاملاتی موردنیاز را در بروکر ePlanet ایجاد و مراحل تأیید آن را تکمیل کنید.', sections: [
          { heading: 'مراحل افتتاح حساب', body: 'از لینک رسمی ثبت‌نامی که توسط تیم پروژه ارائه شده استفاده کنید و اطلاعات را دقیقاً مطابق مدارک خود وارد کنید.', bullets: ['ورود به لینک اختصاصی ثبت‌نام ePlanet', 'تکمیل اطلاعات شخصی و اطلاعات تماس', 'انجام مراحل احراز هویت در سامانه رسمی بروکر', 'ساخت حساب معاملاتی و نگهداری شناسه حساب'] },
          { heading: 'قبل از ادامه', body: 'نوع حساب، شرایط معاملاتی، هزینه‌ها، اهرم و قوانین برداشت را در اسناد رسمی بروکر بررسی کنید.' }
        ], note: 'رمز عبور، کد یک‌بارمصرف یا اطلاعات محرمانه ورود را برای هیچ شخصی ارسال نکنید.', ctaText: 'رفتن به مسیر ثبت‌نام', ctaUrl: '/profile' }
      },
      {
        id: 'risk', title: 'سرمایه و ریسک', description: 'انتخاب سرمایه و تنظیم ریسک متناسب با شرایط شما', icon: asset('stage-05-risk.webp'), enabled: true, locked: false,
        lesson: { intro: 'پیش از اتصال حساب، مشخص کنید چه مقدار از سرمایه را آگاهانه در معرض ریسک معاملات قرار می‌دهید. مبلغ انتخابی باید با شرایط مالی و توان تحمل زیان شما متناسب باشد.', sections: [
          { heading: 'قبل از شروع بررسی کنید', body: 'میزان سرمایه قابل‌ریسک، حجم معاملات، اهرم، افت سرمایه قابل‌تحمل و شرایط توقف کپی را بشناسید.', bullets: ['با پول موردنیاز زندگی یا بدهی وارد معامله نشوید', 'ریسک هر معامله و مجموع معاملات باز را در نظر بگیرید', 'حداکثر زیان قابل‌تحمل خود را از قبل مشخص کنید', 'عملکرد حساب را به‌صورت منظم بررسی کنید'] },
          { heading: 'انتظار واقع‌بینانه داشته باشید', body: 'دوره‌های زیان، نوسان و افت سرمایه بخشی از معاملات هستند. عملکرد گذشته تضمین‌کننده نتایج آینده نیست.' }
        ], note: 'ممکن است بخشی یا تمام سرمایه‌ای که در معاملات درگیر می‌کنید از دست برود.' }
      },
      {
        id: 'connection', title: 'اتصال به MMTrade', description: 'اتصال حساب معاملاتی به سیستم کپی‌ترید', icon: asset('stage-06-connection.webp'), enabled: true, locked: false,
        lesson: { intro: 'پس از آماده شدن حساب معاملاتی، باید آن را از مسیر رسمی و امن به زیرساخت MMTrade متصل کنید.', sections: [
          { heading: 'اطلاعات موردنیاز', body: 'شناسه حساب و اطلاعاتی را که در فرآیند رسمی اتصال درخواست می‌شود، آماده داشته باشید. فقط از روش‌های تأییدشده پروژه استفاده کنید.' },
          { heading: 'پس از اتصال', body: 'وضعیت اتصال را بررسی کنید، تنظیمات کپی و میزان سرمایه درگیر را تأیید کنید و مطمئن شوید حساب صحیح انتخاب شده است.' },
          { heading: 'امنیت حساب', body: 'رمز اصلی بروکر، کد تأیید دومرحله‌ای و اطلاعات حساس را در پیام یا فرم غیررسمی وارد نکنید.' }
        ], note: 'اتصال موفق به‌تنهایی به معنی فعال شدن معاملات یا تضمین نتیجه نیست.', ctaText: 'ورود به پنل کاربری', ctaUrl: '/profile' }
      },
      {
        id: 'start', title: 'شروع معاملات', description: 'فعال‌سازی سیستم و پایش عملکرد حساب', icon: asset('stage-07-growth.webp'), enabled: true, locked: false,
        lesson: { intro: 'پیش از فعال‌سازی، اتصال حساب و تنظیمات ریسک را دوباره بررسی کنید. پس از شروع، وضعیت معاملات را در حساب شخصی خود پایش کنید.', sections: [
          { heading: 'چک‌لیست شروع', body: 'این موارد را پیش از فعال‌سازی مرور کنید.', bullets: ['شناسه حساب متصل‌شده صحیح است', 'میزان سرمایه و تنظیمات کپی را بررسی کرده‌اید', 'ریسک و افت سرمایه قابل‌تحمل را می‌شناسید', 'روش توقف یا قطع اتصال را می‌دانید'] },
          { heading: 'پس از فعال‌سازی', body: 'وضعیت اتصال، معاملات باز، موجودی و سود و زیان را به‌صورت منظم بررسی کنید. در صورت تغییر شرایط بازار یا وضعیت حساب، تنظیمات را دوباره ارزیابی کنید.' }
        ], note: 'عنوان 10X وعده ده‌برابر شدن سرمایه نیست. معامله‌گری و کپی‌ترید همواره با احتمال زیان همراه‌اند.', ctaText: 'ورود به پنل کاربری', ctaUrl: '/profile' }
      }
    ]
  };

  let config = structuredClone(DEFAULT_CONFIG);
  let readStages = new Set();
  let currentStage = null;
  let modalReturnFocus = null;

  try { tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#031710'); tg?.setBackgroundColor?.('#031710'); } catch (_) {}

  const faNum = (n) => Number(n).toLocaleString('fa-IR');
  const safeUrl = (value, allowExternal = true) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 1000) return '';
    const v = value.trim();
    if (v.startsWith('/') && !v.startsWith('//') && !v.includes('..') && !v.includes('\\')) return v;
    if (!allowExternal) return '';
    try {
      const u = new URL(v, location.origin);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    } catch (_) { return ''; }
  };
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  };
  function toast(message) {
    const el = $('academy-live-status');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  async function postJson(url, body) {
    const response = await fetch(url, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'request_failed');
    return data;
  }
  function applyConfig(raw) {
    if (!raw || typeof raw !== 'object') return;
    config = { ...structuredClone(DEFAULT_CONFIG), ...raw };
    config.cta = { ...DEFAULT_CONFIG.cta, ...(raw.cta || {}) };
    config.layout = { ...DEFAULT_CONFIG.layout, ...(raw.layout || {}) };
    config.layout.backgroundScroll = config.layout.backgroundScroll === true;
    const coverage = Number(config.layout.backgroundCoverage);
    config.layout.backgroundCoverage = Number.isFinite(coverage) ? Math.max(50, Math.min(100, Math.round(coverage / 5) * 5)) : 100;
    if (!Array.isArray(config.stages) || config.stages.length !== 7) config.stages = structuredClone(DEFAULT_CONFIG.stages);
    $('academy-title').textContent = config.title || DEFAULT_CONFIG.title;
    $('academy-subtitle').textContent = config.subtitle || DEFAULT_CONFIG.subtitle;
    $('academy-footer-text').textContent = config.footerText || '';
    $('academy-risk-note').textContent = config.riskText || '';
    const logo = document.querySelector('.academy-logo');
    const brand = document.querySelector('.academy-brand');
    const logoUrl = safeUrl(config.logo || DEFAULT_CONFIG.logo);
    // Older default assets contain the MMTrade wordmark, not the MATIN FUTURE mark shown in the approved reference.
    // Keep the purpose-built MF monogram until the admin uploads a dedicated brand lockup.
    const legacyLogo = /academy-mmtrade-challenge10x-logo-p42|matin-future-logo\.png/i.test(logoUrl);
    if (logo && brand && logoUrl && !legacyLogo) {
      logo.src = logoUrl; logo.hidden = false; brand.classList.add('has-custom-logo');
    } else if (logo && brand) {
      logo.removeAttribute('src'); logo.hidden = true; brand.classList.remove('has-custom-logo');
    }
    const atmosphere = document.querySelector('.academy-atmosphere');
    const bg = safeUrl(config.background || DEFAULT_CONFIG.background);
    if (atmosphere) {
      atmosphere.classList.toggle('mf-bg-scroll', config.layout.backgroundScroll);
      atmosphere.style.setProperty('--mf-academy-bg-coverage', `${config.layout.backgroundCoverage}%`);
      document.documentElement.style.setProperty('--mf-academy-bg-coverage', `${config.layout.backgroundCoverage}%`);
      if (bg) atmosphere.style.backgroundImage = `linear-gradient(180deg,rgba(0,12,9,.12) 0%,rgba(0,17,12,.18) 23%,rgba(0,19,13,.52) 54%,rgba(0,20,14,.62) 100%),url("${bg.replace(/"/g, '')}"),radial-gradient(ellipse at 50% 25%,#073c2a 0%,#031710 70%)`;
    }
    const footer = $('academy-cta-section');
    const footerBg = safeUrl(config.footerBackground || DEFAULT_CONFIG.footerBackground);
    if (footer && footerBg) footer.style.setProperty('--academy-footer-image', `url("${footerBg.replace(/"/g, '')}")`);
    const cta = $('academy-cta');
    const ctaHref = safeUrl(config.cta.href || '/profile');
    cta.href = ctaHref || '/profile';
    $('academy-cta-text').textContent = config.cta.text || 'شروع ثبت‌نام';
    $('academy-cta-arrow').textContent = config.cta.icon || '➜';
    $('academy-cta-section').hidden = config.cta.enabled === false;
    if (config.enabled === false) {
      document.querySelector('.academy-shell').innerHTML = '<section class="academy-disabled">آکادمی در حال حاضر غیرفعال است.</section>';
      return;
    }
    renderStages();
  }
  function renderStages() {
    const root = $('academy-stages');
    root.replaceChildren();
    const stages = config.stages.filter(stage => stage && stage.enabled !== false);
    stages.forEach((stage, visibleIndex) => {
      const originalIndex = config.stages.findIndex(x => x.id === stage.id);
      const button = node('button', 'stage-card' + (readStages.has(stage.id) ? ' is-complete' : '') + (stage.locked ? ' is-locked' : ''));
      button.type = 'button';
      button.disabled = !!stage.locked;
      button.setAttribute('aria-label', `مرحله ${faNum(originalIndex + 1)}: ${stage.title}`);
      const number = node('span', 'stage-number', faNum(originalIndex + 1));
      const copy = node('span', 'stage-copy');
      copy.append(node('strong', 'stage-title', stage.title));
      copy.append(node('small', 'stage-description', stage.description || 'برای مشاهده آموزش لمس کنید'));
      const art = node('span', 'stage-art');
      const img = node('img');
      img.src = safeUrl(stage.icon) || asset('stage-01-rocket.webp');
      img.alt = '';
      img.loading = visibleIndex > 2 ? 'lazy' : 'eager';
      img.decoding = 'async';
      img.onerror = () => { img.hidden = true; };
      art.append(img);
      button.append(number, copy, art);
      button.addEventListener('click', () => openLesson(stage, originalIndex));
      root.append(button);
    });
    if (!stages.length) root.append(node('p', 'academy-loading', 'در حال حاضر مرحله فعالی برای نمایش وجود ندارد.'));
  }
  function appendSection(container, section) {
    if (!section || typeof section !== 'object') return;
    if (section.heading) container.append(node('h3', '', section.heading));
    if (section.body) container.append(node('p', '', section.body));
    if (Array.isArray(section.bullets) && section.bullets.length) {
      const list = node('ul');
      section.bullets.slice(0, 20).forEach(item => list.append(node('li', '', item)));
      container.append(list);
    }
  }
  function openLesson(stage, index) {
    if (!stage || stage.locked) return;
    currentStage = stage;
    modalReturnFocus = document.activeElement;
    $('lesson-stage-label').textContent = `مرحله ${faNum(index + 1)} از ۷`;
    $('lesson-title').textContent = stage.lesson?.title || stage.title;
    const content = $('lesson-content');
    content.replaceChildren();
    if (stage.lesson?.intro) content.append(node('p', '', stage.lesson.intro));
    if (stage.lesson?.imageUrl) {
      const url = safeUrl(stage.lesson.imageUrl);
      if (url) { const image = node('img', 'academy-lesson-image'); image.src = url; image.alt = stage.title; image.loading = 'lazy'; content.append(image); }
    }
    (Array.isArray(stage.lesson?.sections) ? stage.lesson.sections : []).forEach(section => appendSection(content, section));
    if (stage.lesson?.videoUrl) {
      const url = safeUrl(stage.lesson.videoUrl);
      if (url) {
        const link = node('a', 'academy-lesson-video-link', 'مشاهده ویدیوی آموزشی');
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        content.append(link);
      }
    }
    if (stage.lesson?.note) content.append(node('div', 'academy-lesson-note', stage.lesson.note));
    const actions = $('lesson-actions');
    actions.replaceChildren();
    if (stage.lesson?.ctaText && stage.lesson?.ctaUrl) {
      const url = safeUrl(stage.lesson.ctaUrl);
      if (url) { const link = node('a', '', stage.lesson.ctaText); link.href = url; if (/^https:\/\//.test(url)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; } actions.append(link); }
    }
    if (readStages.has(stage.id)) {
      const done = node('button', 'secondary', '✓ این مرحله مطالعه شده است');
      done.type = 'button'; done.disabled = true; actions.append(done);
    } else {
      const complete = node('button', '', '✓ مطالعه کردم');
      complete.type = 'button';
      complete.addEventListener('click', () => completeStage(stage.id, complete));
      actions.append(complete);
    }
    const close = node('button', 'secondary', 'بستن');
    close.type = 'button'; close.addEventListener('click', closeLesson); actions.append(close);
    $('academy-modal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('academy-modal-close')?.focus?.();
  }
  function closeLesson() {
    $('academy-modal').hidden = true;
    document.body.style.overflow = '';
    currentStage = null;
    if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  }
  async function completeStage(stageId, button) {
    if (studioPreview || !initData) { toast('برای ثبت پیشرفت، آکادمی را از داخل ربات باز کنید.'); return; }
    button.disabled = true;
    button.textContent = 'در حال ثبت…';
    try {
      const result = await postJson('/academy-home/progress/complete', { initData, stageId });
      if (result.tracked === false) throw new Error('registration_required');
      readStages.add(stageId);
      renderStages();
      toast('پیشرفت این مرحله ثبت شد.');
      closeLesson();
    } catch (error) {
      button.disabled = false;
      button.textContent = '✓ مطالعه کردم';
      toast(error.message === 'registration_required' ? 'برای ذخیره پیشرفت، ابتدا ثبت‌نام اولیه را تکمیل کنید.' : 'ثبت پیشرفت انجام نشد؛ دوباره تلاش کنید.');
    }
  }
  async function loadProgress() {
    if (studioPreview || !initData || !$('academy-stages')) return;
    try {
      const result = await postJson('/academy-home/progress/status', { initData });
      if (result.tracked && Array.isArray(result.read)) readStages = new Set(result.read);
      renderStages();
    } catch (_) { /* Public reading remains available when progress tracking is unavailable. */ }
  }
  function bindInteractions() {
    $('academy-modal').addEventListener('click', event => {
      if (event.target?.dataset?.close === '1') closeLesson();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('academy-modal').hidden) closeLesson(); });
    $('academy-cta').addEventListener('click', async event => {
      const cta = $('academy-cta');
      const destination = safeUrl(config.cta.href || '/profile') || '/profile';
      if (previewMode || studioPreview) { event.preventDefault(); toast('این دکمه در پیش‌نمایش است.'); return; }
      if (!initData) return;
      event.preventDefault();
      const external = /^https:\/\//.test(destination);
      const opened = external ? window.open(destination, '_blank', 'noopener') : null;
      try { await postJson('/academy-home/cta-click', { initData }); } catch (_) {}
      if (!external) location.assign(destination);
      else if (!opened) location.assign(destination);
    });
  }
  async function loadConfig() {
    if (previewMode) { applyConfig(DEFAULT_CONFIG); return; }
    try {
      const response = await fetch('/public/academy-home', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('academy_config_unavailable');
      const data = await response.json();
      if (data?.config) applyConfig(data.config);
    } catch (_) { applyConfig(DEFAULT_CONFIG); }
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'MM10_ACADEMY_PREVIEW_CONFIG' && event.data.config) applyConfig(event.data.config);
  });
  window.MM10AcademyHome = { getConfig: () => structuredClone(config), preview: applyConfig };

  bindInteractions();
  loadConfig().then(loadProgress);
})();
