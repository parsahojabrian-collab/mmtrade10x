/* MMVS_R9_UNIFIED_WORKSPACE — MMVS_R9_1_CANVAS_FOCUS presentation only; no editor data mutations. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
function mount(){
 const workspace=$('workspace'),side=workspace?.querySelector(':scope > .side'),designer=document.querySelector('#pages-pane .designer'),toolbar=$('page-toolbar');
 const dom=$('mmvs-dom-explorer'),stack=$('mmvs-visual-stack');
 if(!workspace||!side||!designer||!toolbar||!dom||!stack||$('mmvs9-studio-menu'))return;
 // Main studio navigation, not the global superadmin modal.
 const controls=document.createElement('div');controls.className='mmvs9-controls';
 const make=(id,label,pressed)=>{const b=document.createElement('button');b.type='button';b.id=id;b.className='mmvs9-control';b.textContent=label;b.setAttribute('aria-expanded',String(pressed));return b};
 const menu=make('mmvs9-studio-menu','☰ صفحه‌ها',false),tools=make('mmvs9-studio-tools','☷ ابزارها',false),inspect=make('mmvs9-studio-inspector','⚙ Inspector',false),dockBtn=make('mmvs9-studio-dom','▤ DOM / لایه‌ها',true);
 controls.append(menu,tools,inspect,dockBtn);toolbar.insertBefore(controls,toolbar.firstChild);
 const scrim=document.createElement('button');scrim.type='button';scrim.id='mmvs9-studio-scrim';scrim.setAttribute('aria-label','بستن منو');document.body.append(scrim);
 side.id='mmvs9-studio-nav';menu.setAttribute('aria-controls',side.id);
 const layerPane=$('mmvs-r6-layers'),inspector=designer.querySelector(':scope > .inspector');
 if(layerPane)tools.setAttribute('aria-controls',layerPane.id);
 if(inspector){inspector.id=inspector.id||'mmvs9-studio-inspector-panel';inspect.setAttribute('aria-controls',inspector.id)}
 const dock=document.createElement('section');dock.id='mmvs9-dock';dock.dataset.mode='stack';dock.classList.add('mmvs9-dock-collapsed');dock.setAttribute('aria-label','پشته بصری و درخت HTML');
 const head=document.createElement('div');head.id='mmvs9-dock-header';
 const title=document.createElement('strong');title.textContent='DOM و لایه‌ها';
 const tabs=document.createElement('div');tabs.id='mmvs9-dock-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','نوع فهرست');
 const domTab=document.createElement('button');domTab.type='button';domTab.textContent='درخت HTML';domTab.setAttribute('role','tab');
 const stackTab=document.createElement('button');stackTab.type='button';stackTab.textContent='ترتیب روی‌هم‌افتادن';stackTab.setAttribute('role','tab');
 const collapse=document.createElement('button');collapse.id='mmvs9-dock-toggle';collapse.type='button';
 tabs.append(stackTab,domTab);head.append(title,tabs,collapse);
 const body=document.createElement('div');body.id='mmvs9-dock-body';
 const slotDOM=document.createElement('div');slotDOM.id='mmvs9-dom-slot';slotDOM.setAttribute('role','tabpanel');
 const slotStack=document.createElement('div');slotStack.id='mmvs9-stack-slot';slotStack.setAttribute('role','tabpanel');
 // Reparent the *existing* live controls: listeners and identifiers remain unchanged.
 dom.open=true;stack.open=true;slotDOM.append(dom);slotStack.append(stack);
 body.append(slotDOM,slotStack);dock.append(head,body);document.body.append(dock);
 const syncLogin=()=>{dock.hidden=workspace.hidden};syncLogin();new MutationObserver(syncLogin).observe(workspace,{attributes:true,attributeFilter:['hidden']});
 const extra=document.createElement('details');extra.id='mmvs9-more';const summary=document.createElement('summary');summary.className='mmvs9-control';summary.textContent='⋯ بیشتر';const extraContent=document.createElement('div');extraContent.id='mmvs9-more-content';
 extra.append(summary,extraContent);const actions=toolbar.querySelector('.actions');
 for(const id of ['undo','redo','export-page','import-page','edit-page-root','reload']){const button=$(id);if(button&&actions?.contains(button))extraContent.append(button)}
 if(actions)actions.append(extra);
 let opened=false;
 function refresh(){
  const menuOpen=document.body.classList.contains('mmvs9-menu-open');menu.setAttribute('aria-expanded',String(menuOpen));
  tools.setAttribute('aria-expanded',String(designer.classList.contains('mmvs9-tools-open')));
  inspect.setAttribute('aria-expanded',String(designer.classList.contains('mmvs9-inspector-open')));
  opened=!dock.classList.contains('mmvs9-dock-collapsed');dockBtn.setAttribute('aria-expanded',String(opened));
  collapse.textContent=opened?'▾ جمع‌کردن':'▴ بازکردن';collapse.setAttribute('aria-expanded',String(opened));
  stackTab.setAttribute('aria-selected',String(dock.dataset.mode==='stack'));domTab.setAttribute('aria-selected',String(dock.dataset.mode==='dom'));
 }
 function closeOverlays(){document.body.classList.remove('mmvs9-menu-open');designer.classList.remove('mmvs9-tools-open','mmvs9-inspector-open');refresh()}
 menu.onclick=()=>{const next=!document.body.classList.contains('mmvs9-menu-open');closeOverlays();document.body.classList.toggle('mmvs9-menu-open',next);refresh()};
 tools.onclick=()=>{const next=!designer.classList.contains('mmvs9-tools-open');closeOverlays();designer.classList.toggle('mmvs9-tools-open',next);refresh()};
 inspect.onclick=()=>{const next=!designer.classList.contains('mmvs9-inspector-open');closeOverlays();designer.classList.toggle('mmvs9-inspector-open',next);refresh()};
 dockBtn.onclick=()=>{dock.classList.toggle('mmvs9-dock-collapsed');refresh()};
 collapse.onclick=()=>{dock.classList.toggle('mmvs9-dock-collapsed');refresh()};
 const setTab=mode=>{dock.dataset.mode=mode;dock.classList.remove('mmvs9-dock-collapsed');refresh()};
 domTab.onclick=()=>setTab('dom');stackTab.onclick=()=>setTab('stack');
 side.addEventListener('click',e=>{if(e.target.closest('button.tab,button[data-tab]'))closeOverlays()});
 scrim.onclick=closeOverlays;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeOverlays();extra.open=false}});
 document.addEventListener('click',e=>{if(extra.open&&!extra.contains(e.target))extra.open=false});
 // Canvas-first default. Advanced tools stay available in a single click.
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
