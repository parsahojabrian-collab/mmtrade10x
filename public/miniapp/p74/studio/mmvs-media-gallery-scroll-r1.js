/* MMVS Media Gallery Scroll R1: adjusts ONLY open picture-library grids. */
(()=>{'use strict';
  if(window.__MMVS_MEDIA_GALLERY_SCROLL_R1__)return;
  window.__MMVS_MEDIA_GALLERY_SCROLL_R1__=true;
  const title=/\b(?:media|image|photo|asset)\s*(?:library|picker|gallery)\b|کتابخانه\s*(?:تصاویر|عکس|رسانه)|(?:گالری|انتخاب)\s*(?:تصاویر|عکس|رسانه|تصویر)/i;
  const name=/\b(?:media|image|photo|asset)[-_ ]*(?:library|picker|gallery|grid|list)\b|\b(?:library|picker|gallery)[-_ ]*(?:media|image|photo|asset)\b|mmvs[-_ ]*media/i;
  const panelSelector='dialog,[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="dialog"],[class*="popup"],[id*="modal"],[id*="dialog"],[id*="popup"]';
  const boundDocs=new WeakSet();
  const live=(el)=>{if(!el||!el.isConnected)return false;const win=el.ownerDocument.defaultView;const cs=win?.getComputedStyle(el);const r=el.getBoundingClientRect();return !!cs&&cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>50&&r.height>25;};
  const visiblePictures=(root)=>[...root.querySelectorAll('img')].filter(live);
  function enclosing(a,b){if(!a||!b)return null;let n=a;while(n&&!n.contains(b))n=n.parentElement;return n;}
  function galleryGrid(root,pictures){
    const candidates=[...root.querySelectorAll('[class*="grid"],[class*="list"],[class*="gallery"],[class*="items"],[class*="media"],[class*="library"]')]
      .filter(n=>n!==root&&live(n)&&pictures.filter(p=>n.contains(p)).length>=Math.min(3,pictures.length));
    // Prefer the smallest enclosing gallery list, not the dialog itself.
    candidates.sort((a,b)=>a.querySelectorAll('img').length-b.querySelectorAll('img').length||a.getBoundingClientRect().height-b.getBoundingClientRect().height);
    for(const n of candidates){
      const mediaChildren=[...n.children].filter(c=>pictures.some(p=>c===p||c.contains(p)));
      if(mediaChildren.length>=2)return n;
    }
    let common=pictures[0];for(const p of pictures.slice(1,7))common=enclosing(common,p);
    if(!common||common===root.ownerDocument.body||common===root.ownerDocument.documentElement)return null;
    if(common===root){
      // Avoid imposing a grid on a dialog's header/toolbar.
      const nested=[...root.children].find(c=>pictures.filter(p=>c.contains(p)).length>=Math.min(3,pictures.length));
      if(!nested||nested===root)return null;
      common=nested;
    }
    return common;
  }
  function dialogFor(node){
    const exact=node.closest(panelSelector);
    if(exact&&live(exact))return exact;
    let n=node,steps=0;
    while(n&&n!==node.ownerDocument.body&&steps++<9){
      if(visiblePictures(n).length>=3&&n.getBoundingClientRect().height>=150)return n;
      n=n.parentElement;
    }
    return null;
  }
  function findLibraries(doc){
    const out=new Set();
    // Look for named media library containers first.
    for(const e of doc.querySelectorAll('[id],[class],[aria-label]')){
      const label=[e.id,typeof e.className==='string'?e.className:'',e.getAttribute('aria-label')||''].join(' ');
      if(name.test(label)&&live(e)){
        const n=dialogFor(e)||e;
        if(visiblePictures(n).length>=3)out.add(n);
      }
    }
    // Localized modal titles provide a safe fallback for dynamic libraries.
    for(const e of doc.querySelectorAll('h1,h2,h3,h4,h5,summary,strong,header,button,[role="heading"],[aria-label]')){
      const str=(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,100);
      if(!title.test(str)||!live(e))continue;
      const n=dialogFor(e);
      if(n&&visiblePictures(n).length>=3)out.add(n);
    }
    return [...out];
  }
  function apply(doc){
    for(const panel of findLibraries(doc)){
      const images=visiblePictures(panel);
      const grid=galleryGrid(panel,images);
      if(!grid||!live(grid))continue;
      if(grid.children.length<2)continue;
      panel.classList.add('mmvs-mg-r1-panel');
      grid.classList.add('mmvs-mg-r1-scroll');
      grid.dataset.mmvsMediaGalleryScrollR1='applied';
    }
  }
  function attach(doc){
    if(!doc||!doc.documentElement||boundDocs.has(doc))return;
    boundDocs.add(doc);
    let scheduled=false;
    const schedule=()=>{if(scheduled)return;scheduled=true;doc.defaultView?.requestAnimationFrame(()=>{scheduled=false;apply(doc)});};
    new MutationObserver(schedule).observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','hidden','style','open']});
    doc.addEventListener('click',schedule,true);
    doc.addEventListener('load',schedule,true);
    schedule();
  }
  function attachFrames(){
    for(const frame of document.querySelectorAll('iframe')){
      try{if(frame.contentDocument)attach(frame.contentDocument);}catch(_){}
      if(!frame.dataset.mmvsMediaGalleryWatchR1){
        frame.dataset.mmvsMediaGalleryWatchR1='1';
        frame.addEventListener('load',()=>{try{attach(frame.contentDocument)}catch(_){}},{passive:true});
      }
    }
  }
  function start(){attach(document);attachFrames();new MutationObserver(attachFrames).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
