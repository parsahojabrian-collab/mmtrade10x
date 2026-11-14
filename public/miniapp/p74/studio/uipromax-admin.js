/* MMTrade10X · UI/UX Pro Max mobile interaction layer */
(() => {
  'use strict';
  const root = document.documentElement;
  const body = document.body;
  let observer;

  function syncViewport() {
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const height = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--uix-vv-top', Math.max(0, top) + 'px');
    root.style.setProperty('--uix-vv-height', Math.max(280, height) + 'px');
    const drawerOpen = body.classList.contains('p53-drawer-open');
    const keyboardOpen = !!(drawerOpen && vv && (window.innerHeight - vv.height > 120));
    body.classList.toggle('uix-keyboard-open', keyboardOpen);
  }

  function syncEmptyState() {
    const drawer = document.getElementById('p53-mobile-drawer');
    const groups = drawer && drawer.querySelector('.p53-groups');
    if (!groups) return;
    let empty = groups.querySelector('.uix-p53-empty');
    const visible = [...groups.querySelectorAll('.p53-group')].some(group => !group.hidden);
    if (!visible) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'uix-p53-empty';
        empty.setAttribute('role', 'status');
        empty.textContent = 'بخشی با این عبارت پیدا نشد.';
        groups.append(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  }

  function init() {
    const drawer = document.getElementById('p53-mobile-drawer');
    const search = drawer && drawer.querySelector('.p53-search');
    if (drawer) {
      drawer.setAttribute('tabindex', '-1');
      drawer.setAttribute('aria-modal', 'true');
    }
    if (search) {
      search.setAttribute('autocomplete', 'off');
      search.setAttribute('inputmode', 'search');
      search.setAttribute('enterkeyhint', 'search');
      search.style.fontSize = '16px';
      search.addEventListener('focus', () => {
        syncViewport();
        requestAnimationFrame(() => search.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      }, { passive: true });
      search.addEventListener('input', () => requestAnimationFrame(syncEmptyState), { passive: true });
    }
    if (drawer) {
      observer = new MutationObserver(() => {
        syncViewport();
        syncEmptyState();
      });
      observer.observe(drawer, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open'] });
    }
    syncViewport();
    syncEmptyState();
  }

  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', syncViewport, { passive: true });
  }
  new MutationObserver(syncViewport).observe(body, { attributes: true, attributeFilter: ['class'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
