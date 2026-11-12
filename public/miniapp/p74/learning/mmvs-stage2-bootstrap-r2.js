/* MMTRADE_STAGE2_ROUTE_FIX_R2: Load studio bridges only in admin preview or after stage-1 authorization. */
(()=>{'use strict';
 if(window.__MMVS_STAGE2_BOOTSTRAP_R2__)return;
 window.__MMVS_STAGE2_BOOTSTRAP_R2__=true;
 const preview=new URLSearchParams(location.search).get('visualPreview')==='1';
 let started=false;
 function include(url){
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=url;script.async=false;
   script.onload=()=>resolve();
   script.onerror=()=>reject(Error('MMVS_STAGE2_BRIDGE_LOAD_FAILED: '+url));
   (document.head||document.documentElement).appendChild(script);
  });
 }
 async function activate(){
  if(started)return;
  if(!preview&&window.__MMVS_STAGE2_UNLOCKED__!==true)return;
  started=true;
  try{
   await include('/miniapp/p74/studio/bridge.js?v=BOT_PREVIEW_FIX_20261111_R1');
   await include('/miniapp/p74/studio/spatial-bridge.js?v=STAGE2_GATED_R2');
  }catch(err){
   started=false;
   console.error(err);
  }
 }
 if(preview||window.__MMVS_STAGE2_UNLOCKED__===true)activate();
 else window.addEventListener('mmvs:stage2-unlocked',activate,{once:true});
})();
