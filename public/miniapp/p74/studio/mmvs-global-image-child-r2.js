/* MMVS_GLOBAL_IMAGE_SPATIAL_R2 — response in same-origin preview frame. */
(()=>{
 'use strict';
 if(window.__MMVS_GLOBAL_IMAGE_CHILD_R2__)return;
 window.__MMVS_GLOBAL_IMAGE_CHILD_R2__=true;
 const query=new URLSearchParams(location.search),path=location.pathname,view=query.get('view');
 /* MMTRADE_AUDIT_FIX_R1_CHILD_SLUG: agree with spatial-bridge on selected page. */
const slug=path.includes('/eplanet/')?'eplanet':path.includes('/learning/stage2')?'stage2':path.includes('/learning/')?'academy':path.includes('/profile/')?'profile':path.includes('/support/')?'support':path.includes('/copytrade-academy/')?'copytrade-academy':path.includes('/mmtrade-r3-preview/')?'mmtrade10x':path.includes('/crypto')?'crypto':path.includes('/copy-trading')?'copy-trading':path.includes('/challenge')?'challenge':view==='academy'?'academy':view==='profile'?'profile':view==='mmtrade10x'?'mmtrade10x':'index';
 window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.source!==window.parent)return;
   const d=event.data;
   if(!d||d.type!=='MMVS_GLOBAL_IMAGE_FOCUS_R2'||typeof d.selector!=='string'||!/^#mmvs-library-image-[a-f0-9]+-\d+$/.test(d.selector))return;
   const img=document.getElementById(d.selector.slice(1));
   if(!(img instanceof HTMLImageElement)||!img.closest('#mmvs-managed-content'))return;
   window.parent.postMessage({type:'MMVS_SPATIAL_SELECTED',slug,item:{selector:d.selector,x:0,y:0,scale:1}},location.origin);
   window.parent.postMessage({type:'MMVS_SELECT',element:{selector:d.selector,tag:'IMG',src:img.getAttribute('src'),alt:img.getAttribute('alt')}},location.origin);
 },false);
})();
