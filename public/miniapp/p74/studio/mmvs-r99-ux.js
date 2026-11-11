/* MMVS_R99_UX_REFINEMENT. Shell-only interaction. No change to iframe DOM or editor data. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
function mount(){
 const toolbar=$('page-toolbar'),controls=toolbar?.querySelector('.mmvs9-controls');
 const designer=document.querySelector('#pages-pane .designer'),dock=$('mmvs9-dock');
 if(!toolbar||!controls||!designer||!dock||$('mmvs99-focus'))return;
 const make=(id,text,title)=>{
  const b=document.createElement('button');b.type='button';b.id=id;b.className='mmvs99-control';
  b.textContent=text;b.title=title;return b;
 };
 const divider=document.createElement('span');divider.id='mmvs99-control-divider';divider.setAttribute('aria-hidden','true');controls.append(divider);
 const sizes=make('mmvs99-sizes','▣ ابعاد','باز و بسته‌کردن تنظیمات اندازه پیش‌نمایش');
 const focus=make('mmvs99-focus','⛶ تمرکز','پنهان‌کردن ابزارهای اضافی برای دیدن پیش‌نمایش');
 controls.append(sizes,focus);
 let syncingOverlay=false;
 const grouped=fn=>{if(syncingOverlay)return;syncingOverlay=true;try{fn()}finally{syncingOverlay=false}};
 const sizePanel=$('mmvs-preview-canvas-panel');
 function update(){
  sizes.setAttribute('aria-pressed',String(!document.body.classList.contains('mmvs99-size-hidden')));
  sizes.setAttribute('aria-expanded',String(!document.body.classList.contains('mmvs99-size-hidden')));
  focus.setAttribute('aria-pressed',String(document.body.classList.contains('mmvs99-focus')));
  focus.textContent=document.body.classList.contains('mmvs99-focus')?'⤢ خروج از تمرکز':'⛶ تمرکز';
 }
 document.body.classList.add('mmvs99-size-hidden');
 if(sizePanel){sizes.setAttribute('aria-controls',sizePanel.id);sizes.onclick=()=>{document.body.classList.toggle('mmvs99-size-hidden');update()}}
 else sizes.disabled=true;
 function closeBg(){const panel=$('mmvs-bg-panel');if(panel&&!panel.hidden)$('mmvs-bg-close')?.click()}
 function closeDock(){if(!dock.classList.contains('mmvs9-dock-collapsed'))$('mmvs9-dock-toggle')?.click()}
 function closePrimary(){
  if(document.body.classList.contains('mmvs9-menu-open'))$('mmvs9-studio-menu')?.click();
  if(designer.classList.contains('mmvs9-tools-open'))$('mmvs9-studio-tools')?.click();
  if(designer.classList.contains('mmvs9-inspector-open'))$('mmvs9-studio-inspector')?.click();
 }
 focus.onclick=()=>{
  const next=!document.body.classList.contains('mmvs99-focus');
  if(next){grouped(()=>{closePrimary();closeDock();closeBg()});document.body.classList.add('mmvs99-size-hidden')}
  document.body.classList.toggle('mmvs99-focus',next);update();
 };
 const side=make('mmvs99-dock-side','⇄','انتقال پنل DOM به سمت مقابل');
 side.className='';side.setAttribute('aria-label','تغییر سمت پنل DOM');
 const dockHead=$('mmvs9-dock-header');const toggle=$('mmvs9-dock-toggle');
 if(dockHead&&toggle)dockHead.insertBefore(side,toggle);
 side.onclick=()=>document.body.classList.toggle('mmvs99-dock-left');
 // Keep major overlays mutually exclusive while preserving their native click handlers.
 document.addEventListener('click',e=>{
  if(syncingOverlay)return;
  const el=e.target?.closest?.('button');if(!el)return;
  const id=el.id;
  if(['mmvs9-studio-menu','mmvs9-studio-tools','mmvs9-studio-inspector'].includes(id)){
    grouped(()=>{closeDock();closeBg()});
  }else if(['mmvs9-studio-dom','mmvs9-dock-toggle'].includes(id)){
    grouped(()=>{closeBg();closePrimary()});
  }else if(id==='mmvs-bg-toggle'){
    grouped(()=>{closeDock();closePrimary()});
  }
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   if(document.body.classList.contains('mmvs99-focus')){document.body.classList.remove('mmvs99-focus');update()}
   grouped(()=>{closeDock();closeBg()});
  }
 });
 update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
