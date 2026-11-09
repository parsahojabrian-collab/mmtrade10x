/* MMVS_PUBLISHED_FOLD_R1: draft-and-publish first/last visible boundary */
(()=>{'use strict';
 if(window.__MMVS_PUBLISHED_FOLD_R1__)return;
 const $=id=>document.getElementById(id);
 const panel=$('mmvs-pub-fold-panel'),holder=$('preview-holder'),frame=$('frame');
 if(!panel||!holder||!frame)return;
 window.__MMVS_PUBLISHED_FOLD_R1__=true;
 const input=$('mmvs-pub-fold-height'),status=$('mmvs-pub-fold-status'),guide=$('mmvs-pub-fold-line');
 const MAX=12000,MIN=200;
 const num=n=>Number.isInteger(Number(n))&&Number(n)>=MIN&&Number(n)<=MAX?Number(n):null;
 const msg=(t,error=false)=>{status.textContent=t;status.classList.toggle('bad',error)};
 const cfg=()=>window.MMVS_PublishedFold;
 let lastPage='',lastSignature='',dragging=false;
 function pageKey(){return cfg()?.page?.()||$('current-title')?.textContent||''}
 function line(){
  const v=num(input.value),doc=frame.contentDocument;
  if(!v||!doc||doc.readyState==='loading'){guide.hidden=true;return}
  const a=frame.getBoundingClientRect(),b=holder.getBoundingClientRect();
  const y=a.top-b.top+holder.scrollTop+v;
  const x=a.left-b.left+holder.scrollLeft;
  // The marker describes document coordinates; don't misrepresent an off-canvas marker.
  if(y<0||y>holder.scrollHeight+150){guide.hidden=true;return}
  guide.style.left=Math.round(x)+'px';guide.style.top=Math.round(y)+'px';
  guide.style.width=Math.round(a.width)+'px';guide.hidden=false;
  guide.querySelector('span').textContent='مرز انتشار · '+v+'px (برای جابه‌جایی بکش)';
 }
 function sync(){
  const k=pageKey(),v=cfg()?.get?.(),signature=k+':'+JSON.stringify(v);
  if(k!==lastPage||signature!==lastSignature){lastPage=k;lastSignature=signature;input.value=num(v?.heightPx)||num($('mmvs-pc-height')?.value)||852;msg(v?.enabled?`برای این صفحه مرز ${v.heightPx}px در پیش‌نویس فعلی تنظیم شده است؛ انتشار را جداگانه انجام بده.`:'برای این صفحه مرز انتشار فعال نیست؛ نمایش محتوا کامل خواهد بود.');panel.dataset.configured=v?.enabled?'1':'0'}
  line();
 }
 function stage(enable){
  if(!cfg()?.set)return msg('اتصال به ویرایشگر آماده نیست؛ صفحه را یک بار بازخوانی کن.',true);
  const h=num(input.value);if(enable&&!h)return msg(`ارتفاع مرز باید بین ${MIN} و ${MAX} پیکسل باشد.`,true);
  try{const result=cfg().set(enable?{enabled:true,heightPx:h}:{enabled:false});if(!result?.ok)throw Error(result?.error||'پیش‌نویس تغییر نکرد');
   panel.dataset.configured=enable?'1':'0';msg(enable?`مرز ${h}px در پیش‌نویس ثبت شد. حالا «ذخیره» و سپس «انتشار» را بزن.`:'حذف مرز در پیش‌نویس ثبت شد؛ برای نمایش کامل صفحه به کاربران، ذخیره و منتشر کن.');
   line();
  }catch(e){msg('خطا: '+e.message,true)}
 }
 $('mmvs-pub-fold-from-guide').addEventListener('click',()=>{const h=num($('mmvs-pc-height')?.value);if(!h)return msg('ارتفاع قاب پیش‌نمایش معتبر نیست.',true);input.value=h;line();msg('ارتفاع از خط طلایی پیش‌نمایش گرفته شد؛ برای فعال‌شدن باید آن را در پیش‌نویس ثبت کنی.')});
 $('mmvs-pub-fold-stage').addEventListener('click',()=>stage(true));
 $('mmvs-pub-fold-clear').addEventListener('click',()=>stage(false));
 $('mmvs-pub-fold-see').addEventListener('click',()=>{const full=$('mmvs-pc-full');if(full)full.click();line();setTimeout(line,100);msg('خط قرمز مرز انتشار را نشان می‌دهد. می‌توانی برچسب خط را با انگشت جابه‌جا کنی.')});
 input.addEventListener('input',line);input.addEventListener('change',line);
 const grip=guide.querySelector('span');
 grip.addEventListener('pointerdown',e=>{if(!num(input.value))return;dragging=true;e.preventDefault();e.stopPropagation();grip.setPointerCapture?.(e.pointerId)});
 grip.addEventListener('pointermove',e=>{if(!dragging)return;e.preventDefault();const top=frame.getBoundingClientRect().top;const h=Math.round(e.clientY-top);input.value=Math.max(MIN,Math.min(MAX,h));line()});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(event,()=>{if(dragging){dragging=false;msg(`مرز به ${input.value}px جابه‌جا شد؛ دکمه «ثبت مرز در پیش‌نویس» را بزن.`)}});
 const mo=new MutationObserver(sync);if($('current-title'))mo.observe($('current-title'),{childList:true,characterData:true,subtree:true});
 window.addEventListener('mmvs:state',sync);holder.addEventListener('scroll',line,{passive:true});window.addEventListener('resize',line,{passive:true});frame.addEventListener('load',()=>{setTimeout(line,300)});
 if(window.ResizeObserver){const obs=new ResizeObserver(line);obs.observe(frame);obs.observe(holder)}
 sync();panel.dataset.runtime='ready';
})();
