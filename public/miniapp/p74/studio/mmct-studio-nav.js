/* MMVS Copytrade Academy R2 — editor-only lesson navigation. */
(() => {
 'use strict';
 const frame=document.getElementById('frame');
 const toolbar=document.querySelector('.preview-toolbar');
 const current=document.getElementById('current-title');
 if(!frame||!toolbar||!current)return;
 const root=document.createElement('div');root.id='mmct-studio-nav';root.hidden=true;
 root.setAttribute('aria-label','ناوبری آموزش کپی‌ترید در استودیو');
 root.innerHTML=`<label>نمایش <select id="mmct-studio-lesson"><option value="-1">فهرست هفت درس</option>${Array.from({length:7},(_,i)=>`<option value="${i}">درس ${i+1}</option>`).join('')}</select></label><label>بخش درس <select id="mmct-studio-slide">${Array.from({length:4},(_,i)=>`<option value="${i}">بخش ${i+1}</option>`).join('')}</select></label><span class="mmct-tip">آیکون یا متن را انتخاب و در «تنظیمات عنصر» ویرایش کن. قفل از لیست لایه‌ها باز می‌شود.</span>`;
 toolbar.insertAdjacentElement('afterend',root);
 const css=document.createElement('style');css.textContent=`
  #mmct-studio-nav{padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#0a201b;border:1px solid #39654f;border-radius:12px;color:#e6f9ee;direction:rtl;margin:8px 0}
  #mmct-studio-nav[hidden]{display:none!important}
  #mmct-studio-nav label{display:flex;align-items:center;gap:7px;font-size:12px}
  #mmct-studio-nav select{font:inherit;color:#f5fffb;background:#103c2b;border:1px solid #599b7e;border-radius:8px;min-height:35px;padding:4px 8px}
  #mmct-studio-nav .mmct-tip{font-size:11px;opacity:.76;flex:1 1 170px}
 `;document.head.append(css);
 const lesson=document.getElementById('mmct-studio-lesson');
 const slide=document.getElementById('mmct-studio-slide');
 const isThis=()=>frame.src.includes('/copytrade-academy/')||current.textContent.includes('آموزش کپی‌ترید ۱۰ایکس');
 function send(){if(!isThis())return;const k=Number(lesson.value),s=Number(slide.value);slide.disabled=k<0;root.hidden=false;frame.contentWindow?.postMessage({type:'MMCT_STUDIO_NAV',lesson:k,slide:s},location.origin);}
 function update(){const active=isThis();root.hidden=!active;if(active)send();}
 lesson.addEventListener('change',()=>{slide.value='0';send();});slide.addEventListener('change',send);
 frame.addEventListener('load',()=>{if(isThis())setTimeout(send,180)});
 new MutationObserver(update).observe(current,{childList:true,characterData:true,subtree:true});
 update();
})();
