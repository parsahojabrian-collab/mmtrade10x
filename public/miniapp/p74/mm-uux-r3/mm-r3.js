/* MMTRADE UI/UX Pro Max R3 — progressive DOM enhancements.
 * Never replaces application content, monkey-patches app handlers, changes auth,
 * sends requests, modifies state, or rewrites link destinations.
 */
(function () {
  'use strict';
  if (window.__MMTRADE_UIUX_R3__) return;
  window.__MMTRADE_UIUX_R3__ = Object.freeze({ version: 'R3-20261118' });

  var doc = document;
  var html = doc.documentElement;

  function classify() {
    var p = window.location.pathname.toLowerCase();
    if (p.indexOf('/miniapp/p74/studio/') !== -1) return 'visual-studio';
    if (p.indexOf('control-center-v2') !== -1) return 'control-center';
    if (p.indexOf('academy-studio') !== -1 || p.indexOf('/learning/studio.html') !== -1) return 'academy-studio';
    if (p.indexOf('copytrade-academy') !== -1) return 'copytrade';
    if (p.indexOf('eplanet') !== -1 || p.indexOf('marhale2') !== -1) return 'eplanet';
    if (p.indexOf('/profile') !== -1 && p.indexOf('/miniapp/team') === -1) return 'profile';
    if (p.indexOf('/support') !== -1) return 'support';
    if (p.indexOf('/academy') !== -1 || p.indexOf('/learning/') !== -1) return 'academy';
    if (p.indexOf('/team') !== -1) return 'team';
    if (p.indexOf('/admin') !== -1) return 'admin';
    if (p.indexOf('preview') !== -1 && doc.querySelector('#p74-app')) return 'home';
    if (p === '/' || p === '/miniapp' || p === '/miniapp/' || p.endsWith('/miniapp/index.html')) return 'home';
    return 'generic';
  }

  function addSkip() {
    if (doc.querySelector('.mm3-skip')) return;
    var main = doc.querySelector('main:not([hidden]), #workspace:not([hidden]), .main:not([hidden])');
    if (!main || !doc.body || doc.querySelector('#p74-app')) return;
    if (!main.id) main.id = 'mm3-main';
    var skip = doc.createElement('a');
    skip.className = 'mm3-skip';
    skip.href = '#' + main.id;
    skip.textContent = 'پرش به محتوای اصلی';
    doc.body.insertBefore(skip, doc.body.firstChild);
  }

  function tagSemanticRegions() {
    var page = html.getAttribute('data-mm-r3-page');
    if (page === 'visual-studio') {
      var side = doc.querySelector('.workspace .side');
      var header = doc.querySelector('.header');
      if (side && header && !doc.querySelector('#mm3-studio-nav-toggle')) {
        if (!side.id) side.id = 'mm3-studio-side';
        var button = doc.createElement('button');
        button.type = 'button';
        button.id = 'mm3-studio-nav-toggle';
        button.className = 'minor mm3-studio-nav-toggle';
        button.textContent = 'نمایش / پنهان‌سازی ابزارها';
        button.setAttribute('aria-controls', side.id);
        button.setAttribute('aria-expanded', 'true');
        button.addEventListener('click', function() {
          var hidden = html.getAttribute('data-mm-r3-side-hidden') === 'true';
          html.setAttribute('data-mm-r3-side-hidden', hidden ? 'false' : 'true');
          button.setAttribute('aria-expanded', hidden ? 'true' : 'false');
        });
        header.appendChild(button);
      }
    }

    // Unobtrusive section semantics. Do not override existing ARIA roles.
    var nav = doc.querySelector('#mmu-bottom-nav');
    if (nav && !nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', 'ناوبری اصلی MMTRADE');
    var tabbar = doc.querySelector('.studio-shell .studio-tabs');
    if (tabbar && !tabbar.hasAttribute('aria-label')) tabbar.setAttribute('aria-label', 'بخش‌های استودیوی آکادمی');
  }

  function initialize() {
    if (!doc.body) return;
    html.setAttribute('data-mm-r3-page', classify());
    html.setAttribute('data-mm-r3-ready', 'true');
    addSkip();
    tagSemanticRegions();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
