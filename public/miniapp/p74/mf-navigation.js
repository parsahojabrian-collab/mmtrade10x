/* MATIN_FUTURE_NAVIGATION_R1 */
(function () {
  'use strict';
  if (window.__MF_GLOBAL_NAV_R1__) return;
  window.__MF_GLOBAL_NAV_R1__ = true;

  var NAV_ID = 'mf-global-bottom-nav';
  var ACADEMY_HOME = '/miniapp/p74/learning/academy-home.html';
  var STAGE1 = '/miniapp/p74/learning/stage1.html';

  var iconPaths = {
    home: 'M3 10 L12 3 L21 10 V21 H14 V14 H10 V21 H3 Z',
    academy: 'M3 7 L12 3 L21 7 L12 11 Z M5 9 V16 Q12 21 19 16 V9 M21 7 V15',
    support: 'M4 13 V11 A8 8 0 0 1 20 11 V13 M4 12 H3 V18 H6 V12 Z M20 12 H21 V18 H18 V12 Z',
    chart: 'M4 20 V12 H8 V20 Z M10 20 V5 H14 V20 Z M16 20 V9 H20 V20 Z',
    trophy: 'M7 3 H17 V9 A5 5 0 0 1 7 9 Z M7 6 H3 V8 A5 5 0 0 0 8 13 M17 6 H21 V8 A5 5 0 0 1 16 13 M12 13 V18 M8 21 H16',
    user: 'M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12 M4 21 A8 8 0 0 1 20 21',
    book: 'M3 4 H10 Q12 4 12 6 V21 Q12 18 9 18 H3 Z M21 4 H14 Q12 4 12 6 V21 Q12 18 15 18 H21 Z',
    star: 'M12 2 L15 9 L22 9 L16.5 14 L18.5 22 L12 17.5 L5.5 22 L7.5 14 L2 9 L9 9 Z'
  };

  var fallbackItems = [
    { id: 'home', label: 'خانه', href: '/miniapp', icon: 'home', enabled: true, sort: 10 },
    { id: 'academy', label: 'آکادمی', href: ACADEMY_HOME, icon: 'academy', enabled: true, sort: 20 },
    { id: 'support', label: 'پشتیبانی', href: '/miniapp/p74/support/support.html', icon: 'support', enabled: true, sort: 30 },
    { id: 'copy-trading', label: 'کپی‌ترید', href: '/copy-trading', icon: 'chart', enabled: true, sort: 40 }
  ];

  function cleanPath(value) {
    return String(value || '/').split('?')[0].replace(/\/+$/, '') || '/';
  }

  function validHref(value) {
    return typeof value === 'string' &&
      /^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(value) &&
      value.indexOf('..') === -1;
  }

  function makeItems(source) {
    var items = (Array.isArray(source) ? source : []).filter(function (item) {
      return item && item.enabled === true &&
        typeof item.label === 'string' && item.label.trim() &&
        validHref(item.href) &&
        Object.prototype.hasOwnProperty.call(iconPaths, item.icon);
    }).map(function (item) {
      return {
        id: String(item.id || ''),
        label: item.label.trim().slice(0, 32),
        href: item.href,
        icon: item.icon,
        sort: Number(item.sort) || 0
      };
    }).sort(function (a, b) { return a.sort - b.sort; }).slice(0, 8);

    var placeholder = items.find(function (item) {
      return /آیتم جدید|آيتم جديد|new item/i.test(item.label);
    });
    if (placeholder) {
      placeholder.id = 'mmtrade10x';
      placeholder.label = 'MMTrade10X';
      placeholder.href = STAGE1;
    } else if (!items.some(function (item) { return item.id === 'mmtrade10x'; })) {
      items.push({
        id: 'mmtrade10x',
        label: 'MMTrade10X',
        href: STAGE1,
        icon: 'trophy',
        sort: 999
      });
    }
    return items;
  }

  function activeItem(items) {
    var path = cleanPath(location.pathname);
    var view = new URLSearchParams(location.search).get('view');
    if (view === 'academy') return items.find(function (item) { return item.id === 'academy'; }) || null;
    if (view === 'mmtrade10x') return items.find(function (item) { return item.id === 'mmtrade10x'; }) || null;

    var exact = items.find(function (item) {
      return cleanPath(item.href) === path;
    });
    if (exact) return exact;

    if (path === '/miniapp' || path === '/miniapp/index.html' || path === '/') {
      return items.find(function (item) { return item.id === 'home'; }) || null;
    }
    if (/\/(learning|academy)(\/|$)/i.test(path) || /marhaleh1/i.test(path)) {
      return items.find(function (item) { return item.id === 'academy'; }) || null;
    }
    if (/\/support(\/|\.html|$)/i.test(path)) {
      return items.find(function (item) { return item.id === 'support'; }) || null;
    }
    if (/\/profile(\/|\.html|$)/i.test(path)) {
      return items.find(function (item) {
        return item.id === 'profile' || item.icon === 'user';
      }) || null;
    }
    if (/copy[-_]?trading/i.test(path)) {
      return items.find(function (item) {
        return item.id === 'copy-trading' || /کپی/.test(item.label);
      }) || null;
    }
    return null;
  }

  function ensureNav(items) {
    var nav = document.getElementById(NAV_ID);
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = NAV_ID;
      nav.className = 'mf-global-bottom-nav';
      nav.setAttribute('aria-label', 'ناوبری اصلی MATIN FUTURE');
    }

    var app = document.getElementById('p74-app');
    var host = app || document.body;
    if (host && nav.parentNode !== host) host.appendChild(nav);

    nav.replaceChildren();
    var active = activeItem(items);
    items.forEach(function (item) {
      var link = document.createElement('a');
      link.className = 'mf-global-nav-item';
      link.href = item.href;
      link.dataset.nav = item.id;
      link.setAttribute('aria-label', item.label);

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', iconPaths[item.icon]);
      svg.appendChild(path);

      var label = document.createElement('span');
      label.textContent = item.label;
      link.append(svg, label);

      if (active && active.id === item.id) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
      nav.appendChild(link);
    });
    nav.dataset.ready = '1';
  }

  function init() {
    document.documentElement.classList.add('mf-nav-enabled');
    var items = makeItems(fallbackItems);
    ensureNav(items);

    fetch('/public/bottom-nav', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin'
    }).then(function (response) {
      if (!response.ok) throw new Error('bottom_nav_unavailable');
      return response.json();
    }).then(function (config) {
      if (config && Array.isArray(config.items)) {
        var managed = makeItems(config.items);
        if (managed.length) {
          items = managed;
          ensureNav(items);
        }
      }
    }).catch(function (error) {
      console.warn('MATIN FUTURE shared navigation: using safe defaults.', error);
    });

    if (window.MutationObserver && document.body) {
      var observer = new MutationObserver(function () {
        var app = document.getElementById('p74-app');
        var nav = document.getElementById(NAV_ID);
        if (!nav) {
          ensureNav(items);
          return;
        }
        if (app && nav.parentNode !== app) app.appendChild(nav);
        if (!app && nav.parentNode !== document.body) document.body.appendChild(nav);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
