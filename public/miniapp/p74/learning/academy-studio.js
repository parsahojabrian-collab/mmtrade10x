(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fa = (value) => Number(value || 0).toLocaleString('fa-IR');
  const token = (() => { try { return sessionStorage.getItem('tenx_admin_token') || ''; } catch (_) { return ''; } })();
  const DEFAULT_STAGE_IDS = ['welcome','gold','copy','account','risk','connection','start'];
  let state = null;
  let config = null;
  let initial = '';
  let selectedStageId = 'welcome';
  let busy = false;
  let currentTab = 'overview';
  let toastTimer = null;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  function toast(message) {
    const t = $('studio-toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function status(message, error = false) {
    $('save-state').textContent = message;
    $('save-state').style.borderColor = error ? 'rgba(235,108,93,.5)' : 'rgba(63,191,145,.25)';
    $('save-state').style.color = error ? '#ffb8ae' : '#d4e5da';
  }
  async function api(path, options = {}) {
    if (!token) throw new Error('نشست مدیریت در این مرورگر پیدا نشد؛ ابتدا از پنل سوپرادمین وارد شو.');
    const response = await fetch('/admin' + path, {
      ...options,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || ('HTTP ' + response.status));
    return data;
  }
  function dirty() { return !!config && JSON.stringify(config) !== initial; }
  function updateStateLabel() {
    if (busy) return;
    status(dirty() ? 'تغییر ذخیره‌نشده' : 'همگام با پیش‌نویس');
    $('save').disabled = !dirty();
    if (config && $('overview-draft-state')) $('overview-draft-state').textContent = dirty() ? 'تغییر ذخیره‌نشده' : 'همگام با پیش‌نویس';
  }
  function field(label, value, options = {}) {
    const wrap = el('label', 'editor-field' + (options.full ? ' full' : ''));
    wrap.append(el('span', '', label));
    let input;
    if (options.textarea) {
      input = el('textarea', '');
      input.rows = options.rows || 3;
    } else {
      input = el('input', '');
      input.type = options.type || 'text';
    }
    input.value = value == null ? '' : String(value);
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.ltr) { input.dir = 'ltr'; input.style.textAlign = 'left'; input.style.fontFamily = 'Arial,sans-serif'; }
    wrap.append(input);
    return { wrap, input };
  }
  function checkbox(label, checked) {
    const wrap = el('label', 'toggle-field');
    const input = el('input'); input.type = 'checkbox'; input.checked = !!checked;
    wrap.append(input, el('span', '', label));
    return { wrap, input };
  }
  function setTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
    document.querySelectorAll('.studio-panel').forEach(panel => {
      const active = panel.id === 'tab-' + name;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    if (name === 'preview') sendPreview();
    if (name === 'history') renderHistory();
    if (name === 'analytics') loadAnalytics();
  }
  function markChanged() {
    updateStateLabel();
    renderOverview();
    sendPreview();
  }
  function bindGlobal(id, getter, setter, eventName = 'input') {
    const input = $(id);
    input['on' + eventName] = () => { setter(input.type === 'checkbox' ? input.checked : input.value); markChanged(); };
    input.value = getter() ?? '';
    if (input.type === 'checkbox') input.checked = !!getter();
  }
  function syncGlobalMediaPreviews() {
    const pairs = [
      ['global-logo', 'global-logo-image'],
      ['global-background', 'global-background-image'],
      ['global-footer-bg', 'global-footer-image']
    ];
    pairs.forEach(([inputId, imageId]) => {
      const input = $(inputId); const image = $(imageId);
      if (!input || !image) return;
      const value = String(input.value || '').trim();
      const valid = value.startsWith('/') && !value.startsWith('//') && !value.includes('..') || /^https:\/\//i.test(value);
      image.hidden = !valid;
      if (valid && image.src !== value) image.src = value;
      image.onerror = () => { image.hidden = true; };
    });
  }
  function renderOverview() {
    if (!config) return;
    const stages = Array.isArray(config.stages) ? config.stages : [];
    const enabled = stages.filter(stage => stage.enabled !== false).length;
    const locked = stages.filter(stage => stage.locked === true).length;
    const put = (id, value) => { const node = $(id); if (node) node.textContent = String(value); };
    put('overview-academy-title', config.title || 'آکادمی متین فیوچر');
    put('overview-total', fa(stages.length));
    put('overview-enabled', fa(enabled));
    put('overview-locked', fa(locked));
    put('overview-revision', fa(state?.revision || 0));
    put('overview-draft-state', dirty() ? 'تغییر ذخیره‌نشده' : 'همگام با پیش‌نویس');
    put('overview-cta-state', config.cta?.enabled === false ? 'غیرفعال' : 'فعال');
    put('overview-enabled-state', config.enabled === false ? 'غیرفعال' : 'فعال');
    const fill = $('overview-progress-fill');
    if (fill) fill.style.width = `${stages.length ? enabled / stages.length * 100 : 0}%`;
  }
  function renderGeneral() {
    const c = config;
    c.layout = { backgroundScroll: c.layout?.backgroundScroll === true, backgroundCoverage: 100, ...(c.layout || {}) };
    const coverage = Number(c.layout.backgroundCoverage);
    c.layout.backgroundCoverage = Number.isFinite(coverage) ? Math.max(50, Math.min(100, Math.round(coverage / 5) * 5)) : 100;
    $('global-title').value = c.title || '';
    $('global-subtitle').value = c.subtitle || '';
    $('global-logo').value = c.logo || '';
    $('global-background').value = c.background || '';
    $('global-footer-bg').value = c.footerBackground || '';
    $('global-cta-text').value = c.cta?.text || '';
    $('global-cta-icon').value = c.cta?.icon || '➜';
    $('global-cta-href').value = c.cta?.href || '/profile';
    $('global-footer-text').value = c.footerText || '';
    $('global-risk-text').value = c.riskText || '';
    $('global-enabled').checked = c.enabled !== false;
    $('global-cta-enabled').checked = c.cta?.enabled !== false;
    $('global-background-scroll').checked = c.layout.backgroundScroll;
    $('global-background-coverage').value = String(c.layout.backgroundCoverage);
    $('global-background-coverage-value').textContent = fa(c.layout.backgroundCoverage) + '٪';
    const map = [
      ['global-title', v => c.title = v], ['global-subtitle', v => c.subtitle = v],
      ['global-logo', v => c.logo = v], ['global-background', v => c.background = v],
      ['global-footer-bg', v => c.footerBackground = v], ['global-cta-text', v => c.cta.text = v],
      ['global-cta-icon', v => c.cta.icon = v], ['global-cta-href', v => c.cta.href = v],
      ['global-footer-text', v => c.footerText = v], ['global-risk-text', v => c.riskText = v]
    ];
    map.forEach(([id, setter]) => { $(id).oninput = e => { setter(e.target.value); syncGlobalMediaPreviews(); markChanged(); }; });
    $('global-enabled').onchange = e => { c.enabled = e.target.checked; markChanged(); };
    $('global-cta-enabled').onchange = e => { c.cta.enabled = e.target.checked; markChanged(); };
    $('global-background-scroll').onchange = e => { c.layout.backgroundScroll = e.target.checked; markChanged(); };
    $('global-background-coverage').oninput = e => {
      c.layout.backgroundCoverage = Math.max(50, Math.min(100, Number(e.target.value) || 100));
      $('global-background-coverage-value').textContent = fa(c.layout.backgroundCoverage) + '٪';
      markChanged();
    };
    bindUpload('upload-logo', url => { c.logo = url; $('global-logo').value = url; syncGlobalMediaPreviews(); markChanged(); });
    bindUpload('upload-background', url => { c.background = url; $('global-background').value = url; syncGlobalMediaPreviews(); markChanged(); });
    bindUpload('upload-footer-bg', url => { c.footerBackground = url; $('global-footer-bg').value = url; syncGlobalMediaPreviews(); markChanged(); });
    syncGlobalMediaPreviews();
  }
  function renderStageList() {
    const root = $('stage-list'); root.replaceChildren();
    config.stages.forEach((stage, index) => {
      const button = el('button', 'stage-list-item' + (stage.id === selectedStageId ? ' active' : ''));
      button.type = 'button';
      const image = el('img'); image.src = stage.icon || ''; image.alt = ''; image.onerror = () => image.hidden = true;
      const copy = el('span', '', `${fa(index + 1)} · ${stage.title}`);
      const meta = el('small', '', stage.enabled === false ? 'مخفی' : stage.locked ? 'قفل' : 'فعال');
      button.append(image, copy, meta);
      button.addEventListener('click', () => { selectedStageId = stage.id; renderStageList(); renderStageEditor(); renderLessonEditor(); });
      root.append(button);
    });
  }
  function renderStageEditor() {
    const root = $('stage-editor'); root.replaceChildren();
    const stage = config.stages.find(x => x.id === selectedStageId);
    if (!stage) { root.append(el('p', 'empty-hint', 'مرحله‌ای انتخاب نشده است.')); return; }
    const grid = el('div', 'stage-editor-grid');
    const title = field('عنوان مرحله', stage.title, { maxLength: 100 });
    const description = field('توضیح کوتاه کارت', stage.description, { textarea: true, rows: 2, maxLength: 300 });
    const icon = field('مسیر آیکون', stage.icon, { ltr: true, maxLength: 500 });
    title.input.addEventListener('input', e => { stage.title = e.target.value; renderStageList(); markChanged(); });
    description.input.addEventListener('input', e => { stage.description = e.target.value; renderStageList(); markChanged(); });
    icon.input.addEventListener('input', e => { stage.icon = e.target.value; renderStageList(); markChanged(); });
    grid.append(title.wrap, description.wrap, icon.wrap);
    const visible = checkbox('این مرحله برای کاربران نمایش داده شود', stage.enabled !== false);
    const locked = checkbox('مرحله قفل باشد و باز نشود', !!stage.locked);
    visible.input.addEventListener('change', () => { stage.enabled = visible.input.checked; renderStageList(); markChanged(); });
    locked.input.addEventListener('change', () => { stage.locked = locked.input.checked; renderStageList(); markChanged(); });
    const iconPreview = el('div', 'stage-icon-preview');
    const image = el('img'); image.src = stage.icon || ''; image.alt = 'پیش‌نمایش آیکون'; image.onerror = () => image.hidden = true;
    const upload = el('label', 'upload-btn', 'بارگذاری آیکون جدید');
    const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
    file.addEventListener('change', async () => { if (!file.files?.[0]) return; upload.textContent = 'در حال بارگذاری…'; try { const url = await uploadMedia(file.files[0]); stage.icon = url; icon.input.value = url; image.src = url; image.hidden = false; markChanged(); toast('آیکون مرحله جایگزین شد.'); } catch (e) { toast('بارگذاری ناموفق: ' + e.message); } finally { upload.textContent = 'بارگذاری آیکون جدید'; file.value = ''; } });
    upload.append(file); iconPreview.append(image, upload);
    const order = el('div', 'inline-actions');
    const up = el('button', 'mini-btn', '↑ انتقال به بالا'); up.type = 'button'; up.disabled = config.stages[0].id === stage.id;
    up.addEventListener('click', () => moveStage(stage.id, -1));
    const down = el('button', 'mini-btn', '↓ انتقال به پایین'); down.type = 'button'; down.disabled = config.stages[config.stages.length - 1].id === stage.id;
    down.addEventListener('click', () => moveStage(stage.id, 1));
    const editLesson = el('button', 'mini-btn', 'ویرایش محتوای این درس'); editLesson.type = 'button'; editLesson.addEventListener('click', () => setTab('lesson'));
    order.append(up, down, editLesson);
    root.append(grid, visible.wrap, locked.wrap, iconPreview, order);
  }
  function moveStage(id, delta) {
    const index = config.stages.findIndex(x => x.id === id); const target = index + delta;
    if (index < 0 || target < 0 || target >= config.stages.length) return;
    [config.stages[index], config.stages[target]] = [config.stages[target], config.stages[index]];
    selectedStageId = id; renderStageList(); renderStageEditor(); markChanged();
  }
  function renderLessonEditor() {
    const root = $('lesson-editor'); root.replaceChildren();
    const stage = config.stages.find(x => x.id === selectedStageId);
    if (!stage) { root.append(el('p', 'empty-hint', 'ابتدا یک مرحله را انتخاب کن.')); return; }
    stage.lesson = stage.lesson || { intro: '', sections: [], note: '' };
    $('lesson-editor-subtitle').textContent = `ویرایش محتوای مرحله «${stage.title}»`;
    const intro = field('متن شروع درس', stage.lesson.intro || '', { textarea: true, rows: 4, maxLength: 4000 });
    intro.input.addEventListener('input', e => { stage.lesson.intro = e.target.value; markChanged(); });
    root.append(intro.wrap);
    const sectionsTitle = el('div', 'subheading', 'بخش‌های آموزشی'); root.append(sectionsTitle);
    const sectionRoot = el('div', 'lesson-sections');
    function drawSections() {
      sectionRoot.replaceChildren();
      (stage.lesson.sections || []).forEach((section, index) => {
        const card = el('div', 'lesson-section-card');
        const head = el('div', 'lesson-section-head'); head.append(el('span', '', `بخش ${fa(index + 1)}`));
        const remove = el('button', 'mini-btn danger', 'حذف بخش'); remove.type = 'button'; remove.addEventListener('click', () => { stage.lesson.sections.splice(index, 1); drawSections(); markChanged(); });
        head.append(remove);
        const fields = el('div', 'lesson-section-fields');
        const heading = field('عنوان بخش', section.heading || '', { maxLength: 120 });
        const body = field('توضیحات بخش', section.body || '', { textarea: true, rows: 3, maxLength: 3000 });
        const bullets = field('نکته‌ها (هر مورد در یک خط)', (section.bullets || []).join('\n'), { textarea: true, rows: 3, maxLength: 2000 });
        heading.input.addEventListener('input', e => { section.heading = e.target.value; markChanged(); });
        body.input.addEventListener('input', e => { section.body = e.target.value; markChanged(); });
        bullets.input.addEventListener('input', e => { section.bullets = e.target.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0,20); markChanged(); });
        fields.append(heading.wrap, body.wrap, bullets.wrap); card.append(head, fields); sectionRoot.append(card);
      });
    }
    drawSections(); root.append(sectionRoot);
    const add = el('button', 'btn secondary', '+ افزودن بخش آموزشی'); add.type = 'button';
    add.addEventListener('click', () => { stage.lesson.sections = stage.lesson.sections || []; if (stage.lesson.sections.length >= 12) return toast('حداکثر ۱۲ بخش برای هر درس مجاز است.'); stage.lesson.sections.push({ heading: 'عنوان بخش جدید', body: '', bullets: [] }); drawSections(); markChanged(); });
    root.append(add);
    const note = field('نکته یا هشدار مهم', stage.lesson.note || '', { textarea: true, rows: 2, maxLength: 1200 });
    const image = field('آدرس تصویر داخل درس', stage.lesson.imageUrl || '', { ltr: true, maxLength: 500 });
    const video = field('لینک ویدیوی آموزشی (HTTPS)', stage.lesson.videoUrl || '', { ltr: true, maxLength: 500 });
    const ctaText = field('متن دکمه داخل درس', stage.lesson.ctaText || '', { maxLength: 80 });
    const ctaUrl = field('لینک دکمه داخل درس', stage.lesson.ctaUrl || '', { ltr: true, maxLength: 1000 });
    note.input.addEventListener('input', e => { stage.lesson.note = e.target.value; markChanged(); });
    image.input.addEventListener('input', e => { stage.lesson.imageUrl = e.target.value; markChanged(); });
    video.input.addEventListener('input', e => { stage.lesson.videoUrl = e.target.value; markChanged(); });
    ctaText.input.addEventListener('input', e => { stage.lesson.ctaText = e.target.value; markChanged(); });
    ctaUrl.input.addEventListener('input', e => { stage.lesson.ctaUrl = e.target.value; markChanged(); });
    const bottom = el('div', 'lesson-bottom-fields'); bottom.append(note.wrap, image.wrap, video.wrap, ctaText.wrap, ctaUrl.wrap); root.append(bottom);
    const imageUpload = el('label', 'upload-btn', 'بارگذاری تصویر داخل درس');
    const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
    file.addEventListener('change', async () => { if (!file.files?.[0]) return; imageUpload.textContent = 'در حال بارگذاری…'; try { const url = await uploadMedia(file.files[0]); stage.lesson.imageUrl = url; image.input.value = url; markChanged(); toast('تصویر درس بارگذاری شد.'); } catch (e) { toast('بارگذاری ناموفق: ' + e.message); } finally { imageUpload.textContent = 'بارگذاری تصویر داخل درس'; file.value = ''; } });
    imageUpload.append(file); root.append(imageUpload);
  }
  function bindUpload(id, onDone) {
    const input = $(id);
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      status('در حال بارگذاری فایل…');
      try { const url = await uploadMedia(file); onDone(url); toast('فایل با موفقیت بارگذاری شد.'); }
      catch (error) { toast('بارگذاری ناموفق: ' + error.message); }
      finally { input.value = ''; updateStateLabel(); }
    };
  }
  async function uploadMedia(file) {
    if (!token) throw new Error('نشست مدیریت موجود نیست.');
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('فقط PNG، JPG و WEBP مجاز است.');
    if (file.size > 12 * 1024 * 1024) throw new Error('حداکثر حجم تصویر ۱۲ مگابایت است.');
    const init = await api('/home-studio/media/begin', { method: 'POST', body: JSON.stringify({ name: file.name, kind: 'image', size: file.size, type: file.type }) });
    const chunkSize = init.chunkSize || 192 * 1024;
    let index = 0;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const bytes = await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer();
      const response = await fetch(`/admin/home-studio/media/${init.uploadId}/${index}`, { method: 'POST', cache: 'no-store', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/octet-stream' }, body: bytes });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'خطا در بارگذاری بخش تصویر');
      index++;
    }
    const finish = await api(`/home-studio/media/${init.uploadId}/finish`, { method: 'POST', body: '{}' });
    if (!finish.url) throw new Error('آدرس فایل دریافت نشد.');
    return finish.url;
  }
  function sendPreview() {
    const frame = $('preview-frame');
    if (!frame?.contentWindow || !config) return;
    frame.contentWindow.postMessage({ type: 'MM10_ACADEMY_PREVIEW_CONFIG', config: clone(config) }, location.origin);
  }
  async function saveDraft() {
    if (!dirty()) { toast('تغییری برای ذخیره وجود ندارد.'); return true; }
    busy = true; $('save').disabled = true; $('publish').disabled = true; status('در حال ذخیره پیش‌نویس…');
    try {
      const result = await api('/academy-home/draft', { method: 'PUT', body: JSON.stringify({ config }) });
      state = result.state || state; initial = JSON.stringify(config); status('پیش‌نویس ذخیره شد'); $('revision-label').textContent = 'نسخه منتشرشده: ' + fa(state?.revision || 0); toast('پیش‌نویس ذخیره شد؛ هنوز برای کاربران منتشر نشده است.'); return true;
    } catch (error) { status('ذخیره ناموفق', true); toast('خطا در ذخیره: ' + error.message); return false; }
    finally { busy = false; $('publish').disabled = false; updateStateLabel(); }
  }
  async function publish() {
    if (!confirm('نسخه فعلی آکادمی برای همه کاربران منتشر شود؟')) return;
    if (dirty() && (await saveDraft()) === false) return;
    busy = true; $('publish').disabled = true; $('save').disabled = true; status('در حال انتشار…');
    try {
      const result = await api('/academy-home/publish', { method: 'POST', body: '{}' });
      state = result.state || state; config = clone(state?.published || config); initial = JSON.stringify(config); renderAll();
      status('نسخه ' + fa(result.revision || state?.revision || 0) + ' منتشر شد'); $('revision-label').textContent = 'نسخه منتشرشده: ' + fa(result.revision || state?.revision || 0); toast('آکادمی با موفقیت منتشر شد.');
      await renderHistory();
    } catch (error) { status('انتشار ناموفق', true); toast('خطا در انتشار: ' + error.message); }
    finally { busy = false; updateStateLabel(); }
  }
  async function load() {
    if (!token) { status('نشست مدیریت پیدا نشد', true); toast('این صفحه را از داخل پنل سوپرادمین باز کن.'); return; }
    busy = true; status('در حال دریافت تنظیمات…');
    try {
      state = await api('/academy-home');
      config = clone(state.draft || state.published);
      if (!Array.isArray(config?.stages) || config.stages.length !== 7) throw new Error('invalid_academy_config');
      selectedStageId = config.stages.find(x => x.id === selectedStageId)?.id || config.stages[0].id;
      initial = JSON.stringify(config);
      renderAll();
      $('revision-label').textContent = 'نسخه منتشرشده: ' + fa(state.revision || 0);
      status('تنظیمات بارگذاری شد');
      await renderHistory();
    } catch (error) { status('خطا در دریافت تنظیمات', true); toast('بارگذاری ناموفق: ' + error.message); }
    finally { busy = false; updateStateLabel(); }
  }
  function renderAll() { renderGeneral(); renderStageList(); renderStageEditor(); renderLessonEditor(); renderOverview(); sendPreview(); }
  async function renderHistory() {
    const root = $('history-list'); root.replaceChildren();
    const rows = Array.isArray(state?.history) ? state.history.slice().sort((a,b) => Number(b.revision)-Number(a.revision)) : [];
    if (!rows.length) { root.append(el('p', 'empty-hint', 'هنوز نسخه‌ای منتشر نشده است.')); return; }
    rows.forEach(item => {
      const row = el('div', 'history-row');
      const meta = el('div', 'history-meta');
      meta.append(el('strong', '', `نسخه ${fa(item.revision)}${item.restoredFrom ? ' · بازگردانی‌شده' : ''}`));
      meta.append(el('small', '', `${item.publishedAt ? new Date(item.publishedAt).toLocaleString('fa-IR') : '—'} · ${item.createdBy || 'مدیر'}`));
      const restore = el('button', 'mini-btn', 'بازگردانی این نسخه'); restore.type = 'button';
      restore.addEventListener('click', async () => {
        if (!confirm(`نسخه ${fa(item.revision)} فوراً روی کاربران منتشر شود؟`)) return;
        try {
          const result = await api('/academy-home/restore', { method: 'POST', body: JSON.stringify({ revision: Number(item.revision) }) });
          state = result.state || state; config = clone(state.published); initial = JSON.stringify(config); renderAll(); $('revision-label').textContent = 'نسخه منتشرشده: ' + fa(state.revision); toast('نسخه قبلی بازگردانی و منتشر شد.'); await renderHistory();
        } catch (error) { toast('بازگردانی ناموفق: ' + error.message); }
      });
      row.append(meta, restore); root.append(row);
    });
  }
  async function loadAnalytics() {
    const summary = $('analytics-summary'); const stages = $('analytics-stages');
    summary.replaceChildren(el('p','empty-hint','در حال دریافت آمار…')); stages.replaceChildren();
    try {
      const data = await api('/academy-home/analytics'); summary.replaceChildren();
      const metrics = [
        ['کاربران دارای پیشرفت', data.trackedUsers],
        ['تکمیل‌های ثبت‌شده', data.completedStages],
        ['کلیک دکمه ثبت‌نام', data.ctaClicks]
      ];
      metrics.forEach(([label,value]) => { const card=el('div','metric-card');card.append(el('small','',label),el('strong','',fa(value)));summary.append(card); });
      (data.stages || []).forEach(stage => { const row=el('div','analytics-stage-row');row.append(el('span','',stage.title),el('b','',`${fa(stage.completed)} تکمیل`));stages.append(row); });
      if (!(data.stages || []).length) stages.append(el('p','empty-hint','هنوز پیشرفتی ثبت نشده است.'));
    } catch (error) { summary.replaceChildren(el('p','empty-hint','دریافت آمار ناموفق بود: ' + error.message)); }
  }
  document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
  document.querySelectorAll('[data-go-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.goTab)));
  document.querySelectorAll('.preview-size').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.preview-size').forEach(x => x.classList.toggle('active', x === button));
    $('preview-frame-wrap').classList.toggle('desktop', button.dataset.size === 'desktop');
  }));
  $('preview-frame').addEventListener('load', sendPreview);
  $('save').addEventListener('click', saveDraft);
  $('publish').addEventListener('click', publish);
  $('reload').addEventListener('click', () => { if (dirty() && !confirm('تغییرات ذخیره‌نشده حذف شوند؟')) return; load(); });
  $('refresh-analytics').addEventListener('click', loadAnalytics);
  window.MM10AcademyStudio = { isDirty: dirty, isBusy: () => busy, saveDraft };
  load();
})();
