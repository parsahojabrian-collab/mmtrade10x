/* MMVS_R4_TOOLS_FIX: preserve original handlers, only reorganize DOM. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
function init(){const root=$('spatial-panel');if(!root||$('mmvs-r4-nav'))return;
 const choices=[['html','HTML / DOM','mmvs-dom-explorer'],['visual','لایه‌های تصویری','spatial-layer-panel'],['edit','موقعیت و ترتیب','spatial-tools'],['extra','تنظیمات تکمیلی',null]];
 const nav=document.createElement('div');nav.id='mmvs-r4-nav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','گروه ابزارهای استودیو');
 const deck=document.createElement('div');deck.id='mmvs-r4-deck';
 const anchor=$('spatial-toolbar')||root.querySelector('.spatial-toolbar')||root.querySelector('.spatial-head');if(!anchor)return;
 anchor.after(nav,deck);
 const targets=new Set(choices.filter(x=>x[2]).map(x=>x[2]));
 for(const [key,label,id] of choices){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.r4Tab=key;button.setAttribute('role','tab');button.setAttribute('aria-selected','false');nav.append(button);}
 for(const id of targets){const node=$(id);if(!node)continue;node.dataset.mmvsR4Panel=id;deck.append(node)}
 // Existing controls stay in the document and retain their event listeners.
 const extra=document.createElement('section');extra.id='mmvs-r4-extra';extra.dataset.mmvsR4Panel='extra';
 const excluded=new Set(['spatial-head','spatial-toolbar','spatial-note','spatial-boundary-panel']);
 const extras=[...root.children].filter(el=>el!==nav&&el!==deck&&el!==anchor&&!el.classList.contains('spatial-head')&&!el.classList.contains('spatial-toolbar')&&!el.classList.contains('spatial-note')&&!el.classList.contains('spatial-boundary-panel'));
 for(const el of extras)extra.append(el);deck.append(extra);
 function activate(key){for(const b of nav.querySelectorAll('button'))b.setAttribute('aria-selected',String(b.dataset.r4Tab===key));for(const p of deck.children){const active=(key==='extra'?p===extra:p.id===choices.find(x=>x[0]===key)?.[2]);p.classList.toggle('mmvs-r4-visible',active);if(active&&p.tagName==='DETAILS')p.open=true}}
 nav.addEventListener('click',e=>{const b=e.target.closest('button[data-r4-tab]');if(b)activate(b.dataset.r4Tab)});
 activate('html');
 const status=$('mmvs-dom-status');if(status)status.textContent='برای اسکن، صفحه را باز کن و «بازخوانی HTML» را بزن.';
 const refresh=()=>{const button=$('mmvs-dom-refresh');if(button&&document.visibilityState!=='hidden')button.click()};
 $('frame')?.addEventListener('load',()=>setTimeout(refresh,650));
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('frame')?.contentWindow)return;if(e.data?.type==='MMVS_SPATIAL_READY'||e.data?.type==='MMVS_READY')setTimeout(refresh,450)});
 window.MMVS_R4_TOOLS={activate,refresh};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
