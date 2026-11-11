/* MMVS_R5_LAYOUT: keep canvas above fold; relocate existing tools without cloning handlers. */
(() => {
  function mount(){
    const panel=document.getElementById('spatial-panel');
    const inspector=document.querySelector('#pages-pane .designer > .inspector');
    if(!panel||!inspector||panel.dataset.mmvsR5Mounted==='1')return;
    inspector.insertBefore(panel,inspector.firstChild);
    panel.dataset.mmvsR5Mounted='1';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
