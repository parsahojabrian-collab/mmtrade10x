/* MMTrade R10: public startup guard, legacy page retirement and Home engine arbitration. */
(function(){'use strict';if(window.__MM_PAGE_GATE_R10__)return;window.__MM_PAGE_GATE_R10__=true;
const params=new URLSearchParams(location.search);
const preview=['visualPreview','p74Preview','p62preview','quizPreview','stagePreview','tenx_debug','editor','studio'].some(k=>params.has(k));
window.__MM_PAGE_ENGINE__='p74';
window.__MM_PAGE_GATE_REDIRECT__=false;
const path=location.pathname.replace(/\/+$/,'')||'/';
const isMain=path==='/miniapp'||path==='/miniapp/index.html';
const idxView=params.get('view')||'';
const hide=!preview;
if(hide){document.documentElement.style.setProperty('visibility','hidden');}
let watchdog=null;
const unhide=()=>{if(watchdog)clearTimeout(watchdog);document.documentElement.style.removeProperty('visibility');};
if(hide)watchdog=setTimeout(unhide,1800);
function sameTarget(a,b){
 try{const x=new URL(a,location.origin),y=new URL(b,location.origin);
  return x.origin===y.origin&&x.pathname.replace(/\/+$/,'')===y.pathname.replace(/\/+$/,'')&&x.search===y.search;
 }catch{return false}
}
function pageMatches(p){
 const urls=[p.path,p.target,...(Array.isArray(p.aliases)?p.aliases:[])];
 if(!idxView&&path==='/miniapp'&&p.slug==='index')return true;
 if(isMain&&idxView&&idxView===p.slug)return true;
 for(const target of urls){
  try{const u=new URL(target,location.origin);if(u.origin!==location.origin)continue;
   const v=u.searchParams.get('view');
   if(u.pathname.replace(/\/+$/,'')!==path)continue;
   if(isMain&&idxView&&p.slug==='index')continue;
   if(v&&v!==idxView)continue;
   if(v===null&&isMain&&idxView)continue;
   return true;
  }catch{}
 }
 return false;
}
function rewriteLinks(data){
 const pages=Array.isArray(data.pages)?data.pages:[];
 const inactive=pages.filter(p=>p.status==='ARCHIVED');
 if(!inactive.length)return;
 // A shared HTML entry (e.g. challenge/mmtrade10x) must not be removed
 // when another active page uses precisely the same URL.
 function matchesUrl(link,source){
  try{
   const actual=new URL(link,location.origin),declared=new URL(source,location.origin);
   if(actual.origin!==location.origin||declared.origin!==location.origin)return false;
   if(actual.pathname.replace(/\/+$/,'')!==declared.pathname.replace(/\/+$/,''))return false;
   if(declared.search)return actual.search===declared.search;
   // /miniapp/index.html is multiplexed by view=...; never match a view
   // through the generic index path, even if the index is archived.
   if(declared.pathname==='/miniapp/index.html'&&actual.searchParams.has('view'))return false;
   return true;
  }catch{return false}
 }
 function sources(page){return [page.path,page.target,...(page.aliases||[])];}
 function patch(){
  document.querySelectorAll('a[href]').forEach(a=>{
   const href=a.getAttribute('href');if(!href||href[0]==='#')return;
   if(!inactive.some(p=>sources(p).some(v=>matchesUrl(href,v))))return;
   if(pages.some(p=>p.status==='PUBLISHED'&&sources(p).some(v=>matchesUrl(href,v))))return;
   a.href=data.startPath;
  });
 }
 patch();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch,{once:true});
}
window.__MM_PAGE_GATE_READY__=fetch('/public/page-lifecycle',{cache:'no-store',credentials:'same-origin'}).then(r=>{
 if(!r.ok)throw Error('lifecycle_unavailable');return r.json();
}).then(data=>{
 if(!data||!Array.isArray(data.pages))return;
 window.__MM_PAGE_ENGINE__=['p74','p62','legacy'].includes(data.engine)?data.engine:'p74';
 if(preview)return;
 const start=data.startPath||'/miniapp/index.html';
 // An index custom alias redirects back to index on the API. Never redirect it to itself via the alias.
 const needsStartup=isMain&&!idxView&&data.start!=='index';
 const startPage=data.pages.find(p=>p.slug===data.start);
 const matching=data.pages.filter(pageMatches);
 const retired=matching.some(p=>p.status==='ARCHIVED')&&!matching.some(p=>p.status==='PUBLISHED');
 if((needsStartup||retired)&&!sameTarget(location.pathname+location.search,start)){
  window.__MM_PAGE_GATE_REDIRECT__=true;
  location.replace(start);
  return;
 }
 rewriteLinks(data);
}).catch(()=>{window.__MM_PAGE_ENGINE__='p74';}).finally(unhide);
})();
