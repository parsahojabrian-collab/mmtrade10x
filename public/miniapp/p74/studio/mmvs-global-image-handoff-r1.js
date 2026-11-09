/* MMVS_GLOBAL_IMAGE_SPATIAL_R1 — generic gallery -> editable iframe handoff.
 * Only operates in Visual Studio; no API/DB changes or scrolling patches. */
(()=>{
  'use strict';
  if(window.__MMVS_GLOBAL_IMAGE_HANDOFF_R1__)return;
  window.__MMVS_GLOBAL_IMAGE_HANDOFF_R1__=true;
  const $=id=>document.getElementById(id);
  let pending=null,serial=0;
  function note(s){const node=$('notice');if(!node)return;node.textContent=s;node.className='show';}
  function onChange(e){
    const input=e.target;
    if(!(input instanceof HTMLInputElement)||input.type!=='url')return;
    const props=input.closest('#block-properties');
    if(!props||!props.querySelector('input[type="file"]'))return;
    const src=input.value.trim();if(!src)return;
    const frame=$('frame');if(!frame)return;
    const seq=++serial;
    pending={src,seq,attempt:0};
    setTimeout(()=>focus(seq),90);
  }
  function focus(seq){
    if(!pending||pending.seq!==seq)return;
    const frame=$('frame');if(!frame)return;
    let doc,win;
    try{doc=frame.contentDocument;win=frame.contentWindow}catch{return}
    if(!doc||!win)return;
    if(!win.__MMVS_GLOBAL_IMAGE_IDS_R1__){
      pending=null;
      note('پیش‌نمایش این صفحه پل تصویری ندارد یا صفحه بارگذاری نشده است؛ مسیر پیش‌نمایش را بررسی کن.');
      return;
    }
    const imgs=Array.from(doc.querySelectorAll('#mmvs-managed-content .mmvs-c-block > img'));
    const matches=imgs.filter(im=>(im.getAttribute('src')||'')===pending.src);
    const image=matches[matches.length-1];
    if(!image||!image.id){
      if(++pending.attempt<=20)setTimeout(()=>focus(seq),100);
      else{pending=null;note('عکس به پیش‌نویس افزوده شد، اما در پیش‌نمایش دیده نشد؛ از بارگذاری صفحه اطمینان بگیر.');}
      return;
    }
    pending=null;
    const selector='#'+image.id;
    const mode=$('spatial-mode');
    if(mode&&!mode.disabled&&!mode.classList.contains('active'))mode.click();
    try{window.MMVS_Spatial?.refresh?.()}catch{}
    try{image.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'})}catch{}
    try{$('preview-holder')?.scrollIntoView({block:'start',behavior:'auto'})}catch{}
    // The common spatial bridge consumes PICK in any supported page.
    win.postMessage({type:'MMVS_SPATIAL_PICK',selector},location.origin);
    note('عکس در پیش‌نمایش انتخاب شد؛ با انگشت جابه‌جا کن و از «ذخیره» و «انتشار» استفاده کن.');
  }
  function onMessage(e){
    const frame=$('frame');if(!frame||e.source!==frame.contentWindow||e.origin!==location.origin)return;
    if(e.data?.type!=='MMVS_GLOBAL_IMAGES_RENDERED_R1')return;
    // Reapply existing spatial layout after the content bridge recreates image DOM nodes.
    try{window.MMVS_Spatial?.refresh?.()}catch{}
    if(pending)setTimeout(()=>focus(pending.seq),0);
  }
  document.addEventListener('change',onChange,true);
  window.addEventListener('message',onMessage);
})();
