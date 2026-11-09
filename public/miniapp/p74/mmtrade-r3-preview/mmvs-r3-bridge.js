/* MMTrade R3 ↔ MMVS Visual Studio bridge. No new APIs, no local credentials. */
(() => {
  'use strict';
  if (window.__MMVS_R3_LINK_R1__) return;
  window.__MMVS_R3_LINK_R1__ = true;
  const params = new URLSearchParams(location.search);
  const inPreview = params.get('visualPreview') === '1' && params.get('adminPreview') === '1';
  const root = document.querySelector('.mm-app');
  if (!root) return;
  const baseline = new Map();
  let addon = null;

  function isEditable(element) {
    return element instanceof Element &&
      (element === document.body || root.contains(element)) &&
      !element.matches('script,style,meta,link,html,svg,use') &&
      !element.closest('.mmvs-r3-addons');
  }
  function originalOf(el) {
    if (!baseline.has(el)) baseline.set(el, {
      html: el.innerHTML,
      style: el.getAttribute('style'),
      src: el.getAttribute('src'),
      href: el.getAttribute('href'),
      alt: el.getAttribute('alt'),
      hidden: el.hasAttribute('hidden')
    });
    return baseline.get(el);
  }
  function restore() {
    for (const [el, base] of baseline) {
      if (!el.isConnected) continue;
      el.innerHTML = base.html;
      for (const k of ['style','src','href','alt']) {
        if (base[k] === null) el.removeAttribute(k);
        else el.setAttribute(k, base[k]);
      }
      if (base.hidden) el.setAttribute('hidden','');
      else el.removeAttribute('hidden');
    }
    baseline.clear();
    addon?.remove(); addon = null;
  }
  function safeLink(value) {
    const v = String(value || '');
    return (/^https:\/\/[^\s]+$/.test(v) || /^\/(?!\/)[^\s]+$/.test(v)) ? v : null;
  }
  function applyElement(block) {
    if (!block || typeof block.selector !== 'string' || block.selector.length > 500) return;
    let el;
    try { el = document.querySelector(block.selector); } catch { return; }
    if (!isEditable(el)) return;
    originalOf(el);
    if (block.deleted === true) { el.hidden = true; el.style.setProperty('display', 'none', 'important'); return; }
    if (typeof block.text === 'string' && !['IMG', 'INPUT', 'TEXTAREA'].includes(el.tagName)) {
      el.textContent = block.text; // Never inject user-provided HTML.
    }
    const props = {
      color: 'color', background: 'backgroundColor', fontSize: 'fontSize',
      fontWeight: 'fontWeight', textAlign: 'textAlign', borderRadius: 'borderRadius',
      padding: 'padding', margin: 'margin', opacity: 'opacity', width: 'width',
      maxWidth: 'maxWidth', minHeight: 'minHeight', borderColor: 'borderColor',
      borderWidth: 'borderWidth', lineHeight: 'lineHeight', letterSpacing: 'letterSpacing'
    };
    const numeric = new Set(['fontSize', 'borderRadius', 'padding', 'margin', 'width', 'maxWidth', 'minHeight', 'borderWidth', 'letterSpacing']);
    for (const [key, prop] of Object.entries(props)) {
      const val = block[key];
      if (val === undefined || val === null) continue;
      if (['color','background','borderColor'].includes(key) && !/^#[0-9a-fA-F]{6}$/.test(String(val))) continue;
      if (numeric.has(key) && !(typeof val === 'number' && Number.isFinite(val) && Math.abs(val) <= 1200)) continue;
      if (key === 'opacity' && !(typeof val === 'number' && val >= 0 && val <= 1)) continue;
      if (key === 'fontWeight' && !['300','400','500','600','700','800','900'].includes(String(val))) continue;
      if (key === 'textAlign' && !['left','right','center','justify'].includes(String(val))) continue;
      el.style[prop] = numeric.has(key) ? `${val}px` : String(val);
    }
    if (['soft','medium','strong','none'].includes(block.shadow)) {
      el.style.boxShadow = ({soft:'0 0 8px #08ec9955',medium:'0 0 18px #08ec9988',strong:'0 0 30px #08ec99aa',none:'none'})[block.shadow];
    }
    if (el.tagName === 'IMG') {
      const src = safeLink(block.src); if (src) el.setAttribute('src', src);
      if (typeof block.alt === 'string') el.setAttribute('alt', block.alt.slice(0,200));
    }
    if (el.tagName === 'A') {
      const href = safeLink(block.href); if (href) el.setAttribute('href', href);
    }
  }
  function makeBlock(block) {
    const type = String(block?.type || '');
    const div = document.createElement('section');
    div.className = 'mmvs-r3-content';
    if (['heading','text','banner','mm10_step'].includes(type)) {
      const title = type === 'heading' ? block.text : type === 'text' ? '' : block.title;
      const body = type === 'heading' ? '' : type === 'text' ? block.text : type === 'mm10_step' ? block.body : block.text;
      if (title) { const h = document.createElement('h3'); h.textContent = String(title).slice(0,3000); div.append(h); }
      if (body) { const p = document.createElement('p'); p.textContent = String(body).slice(0,3000); div.append(p); }
      if (type === 'banner' && safeLink(block.url)) { const a = document.createElement('a'); a.href = safeLink(block.url); a.textContent = 'مشاهده'; div.append(a); }
    } else if (type === 'image') {
      const src = safeLink(block.url); if (!src) return null;
      const img = document.createElement('img'); img.src = src; img.alt = String(block.alt || '').slice(0,200); img.loading = 'lazy'; div.append(img);
    } else if (type === 'button') {
      const href = safeLink(block.url); if (!href) return null;
      const a = document.createElement('a'); a.href = href; a.textContent = String(block.text || 'مشاهده').slice(0,80); div.append(a);
    } else if (type === 'divider') {
      div.append(document.createElement('hr'));
    } else if (type === 'progress') {
      const h = document.createElement('h3'); h.textContent = String(block.title || 'پیشرفت'); div.append(h);
      const p = document.createElement('p'); p.textContent = 'برای نمایش پیشرفت واقعی، داده کاربر لازم است.'; div.append(p);
    } else return null;
    return div;
  }
  function applyBlocks(blocks) {
    if (!Array.isArray(blocks)) return;
    restore();
    // Apply changes without mutating original source files or executing HTML.
    for (const b of blocks.slice(0, 40)) if (b && b.type === 'element') applyElement(b);
    const added = blocks.filter(b => b && b.type !== 'element').map(makeBlock).filter(Boolean);
    if (added.length) {
      addon = document.createElement('div'); addon.className = 'mmvs-r3-addons';
      addon.setAttribute('aria-label','محتوای افزوده‌شده در استودیو'); addon.append(...added);
      const footer = root.querySelector('.mm-footer');
      if (footer) footer.before(addon); else root.append(addon);
    }
  }
  function cssPath(el) {
    if (!isEditable(el)) return '';
    if (el === document.body) return 'body';
    const segments = [];
    for (let node = el; node instanceof Element && node !== root; node = node.parentElement) {
      if (node.id && /^stage-[1-7]$/.test(node.id)) { segments.unshift('#' + node.id); break; }
      const parent = node.parentElement;
      if (!parent) return '';
      const tag = node.tagName.toLowerCase();
      const peers = [...parent.children].filter(c => c.tagName === node.tagName);
      segments.unshift(tag + (peers.length > 1 ? `:nth-of-type(${peers.indexOf(node)+1})` : ''));
    }
    if (!segments.some(x => x.startsWith('#stage-'))) segments.unshift('.mm-app');
    const path = segments.join(' > ');
    try { return document.querySelector(path) === el ? path : ''; } catch { return ''; }
  }
  if (inPreview) {
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || e.source !== window.parent || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'MMVS_PREVIEW') applyBlocks(e.data.blocks);
    });
    document.addEventListener('click', e => {
      if (document.documentElement.classList.contains('mmvs-spatial-on')) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest('.mmvs-r3-addons')) return;
      const editable = target.closest('.mm-stage__title,.mm-stage__icon,.mm-stage__toggle,.mm-stage__head,.mm-feature__copy h2,.mm-feature__copy p,.mm-mini,.mm-art,.mm-guide__art,.mm-cta,.mm-duel img,.mm-compare-card,.mm-disclaimer') || target;
      const selector = cssPath(editable);
      if (!selector) return;
      window.parent.postMessage({type:'MMVS_SELECT',element:{selector,tag:editable.tagName,text:editable.textContent?.trim().slice(0,3000)||'',href:editable.getAttribute('href'),src:editable.getAttribute('src')}},location.origin);
    }, true);
    window.parent.postMessage({type:'MMVS_READY'}, location.origin);
  } else {
    // Public content is loaded only with Telegram-verified initData, using the EXISTING API.
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      fetch('/content/page', {method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({initData,slug:'mmtrade10x'})})
        .then(r => r.ok ? r.json() : null).then(data => { if (data?.blocks) applyBlocks(data.blocks); })
        .catch(() => {});
    }
  }
})();
