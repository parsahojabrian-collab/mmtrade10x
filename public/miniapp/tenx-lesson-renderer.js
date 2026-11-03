
(function () {
  'use strict';

  var VERSION = '10x.lesson.v1';

  function el(tag, cls, value) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined && value !== null)
      node.textContent = String(value);
    return node;
  }

  function text(value, max) {
    return typeof value === 'string'
      ? value.slice(0, max || 10000) : '';
  }

  function safeImage(value) {
    if (typeof value !== 'string' || value.length > 2048)
      return false;
    try {
      var u = new URL(value, location.origin);
      return (
        u.protocol === 'https:' ||
        (u.origin === location.origin &&
         u.protocol === location.protocol)
      ) && !u.username && !u.password;
    } catch (_) {
      return false;
    }
  }

  function paragraph(container, value) {
    var p = el('p', 'tenx-lr-paragraph', text(value));
    container.appendChild(p);
  }

  function renderBlock(container, block) {
    if (!block || typeof block !== 'object' ||
        Array.isArray(block)) return;

    var type = block.type;

    if (type === 'heading') {
      var level = block.level === 3 ? 'h3' : 'h2';
      container.appendChild(
        el(level, 'tenx-lr-heading', text(block.text, 300))
      );
    }

    else if (type === 'paragraph') {
      paragraph(container, block.text);
    }

    else if (type === 'bullets') {
      if (!Array.isArray(block.items)) return;
      var ul = el('ul', 'tenx-lr-list');
      block.items.slice(0, 20).forEach(function (item) {
        ul.appendChild(el('li', '', text(item, 1000)));
      });
      container.appendChild(ul);
    }

    else if (type === 'callout') {
      var box = el('aside', 'tenx-lr-callout');
      if (block.title)
        box.appendChild(el('strong', '', text(block.title, 200)));
      paragraph(box, block.text);
      container.appendChild(box);
    }

    else if (type === 'image') {
      if (!safeImage(block.src)) return;
      var figure = el('figure', 'tenx-lr-figure');
      var img = document.createElement('img');
      img.src = block.src;
      img.alt = text(block.alt, 300);
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      figure.appendChild(img);
      if (block.caption)
        figure.appendChild(
          el('figcaption', '', text(block.caption, 500))
        );
      container.appendChild(figure);
    }

    else if (type === 'chart') {
      if (!Array.isArray(block.items)) return;
      var chart = el('section', 'tenx-lr-chart');
      if (block.title)
        chart.appendChild(
          el('strong', '', text(block.title, 200))
        );

      block.items.slice(0, 12).forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        var value = Number(item.value);
        if (!Number.isFinite(value)) return;
        value = Math.max(0, Math.min(100, value));

        var row = el('div', 'tenx-lr-chart-row');
        row.appendChild(
          el('span', '', text(item.label, 100))
        );

        var track = el('div', 'tenx-lr-track');
        var fill = el('div', 'tenx-lr-fill');
        fill.style.width = value + '%';
        track.appendChild(fill);

        row.appendChild(track);
        row.appendChild(
          el('b', '', value.toLocaleString('fa-IR') + '٪')
        );
        chart.appendChild(row);
      });

      container.appendChild(chart);
    }

    else if (type === 'balance-simulator') {
      var card = el('section', 'tenx-lr-interactive');
      card.appendChild(
        el('strong', '', text(
          block.title || 'شبیه‌سازی فشار خرید و فروش', 200
        ))
      );

      var input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '10';
      input.value = '50';
      input.setAttribute('aria-label', 'فشار نسبی خرید');

      var result = el('p', 'tenx-lr-result');

      function update() {
        var value = Number(input.value);
        result.textContent =
          'فشار نسبی خرید: ' +
          value.toLocaleString('fa-IR') +
          '٪ — ' +
          (value > 50
            ? 'در این مدل ساده، فشار خرید بیشتر است.'
            : value < 50
              ? 'در این مدل ساده، فشار فروش بیشتر است.'
              : 'در این مدل ساده، فشارها برابرند.');
      }

      input.addEventListener('input', update);
      card.appendChild(input);
      card.appendChild(result);
      card.appendChild(el(
        'small', '',
        'شبیه‌سازی مفهومی؛ پیش‌بینی قیمت واقعی نیست.'
      ));
      update();
      container.appendChild(card);
    }

    else if (type === 'summary') {
      var summary = el('section', 'tenx-lr-summary');
      summary.appendChild(
        el('h3', '', 'جمع‌بندی درس')
      );
      paragraph(summary, block.text);
      container.appendChild(summary);
    }
  }

  function render(target, raw) {
    if (!target) return false;
    var value = typeof raw === 'string' ? raw : '';
    var parsed;

    try {
      parsed = JSON.parse(value);
    } catch (_) {
      return false;
    }

    if (!parsed || parsed.version !== VERSION ||
        !Array.isArray(parsed.blocks) ||
        parsed.blocks.length > 100) return false;

    var fragment = document.createDocumentFragment();

    parsed.blocks.forEach(function (block) {
      renderBlock(fragment, block);
    });

    target.replaceChildren(fragment);
    target.classList.add('tenx-lr-root');
    return true;
  }

  window.TenxLessonRenderer = {
    version: VERSION,
    render: render
  };

  var css = `
  .tenx-lr-root{direction:rtl;line-height:2;text-align:right;
    overflow-wrap:anywhere;white-space:normal}
  .tenx-lr-paragraph{margin:12px 0;white-space:pre-line}
  .tenx-lr-heading{margin:24px 0 10px;font-weight:800;
    line-height:1.6}
  .tenx-lr-list{padding-right:22px;margin:12px 0}
  .tenx-lr-list li{margin:7px 0}
  .tenx-lr-callout,.tenx-lr-summary,.tenx-lr-interactive,
  .tenx-lr-chart{border:1px solid rgba(148,163,184,.25);
    border-radius:16px;padding:16px;margin:18px 0;
    background:rgba(148,163,184,.07)}
  .tenx-lr-figure{margin:20px 0;text-align:center}
  .tenx-lr-figure img{max-width:100%;height:auto;
    border-radius:14px}
  .tenx-lr-figure figcaption{font-size:12px;opacity:.7;
    margin-top:8px}
  .tenx-lr-chart-row{display:grid;
    grid-template-columns:minmax(70px,1fr) 2fr auto;
    gap:10px;align-items:center;margin:12px 0;font-size:13px}
  .tenx-lr-track{height:12px;background:rgba(148,163,184,.2);
    border-radius:20px;overflow:hidden}
  .tenx-lr-fill{height:100%;background:#39ff88;border-radius:20px}
  .tenx-lr-interactive input[type=range]{display:block;
    width:100%;margin:16px 0;accent-color:#39ff88}
  .tenx-lr-result{font-weight:600}
  .tenx-lr-interactive small{display:block;opacity:.7}
  @media(max-width:420px){
    .tenx-lr-chart-row{grid-template-columns:1fr 1.5fr auto;
      gap:6px}
  }`;

  var style = document.createElement('style');
  style.setAttribute('data-tenx-lesson-renderer', VERSION);
  style.textContent = css;
  document.head.appendChild(style);
})();
