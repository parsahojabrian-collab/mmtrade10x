/* TENX_SAFE_CUSTOM_HTML_R1 — safe allowlist renderer; no executable HTML. */
(function (root) {
  'use strict';
  if (root.TenxSafeHtml) return;

  const ALLOWED_TAGS = new Set([
    'article','section','div','span','p','h1','h2','h3','h4','h5','h6',
    'strong','b','em','i','u','s','small','mark','ul','ol','li','a','img',
    'br','hr','blockquote','pre','code','figure','figcaption','table','thead',
    'tbody','tfoot','tr','th','td','details','summary'
  ]);
  const VOID_TAGS = new Set(['img','br','hr']);
  const DROP_SUBTREE = new Set([
    'script','style','iframe','frame','frameset','object','embed','applet',
    'form','input','button','textarea','select','option','svg','math',
    'template','noscript','link','meta','base','audio','video','source','canvas'
  ]);
  const ALLOWED_STYLES = new Set([
    'color','background-color','border-color','border-style','border-width',
    'font-size','font-weight','font-style','line-height','letter-spacing',
    'text-align','text-decoration','text-transform','white-space',
    'border-radius','padding','padding-top','padding-right','padding-bottom',
    'padding-left','margin','margin-top','margin-right','margin-bottom',
    'margin-left','width','max-width','min-width','height','max-height',
    'min-height','display','gap','row-gap','column-gap','flex-direction',
    'flex-wrap','align-items','justify-content','object-fit','vertical-align'
  ]);
  const COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{1,24}|rgba?\(\s*[\d.%+\-\s,]+\))$/i;
  const LENGTH = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)?$/i;
  const MAX_HTML = 16000;
  const MAX_NODES = 500;
  const MAX_DEPTH = 24;

  function isSafeUrl(value) {
    const url = String(value || '').trim();
    if (!url || url.length > 500 || /[\u0000-\u0020\\<>"']/u.test(url)) return false;
    if (/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(url)) return true;
    return /^\/(?!\/)[a-z0-9_./?%#=&+\-]*$/i.test(url) && !url.split('/').includes('..');
  }

  function isSafeImageUrl(value) {
    const url = String(value || '').trim();
    return url.length <= 500 && /^\/(?!\/)[a-z0-9_./-]+$/i.test(url) && !url.split('/').includes('..');
  }

  function validLength(value, options = {}) {
    const parts = String(value).trim().split(/\s+/);
    if (!parts.length || parts.length > (options.multi ? 4 : 1)) return false;
    return parts.every(part => {
      if (options.auto && part === 'auto') return true;
      if (part === '0') return true;
      if (!LENGTH.test(part)) return false;
      const n = Math.abs(Number.parseFloat(part));
      return Number.isFinite(n) && n <= (options.max || 1200) &&
        (options.negative || Number.parseFloat(part) >= 0);
    });
  }

  function validStyleValue(property, rawValue) {
    const value = String(rawValue || '').trim();
    if (!value || value.length > 120 ||
        /url\s*\(|expression\s*\(|javascript:|data:|@import|var\s*\(|behavior\s*:/i.test(value) ||
        /[\u0000-\u001f]/.test(value)) return false;
    if (['color','background-color','border-color'].includes(property)) return COLOR.test(value);
    if (property === 'border-style') return ['none','solid','dashed','dotted','double'].includes(value.toLowerCase());
    if (property === 'font-weight') return ['300','400','500','600','700','800','900','normal','bold'].includes(value.toLowerCase());
    if (property === 'font-style') return ['normal','italic','oblique'].includes(value.toLowerCase());
    if (property === 'text-align') return ['left','right','center','justify','start','end'].includes(value.toLowerCase());
    if (property === 'text-decoration') return ['none','underline','overline','line-through'].includes(value.toLowerCase());
    if (property === 'text-transform') return ['none','uppercase','lowercase','capitalize'].includes(value.toLowerCase());
    if (property === 'white-space') return ['normal','nowrap','pre','pre-wrap','pre-line','break-spaces'].includes(value.toLowerCase());
    if (property === 'display') return ['block','inline','inline-block','flex','grid','table','list-item'].includes(value.toLowerCase());
    if (property === 'flex-direction') return ['row','row-reverse','column','column-reverse'].includes(value.toLowerCase());
    if (property === 'flex-wrap') return ['nowrap','wrap','wrap-reverse'].includes(value.toLowerCase());
    if (property === 'align-items') return ['stretch','center','flex-start','flex-end','baseline'].includes(value.toLowerCase());
    if (property === 'justify-content') return ['start','end','center','space-between','space-around','space-evenly','flex-start','flex-end'].includes(value.toLowerCase());
    if (property === 'object-fit') return ['contain','cover','fill','none','scale-down'].includes(value.toLowerCase());
    if (property === 'vertical-align') return ['baseline','top','middle','bottom','sub','super'].includes(value.toLowerCase());
    if (property === 'line-height') {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0.8 && n <= 3;
    }
    if (property === 'letter-spacing') return validLength(value, { max: 20, negative: true });
    if (property === 'font-size') return validLength(value, { max: 96 });
    if (property.startsWith('padding')) return validLength(value, { max: 120, multi: property === 'padding' });
    if (property.startsWith('margin')) return validLength(value, { max: 120, multi: property === 'margin', negative: true, auto: true });
    if (property === 'border-radius') return validLength(value, { max: 100, multi: true });
    if (property === 'border-width') return validLength(value, { max: 16 });
    if (['width','max-width','min-width','height','max-height','min-height'].includes(property)) return validLength(value, { max: 1200, auto: true });
    if (['gap','row-gap','column-gap'].includes(property)) return validLength(value, { max: 120 });
    return false;
  }

  function sanitizeStyle(raw) {
    const result = {};
    String(raw || '').split(';').forEach(declaration => {
      const colon = declaration.indexOf(':');
      if (colon <= 0) return;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (ALLOWED_STYLES.has(property) && validStyleValue(property, value)) result[property] = value;
    });
    return result;
  }

  function safeAttribute(element, name, value) {
    const tag = element.tagName.toLowerCase();
    if (name === 'style') {
      Object.entries(sanitizeStyle(value)).forEach(([property, setting]) => element.style.setProperty(property, setting));
      return;
    }
    if (name === 'href' && tag === 'a') {
      if (isSafeUrl(value)) {
        element.setAttribute('href', value);
        if (/^https:\/\//i.test(value)) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        }
      }
      return;
    }
    if (name === 'src' && tag === 'img') {
      if (isSafeImageUrl(value)) {
        element.setAttribute('src', value);
        element.setAttribute('loading', 'lazy');
        element.setAttribute('decoding', 'async');
      }
      return;
    }
    if (name === 'class' && /^[a-z0-9 _-]{1,128}$/i.test(value)) {
      element.setAttribute('class', value);
      return;
    }
    if (['title','alt','dir','lang','role','aria-label'].includes(name)) {
      if (value.length <= 200 && !/[\u0000-\u001f]/.test(value) &&
          (name !== 'dir' || ['rtl','ltr','auto'].includes(value.toLowerCase())) &&
          (name !== 'lang' || /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value))) {
        element.setAttribute(name, value);
      }
      return;
    }
    if (['width','height'].includes(name) && /^\d{1,4}$/.test(value)) {
      const n = Number(value);
      if (n > 0 && n <= 1200) element.setAttribute(name, String(n));
    }
  }

  function append(container, source) {
    if (!container || !container.ownerDocument) return false;
    const doc = container.ownerDocument;
    const Parser = doc.defaultView && doc.defaultView.DOMParser || root.DOMParser;
    const html = String(source || '').slice(0, MAX_HTML);
    if (!Parser) {
      container.appendChild(doc.createTextNode(html));
      return false;
    }
    let parsed;
    try { parsed = new Parser().parseFromString(html, 'text/html'); }
    catch (_) { container.appendChild(doc.createTextNode(html)); return false; }

    let seen = 0;
    function copyNode(input, parent, depth) {
      if (++seen > MAX_NODES || depth > MAX_DEPTH) return;
      if (input.nodeType === 3) {
        parent.appendChild(doc.createTextNode(input.nodeValue || ''));
        return;
      }
      if (input.nodeType !== 1) return;
      const tag = input.tagName.toLowerCase();
      if (DROP_SUBTREE.has(tag)) return;
      if (!ALLOWED_TAGS.has(tag)) {
        Array.from(input.childNodes).forEach(child => copyNode(child, parent, depth + 1));
        return;
      }
      const output = doc.createElement(tag);
      Array.from(input.attributes || []).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') return;
        safeAttribute(output, name, attribute.value);
      });
      parent.appendChild(output);
      if (!VOID_TAGS.has(tag)) Array.from(input.childNodes).forEach(child => copyNode(child, output, depth + 1));
    }
    Array.from(parsed.body.childNodes).forEach(child => copyNode(child, container, 0));
    return true;
  }

  root.TenxSafeHtml = Object.freeze({
    append, isSafeUrl, isSafeImageUrl, sanitizeStyle,
    allowedTags: Object.freeze(Array.from(ALLOWED_TAGS)),
    droppedTags: Object.freeze(Array.from(DROP_SUBTREE))
  });
})(window);
