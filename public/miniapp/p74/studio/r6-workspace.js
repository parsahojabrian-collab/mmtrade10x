/* MMVS_R6_WORKSPACE */
(()=>{'use strict';
function mount(){const d=document,designer=d.querySelector('#pages-pane .designer'),preview=designer?.querySelector(':scope > .preview-area'),inspector=designer?.querySelector(':scope > .inspector'),spatial=d.getElementById('spatial-panel');if(!designer||!preview||!inspector||!spatial)return;
let layers=d.getElementById('mmvs-r6-layers');if(!layers){layers=d.createElement('aside');layers.id='mmvs-r6-layers';layers.className='mmvs-r6-layers';layers.setAttribute('aria-label','درخت عناصر و ابزارهای لایه');designer.insertBefore(layers,preview);}
if(spatial.parentElement!==layers)layers.appendChild(spatial);
let tabs=d.getElementById('mmvs-r6-tabs');if(!tabs){tabs=d.createElement('div');tabs.id='mmvs-r6-tabs';tabs.className='mmvs-r6-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','بخش‌های محیط ویرایش');[['canvas','پیش‌نمایش'],['layers','لایه‌ها'],['inspector','تنظیمات']].forEach(([id,label])=>{const b=d.createElement('button');b.type='button';b.textContent=label;b.dataset.r6Tab=id;b.addEventListener('click',()=>select(id));tabs.appendChild(b)});designer.parentElement.insertBefore(tabs,designer);}
function select(id){designer.dataset.r6View=id;tabs.querySelectorAll('button').forEach(b=>{const active=b.dataset.r6Tab===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});}
select(designer.dataset.r6View||'canvas');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
